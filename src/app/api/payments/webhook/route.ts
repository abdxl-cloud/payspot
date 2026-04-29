import { verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndProcess } from "@/lib/payments";
import { requirePlatformPaystackSecretKey, usesPlatformPaystack } from "@/lib/paystack-routing";
import { getTransactionByReference } from "@/lib/store";

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

  const transaction = await getTransactionByReference(reference);
  if (!transaction) {
    return Response.json({ error: "Unknown transaction" }, { status: 404 });
  }

  if (!usesPlatformPaystack(transaction)) {
    return Response.json(
      { error: "This transaction belongs to a tenant Paystack integration. Use /api/t/<slug>/payments/webhook." },
      { status: 409 },
    );
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = requirePlatformPaystackSecretKey();
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Platform Paystack key is invalid"
        ? "Admin Paystack key is invalid. Set PAYSTACK_SECRET_KEY to a valid sk_test_... or sk_live_... key."
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
