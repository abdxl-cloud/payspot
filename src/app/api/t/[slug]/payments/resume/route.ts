import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAndProcess } from "@/lib/payments";
import {
  getTenantBySlug,
  getTransaction,
  getTransactionByReferencePhone,
  requireTenantPaystackSecretKey,
} from "@/lib/store";
import { getResumeTtlMs } from "@/lib/payments";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  reference: z.string().min(6),
  phone: z.string().min(7),
});

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`resume:${tenant.slug}:${ip}`, 8, 60_000);
  if (!limiter.allowed) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { reference, phone } = parsed.data;
  const transaction = getTransactionByReferencePhone(tenant.id, reference, phone);

  if (!transaction) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return Response.json({
      status: "success",
      reference,
    });
  }

  if (transaction.payment_status === "pending") {
    let paystackSecretKey: string;
    try {
      paystackSecretKey = requireTenantPaystackSecretKey(tenant.id);
    } catch {
      return Response.json(
        { error: "Tenant payments are not configured" },
        { status: 409 },
      );
    }
    try {
      await verifyAndProcess({
        tenantId: tenant.id,
        reference,
        expectedAmountNgn: transaction.amount_ngn,
        paystackSecretKey,
      });
    } catch (error) {
      console.error("Resume verification failed", error);
    }
  }

  const refreshed = getTransaction(tenant.id, reference) ?? transaction;

  if (refreshed.payment_status === "success" && refreshed.voucher_code) {
    return Response.json({
      status: "success",
      reference,
    });
  }

  if (refreshed.payment_status !== "pending") {
    const failureMessages: Record<string, string> = {
      paystack_failed: "Payment could not be confirmed. Please contact support.",
      amount_mismatch: "Payment amount did not match the selected package.",
      currency_mismatch: "Payment currency was not supported.",
      init_failed: "Payment could not be initialized. Please try again.",
      voucher_unavailable:
        "Payment succeeded but no voucher was available. Please contact support.",
    };

    const message =
      failureMessages[refreshed.payment_status] ??
      "Transaction cannot be resumed";

    return Response.json({ error: message }, { status: 409 });
  }

  const ttlMs = getResumeTtlMs();
  const derivedExpiresAt =
    refreshed.expires_at ??
    new Date(new Date(refreshed.created_at).getTime() + ttlMs).toISOString();

  if (isExpired(derivedExpiresAt)) {
    return Response.json({ error: "Transaction expired" }, { status: 410 });
  }

  if (!refreshed.authorization_url) {
    return Response.json(
      { error: "Missing payment authorization" },
      { status: 409 },
    );
  }

  return Response.json({
    status: "pending",
    authorizationUrl: refreshed.authorization_url,
    ttlMs,
  });
}
