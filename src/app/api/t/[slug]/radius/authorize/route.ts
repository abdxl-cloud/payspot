import { z } from "zod";
import {
  authorizeSubscriberRadiusAccess,
  getTenantBySlug,
  verifyTenantRadiusAdapterSecret,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

function getRadiusReauthIntervalSeconds() {
  const raw = process.env.RADIUS_REAUTH_INTERVAL_SECONDS?.trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

const schema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
  callingStationId: z.string().optional(),
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
    callingStationId: parsed.data.callingStationId,
  });

  if (auth.status !== "ok") {
    const reasonMessages: Record<string, string> = {
      invalid_credentials: "Invalid email or password.",
      no_active_plan: "No active plan found for this account.",
      plan_expired: "Your plan has expired.",
      data_limit_reached: "Your data limit has been reached.",
      session_limit_reached:
        "Maximum devices reached for this plan. Disconnect another device and try again.",
    };
    return Response.json({
      accept: false,
      reason: reasonMessages[auth.status] ?? auth.status,
      reasonCode: auth.status,
    });
  }

  const hasTimeLimit = !!auth.entitlement.ends_at;
  const timeoutSeconds = hasTimeLimit
    ? Math.floor((new Date(auth.entitlement.ends_at as string).getTime() - Date.now()) / 1000)
    : null;
  if (hasTimeLimit && (!Number.isFinite(timeoutSeconds) || (timeoutSeconds as number) <= 0)) {
    return Response.json({
      accept: false,
      reason: "Your plan has expired.",
      reasonCode: "plan_expired",
    });
  }

  const reauthIntervalSeconds = getRadiusReauthIntervalSeconds();
  let sessionTimeout: number | undefined;
  if (hasTimeLimit) {
    sessionTimeout = Math.max(1, timeoutSeconds as number);
  }
  if (reauthIntervalSeconds) {
    sessionTimeout =
      sessionTimeout === undefined
        ? reauthIntervalSeconds
        : Math.min(sessionTimeout, reauthIntervalSeconds);
  }

  return Response.json({
    accept: true,
    subscriberId: auth.subscriber.id,
    entitlementId: auth.entitlement.id,
    reply: {
      sessionTimeout,
      maxDevices: auth.entitlement.max_devices,
      bandwidthProfile: auth.entitlement.bandwidth_profile,
      dataLimitMb: auth.entitlement.data_limit_mb,
      planEndsAt: auth.entitlement.ends_at ?? undefined,
    },
  });
}
