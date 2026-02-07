import { getAppEnv, getEnv } from "@/lib/env";
import {
  getPackageById,
  getTransaction,
  markTransactionFailed,
  transactionAssignVoucher,
} from "@/lib/store";
import { sendVoucherSms } from "@/lib/termii";
import { verifyTransaction } from "@/lib/paystack";

export async function handleSuccessfulPayment(params: {
  tenantId: string;
  reference: string;
}) {
  const transaction = getTransaction(params.tenantId, params.reference);
  if (!transaction) {
    return { status: "missing" as const };
  }
  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return {
      status: "already" as const,
      voucherCode: transaction.voucher_code,
    };
  }

  const result = transactionAssignVoucher({
    tenantId: params.tenantId,
    reference: params.reference,
    email: transaction.email,
    phone: transaction.phone,
    packageId: transaction.package_id,
  });

  if (result.status === "assigned" || result.status === "already") {
    const pkg = getPackageById(params.tenantId, transaction.package_id);
    if (pkg) {
      const message = [
        "Payment confirmed!",
        `Voucher: ${result.voucherCode}`,
        `Package: ${pkg.name}`,
        "Connect to WiFi and enter your code.",
      ].join("\n");

      try {
        await sendVoucherSms({
          phone: transaction.phone,
          message,
          channel: "dnd",
        });
      } catch (error) {
        console.error("SMS delivery failed", error);
      }
    }
  }

  return result;
}

export async function verifyAndProcess(params: {
  tenantId: string;
  reference: string;
  expectedAmountNgn: number;
  paystackSecretKey: string;
}) {
  const verification = await verifyTransaction({
    secretKey: params.paystackSecretKey,
    reference: params.reference,
  });
  if (verification.status !== "success") {
    markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "paystack_failed",
    });
    return { status: "not_success" as const };
  }

  const amountNgn = Math.round(verification.amount / 100);
  if (amountNgn !== params.expectedAmountNgn) {
    markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "amount_mismatch",
    });
    return { status: "amount_mismatch" as const };
  }

  if (verification.currency !== "NGN") {
    markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "currency_mismatch",
    });
    return { status: "currency_mismatch" as const };
  }

  return handleSuccessfulPayment({
    tenantId: params.tenantId,
    reference: params.reference,
  });
}

export function getCallbackUrl(params: { tenantSlug: string; reference: string }) {
  const { APP_URL } = getAppEnv();
  return new URL(
    `/t/${params.tenantSlug}/payment/verify/${params.reference}`,
    APP_URL,
  ).toString();
}

export function getResumeTtlMs() {
  const { RESUME_TTL_MINUTES } = getEnv();
  const minutes = RESUME_TTL_MINUTES ?? 60;
  return minutes * 60 * 1000;
}
