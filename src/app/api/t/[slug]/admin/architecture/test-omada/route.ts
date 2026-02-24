import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { testOmadaOpenApiConnection } from "@/lib/omada";
import {
  getTenantBySlug,
  resolveTenantOmadaOpenApiConfigForTesting,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

async function normalizeTenantAccess(request: Request, tenantId: string) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (user.role === "tenant" && user.tenantId !== tenantId) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

const schema = z.object({
  omada: z
    .object({
      apiBaseUrl: z.string().max(300).optional(),
      omadacId: z.string().max(200).optional(),
      siteId: z.string().max(200).optional(),
      clientId: z.string().max(200).optional(),
      clientSecret: z.string().max(500).optional(),
    })
    .optional(),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const resolved = await resolveTenantOmadaOpenApiConfigForTesting({
    tenantId: tenant.id,
    overrides: {
      apiBaseUrl: parsed.data.omada?.apiBaseUrl,
      omadacId: parsed.data.omada?.omadacId,
      siteId: parsed.data.omada?.siteId,
      clientId: parsed.data.omada?.clientId,
      clientSecret: parsed.data.omada?.clientSecret,
    },
  });

  if (resolved.status === "missing") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (resolved.status === "incomplete") {
    return Response.json(
      {
        error: `Missing required Omada fields: ${resolved.missing.join(", ")}`,
        missing: resolved.missing,
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    await testOmadaOpenApiConnection(resolved.config);
    return Response.json({
      ok: true,
      message: "Omada OpenAPI connection is healthy.",
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Omada connection test failed";
    return Response.json(
      {
        ok: false,
        error: `Omada connection test failed: ${message}`,
        latencyMs: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }
}
