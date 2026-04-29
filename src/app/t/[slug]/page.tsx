import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Checkout } from "@/components/checkout";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCaptivePortalContextFromSearchParams } from "@/lib/captive-portal";
import { getPackagesWithAvailability, getTenantAppearance, getTenantBySlug } from "@/lib/store";

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
  const appearance = await getTenantAppearance(tenant.id);
  const shellStyle = {
    "--ac": appearance.storePrimaryColor,
    "--ac-dim": `${appearance.storePrimaryColor}1a`,
    "--ac-soft": `${appearance.storePrimaryColor}2b`,
    "--ac-bd": `${appearance.storePrimaryColor}55`,
  } as CSSProperties;
  const autoProvisionVoucherMode =
    tenant.voucher_source_mode === "omada_openapi" ||
    tenant.voucher_source_mode === "mikrotik_rest" ||
    tenant.voucher_source_mode === "radius_voucher";

  if (tenant.status !== "active") {
    return (
      <div className="portal-public-shell">
        <div className="portal-public-container" style={shellStyle}>
          <PortalHeader tenantName={tenant.name} tenantSlug={tenant.slug} />
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
      <div className="portal-public-shell">
        <div className="portal-public-container" style={shellStyle}>
          <PortalHeader tenantName={tenant.name} tenantSlug={tenant.slug} />
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
    <div className="portal-public-shell">
      <div className="portal-public-container" style={shellStyle}>
        <PortalHeader tenantName={tenant.name} tenantSlug={tenant.slug} />

        <section className="portal-public-hero">
          <p className="section-kicker">Captive portal storefront</p>
          <h1>{tenant.name} Wi-Fi access</h1>
          <p>Choose a plan, pay securely, and receive your access details instantly.</p>
        </section>

        <div className="portal-checkout-frame">
          <Checkout
            tenantSlug={tenant.slug}
            packages={packages}
            accessMode={normalizeAccessMode(tenant.portal_auth_mode)}
            voucherSourceMode={tenant.voucher_source_mode ?? "import_csv"}
            portalContext={portalContext}
          />
        </div>
      </div>
    </div>
  );
}

function PortalHeader({ tenantName, tenantSlug }: { tenantName: string; tenantSlug: string }) {
  const initials = tenantName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "PS";

  return (
    <header className="portal-public-head">
      <div className="portal-venue">
        <div className="portal-venue-mark">{initials}</div>
        <div>
          <p className="portal-venue-name">{tenantName}</p>
          <p className="portal-venue-sub">{tenantSlug}.payspot.app</p>
        </div>
      </div>
      <div className="portal-head-actions">
        <ThemeToggle />
        <p className="powered-by">Powered by <strong>PaySpot</strong></p>
      </div>
    </header>
  );
}
