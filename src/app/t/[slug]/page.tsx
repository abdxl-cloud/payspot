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

        <div className="mx-auto grid w-full max-w-5xl gap-4 sm:gap-5">
          <section className="workspace-rail p-4 sm:p-5">
            <h3 className="text-base sm:text-lg">Checkout steps</h3>
            <ol className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                1. Select a voucher plan.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                2. Enter your active phone number.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                3. Pay securely with Paystack.
              </li>
              <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                4. Receive your voucher instantly by SMS.
              </li>
            </ol>
          </section>

          <Checkout tenantSlug={tenant.slug} packages={packages} />
        </div>
      </div>
    </div>
  );
}
