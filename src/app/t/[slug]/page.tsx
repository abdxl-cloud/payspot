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
          <AppTopbar breadcrumb="Purchase portal" environment="Live" accountLabel={tenant.name} />
          <div className="status-card">
            <h1 className="status-title">Portal setup in progress</h1>
            <p className="status-copy">This voucher storefront is still being configured. Please check again shortly.</p>
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
          <AppTopbar breadcrumb="Purchase portal" environment="Live" accountLabel={tenant.name} />
          <div className="status-card">
            <h1 className="status-title">Plans are coming soon</h1>
            <p className="status-copy">Voucher plans are not available yet for this location. The operator will publish pricing soon.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar breadcrumb={`Purchase / ${tenant.slug}`} environment="Live" accountLabel={tenant.name} />
        <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/82 px-4 py-3">
          <div className="min-w-0">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Choose a plan and pay</h1>
            <p className="mt-1 text-sm text-slate-600">Instant voucher delivery after successful payment.</p>
          </div>
          <div className="flex gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-300/80 bg-white px-2.5 py-1">Live inventory</span>
            <span className="rounded-full border border-slate-300/80 bg-white px-2.5 py-1">Paystack secure</span>
          </div>
        </section>
        <div className="grid gap-6">
          <section>
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </section>
        </div>
      </div>
    </div>
  );
}
