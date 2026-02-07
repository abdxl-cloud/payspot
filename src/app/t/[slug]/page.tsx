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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24 text-center">
          <h1 className="text-3xl font-display font-semibold">Portal is being set up</h1>
          <p className="mt-4 text-muted-foreground text-base">
            This Wi-Fi voucher portal is currently being configured. Please check back soon.
          </p>
        </div>
      </div>
    );
  }

  const packages = getPackagesWithAvailability(tenant.id).map((pkg) => ({
    code: pkg.code,
    name: pkg.name,
    durationMinutes: pkg.duration_minutes,
    priceNgn: pkg.price_ngn,
    description: pkg.description,
    availableCount: pkg.available_count,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
          <div className="space-y-8 pt-4">
            <div className="space-y-4">
              <p className="text-sm font-semibold text-muted-foreground">{tenant.name}</p>
              <h1 className="font-display text-6xl sm:text-7xl font-bold leading-tight text-balance">
                Buy WiFi
              </h1>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed max-w-lg font-light">
              Select a package, pay securely, and get instant access via SMS.
            </p>
          </div>

          <div>
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </div>
        </div>
      </div>
    </div>
  );
}
