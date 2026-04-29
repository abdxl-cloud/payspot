import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { CaptiveBrowserAuth } from "@/components/captive-browserauth";
import { ThemeToggle } from "@/components/theme-toggle";
import { VoucherDisplay } from "@/components/voucher-display";
import {
  createCaptivePortalSearchParams,
  getCaptivePortalContextFromSearchParams,
} from "@/lib/captive-portal";
import { verifyAndProcess } from "@/lib/payments";
import { requirePaystackSecretForTransaction } from "@/lib/paystack-routing";
import {
  getPackageById,
  getTenantBySlug,
  getTransaction,
} from "@/lib/store";

type Props = {
  params: { slug: string; reference: string } | Promise<{ slug: string; reference: string }>;
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function TenantPaymentVerifyPage({ params, searchParams }: Props) {
  const { slug, reference } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const portalContext = getCaptivePortalContextFromSearchParams(resolvedSearchParams);
  const portalReturnQuery = createCaptivePortalSearchParams(portalContext).toString();

  const transaction = await getTransaction(tenant.id, reference);

  if (!transaction) {
    return (
      <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
          <div className="status-card">
            <h1 className="status-title">Transaction not found</h1>
            <p className="status-copy">
              We could not locate this payment reference. Please contact us at payspot@abdxl.cloud if you were charged.
            </p>
          </div>
      </VerifyFrame>
    );
  }

  if (transaction.payment_status === "cancelled") {
    return (
      <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
          <div className="status-card">
            <h1 className="status-title">Payment cancelled</h1>
            <p className="status-copy">
              This pending payment was cancelled by the operator, so PaySpot will not keep checking it.
            </p>
            <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
          </div>
      </VerifyFrame>
    );
  }

  if (transaction.payment_status !== "success") {
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
          : "Payments are not configured for this tenant.";
      return (
        <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
            <div className="status-card">
              <h1 className="status-title">Unable to verify payment</h1>
              <p className="status-copy">{message}</p>
            </div>
        </VerifyFrame>
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
      console.error("Payment verification failed", error);
      return (
        <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
            <div className="status-card">
              <h1 className="status-title">Unable to verify payment right now</h1>
              <p className="status-copy">
                We could not reach the payment provider to confirm this transaction. Please refresh shortly.
              </p>
              <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
            </div>
        </VerifyFrame>
      );
    }
  }

  const updated = await getTransaction(tenant.id, reference);
  const pkg = updated ? await getPackageById(tenant.id, updated.package_id) : null;

  if (updated?.payment_status === "success") {
    const isAccountAccess = updated.delivery_mode === "account_access";
    const smsDelivered = (updated.notification_sms_sent ?? 0) > 0;
    const emailDelivered = (updated.notification_email_sent ?? 0) > 0;
    const voucherDeliveryMessage =
      smsDelivered && emailDelivered
        ? "This voucher was also delivered to your email and phone by SMS, check your inbox, spam folder, and SMS messages."
        : emailDelivered
          ? "This voucher was also delivered to your email, check your inbox and spam folder."
          : smsDelivered
            ? "This voucher was also delivered to your phone by SMS."
            : "Your voucher is shown above and ready to use.";
    return (
      <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
          <div className="status-card">
            <p className="section-kicker">Payment confirmed</p>
            <h1 className="mt-2 status-title">
              {isAccountAccess ? "Your internet plan is active" : "Your voucher is ready"}
            </h1>
            <p className="mt-2 break-all text-slate-600">
              {pkg?.name ?? "WiFi Access"} | Reference: {reference}
            </p>

            {isAccountAccess ? (
              <div className="mt-6 rounded-2xl border border-emerald-300/80 bg-emerald-50/80 px-5 py-7 text-center sm:px-6 sm:py-8">
                <p className="text-sm text-emerald-700">
                  Sign in to the captive portal with your account credentials to start browsing.
                </p>
              </div>
            ) : (
              <VoucherDisplay
                code={updated.voucher_code ?? ""}
                tenantSlug={tenant.slug}
                voucherSourceMode={tenant.voucher_source_mode ?? "import_csv"}
                planName={pkg?.name}
                reference={reference}
              />
            )}

            <div className="mt-6 space-y-2 text-sm text-slate-700">
              {isAccountAccess ? (
                <>
                  <p>1. Connect to the Wi-Fi network.</p>
                  <p>2. Open the login page in your browser.</p>
                  <p>3. Sign in with your subscriber account to start browsing.</p>
                </>
              ) : (
                <>
                  <p>1. Connect to the Wi-Fi network.</p>
                  <p>2. Open the login page in your browser.</p>
                  <p>3. Enter this voucher code to begin browsing.</p>
                </>
              )}
            </div>

            {isAccountAccess && portalContext?.originUrl ? (
              <div className="mt-6">
                <a
                  href={portalContext.originUrl}
                  className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
                >
                  Return to network sign-in
                </a>
                <p className="mt-2 text-xs text-slate-500">
                  This returns you to the original page you tried to open so the captive network can continue its login flow.
                </p>
              </div>
            ) : null}

            {isAccountAccess && !portalContext?.originUrl && portalReturnQuery ? (
              <p className="mt-6 text-xs text-slate-500">
                Captive portal session details were preserved for this payment, but no original destination URL was provided by the controller.
              </p>
            ) : null}

            {isAccountAccess ? (
              <div className="mt-6">
                <CaptiveBrowserAuth
                  tenantSlug={tenant.slug}
                  portalContext={portalContext}
                  defaultUsername={updated.email}
                  autoSubmitWhenReady
                />
              </div>
            ) : null}

            {!isAccountAccess ? (
              <>
                <div className="mt-6">
                  <a
                    href={portalContext?.originUrl ?? `/t/${tenant.slug}`}
                    className="inline-flex items-center justify-center rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800"
                  >
                    Go to network sign-in
                  </a>
                  <p className="mt-2 text-xs text-slate-500">
                    Opens the Wi-Fi login page where you can enter your voucher code.
                  </p>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  {voucherDeliveryMessage}
                </p>
              </>
            ) : null}
          </div>
      </VerifyFrame>
    );
  }

  if (updated && updated.payment_status !== "pending" && updated.payment_status !== "processing") {
    const failureMessages: Record<string, string> = {
      paystack_failed:
        "We could not confirm this payment with Paystack. If you were charged, contact us at payspot@abdxl.cloud.",
      amount_mismatch:
        "We received a payment but the amount did not match the selected package.",
      currency_mismatch:
        "We received a payment in an unsupported currency.",
      init_failed: "We could not start this payment. Please try again.",
      voucher_unavailable: "Payment succeeded but no voucher was available. Contact us at payspot@abdxl.cloud.",
      mikrotik_config_missing:
        "Payment succeeded, but MikroTik voucher delivery is not configured correctly. Contact us at payspot@abdxl.cloud.",
      mikrotik_provision_failed:
        "Payment succeeded, but PaySpot could not create your MikroTik voucher. Contact us at payspot@abdxl.cloud.",
      access_activation_failed:
        "Payment succeeded but account access could not be activated. Contact us at payspot@abdxl.cloud.",
      plan_window_unusable:
        "Payment succeeded, but this plan's usage window is not valid right now. Contact us at payspot@abdxl.cloud.",
    };

    const message =
      failureMessages[updated.payment_status] ??
      "This payment could not be completed. Please contact us at payspot@abdxl.cloud.";

    return (
      <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
          <div className="status-card">
            <h1 className="status-title">Payment not completed</h1>
            <p className="status-copy">{message}</p>
            <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
          </div>
      </VerifyFrame>
    );
  }

  return (
    <VerifyFrame tenantName={tenant.name} tenantSlug={tenant.slug}>
        <div className="status-card">
          <h1 className="status-title">Payment pending</h1>
          <p className="status-copy">We are verifying your payment. Please refresh this page in a moment.</p>
          <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
        </div>
    </VerifyFrame>
  );
}

function VerifyFrame({
  tenantName,
  tenantSlug,
  children,
}: {
  tenantName: string;
  tenantSlug: string;
  children: ReactNode;
}) {
  return (
    <div className="verify-prototype-shell">
      <div className="verify-prototype-container">
        <header className="prototype-nav">
          <a href={`/t/${tenantSlug}`} className="prototype-brand">
            {tenantName}
          </a>
          <ThemeToggle />
        </header>
        {children}
      </div>
    </div>
  );
}
