import {
  createCaptivePortalSearchParams,
  type CaptivePortalContext,
} from "@/lib/captive-portal";
import { getAppEnv, getEnv } from "@/lib/env";
import {
  activateSubscriberAccessForTransaction,
  getPackageById,
  getTenantById,
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
  const tenant = await getTenantById(params.tenantId);
  const transaction = await getTransaction(params.tenantId, params.reference);
  if (!transaction) {
    return { status: "missing" as const };
  }
  if (transaction.payment_status === "success" && transaction.delivery_mode === "account_access") {
    return { status: "already_access" as const };
  }
  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return {
      status: "already" as const,
      voucherCode: transaction.voucher_code,
    };
  }

  const shouldActivateAccess =
    transaction.delivery_mode === "account_access" ||
    tenant?.portal_auth_mode === "external_radius_portal";
  if (shouldActivateAccess) {
    const activation = await activateSubscriberAccessForTransaction({
      tenantId: params.tenantId,
      reference: params.reference,
    });
    if (activation.status === "activated" || activation.status === "already") {
      return { status: "access_activated" as const };
    }

    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "access_activation_failed",
    });
    return { status: "access_failed" as const };
  }

  const result = await transactionAssignVoucher({
    tenantId: params.tenantId,
    reference: params.reference,
    email: transaction.email,
    phone: transaction.phone,
    packageId: transaction.package_id,
  });

  if (result.status === "assigned" || result.status === "already") {
    const pkg = await getPackageById(params.tenantId, transaction.package_id);
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
  const paystackStatus = verification.status?.toLowerCase();
  if (paystackStatus !== "success") {
    // Keep checkout resumable while payment is still in-flight on Paystack.
    if (paystackStatus === "pending" || paystackStatus === "ongoing") {
      return { status: "pending" as const };
    }

    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "paystack_failed",
    });
    return { status: "not_success" as const };
  }

  const amountNgn = Math.round(verification.amount / 100);
  if (amountNgn !== params.expectedAmountNgn) {
    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "amount_mismatch",
    });
    return { status: "amount_mismatch" as const };
  }

  if (verification.currency !== "NGN") {
    await markTransactionFailed({
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

export function getCallbackUrl(params: {
  tenantSlug: string;
  reference: string;
  portalContext?: CaptivePortalContext;
}) {
  const { APP_URL } = getAppEnv();
  const callbackUrl = new URL(
    `/t/${params.tenantSlug}/payment/verify/${params.reference}`,
    APP_URL,
  );
  const portalParams = createCaptivePortalSearchParams(params.portalContext);
  for (const [key, value] of portalParams.entries()) {
    callbackUrl.searchParams.set(key, value);
  }
  return callbackUrl.toString();
}

export function getResumeTtlMs() {
  const { RESUME_TTL_MINUTES } = getEnv();
  const minutes = RESUME_TTL_MINUTES ?? 60;
  return minutes * 60 * 1000;
}
