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
        <div className="app-container max-w-2xl py-20 sm:py-24">
          <div className="surface-card p-8">
            <h1 className="font-display text-3xl font-bold text-slate-900">Not ready yet</h1>
            <p className="mt-3 text-slate-600">
              This voucher portal is still being set up. Please check back soon.
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
        <div className="app-container max-w-2xl py-20 sm:py-24">
          <div className="surface-card p-8">
            <h1 className="font-display text-3xl font-bold text-slate-900">Coming soon</h1>
            <p className="mt-3 text-slate-600">
              This tenant portal will go live after voucher plans are imported.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-16">
          <div className="space-y-6 pt-2 text-center lg:space-y-8 lg:text-left">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="hero-title">Get fast guest Wi-Fi without lines, paper slips, or manual setup.</h1>
            <p className="hero-copy mx-auto lg:mx-0">
              Pick a plan, pay securely with Paystack, and receive your voucher code by SMS in seconds.
            </p>
            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Live</strong>
                <span>plan availability</span>
              </div>
              <div className="hero-metric">
                <strong>Secure</strong>
                <span>paystack checkout</span>
              </div>
              <div className="hero-metric">
                <strong>Instant</strong>
                <span>code delivery</span>
              </div>
            </div>
          </div>

          <div className="surface-card p-5 sm:p-6 md:p-7">
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </div>
        </div>
      </div>
    </div>
  );
}