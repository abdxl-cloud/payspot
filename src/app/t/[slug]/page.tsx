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
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24">
          <h1 className="text-3xl font-semibold">Not ready yet</h1>
          <p className="mt-4 text-slate-300">
            This voucher portal is still being set up. Please check back soon.
          </p>
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
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24">
          <h1 className="text-3xl font-semibold">Coming soon</h1>
          <p className="mt-4 text-slate-300">
            This tenant portal will go live after voucher plans are imported.
            Please check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-6 text-center lg:text-left">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 lg:mx-0">
              {tenant.name}
            </div>
            <h1 className="font-display mx-auto max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:mx-0">
              Fast, paid WiFi access for guests who need instant connectivity.
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-600 lg:mx-0">
              Choose a plan, pay securely with Paystack, and receive your Wi-Fi access
              code by SMS in seconds.
            </p>
          </div>

          <div className="w-full rounded-[32px] border border-white/60 bg-white/70 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.15)] backdrop-blur sm:p-6">
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </div>
        </div>
      </div>
    </div>
  );
}
