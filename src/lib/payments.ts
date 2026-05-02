import {
  createCaptivePortalSearchParams,
  type CaptivePortalContext,
} from "@/lib/captive-portal";
import { getAppEnv, getEnv } from "@/lib/env";
import { ensureHotspotVoucher, findHotspotUserByName, type TenantMikrotikConfig } from "@/lib/mikrotik";
import {
  completeTransaction,
  activateSubscriberAccessForTransaction,
  getPackageById,
  getTenantAppearance,
  getTenantEmailNotifications,
  getTenantById,
  getTenantLocationById,
  getPackageVoucherStock,
  getTransaction,
  getTransactionByVoucherCode,
  getVoucherPoolEntryByCode,
  markTransactionFailed,
  markTransactionProcessing,
  normalizeVoucherSourceMode,
  resolveTenantMikrotikConfigIfPresent,
  transactionAssignVoucher,
  updateTransactionNotificationDelivery,
} from "@/lib/store";
import { sendVoucherSms } from "@/lib/termii";
import { sendMail, sendVoucherEmail } from "@/lib/mailer";
import { verifyTransaction } from "@/lib/paystack";
import { buildLegacyGeneratedVoucherCode, buildRadiusVoucherCode } from "@/lib/voucher-codes";

async function sendVoucherNotifications(params: {
  tenantId: string;
  locationId?: string | null;
  transaction: {
    email: string;
    phone: string;
    reference: string;
    package_id: string;
  };
  voucherCode: string;
}) {
  let smsSent = false;
  let emailSent = false;
  const pkg = await getPackageById(params.tenantId, params.transaction.package_id);
  if (!pkg) {
    return { smsSent, emailSent };
  }
  const tenant = await getTenantById(params.tenantId);
  const location = params.locationId ? await getTenantLocationById(params.locationId) : null;

  const message = [
    "Payment confirmed!",
    `Voucher: ${params.voucherCode}`,
    `Package: ${pkg.name}`,
    "Connect to WiFi and enter your code.",
  ].join("\n");

  try {
    await sendVoucherSms({
      phone: params.transaction.phone,
      message,
      channel: "dnd",
    });
    smsSent = true;
  } catch (error) {
    console.error("SMS delivery failed", error);
  }

  try {
    await sendVoucherEmail({
      to: params.transaction.email,
      voucherCode: params.voucherCode,
      packageName: pkg.name,
      reference: params.transaction.reference,
      tenantName: location?.name ?? tenant?.name,
      tenantSlug: location?.slug ?? tenant?.slug,
      amountNgn: pkg.price_ngn,
      primaryColor: tenant ? (await getTenantAppearance(tenant.id, location?.id ?? null)).storePrimaryColor : undefined,
    });
    emailSent = true;
  } catch (error) {
    console.error("Voucher email delivery failed", error);
  }

  return { smsSent, emailSent };
}

async function sendLowVoucherStockAlertIfNeeded(params: {
  tenantId: string;
  packageId: string;
  locationId?: string | null;
}) {
  const tenant = await getTenantById(params.tenantId);
  const location = params.locationId ? await getTenantLocationById(params.locationId) : null;
  const source = location ?? tenant;
  if (!tenant || !source || normalizeVoucherSourceMode(source.voucher_source_mode) !== "import_csv") return;

  const notifications = await getTenantEmailNotifications(params.tenantId, location?.id ?? null);
  if (!notifications.lowVoucherStockAlerts) return;

  const stock = await getPackageVoucherStock({
    tenantId: params.tenantId,
    packageId: params.packageId,
  });
  if (!stock || stock.total <= 0) return;

  const lowByPercent = stock.unused / stock.total <= 0.2;
  const lowByCount = stock.unused <= 5;
  if (!lowByPercent && !lowByCount) return;

  try {
    await sendMail({
      to: tenant.admin_email,
      subject: `Low voucher stock: ${stock.name}`,
      text: [
        `${tenant.name} is running low on voucher stock for ${stock.name}.`,
        "",
        `Unused vouchers: ${stock.unused}`,
        `Total vouchers: ${stock.total}`,
        "",
        "Open the tenant dashboard and import more voucher CSV stock for this plan.",
      ].join("\n"),
    });
  } catch (error) {
    console.error("Low voucher stock email failed", error);
  }
}

