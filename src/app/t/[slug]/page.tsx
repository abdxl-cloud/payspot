import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout";
import { getPackagesWithAvailability, getTenantBySlug } from "@/lib/store";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantPurchasePage({ params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  if (tenant.status !== "active") {
    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-20 sm:py-24">
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

  const packages = getPackagesWithAvailability(tenant.id)
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
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-14">
          <section className="space-y-7 pt-1 text-center lg:text-left">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="hero-title">
              Buy guest Wi-Fi in seconds with a checkout that feels product-grade.
            </h1>
            <p className="hero-copy mx-auto lg:mx-0">
              Select a plan, complete payment via Paystack, and receive your voucher code instantly over SMS.
            </p>
            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Live inventory</strong>
                <span>only available plans are shown</span>
              </div>
              <div className="hero-metric">
                <strong>Secure checkout</strong>
                <span>payments processed by Paystack</span>
              </div>
              <div className="hero-metric">
                <strong>Instant delivery</strong>
                <span>voucher sent by SMS after success</span>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6 md:p-7">
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </section>
        </div>
      </div>
    </div>
  );
}
