import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantAdminStats, getTenantBySlug, isTenantPaymentConfigured } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "tenant") {
    if (user.tenantId !== tenant.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const needsSetup =
      user.mustChangePassword ||
      !isTenantPaymentConfigured(tenant) ||
      tenant.status !== "active";
    if (needsSetup) {
      return Response.json(
        { error: "Complete setup before accessing admin stats" },
        { status: 409 },
      );
    }
  }

  return Response.json({
    tenant: { slug: tenant.slug, name: tenant.name },
    stats: await getTenantAdminStats(tenant.id),
  });
}
