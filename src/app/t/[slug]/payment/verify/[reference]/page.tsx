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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24 text-center">
          <h1 className="text-3xl font-display font-semibold">Transaction not found</h1>
          <p className="mt-4 text-muted-foreground">
            We could not locate this payment reference. Please contact support if you were charged.
          </p>
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
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24 text-center">
            <h1 className="text-3xl font-display font-semibold">Unable to verify payment</h1>
            <p className="mt-4 text-muted-foreground">
              Payments are not configured for this tenant. Please contact support.
            </p>
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-lg sm:p-12">
            <div className="text-center mb-8">
              <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Payment confirmed
              </p>
              <h1 className="mt-4 text-4xl font-display font-semibold text-foreground">
                Your voucher is ready
              </h1>
              <p className="mt-3 text-muted-foreground">
                {pkg?.name ?? "WiFi Access"} • {reference}
              </p>
            </div>

            <div className="mt-8 rounded-xl border-2 border-dashed border-border bg-muted px-6 py-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">Voucher Code</p>
              <p className="mt-3 break-all text-3xl font-semibold tracking-wider text-foreground font-mono">
                {updated.voucher_code}
              </p>
            </div>

            <div className="mt-8 space-y-3 text-sm text-muted-foreground">
              <div className="flex gap-3">
                <span className="flex-shrink-0 font-semibold text-foreground">1.</span>
                <span>Connect to the WiFi network at this venue</span>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 font-semibold text-foreground">2.</span>
                <span>Open your browser to the login portal</span>
              </div>
              <div className="flex gap-3">
                <span className="flex-shrink-0 font-semibold text-foreground">3.</span>
                <span>Enter your voucher code above to start browsing</span>
              </div>
            </div>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              We've also sent your code to your phone via SMS for convenience.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24 text-center">
        <h1 className="text-3xl font-display font-semibold">Payment pending</h1>
        <p className="mt-4 text-muted-foreground">
          We are verifying your payment. Please refresh this page in a moment.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">Reference: {reference}</p>
      </div>
    </div>
  );
}
