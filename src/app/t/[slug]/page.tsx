import { notFound } from "next/navigation";
import { Checkout } from "@/components/checkout";
import { AppTopbar } from "@/components/app-topbar";
import { getCaptivePortalContextFromSearchParams } from "@/lib/captive-portal";
import { getPackagesWithAvailability, getTenantBySlug } from "@/lib/store";

function normalizeAccessMode(
  value: string | null | undefined,
): "voucher_access" | "account_access" {
  if (value === "external_radius_portal") return "account_access";
  return "voucher_access";
}

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function TenantPurchasePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const portalContext = getCaptivePortalContextFromSearchParams(resolvedSearchParams);
  const autoProvisionVoucherMode =
    tenant.voucher_source_mode === "omada_openapi" ||
    tenant.voucher_source_mode === "mikrotik_rest" ||
    tenant.voucher_source_mode === "radius_voucher";

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
    .filter((pkg) =>
      normalizeAccessMode(tenant.portal_auth_mode) === "account_access"
        ? pkg.price_ngn > 0
        : autoProvisionVoucherMode
        ? pkg.price_ngn > 0
        : pkg.price_ngn > 0 && pkg.total_count > 0,
    )
    .map((pkg) => ({
      code: pkg.code,
      name: pkg.name,
      durationMinutes: pkg.duration_minutes,
      priceNgn: pkg.price_ngn,
      maxDevices: pkg.max_devices,
      bandwidthProfile: pkg.bandwidth_profile,
      dataLimitMb: pkg.data_limit_mb,
      description: pkg.description,
      availableCount:
        normalizeAccessMode(tenant.portal_auth_mode) === "account_access"
          ? 999999
          : autoProvisionVoucherMode
          ? Math.max(1, pkg.available_count)
          : pkg.available_count,
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
          <Checkout
            tenantSlug={tenant.slug}
            packages={packages}
            accessMode={normalizeAccessMode(tenant.portal_auth_mode)}
            portalContext={portalContext}
          />
        </div>
      </div>
    </div>
  );
}
