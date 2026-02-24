import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout";
import { AppTopbar } from "@/components/app-topbar";
import { getPackagesWithAvailability, getTenantBySlug } from "@/lib/store";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantPurchasePage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  if (tenant.status !== "active") {
    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-20 sm:py-24">
          <AppTopbar
            breadcrumb="Purchase portal"
            environment="Live"
            accountLabel={tenant.name}
          />
          <div className="status-card">
            <h1 className="status-title">Portal setup in progress</h1>
            <p className="status-copy">
              This voucher storefront is still being configured. Please check again shortly.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const packages = (await getPackagesWithAvailability(tenant.id))
    .filter((pkg) => pkg.price_ngn > 0 && pkg.total_count > 0)
    .map((pkg) => ({
      code: pkg.code,
      name: pkg.name,
      durationMinutes: pkg.duration_minutes,
      priceNgn: pkg.price_ngn,
      description: pkg.description,
      availableCount: pkg.available_count,
    }));

  if (packages.length === 0) {
    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-20 sm:py-24">
          <AppTopbar
            breadcrumb="Purchase portal"
            environment="Live"
            accountLabel={tenant.name}
          />
          <div className="status-card">
            <h1 className="status-title">Plans are coming soon</h1>
            <p className="status-copy">
              Voucher plans are not available yet for this location. The operator will publish pricing soon.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb={`Purchase / ${tenant.slug}`}
          environment="Live"
          accountLabel={tenant.name}
        />

        <div className="workspace-grid">
          <section className="workspace-main space-y-5">
            <header className="panel-surface">
              <p className="section-kicker">Guest voucher checkout</p>
              <h1 className="panel-title mt-2">
                Fast internet access, <span className="text-gradient">paid in seconds</span>
              </h1>
              <p className="panel-copy mt-3 max-w-3xl">
                Select your browsing duration, enter your phone number, and complete payment via Paystack.
                Voucher code is delivered immediately by SMS after successful verification.
              </p>
            </header>
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </section>

          <aside className="workspace-side workspace-side-sticky">
            <section className="workspace-rail">
              <h3>Before You Pay</h3>
              <p>Use an active Nigerian phone number. Voucher and payment updates are tied to it.</p>
            </section>
            <section className="workspace-rail">
              <h3>Trust Signals</h3>
              <p>Paystack-secured checkout, one-time voucher assignment, and SMS delivery on success.</p>
            </section>
            <section className="workspace-rail">
              <h3>Interrupted Payment?</h3>
              <p>Use the resume tab with your reference to continue without starting over.</p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
