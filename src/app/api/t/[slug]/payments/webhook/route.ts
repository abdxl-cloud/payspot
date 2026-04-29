import { verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndProcess } from "@/lib/payments";
import { requirePaystackSecretForTransaction } from "@/lib/paystack-routing";
import {
  getTenantBySlug,
  getTransaction,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

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

  const transaction = await getTransaction(tenant.id, reference);
  if (!transaction) {
    return Response.json({ error: "Unknown transaction" }, { status: 404 });
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = await requirePaystackSecretForTransaction({
      tenantId: tenant.id,
      transaction,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Tenant Paystack key is invalid"
        ? "Tenant payment key is invalid. Use a live Paystack secret key (sk_live_...)."
        : error instanceof Error && error.message === "Platform Paystack key is invalid"
          ? "Admin Paystack key is invalid. Set PAYSTACK_SECRET_KEY to a valid sk_live_... key."
          : error instanceof Error && error.message === "Platform Paystack key is not configured"
            ? "Admin Paystack key is required for this transaction."
            : "Tenant payments are not configured";
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
      tenantId: tenant.id,
      reference,
      expectedAmountNgn: transaction.amount_ngn,
      paystackSecretKey,
    });

    if (
      result.status === "not_success" ||
      result.status === "amount_mismatch" ||
      result.status === "currency_mismatch"
    ) {
      console.warn("Webhook verification mismatch", {
        reference,
        status: result.status,
      });
      return Response.json({ status: "failed", reason: result.status });
    }
  } catch (error) {
    console.error("Webhook processing failed", error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }

  return Response.json({ status: "ok" });
}
