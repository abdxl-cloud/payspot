import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { testMikrotikConnection } from "@/lib/mikrotik";
import {
  getTenantBySlug,
  resolveTenantMikrotikConfigForTesting,
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
  mikrotik: z
    .object({
      baseUrl: z.string().max(300).optional(),
      username: z.string().max(200).optional(),
      password: z.string().max(500).optional(),
      hotspotServer: z.string().max(200).optional(),
      defaultProfile: z.string().max(200).optional(),
      verifyTls: z.boolean().optional(),
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

  const resolved = await resolveTenantMikrotikConfigForTesting({
    tenantId: tenant.id,
    overrides: {
      baseUrl: parsed.data.mikrotik?.baseUrl,
      username: parsed.data.mikrotik?.username,
      password: parsed.data.mikrotik?.password,
      hotspotServer: parsed.data.mikrotik?.hotspotServer,
      defaultProfile: parsed.data.mikrotik?.defaultProfile,
      verifyTls: parsed.data.mikrotik?.verifyTls,
    },
  });

  if (resolved.status === "missing") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (resolved.status === "incomplete") {
    return Response.json(
      {
        error: `Missing required MikroTik fields: ${resolved.missing.join(", ")}`,
        missing: resolved.missing,
      },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  try {
    const info = await testMikrotikConnection(resolved.config);
    return Response.json({
      ok: true,
      message: "MikroTik REST connection is healthy and HotSpot user provisioning works.",
      latencyMs: Date.now() - startedAt,
      info,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MikroTik connection test failed";
    return Response.json(
      {
        ok: false,
        error: `MikroTik connection test failed: ${message}`,
        latencyMs: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }
}
