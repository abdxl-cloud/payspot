import { z } from "zod";
import {
  getPortalSubscriberByEmail,
  getSubscriberAccessState,
  getTenantBySlug,
  recordRadiusAccountingEvent,
  verifyTenantRadiusAdapterSecret,
} from "@/lib/store";
import { getDb } from "@/lib/db";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  event: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) =>
        value === "start" ||
        value === "interim" ||
        value === "interim-update" ||
        value === "stop" ||
        value === "accounting-on" ||
        value === "accounting-off",
      "Unsupported accounting event",
    ),
  sessionId: z.string().min(3),
  subscriberId: z.string().optional(),
  entitlementId: z.string().optional(),
  username: z.string().optional(),
  inputOctets: z.coerce.number().nonnegative().optional(),
  outputOctets: z.coerce.number().nonnegative().optional(),
  acctInputOctets: z.coerce.number().nonnegative().optional(),
  acctOutputOctets: z.coerce.number().nonnegative().optional(),
  acctInputGigawords: z.coerce.number().int().nonnegative().optional(),
  acctOutputGigawords: z.coerce.number().int().nonnegative().optional(),
  callingStationId: z.string().optional(),
  calledStationId: z.string().optional(),
  nasIpAddress: z.string().optional(),
});

function getAdapterSecret(request: Request) {
  return request.headers.get("x-radius-adapter-secret")?.trim() || "";
}

function combineOctets(lowWord?: number, highWord?: number) {
  if (lowWord == null && highWord == null) return undefined;
  const low = Math.max(0, Math.floor(lowWord ?? 0));
  const high = Math.max(0, Math.floor(highWord ?? 0));
  return high * 4_294_967_296 + low;
}

function getRadiusActiveCutoffIso() {
  const parsed = Number.parseInt(process.env.RADIUS_ACTIVE_STALE_MINUTES ?? "20", 10);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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

  if (parsed.data.event === "accounting-on" || parsed.data.event === "accounting-off") {
    return Response.json({ ok: true, ignored: parsed.data.event });
  }

  const normalizedEvent = parsed.data.event === "interim-update" ? "interim" : parsed.data.event;
  const inputOctets = combineOctets(
    parsed.data.inputOctets ?? parsed.data.acctInputOctets,
    parsed.data.acctInputGigawords,
  );
  const outputOctets = combineOctets(
    parsed.data.outputOctets ?? parsed.data.acctOutputOctets,
    parsed.data.acctOutputGigawords,
  );

  let subscriberId = parsed.data.subscriberId;
  let entitlementId = parsed.data.entitlementId;

  if (!subscriberId || !entitlementId) {
    const db = getDb();
    const existing = await db
      .prepare(
        `
        SELECT subscriber_id, entitlement_id, status, stopped_at
        FROM radius_accounting_sessions
        WHERE tenant_id = ? AND session_id = ?
      `,
      )
      .get(tenant.id, parsed.data.sessionId) as
      | { subscriber_id: string; entitlement_id: string; status: string; stopped_at: string | null }
      | undefined;
    subscriberId = subscriberId ?? existing?.subscriber_id;
    entitlementId = entitlementId ?? existing?.entitlement_id;

    if ((!subscriberId || !entitlementId) && parsed.data.callingStationId) {
      const byStation = await db
        .prepare(
          `
          SELECT subscriber_id, entitlement_id
          FROM radius_accounting_sessions
          WHERE tenant_id = ?
            AND UPPER(COALESCE(calling_station_id, '')) = UPPER(?)
            AND status = 'active'
            AND (? = '' OR COALESCE(nas_ip_address, '') = ?)
          ORDER BY last_update_at DESC
          LIMIT 1
        `,
        )
        .get(
          tenant.id,
          parsed.data.callingStationId,
          parsed.data.nasIpAddress ?? "",
          parsed.data.nasIpAddress ?? "",
        ) as
        | { subscriber_id: string; entitlement_id: string }
        | undefined;
      subscriberId = subscriberId ?? byStation?.subscriber_id;
      entitlementId = entitlementId ?? byStation?.entitlement_id;
    }
  }

  if ((!subscriberId || !entitlementId) && parsed.data.username) {
    const subscriber = await getPortalSubscriberByEmail(tenant.id, parsed.data.username);
    if (subscriber) {
      const access = await getSubscriberAccessState({
        tenantId: tenant.id,
        subscriberId: subscriber.id,
      });

      subscriberId = subscriberId ?? subscriber.id;
      entitlementId = entitlementId ?? access.entitlement?.id;
    }
  }

  if (!subscriberId || !entitlementId) {
    return Response.json(
      { error: "subscriberId and entitlementId are required for this session." },
      { status: 400 },
    );
  }

  await recordRadiusAccountingEvent({
    tenantId: tenant.id,
    subscriberId,
    entitlementId,
    sessionId: parsed.data.sessionId,
    event: normalizedEvent as "start" | "interim" | "stop",
    inputOctets,
    outputOctets,
    callingStationId: parsed.data.callingStationId,
    calledStationId: parsed.data.calledStationId,
    nasIpAddress: parsed.data.nasIpAddress,
  });

  const access = await getSubscriberAccessState({
    tenantId: tenant.id,
    subscriberId,
  });

  let shouldDisconnect = false;
  let disconnectReason: string | null = null;

  if (
    normalizedEvent !== "stop" &&
    access.state === "ended" &&
    (access.reason === "data_limit_reached" ||
      access.reason === "plan_expired" ||
      access.reason === "no_active_plan")
  ) {
    shouldDisconnect = true;
    disconnectReason = access.reason;
  }

  if (!shouldDisconnect && normalizedEvent !== "stop" && access.entitlement?.max_devices) {
    const maxDevices = access.entitlement.max_devices;
    if (Number.isFinite(maxDevices) && maxDevices > 0) {
      const db = getDb();
      const cutoffIso = getRadiusActiveCutoffIso();
      const activeSessionCountRow = await db
        .prepare(
          `
          SELECT COUNT(DISTINCT COALESCE(NULLIF(calling_station_id, ''), session_id)) as count
          FROM radius_accounting_sessions
          WHERE tenant_id = ?
            AND subscriber_id = ?
            AND entitlement_id = ?
            AND status = 'active'
            AND last_update_at >= ?
        `,
        )
        .get(tenant.id, subscriberId, access.entitlement.id, cutoffIso) as
        | { count: number }
        | undefined;
      const activeSessionCount = Number(activeSessionCountRow?.count ?? 0);
      if (activeSessionCount > maxDevices) {
        shouldDisconnect = true;
        disconnectReason = "session_limit_reached";
      }
    }
  }

  return Response.json({
    ok: true,
    disconnect: shouldDisconnect,
    reason: shouldDisconnect ? disconnectReason : null,
  });
}