const GENERATED_VOUCHER_CODE_ATTEMPTS = 8;

async function generateUniqueVoucherCode(params: {
  tenantId: string;
  mikrotikConfig?: TenantMikrotikConfig | null;
  voucherCodeFactory?: () => string;
}) {
  for (let attempt = 0; attempt < GENERATED_VOUCHER_CODE_ATTEMPTS; attempt += 1) {
    const voucherCode = params.voucherCodeFactory ? params.voucherCodeFactory() : buildLegacyGeneratedVoucherCode();
    const [existingTransaction, existingPoolEntry, existingHotspotUser] = await Promise.all([
      getTransactionByVoucherCode(params.tenantId, voucherCode),
      getVoucherPoolEntryByCode(params.tenantId, voucherCode),
      params.mikrotikConfig
        ? findHotspotUserByName(params.mikrotikConfig, voucherCode).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (!existingTransaction && !existingPoolEntry && !existingHotspotUser) {
      return voucherCode;
    }
  }

  throw new Error("Unable to generate a unique voucher code");
}

async function provisionMikrotikVoucherForTransaction(params: {
  tenantId: string;
  reference: string;
}) {
  const transaction = await getTransaction(params.tenantId, params.reference);
  if (!transaction) {
    return { status: "missing" as const };
  }
  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return {
      status: "already" as const,
      voucherCode: transaction.voucher_code,
    };
  }

  await markTransactionProcessing({
    tenantId: params.tenantId,
    reference: params.reference,
  });

  const [pkg, mikrotikConfig] = await Promise.all([
    getPackageById(params.tenantId, transaction.package_id),
    resolveTenantMikrotikConfigIfPresent(params.tenantId, transaction.location_id ?? null),
  ]);

  if (!pkg || !mikrotikConfig) {
    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "mikrotik_config_missing",
    });
    return { status: "config_missing" as const };
  }

  const voucherCode = await generateUniqueVoucherCode({
    tenantId: params.tenantId,
    mikrotikConfig,
  });

  try {
    await ensureHotspotVoucher({
      config: mikrotikConfig,
      username: voucherCode,
      password: voucherCode,
      comment: `PaySpot:${transaction.reference}`,
      durationMinutes: pkg.duration_minutes,
      dataLimitMb: pkg.data_limit_mb,
    });

    const paidAt = new Date().toISOString();
    await completeTransaction({
      tenantId: params.tenantId,
      reference: params.reference,
      voucherCode,
      paidAt,
      voucherSourceMode: "mikrotik_rest",
    });

    return { status: "assigned" as const, voucherCode };
  } catch (error) {
    console.error("[payments] MikroTik provisioning failed", {
      tenantId: params.tenantId,
      reference: params.reference,
      error: error instanceof Error ? error.message : error,
    });
    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: "mikrotik_provision_failed",
    });
    return { status: "failed" as const };
  }
}

