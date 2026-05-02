import { verifyTransaction, verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndProcess } from "@/lib/payments";
import { requirePlatformPaystackSecretKey, usesPlatformPaystack } from "@/lib/paystack-routing";
import { sendTenantSubscriptionReceiptEmail } from "@/lib/tenant-subscription-email";
import { getTenantBySubscriptionReference, getTransactionByReference, markTenantSubscriptionPaid } from "@/lib/store";

export async function POST(request: Request) {
  const signature = request.headers.get("x-paystack-signature");
  const bodyText = await request.text();

  let payload: { event?: string; data?: { reference?: string } };
  try {
    payload = JSON.parse(bodyText) as {
      event?: string;
      data?: { reference?: string };
    };
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (payload.event !== "charge.success") {
    return Response.json({ status: "ignored" });
  }

  const reference = payload.data?.reference;
  if (!reference) {
    return Response.json({ error: "Missing reference" }, { status: 400 });
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = await requirePlatformPaystackSecretKey();
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Platform Paystack key is invalid"
        ? "Admin Paystack key is invalid. Set PAYSTACK_SECRET_KEY to a valid sk_live_... key."
        : "Admin Paystack key is required for this webhook. Set PAYSTACK_SECRET_KEY.";
    return Response.json({ error: message }, { status: 409 });
  }

  if (
    !signature ||
    !verifyWebhookSignature({
      payload: bodyText,
      signature,
      secretKey: paystackSecretKey,
    })
  ) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const transaction = await getTransactionByReference(reference);
  if (!transaction) {
    const tenant = await getTenantBySubscriptionReference(reference);
    if (!tenant) {
      return Response.json({ error: "Unknown transaction" }, { status: 404 });
    }

    const verification = await verifyTransaction({ secretKey: paystackSecretKey, reference });
    const expectedAmount = Math.round(Number(tenant.platform_subscription_amount_ngn ?? 0)) * 100;
    if (verification.status?.toLowerCase() !== "success" || Number(verification.amount) !== expectedAmount) {
      return Response.json({ status: "failed", reason: "subscription_mismatch" });
    }
    const result = await markTenantSubscriptionPaid({ tenantId: tenant.id, reference });
    if (result.status === "ok") {
      await sendTenantSubscriptionReceiptEmail({
        tenant: result.tenant,
        reference,
      }).catch((error) => {
        console.error("Tenant subscription receipt email failed", error);
      });
    }
    return Response.json({ status: "ok" });
  }

  if (!usesPlatformPaystack(transaction)) {
    return Response.json(
      { error: "This transaction belongs to a tenant Paystack integration. Use /api/t/<slug>/payments/webhook." },
      { status: 409 },
    );
  }

  try {
    const result = await verifyAndProcess({
      tenantId: transaction.tenant_id,
      reference,
      expectedAmountNgn: transaction.amount_ngn,
      paystackSecretKey,
    });

    if (
      result.status === "not_success" ||
      result.status === "amount_mismatch" ||
      result.status === "currency_mismatch"
    ) {
      console.warn("Platform webhook verification mismatch", {
        reference,
        status: result.status,
      });
      return Response.json({ status: "failed", reason: result.status });
    }
  } catch (error) {
    console.error("Platform webhook processing failed", error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return Response.json({ status: "ok" });
}
