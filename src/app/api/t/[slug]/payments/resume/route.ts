import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { verifyAndProcess } from "@/lib/payments";
import { requirePaystackSecretForTransaction } from "@/lib/paystack-routing";
import {
  getTenantBySlug,
  getTransaction,
  getTransactionByReferenceEmail,
  getTransactionByReferencePhone,
  resetTransactionToPending,
} from "@/lib/store";
import { getResumeTtlMs } from "@/lib/payments";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  reference: z.string().min(6),
  phone: z.string().min(7).optional(),
  email: z.string().email().optional(),
});

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
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

  const { reference, phone, email } = parsed.data;
  const accountAccessMode = tenant.portal_auth_mode === "external_radius_portal";
  if (accountAccessMode && !email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }
  if (!accountAccessMode && !email && !phone) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  // account mode: match by email column; voucher mode: match by phone column
  // (voucher transactions store email in the phone column since we switched from phone to email)
  const transaction = accountAccessMode
    ? await getTransactionByReferenceEmail(tenant.id, reference, email ?? "")
    : email
      ? await getTransactionByReferencePhone(tenant.id, reference, email)
      : await getTransactionByReferencePhone(tenant.id, reference, phone ?? "");

  if (!transaction) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (transaction.payment_status === "success") {
    return Response.json({
      status: "success",
      reference,
      mode: transaction.delivery_mode,
    });
  }

  if (transaction.payment_status === "pending") {
    let paystackSecretKey: string;
    try {
      paystackSecretKey = await requirePaystackSecretForTransaction({
        tenantId: tenant.id,
        transaction,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Tenant Paystack key is invalid"
          ? "Tenant payment key is invalid. Use a Paystack secret key (sk_test_... or sk_live_...)."
          : error instanceof Error && error.message === "Platform Paystack key is invalid"
            ? "Admin Paystack key is invalid. Contact PaySpot support."
            : error instanceof Error && error.message === "Platform Paystack key is not configured"
              ? "Admin Paystack key is not configured. Contact PaySpot support."
          : "Tenant payments are not configured";
      return Response.json(
        { error: message },
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

  // If Paystack previously marked this as failed, double-check with Paystack
  // before showing the customer a failure screen — OPay and some banks report
  // "abandoned" mid-flow even when the money has already left the account.
  if (transaction.payment_status === "paystack_failed") {
    try {
      const paystackSecretKey = await requirePaystackSecretForTransaction({
        tenantId: tenant.id,
        transaction,
      });
      await resetTransactionToPending({ tenantId: tenant.id, reference });
      await verifyAndProcess({
        tenantId: tenant.id,
        reference,
        expectedAmountNgn: transaction.amount_ngn,
        paystackSecretKey,
      });
    } catch (error) {
      console.error("Re-verification of paystack_failed transaction failed", error);
    }
  }

  const refreshed = await getTransaction(tenant.id, reference) ?? transaction;

  if (refreshed.payment_status === "success") {
    return Response.json({
      status: "success",
      reference,
      mode: refreshed.delivery_mode,
    });
  }

  if (refreshed.payment_status !== "pending") {
    const failureMessages: Record<string, string> = {
      paystack_failed: "Payment could not be confirmed. Please contact us at payspot@abdxl.cloud.",
      paystack_timeout: "Payment was not confirmed within 3 hours and has expired. Please start a new transaction.",
      cancelled: "This pending payment was cancelled by the operator. Please start a new transaction.",
      amount_mismatch: "Payment amount did not match the selected package.",
      currency_mismatch: "Payment currency was not supported.",
      init_failed: "Payment could not be initialized. Please try again.",
      voucher_unavailable:
        "Payment succeeded but no voucher was available. Please contact us at payspot@abdxl.cloud.",
      access_activation_failed:
        "Payment succeeded but access activation failed. Please contact us at payspot@abdxl.cloud.",
      plan_window_unusable:
        "Payment succeeded, but this plan's usage window is not valid right now. Please contact us at payspot@abdxl.cloud.",
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
