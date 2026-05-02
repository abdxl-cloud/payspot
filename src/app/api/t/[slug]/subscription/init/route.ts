import { randomUUID } from "node:crypto";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";
import { initializeTransaction } from "@/lib/paystack";
import { requirePlatformPaystackSecretKey } from "@/lib/paystack-routing";
import {
  getTenantBySlug,
  setTenantSubscriptionPending,
  tenantRequiresPlatformSubscription,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }
  if (sessionUser.role !== "tenant" || sessionUser.tenantId !== tenant.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!tenantRequiresPlatformSubscription(tenant)) {
    return Response.json({ error: "Subscription payment is not required for this tenant." }, { status: 409 });
  }

  const amountNgn = Math.round(Number(tenant.platform_subscription_amount_ngn ?? 0));
  if (!Number.isFinite(amountNgn) || amountNgn <= 0) {
    return Response.json({ error: "Subscription amount is not configured." }, { status: 409 });
  }

  let secretKey: string;
  try {
    secretKey = await requirePlatformPaystackSecretKey();
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Platform Paystack key is invalid"
        ? "Admin Paystack key is invalid. Set a live sk_live_... key in platform settings."
        : "Admin Paystack key is required before tenant subscription payments can be accepted.";
    return Response.json({ error: message }, { status: 409 });
  }

  const reference = `SUB-${randomUUID().split("-")[0].toUpperCase()}`;
  const { APP_URL } = getAppEnv();
  const callbackUrl = new URL(`/t/${tenant.slug}/subscription/verify/${reference}`, APP_URL).toString();

  try {
    await setTenantSubscriptionPending({ tenantId: tenant.id, reference });
    const init = await initializeTransaction({
      secretKey,
      email: sessionUser.email,
      amountKobo: amountNgn * 100,
      reference,
      callbackUrl,
      metadata: {
        type: "tenant_subscription",
        tenantId: tenant.id,
        tenant: tenant.slug,
        billingModel: tenant.platform_billing_model,
        subscriptionInterval: tenant.platform_subscription_interval,
      },
    });

    return Response.json({
      reference,
      authorizationUrl: init.authorization_url,
      accessCode: init.access_code,
      verifyUrl: callbackUrl,
    });
  } catch (error) {
    console.error("Tenant subscription payment init failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to initialize subscription payment." },
      { status: 502 },
    );
  }
}
