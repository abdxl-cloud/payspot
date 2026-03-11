import { z } from "zod";
import { randomUUID } from "node:crypto";
import { normalizeCaptivePortalContext } from "@/lib/captive-portal";
import { initializeTransaction } from "@/lib/paystack";
import {
  createTransaction,
  getAvailableCount,
  getPackageByCode,
  getPortalSubscriberSession,
  previewEntitlementWindow,
  getTenantBySlug,
  markTransactionFailed,
  requireTenantPaystackSecretKey,
  updateTransactionAuthUrl,
} from "@/lib/store";
import { getCallbackUrl, getResumeTtlMs } from "@/lib/payments";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  phone: z.string().min(7).optional(),
  packageCode: z.string().min(1),
  subscriberToken: z.string().min(10).optional(),
  portalContext: z.object({
    target: z.string().optional(),
    targetPort: z.string().optional(),
    originUrl: z.string().optional(),
    clientMac: z.string().optional(),
    clientIp: z.string().optional(),
    apMac: z.string().optional(),
    gatewayMac: z.string().optional(),
    raidusServerIp: z.string().optional(),
    scheme: z.string().optional(),
    ssidName: z.string().optional(),
    radioId: z.string().optional(),
    vid: z.string().optional(),
    previewSite: z.string().optional(),
  }).optional(),
});
const emailSchema = z.string().trim().toLowerCase().email();

function buildCheckoutEmailFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const localPart = (digits || `guest${randomUUID().slice(0, 8)}`).slice(0, 40);
  return `${localPart}@guest.payspot.co`;
}

function resolvePaystackEmail(candidate: string, fallbackPhone: string) {
  const parsed = emailSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  return buildCheckoutEmailFromPhone(fallbackPhone);
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = await requireTenantPaystackSecretKey(tenant.id);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Tenant Paystack key is invalid"
        ? "Tenant payment key is invalid. Use a Paystack secret key (sk_test_... or sk_live_...)."
        : "Tenant payments are not configured";
    return Response.json(
      { error: message },
      { status: 409 },
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { phone, packageCode, subscriberToken } = parsed.data;
  const portalContext = normalizeCaptivePortalContext(parsed.data.portalContext);
  const accountAccessMode = tenant.portal_auth_mode === "external_radius_portal";
  const bearer = request.headers.get("authorization");
  const headerToken =
    bearer && bearer.toLowerCase().startsWith("bearer ")
      ? bearer.slice(7).trim()
      : null;
  const effectiveSubscriberToken = subscriberToken ?? headerToken ?? undefined;

  const inputPhone = phone?.trim() ?? "";
  if (!accountAccessMode && inputPhone.length < 7) {
    return Response.json({ error: "Phone is required" }, { status: 400 });
  }

  let subscriberId: string | null = null;
  let email = buildCheckoutEmailFromPhone(inputPhone);
  let normalizedPhone = inputPhone;
  if (accountAccessMode) {
    if (!effectiveSubscriberToken) {
      return Response.json(
        { error: "Subscriber authentication is required for account access mode." },
        { status: 401 },
      );
    }
    const session = await getPortalSubscriberSession(effectiveSubscriberToken);
    if (!session || session.tenant_id !== tenant.id) {
      return Response.json({ error: "Invalid subscriber session" }, { status: 401 });
    }
    subscriberId = session.subscriber_id;
    email = resolvePaystackEmail(session.email, session.phone || inputPhone);
    normalizedPhone = session.phone || session.email;
  }

  const pkg = await getPackageByCode(tenant.id, packageCode);
  if (!pkg) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }
  if (accountAccessMode && subscriberId) {
    const preview = await previewEntitlementWindow({
      tenantId: tenant.id,
      subscriberId,
      packageId: pkg.id,
    });
    if (!preview.ok && preview.reason === "plan_window_unusable") {
      return Response.json(
        {
          error:
            "This plan cannot be activated within its configured usage window. Please choose another plan or contact support.",
        },
        { status: 409 },
      );
    }
  }

  const available = await getAvailableCount(tenant.id, pkg.id);
  const isOmadaOpenApiMode = tenant.voucher_source_mode === "omada_openapi";
  if (!accountAccessMode && !isOmadaOpenApiMode && available <= 0) {
    return Response.json(
      { error: "No vouchers available for this package" },
      { status: 409 },
    );
  }

  let reference: string | null = null;
  try {
    reference = `WIFI-${randomUUID().split("-")[0].toUpperCase()}`;
    const expiresAt = new Date(Date.now() + getResumeTtlMs()).toISOString();
    await createTransaction({
      tenantId: tenant.id,
      reference,
      email,
      phone: normalizedPhone,
      amountNgn: pkg.price_ngn,
      packageId: pkg.id,
      subscriberId,
      deliveryMode: accountAccessMode ? "account_access" : "voucher",
      authorizationUrl: null,
      expiresAt,
    });

    const callbackUrl = getCallbackUrl({
      tenantSlug: tenant.slug,
      reference,
      portalContext,
    });
    const init = await initializeTransaction({
      secretKey: paystackSecretKey,
      email,
      amountKobo: pkg.price_ngn * 100,
      reference,
      callbackUrl,
      metadata: {
        tenant: tenant.slug,
        packageCode: pkg.code,
        phone: normalizedPhone,
        subscriberId: subscriberId ?? undefined,
        deliveryMode: accountAccessMode ? "account_access" : "voucher",
      },
    });
    await updateTransactionAuthUrl({
      tenantId: tenant.id,
      reference,
      authorizationUrl: init.authorization_url,
      expiresAt,
    });

    return Response.json({
      reference,
      authorizationUrl: init.authorization_url,
      verifyUrl: callbackUrl,
    });
  } catch (error) {
    console.error("Paystack init failed", error);
    const reason =
      error instanceof Error ? error.message : "Unknown initialization error";
    if (reference) {
      try {
        await markTransactionFailed({
          tenantId: tenant.id,
          reference,
          status: "init_failed",
        });
      } catch (markError) {
        console.error("Unable to mark transaction as failed", markError);
      }
    }
    return Response.json(
      { error: reason || "Unable to initialize payment" },
      { status: 502 },
    );
  }
}
