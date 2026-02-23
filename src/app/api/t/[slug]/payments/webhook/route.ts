import { verifyWebhookSignature } from "@/lib/paystack";
import { verifyAndProcess } from "@/lib/payments";
import {
  getTenantBySlug,
  getTransaction,
  requireTenantPaystackSecretKey,
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

  let paystackSecretKey: string;
  try {
    paystackSecretKey = await requireTenantPaystackSecretKey(tenant.id);
  } catch {
    return Response.json(
      { error: "Tenant payments are not configured" },
      { status: 409 },
    );
  }

  const signature = request.headers.get("x-paystack-signature");
  const bodyText = await request.text();

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
