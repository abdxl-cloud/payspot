import { z } from "zod";
import {
  getTenantBySlug,
  recordRadiusAccountingEvent,
  verifyTenantRadiusAdapterSecret,
} from "@/lib/store";
import { getDb } from "@/lib/db";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  event: z.enum(["start", "interim", "stop"]),
  sessionId: z.string().min(3),
  subscriberId: z.string().optional(),
  entitlementId: z.string().optional(),
  inputOctets: z.number().nonnegative().optional(),
  outputOctets: z.number().nonnegative().optional(),
  callingStationId: z.string().optional(),
  calledStationId: z.string().optional(),
  nasIpAddress: z.string().optional(),
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

  let subscriberId = parsed.data.subscriberId;
  let entitlementId = parsed.data.entitlementId;

  if (!subscriberId || !entitlementId) {
    const db = getDb();
    const existing = await db
      .prepare(
        `
        SELECT subscriber_id, entitlement_id
        FROM radius_accounting_sessions
        WHERE tenant_id = ? AND session_id = ?
      `,
      )
      .get(tenant.id, parsed.data.sessionId) as
      | { subscriber_id: string; entitlement_id: string }
      | undefined;
    subscriberId = subscriberId ?? existing?.subscriber_id;
    entitlementId = entitlementId ?? existing?.entitlement_id;
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
    event: parsed.data.event,
    inputOctets: parsed.data.inputOctets,
    outputOctets: parsed.data.outputOctets,
    callingStationId: parsed.data.callingStationId,
    calledStationId: parsed.data.calledStationId,
    nasIpAddress: parsed.data.nasIpAddress,
  });

  return Response.json({ ok: true });
}
