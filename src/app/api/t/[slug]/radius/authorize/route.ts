import { z } from "zod";
import {
  authorizeVoucherRadiusAccess,
  authorizeSubscriberRadiusAccess,
  resolveStorefrontContextBySlug,
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
  const storefront = await resolveStorefrontContextBySlug(slug);
  if (!storefront || storefront.tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }
  const { tenant, location, portalAuthMode, voucherSourceMode } = storefront;

  const adapterSecret = getAdapterSecret(request);
  const secretOk = await verifyTenantRadiusAdapterSecret({
    tenantId: tenant.id,
    locationId: location?.id ?? null,
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

  const voucherMode =
    portalAuthMode === "external_radius_voucher" ||
    voucherSourceMode === "radius_voucher";
  const reauthIntervalSeconds = getRadiusReauthIntervalSeconds();
  if (voucherMode) {
    const authResult = await authorizeVoucherRadiusAccess({
      tenantId: tenant.id,
      username: parsed.data.username,
      password: parsed.data.password,
      callingStationId: parsed.data.callingStationId,
    });
    if (authResult.status !== "ok") {
      const reasonMessages: Record<string, string> = {
        invalid_credentials: "Invalid voucher code or password.",
        no_active_voucher: "This voucher is not active.",
        plan_expired: "Your plan has expired.",
        data_limit_reached: "Your data limit has been reached.",
        session_limit_reached:
          "Maximum devices reached for this plan. Disconnect another device and try again.",
      };
      return Response.json({
        accept: false,
        reason: reasonMessages[authResult.status] ?? authResult.status,
        reasonCode: authResult.status,
      });
    }

    const endsAt = authResult.endsAt;
    const hasTimeLimit = !!endsAt;
    const timeoutSeconds = hasTimeLimit
      ? Math.floor((new Date(endsAt as string).getTime() - Date.now()) / 1000)
      : null;
    if (hasTimeLimit && (!Number.isFinite(timeoutSeconds) || (timeoutSeconds as number) <= 0)) {
      return Response.json({
        accept: false,
        reason: "Your plan has expired.",
        reasonCode: "plan_expired",
      });
    }

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
      transactionReference: authResult.transaction.reference,
      reply: {
        sessionTimeout,
        maxDevices: authResult.package.max_devices,
        bandwidthProfile: authResult.package.bandwidth_profile,
        dataLimitMb: authResult.package.data_limit_mb,
        planEndsAt: authResult.endsAt ?? undefined,
      },
    });
  }

  const authResult = await authorizeSubscriberRadiusAccess({
    tenantId: tenant.id,
    username: parsed.data.username,
    password: parsed.data.password,
    callingStationId: parsed.data.callingStationId,
  });
  if (authResult.status !== "ok") {
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
      reason: reasonMessages[authResult.status] ?? authResult.status,
      reasonCode: authResult.status,
    });
  }

  const endsAt = authResult.entitlement.ends_at;
  const hasTimeLimit = !!endsAt;
  const timeoutSeconds = hasTimeLimit
    ? Math.floor((new Date(endsAt as string).getTime() - Date.now()) / 1000)
    : null;
  if (hasTimeLimit && (!Number.isFinite(timeoutSeconds) || (timeoutSeconds as number) <= 0)) {
    return Response.json({
      accept: false,
      reason: "Your plan has expired.",
      reasonCode: "plan_expired",
    });
  }

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
    subscriberId: authResult.subscriber.id,
    entitlementId: authResult.entitlement.id,
    reply: {
      sessionTimeout,
      maxDevices: authResult.entitlement.max_devices,
      bandwidthProfile: authResult.entitlement.bandwidth_profile,
      dataLimitMb: authResult.entitlement.data_limit_mb,
      planEndsAt: authResult.entitlement.ends_at ?? undefined,
    },
  });
}
