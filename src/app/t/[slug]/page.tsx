import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Checkout } from "@/components/checkout";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCaptivePortalContextFromSearchParams } from "@/lib/captive-portal";
import {
  getPackagesWithAvailability,
  getTenantAppearance,
  resolveStorefrontContextBySlug,
  tenantRequiresPlatformSubscription,
} from "@/lib/store";

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
  const storefront = await resolveStorefrontContextBySlug(slug);
  if (!storefront) notFound();
  const { tenant, location, displayName, storefrontSlug, accessMode, voucherSourceMode } = storefront;
  const portalContext = getCaptivePortalContextFromSearchParams(resolvedSearchParams);
  const appearance = await getTenantAppearance(tenant.id, location?.id ?? null);
  const shellStyle = {
    "--ac": appearance.storePrimaryColor,
    "--ac-dim": `${appearance.storePrimaryColor}1a`,
    "--ac-soft": `${appearance.storePrimaryColor}2b`,
    "--ac-bd": `${appearance.storePrimaryColor}55`,
  } as CSSProperties;
  const autoProvisionVoucherMode =
    voucherSourceMode === "omada_openapi" ||
    voucherSourceMode === "mikrotik_rest" ||
    voucherSourceMode === "radius_voucher";

  if (tenant.status !== "active" || tenantRequiresPlatformSubscription(tenant)) {
    return (
      <div className="portal-public-shell">
        <div className="portal-public-container" style={shellStyle}>
          <PortalHeader tenantName={displayName} tenantSlug={storefrontSlug} />
          <div className="status-card">
            <h1 className="status-title">
              {tenantRequiresPlatformSubscription(tenant) ? "Subscription payment pending" : "Portal setup in progress"}
            </h1>
            <p className="status-copy">
              {tenantRequiresPlatformSubscription(tenant)
                ? "This storefront will open after the operator completes the final onboarding subscription step."
                : "This voucher storefront is still being configured. Please check again shortly."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const packages = (await getPackagesWithAvailability(tenant.id, location?.id ?? null))
    .filter((pkg) =>
      accessMode === "account_access"
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
        accessMode === "account_access"
          ? 999999
          : autoProvisionVoucherMode
          ? Math.max(1, pkg.available_count)
          : pkg.available_count,
    }));

  if (packages.length === 0) {
    return (
      <div className="portal-public-shell">
        <div className="portal-public-container" style={shellStyle}>
          <PortalHeader tenantName={displayName} tenantSlug={storefrontSlug} />
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
          <PortalHeader tenantName={displayName} tenantSlug={storefrontSlug} />

        <section className="portal-public-hero">
          <p className="section-kicker">Captive portal storefront</p>
          <h1>{displayName} Wi-Fi access</h1>
          <p>Choose a plan, pay securely, and receive your access details instantly.</p>
        </section>

        <div className="portal-checkout-frame">
          <Checkout
            tenantSlug={storefrontSlug}
            packages={packages}
            accessMode={accessMode}
            voucherSourceMode={voucherSourceMode}
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