async function provisionRadiusVoucherForTransaction(params: {
  tenantId: string;
  reference: string;
}) {
  const transaction = await getTransaction(params.tenantId, params.reference);
  if (!transaction) {
    return { status: "missing" as const };
  }
  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return {
      status: "already" as const,
      voucherCode: transaction.voucher_code,
    };
  }

  const processing = await markTransactionProcessing({
    tenantId: params.tenantId,
    reference: params.reference,
  });
  if (processing === 0) {
    const existing = await getTransaction(params.tenantId, params.reference);
    if (existing?.payment_status === "success" && existing.voucher_code) {
      return {
        status: "already" as const,
        voucherCode: existing.voucher_code,
      };
    }
    return { status: "skipped" as const };
  }

  const pkg = await getPackageById(params.tenantId, transaction.package_id);
  const voucherCode = await generateUniqueVoucherCode({
    tenantId: params.tenantId,
    voucherCodeFactory: () =>
      buildRadiusVoucherCode({
        prefix: pkg?.radius_voucher_code_prefix ?? null,
        codeLength: pkg?.radius_voucher_code_length ?? null,
        characterSet: pkg?.radius_voucher_character_set ?? null,
      }),
  });
  const paidAt = new Date().toISOString();
  await completeTransaction({
    tenantId: params.tenantId,
    reference: params.reference,
    voucherCode,
    paidAt,
    voucherSourceMode: "radius_voucher",
  });

  return { status: "assigned" as const, voucherCode };
}

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

  const location = transaction.location_id ? await getTenantLocationById(transaction.location_id) : null;
  const source = location ?? tenant;
  const sourcePortalAuthMode = source?.portal_auth_mode ?? tenant?.portal_auth_mode ?? null;
  const sourceVoucherMode = normalizeVoucherSourceMode(source?.voucher_source_mode ?? tenant?.voucher_source_mode);

  const shouldActivateAccess =
    transaction.delivery_mode === "account_access" ||
    sourcePortalAuthMode === "external_radius_portal";
  if (shouldActivateAccess) {
    const activation = await activateSubscriberAccessForTransaction({
      tenantId: params.tenantId,
      reference: params.reference,
    });
    if (activation.status === "activated" || activation.status === "already") {
      return { status: "access_activated" as const };
    }

    const activationFailureStatus =
      activation.status === "plan_window_unusable"
        ? "plan_window_unusable"
        : "access_activation_failed";

    await markTransactionFailed({
      tenantId: params.tenantId,
      reference: params.reference,
      status: activationFailureStatus,
    });
    return {
      status:
        activation.status === "plan_window_unusable"
          ? ("access_failed_plan_window" as const)
          : ("access_failed" as const),
    };
  }

  let result:
    | { status: "already" | "assigned"; voucherCode: string }
    | { status: string; voucherCode?: string };
  if (sourceVoucherMode === "mikrotik_rest") {
    result = await provisionMikrotikVoucherForTransaction(params);
  } else if (sourceVoucherMode === "radius_voucher") {
    result = await provisionRadiusVoucherForTransaction(params);
  } else {
    result = await transactionAssignVoucher({
      tenantId: params.tenantId,
      reference: params.reference,
      email: transaction.email,
      phone: transaction.phone,
      packageId: transaction.package_id,
      voucherSourceMode: sourceVoucherMode,
    });
  }

  if (result.status === "assigned" || result.status === "already") {
    const voucherCode = result.voucherCode;
    if (!voucherCode) {
      return result;
    }
    const notificationDelivery = await sendVoucherNotifications({
      tenantId: params.tenantId,
      locationId: transaction.location_id ?? null,
      transaction,
      voucherCode,
    });
    await sendLowVoucherStockAlertIfNeeded({
      tenantId: params.tenantId,
      packageId: transaction.package_id,
      locationId: transaction.location_id ?? null,
    });
    await updateTransactionNotificationDelivery({
      tenantId: params.tenantId,
      reference: params.reference,
      smsSent: notificationDelivery.smsSent,
      emailSent: notificationDelivery.emailSent,
    });
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
    // These are definitive failures from Paystack — payment will never complete.
    if (paystackStatus === "failed" || paystackStatus === "reversed") {
      await markTransactionFailed({
        tenantId: params.tenantId,
        reference: params.reference,
        status: "paystack_failed",
      });
      return { status: "not_success" as const };
    }

    // Everything else (pending, ongoing, abandoned, queued, unknown) means
    // Paystack hasn't finalised yet. Leave as pending so the poller retries.
    return { status: "pending" as const };
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
