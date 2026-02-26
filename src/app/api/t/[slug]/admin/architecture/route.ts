import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  type AccessMode,
  getTenantArchitecture,
  getTenantBySlug,
  setTenantArchitecture,
  type PortalAuthMode,
  type VoucherSourceMode,
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
  accessMode: z.enum(["voucher_access", "account_access"]).optional(),
  voucherSourceMode: z.enum(["import_csv", "omada_openapi"]).optional(),
  portalAuthMode: z
    .enum(["omada_builtin", "external_radius_portal"])
    .optional(),
  omada: z
    .object({
      apiBaseUrl: z.string().max(300).optional(),
      omadacId: z.string().max(200).optional(),
      siteId: z.string().max(200).optional(),
      clientId: z.string().max(200).optional(),
      clientSecret: z.string().max(500).optional(),
      hotspotOperatorUsername: z.string().max(200).optional(),
      hotspotOperatorPassword: z.string().max(500).optional(),
    })
    .optional(),
  radius: z
    .object({
      adapterSecret: z.string().max(500).optional(),
    })
    .optional(),
});

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const architecture = await getTenantArchitecture(tenant.id);
  if (!architecture) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  return Response.json({ architecture });
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const omadaPatch = parsed.data.omada
    ? {
        apiBaseUrl: parsed.data.omada.apiBaseUrl?.trim(),
        omadacId: parsed.data.omada.omadacId?.trim(),
        siteId: parsed.data.omada.siteId?.trim(),
        clientId: parsed.data.omada.clientId?.trim(),
        clientSecret:
          parsed.data.omada.clientSecret !== undefined
            ? parsed.data.omada.clientSecret.trim()
            : undefined,
        hotspotOperatorUsername:
          parsed.data.omada.hotspotOperatorUsername?.trim(),
        hotspotOperatorPassword:
          parsed.data.omada.hotspotOperatorPassword !== undefined
            ? parsed.data.omada.hotspotOperatorPassword.trim()
            : undefined,
      }
    : undefined;
  const radiusPatch = parsed.data.radius
    ? {
        adapterSecret:
          parsed.data.radius.adapterSecret !== undefined
            ? parsed.data.radius.adapterSecret.trim()
            : undefined,
      }
    : undefined;

  try {
    const result = await setTenantArchitecture({
      tenantId: tenant.id,
      accessMode: parsed.data.accessMode as AccessMode | undefined,
      voucherSourceMode: parsed.data.voucherSourceMode as VoucherSourceMode | undefined,
      portalAuthMode: parsed.data.portalAuthMode as PortalAuthMode | undefined,
      omada: omadaPatch,
      radius: radiusPatch,
    });

    if (result.status === "missing") {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }
    if (result.status === "incomplete_omada_openapi") {
      return Response.json(
        {
          error: `Cannot set voucher source to omada_openapi. Missing required Omada fields: ${result.missing.join(", ")}`,
          missing: result.missing,
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("Failed to update architecture", error);
    return Response.json(
      { error: "Unable to save architecture settings" },
      { status: 500 },
    );
  }

  const architecture = await getTenantArchitecture(tenant.id);
  return Response.json({ ok: true, architecture });
}
