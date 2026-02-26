import { z } from "zod";
import {
  authorizeSubscriberRadiusAccess,
  getTenantBySlug,
  verifyTenantRadiusAdapterSecret,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
});

function getAdapterSecret(request: Request) {
  return request.headers.get("x-radius-adapter-secret")?.trim() || "";
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const adapterSecret = getAdapterSecret(request);
  const secretOk = await verifyTenantRadiusAdapterSecret({
    tenantId: tenant.id,
    adapterSecret,
  });
  if (!secretOk) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const auth = await authorizeSubscriberRadiusAccess({
    tenantId: tenant.id,
    username: parsed.data.username,
    password: parsed.data.password,
  });

  if (auth.status !== "ok") {
    return Response.json({
      accept: false,
      reason: auth.status,
    });
  }

  const endsAtMs = new Date(auth.entitlement.ends_at).getTime();
  const timeoutSeconds = Math.floor((endsAtMs - Date.now()) / 1000);
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    return Response.json({
      accept: false,
      reason: "plan_expired",
    });
  }

  return Response.json({
    accept: true,
    subscriberId: auth.subscriber.id,
    entitlementId: auth.entitlement.id,
    reply: {
      sessionTimeout: Math.max(1, timeoutSeconds),
      maxDevices: auth.entitlement.max_devices,
      bandwidthProfile: auth.entitlement.bandwidth_profile,
      dataLimitMb: auth.entitlement.data_limit_mb,
      planEndsAt: auth.entitlement.ends_at,
    },
  });
}
