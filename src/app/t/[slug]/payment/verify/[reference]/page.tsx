import { notFound } from "next/navigation";
import { verifyAndProcess } from "@/lib/payments";
import {
  getPackageById,
  getTenantBySlug,
  getTransaction,
  requireTenantPaystackSecretKey,
} from "@/lib/store";

type Props = {
  params: { slug: string; reference: string } | Promise<{ slug: string; reference: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantPaymentVerifyPage({ params }: Props) {
  const { slug, reference } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  const transaction = getTransaction(tenant.id, reference);

  if (!transaction) {
    return (
      <div className="app-shell">
        <div className="app-container max-w-2xl py-20 sm:py-24">
          <div className="surface-card p-8">
            <h1 className="font-display text-3xl font-semibold text-slate-900">Transaction not found</h1>
            <p className="mt-3 text-slate-600">
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
      paystackSecretKey = requireTenantPaystackSecretKey(tenant.id);
    } catch {
      return (
        <div className="app-shell">
          <div className="app-container max-w-2xl py-20 sm:py-24">
            <div className="surface-card p-8">
              <h1 className="font-display text-3xl font-semibold text-slate-900">Unable to verify payment</h1>
              <p className="mt-3 text-slate-600">Payments are not configured for this tenant.</p>
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

  const updated = getTransaction(tenant.id, reference);
  const pkg = updated ? getPackageById(tenant.id, updated.package_id) : null;

  if (updated?.payment_status === "success" && updated.voucher_code) {
    return (
      <div className="app-shell">
        <div className="app-container max-w-2xl py-20 sm:py-24">
          <div className="surface-card p-8 sm:p-10">
            <p className="section-kicker">Payment confirmed</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Your voucher is ready</h1>
            <p className="mt-2 text-slate-600">
              {pkg?.name ?? "WiFi Access"} | Reference: {reference}
            </p>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center sm:px-6 sm:py-8">
              <p className="text-sm text-slate-500">Voucher code</p>
              <p className="mt-2 break-all text-3xl font-semibold tracking-[0.23em] text-slate-900">
                {updated.voucher_code}
              </p>
            </div>

            <div className="mt-6 space-y-2 text-sm text-slate-600">
              <p>1. Connect to the WiFi network.</p>
              <p>2. Open your browser to the login portal.</p>
              <p>3. Enter your voucher code to start browsing.</p>
            </div>

            <p className="mt-6 text-xs text-slate-500">We also sent this code to your phone by SMS.</p>
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
    };

    const message =
      failureMessages[updated.payment_status] ??
      "This payment could not be completed. Please contact support.";

    return (
      <div className="app-shell">
        <div className="app-container max-w-2xl py-20 sm:py-24">
          <div className="surface-card p-8">
            <h1 className="font-display text-3xl font-semibold text-slate-900">Payment not completed</h1>
            <p className="mt-3 text-slate-600">{message}</p>
            <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container max-w-2xl py-20 sm:py-24">
        <div className="surface-card p-8">
          <h1 className="font-display text-3xl font-semibold text-slate-900">Payment pending</h1>
          <p className="mt-3 text-slate-600">
            We are verifying your payment. Please refresh this page in a moment.
          </p>
          <p className="mt-2 text-sm text-slate-500">Reference: {reference}</p>
        </div>
      </div>
    </div>
  );
}