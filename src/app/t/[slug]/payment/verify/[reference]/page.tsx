import { notFound } from "next/navigation";
import { CaptiveBrowserAuth } from "@/components/captive-browserauth";
import { VoucherDisplay } from "@/components/voucher-display";
import {
  createCaptivePortalSearchParams,
  getCaptivePortalContextFromSearchParams,
} from "@/lib/captive-portal";
import { verifyAndProcess } from "@/lib/payments";
import {
  getPackageById,
  getTenantBySlug,
  getTransaction,
  requireTenantPaystackSecretKey,
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
      <div className="app-shell">
        <div className="app-container max-w-3xl py-12 sm:py-20">
          <div className="status-card">
            <h1 className="status-title">Transaction not found</h1>
            <p className="status-copy">
              We could not locate this payment reference. Please contact support if you were charged.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (transaction.payment_status !== "success") {
    let paystackSecretKey: string;
    try {
      paystackSecretKey = await requireTenantPaystackSecretKey(tenant.id);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Tenant Paystack key is invalid"
          ? "Tenant payment key is invalid. Use a Paystack secret key (sk_test_... or sk_live_...)."
          : "Payments are not configured for this tenant.";
      return (
        <div className="app-shell">
          <div className="app-container max-w-3xl py-12 sm:py-20">
            <div className="status-card">
              <h1 className="status-title">Unable to verify payment</h1>
              <p className="status-copy">{message}</p>
            </div>
          </div>
        </div>
      );
    }
    await verifyAndProcess({
      tenantId: tenant.id,
      reference,
      expectedAmountNgn: transaction.amount_ngn,
      paystackSecretKey,
    });
  }

  const updated = await getTransaction(tenant.id, reference);
  const pkg = updated ? await getPackageById(tenant.id, updated.package_id) : null;

  if (updated?.payment_status === "success") {
    const isAccountAccess = updated.delivery_mode === "account_access";
    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-12 sm:py-20">
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
              <p className="mt-6 text-xs text-slate-500">
                This voucher was also delivered to your phone by SMS.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (updated && updated.payment_status !== "pending" && updated.payment_status !== "processing") {
    const failureMessages: Record<string, string> = {
      paystack_failed:
        "We could not confirm this payment with Paystack. If you were charged, contact support.",
      amount_mismatch:
        "We received a payment but the amount did not match the selected package.",
      currency_mismatch:
        "We received a payment in an unsupported currency.",
      init_failed: "We could not start this payment. Please try again.",
      voucher_unavailable: "Payment succeeded but no voucher was available. Contact support.",
      access_activation_failed:
        "Payment succeeded but account access could not be activated. Contact support.",
      plan_window_unusable:
        "Payment succeeded, but this plan's usage window is not valid right now. Contact support.",
    };

    const message =
      failureMessages[updated.payment_status] ??
      "This payment could not be completed. Please contact support.";

    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-12 sm:py-20">
          <div className="status-card">
            <h1 className="status-title">Payment not completed</h1>
            <p className="status-copy">{message}</p>
            <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container max-w-3xl py-12 sm:py-20">
        <div className="status-card">
          <h1 className="status-title">Payment pending</h1>
          <p className="status-copy">We are verifying your payment. Please refresh this page in a moment.</p>
          <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
        </div>
      </div>
    </div>
  );
}
