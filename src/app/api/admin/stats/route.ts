import { getAdminEnv } from "@/lib/env";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantAdminStats, getTenantBySlug, listTenantLocations, listTenants } from "@/lib/store";

export async function GET(request: Request) {
  const { ADMIN_API_KEY } = getAdminEnv();
  const apiKey = request.headers.get("x-admin-key");
  const sessionUser = await getSessionUserFromRequest(request);

  const authorized =
    sessionUser?.role === "admin" || (!!ADMIN_API_KEY && apiKey === ADMIN_API_KEY);

  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenant");

  if (tenantSlug) {
    const tenant = await getTenantBySlug(tenantSlug);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    const locations = await listTenantLocations(tenant.id);
    return Response.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        locationCount: locations.length,
        maxLocations: tenant.max_locations ?? 1,
        paystackLast4: tenant.paystack_secret_last4,
      },
      stats: await getTenantAdminStats(tenant.id),
    });
  }

  const allTenants = await listTenants();
  const tenants = await Promise.all(
    allTenants.map(async (tenant) => {
      const locations = await listTenantLocations(tenant.id);
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        locationCount: locations.length,
        maxLocations: tenant.max_locations ?? 1,
        paystackLast4: tenant.paystack_secret_last4,
        stats: await getTenantAdminStats(tenant.id),
      };
    }),
  );

  return Response.json({ tenants });
}
