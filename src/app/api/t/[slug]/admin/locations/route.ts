import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  createTenantLocation,
  getTenantBySlug,
  listTenantLocations,
  normalizeTenantAppearance,
  updateTenantLocation,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const patchSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  voucherSourceMode: z.enum(["import_csv", "omada_openapi", "mikrotik_rest", "radius_voucher"]).optional(),
  portalAuthMode: z.enum(["omada_builtin", "external_radius_portal", "external_radius_voucher"]).optional(),
  appearance: z
    .object({
      storePrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      dashboardPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});

const postSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  voucherSourceMode: z.enum(["import_csv", "omada_openapi", "mikrotik_rest", "radius_voucher"]).optional(),
  portalAuthMode: z.enum(["omada_builtin", "external_radius_portal", "external_radius_voucher"]).optional(),
  appearance: z
    .object({
      storePrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      dashboardPrimaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    .optional(),
});

async function requireTenantAccess(request: Request, slug: string) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { status: "unauthorized" as const };
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return { status: "missing" as const };
  if (user.role !== "admin" && user.tenantId !== tenant.id) {
    return { status: "forbidden" as const };
  }
  return { status: "ok" as const, tenant };
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const access = await requireTenantAccess(request, slug);
  if (access.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (access.status === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (access.status === "missing") return Response.json({ error: "Tenant not found" }, { status: 404 });

  const locations = await listTenantLocations(access.tenant.id);
  return Response.json({
    locations: locations.map((location) => ({
      id: location.id,
      slug: location.slug,
      name: location.name,
      status: location.status,
      isPrimary: location.is_primary === 1,
      voucherSourceMode: location.voucher_source_mode ?? "import_csv",
      portalAuthMode: location.portal_auth_mode ?? "omada_builtin",
      appearance: normalizeTenantAppearance(location.ui_config_json),
    })),
    maxLocations: access.tenant.max_locations,
  });
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const access = await requireTenantAccess(request, slug);
  if (access.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (access.status === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (access.status === "missing") return Response.json({ error: "Tenant not found" }, { status: 404 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createTenantLocation({
    tenantId: access.tenant.id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    voucherSourceMode: parsed.data.voucherSourceMode,
    portalAuthMode: parsed.data.portalAuthMode,
    appearance: parsed.data.appearance,
  });
  if (result.status === "limit_reached") {
    return Response.json({ error: "Location limit reached for this tenant." }, { status: 409 });
  }
  if (result.status === "invalid_slug") {
    return Response.json({ error: "Use a valid location slug." }, { status: 400 });
  }
  if (result.status === "slug_taken") {
    return Response.json({ error: "That location slug is already taken." }, { status: 409 });
  }
  if (result.status !== "created") {
    return Response.json({ error: "Unable to create location." }, { status: 500 });
  }

  return Response.json({
    status: "ok",
    location: {
      id: result.location.id,
      slug: result.location.slug,
      name: result.location.name,
      status: result.location.status,
      isPrimary: result.location.is_primary === 1,
      voucherSourceMode: result.location.voucher_source_mode ?? "import_csv",
      portalAuthMode: result.location.portal_auth_mode ?? "omada_builtin",
      appearance: normalizeTenantAppearance(result.location.ui_config_json),
    },
  });
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const access = await requireTenantAccess(request, slug);
  if (access.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (access.status === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (access.status === "missing") return Response.json({ error: "Tenant not found" }, { status: 404 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await updateTenantLocation({
    tenantId: access.tenant.id,
    locationId: parsed.data.locationId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    voucherSourceMode: parsed.data.voucherSourceMode,
    portalAuthMode: parsed.data.portalAuthMode,
    appearance: parsed.data.appearance,
  });
  if (result.status === "missing") {
    return Response.json({ error: "Location not found" }, { status: 404 });
  }
  if (result.status === "invalid_slug") {
    return Response.json({ error: "Use a valid location slug." }, { status: 400 });
  }
  if (result.status === "slug_taken") {
    return Response.json({ error: "That location slug is already taken." }, { status: 409 });
  }

  return Response.json({
    status: "ok",
    location: {
      id: result.location.id,
      slug: result.location.slug,
      name: result.location.name,
      status: result.location.status,
      isPrimary: result.location.is_primary === 1,
      voucherSourceMode: result.location.voucher_source_mode ?? "import_csv",
      portalAuthMode: result.location.portal_auth_mode ?? "omada_builtin",
      appearance: normalizeTenantAppearance(result.location.ui_config_json),
    },
  });
}
