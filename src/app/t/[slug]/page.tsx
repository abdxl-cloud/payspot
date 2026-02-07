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
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">{tenant.name}</h2>
              <h1 className="font-display text-6xl font-bold leading-tight tracking-tight sm:text-7xl text-balance">
                Buy instant WiFi
              </h1>
            </div>
            <p className="text-lg leading-relaxed text-muted-foreground max-w-lg">
              Select a WiFi package, pay securely with Paystack, and get instant access via SMS. Get online in seconds.
            </p>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Multiple duration packages available</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Secure Paystack payment processing</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Instant SMS delivery of access codes</span>
              </div>
            </div>
          </div>

          <div className="lg:pl-8">
            <Checkout tenantSlug={tenant.slug} packages={packages} />
          </div>
        </div>
      </div>
    </div>
  );
}
