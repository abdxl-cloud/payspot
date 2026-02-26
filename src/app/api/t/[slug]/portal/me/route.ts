import {
  getPortalSubscriberSession,
  getTenantBySlug,
  listActiveEntitlementsForSubscriber,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization");
  if (!value || !value.toLowerCase().startsWith("bearer ")) return null;
  return value.slice(7).trim();
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const token = getBearerToken(request);
  if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const session = await getPortalSubscriberSession(token);
  if (!session || session.tenant_id !== tenant.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entitlements = await listActiveEntitlementsForSubscriber({
    tenantId: tenant.id,
    subscriberId: session.subscriber_id,
  });

  return Response.json({
    subscriber: {
      id: session.subscriber_id,
      email: session.email,
      phone: session.phone,
      fullName: session.full_name,
    },
    entitlements: entitlements.map((item) => ({
      id: item.id,
      status: item.status,
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      maxDevices: item.max_devices,
      bandwidthProfile: item.bandwidth_profile,
      dataLimitMb: item.data_limit_mb,
      package: {
        code: item.package_code,
        name: item.package_name,
        durationMinutes: item.package_duration_minutes,
        priceNgn: item.package_price_ngn,
      },
    })),
  });
}
