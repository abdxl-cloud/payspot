import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  Activity,
  ArrowRight,
  DatabaseZap,
  Gauge,
  Search,
  ShieldCheck,
  TimerReset,
  Wifi,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getPackageById,
  getRadiusVoucherAccessState,
  getTenantAppearance,
  getTenantBySlug,
  getTransactionByVoucherCode,
  getVoucherPoolEntryByCode,
  normalizeVoucherSourceMode,
} from "@/lib/store";

export const dynamic = "force-dynamic";

type VoucherSourceMode = "import_csv" | "mikrotik_rest" | "radius_voucher" | "omada_openapi";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return "Not time-based";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "1 day" : `${days} days`;
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function formatReason(reason: string | null | undefined) {
  if (!reason) return "Voucher is active";
  if (reason === "data_limit_reached") return "Data limit reached";
  if (reason === "plan_expired") return "Plan expired";
  if (reason === "no_active_voucher") return "Voucher is no longer active";
  return reason.replaceAll("_", " ");
}

function getUsagePercent(usedBytes: number, dataLimitBytes: number | null) {
  if (dataLimitBytes == null || dataLimitBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((usedBytes / dataLimitBytes) * 100)));
}

function getVoucherModeMeta(mode: VoucherSourceMode) {
  if (mode === "radius_voucher") {
    return {
      label: "RADIUS voucher",
      copy: "Check whether a voucher is active, how much data it has used, and when access ends.",
    };
  }
  if (mode === "mikrotik_rest") {
    return {
      label: "MikroTik direct",
      copy: "Confirm a generated MikroTik voucher and review the plan attached to it.",
    };
  }
  if (mode === "omada_openapi") {
    return {
      label: "Omada API",
      copy: "Confirm an Omada-generated voucher and the PaySpot payment that issued it.",
    };
  }
  return {
    label: "Imported vouchers",
    copy: "Confirm that an imported voucher belongs to this storefront and see its plan details.",
  };
}

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "USED") return "good";
  if (status === "UNUSED" || status === "ASSIGNED") return "warn";
  if (status === "EXPIRED") return "bad";
  return "muted";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    ACTIVE: "Active",
    ASSIGNED: "Issued",
    EXPIRED: "Expired",
    UNKNOWN: "Unknown",
    UNUSED: "Unused",
    USED: "Used",
  };
  return labels[status] ?? status;
}

async function lookupVoucher(params: {
  tenantId: string;
  rawCode: string;
  voucherSourceMode: VoucherSourceMode;
  radiusVoucherMode: boolean;
}) {
  const code = params.rawCode.trim();
  if (!code) return null;

  const [transaction, poolEntry] = await Promise.all([
    getTransactionByVoucherCode(
      params.tenantId,
      code,
      params.voucherSourceMode === "import_csv" ? "import_csv" : params.voucherSourceMode,
    ),
    params.voucherSourceMode === "import_csv"
      ? getVoucherPoolEntryByCode(params.tenantId, code)
      : Promise.resolve(null),
  ]);

  if (!transaction && !poolEntry) return null;

  const packageId = transaction?.package_id ?? poolEntry?.package_id;
  const pkg = packageId ? await getPackageById(params.tenantId, packageId) : null;

  let estimatedExpiresAt: string | null = null;
  if (transaction?.paid_at && pkg?.duration_minutes && pkg.duration_minutes > 0) {
    const paidMs = new Date(transaction.paid_at).getTime();
    if (!Number.isNaN(paidMs)) {
      estimatedExpiresAt = new Date(paidMs + pkg.duration_minutes * 60 * 1000).toISOString();
    }
  }

  const poolStatus: "UNUSED" | "ASSIGNED" | null =
    poolEntry?.status === "UNUSED"
      ? "UNUSED"
      : poolEntry?.status === "ASSIGNED" || transaction
        ? "ASSIGNED"
        : null;

  const radiusVoucher =
    params.radiusVoucherMode && transaction
      ? await getRadiusVoucherAccessState({
          tenantId: params.tenantId,
          reference: transaction.reference,
        })
      : null;
  const dataLimitBytes = pkg?.data_limit_mb && pkg.data_limit_mb > 0 ? pkg.data_limit_mb * 1024 * 1024 : null;
  const remainingBytes =
    radiusVoucher && dataLimitBytes !== null && radiusVoucher.usage
      ? Math.max(0, dataLimitBytes - radiusVoucher.usage.usedBytes)
      : null;
  const displayStatus =
    radiusVoucher?.state === "active"
      ? radiusVoucher.usage.usedBytes > 0 || radiusVoucher.usage.activeSessions > 0
        ? "USED"
        : "ACTIVE"
      : radiusVoucher?.reason
        ? "EXPIRED"
        : poolStatus ?? "UNKNOWN";

  return {
    code: code.toUpperCase(),
    displayStatus,
    estimatedExpiresAt,
    pkg,
    poolStatus,
    purchasedAt: transaction?.paid_at ?? poolEntry?.assigned_at ?? null,
    radiusVoucher: radiusVoucher
      ? {
          activeSessions: radiusVoucher.usage?.activeSessions ?? 0,
          dataLimitBytes,
          endsAt: radiusVoucher.endsAt,
          reason: radiusVoucher.reason,
          remainingBytes,
          state: radiusVoucher.state,
          usedBytes: radiusVoucher.usage?.usedBytes ?? 0,
        }
      : null,
  };
}

function InfoMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
}) {
  return (
    <div className="voucher-check-metric">
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResultMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "warn";
}) {
  return (
    <div className={`voucher-check-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function VoucherHeader({ tenantName, slug }: { tenantName: string; slug: string }) {
  const initials =
    tenantName
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PS";

  return (
    <header className="voucher-check-head">
      <Link href={`/t/${slug}`} className="voucher-check-brand">
        <span>{initials}</span>
        <div>
          <strong>{tenantName}</strong>
          <small>{slug}.payspot.app</small>
        </div>
      </Link>
      <div className="voucher-check-actions">
        <ThemeToggle />
        <Link href={`/t/${slug}`} className="voucher-check-buy">
          Buy a plan <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

export default async function VoucherCheckPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const appearance = await getTenantAppearance(tenant.id);
  const shellStyle = {
    "--ac": appearance.storePrimaryColor,
    "--ac-dim": `${appearance.storePrimaryColor}1a`,
    "--ac-soft": `${appearance.storePrimaryColor}2b`,
    "--ac-bd": `${appearance.storePrimaryColor}55`,
  } as CSSProperties;

  const radiusVoucherMode =
    tenant.portal_auth_mode === "external_radius_voucher" || tenant.voucher_source_mode === "radius_voucher";
  const voucherSourceMode = normalizeVoucherSourceMode(tenant.voucher_source_mode) as VoucherSourceMode;
  const voucherModeMeta = getVoucherModeMeta(voucherSourceMode);
  const rawCode = typeof resolvedSearchParams.code === "string" ? resolvedSearchParams.code : "";

  const result = rawCode
    ? await lookupVoucher({
        tenantId: tenant.id,
        rawCode,
        voucherSourceMode,
        radiusVoucherMode,
      })
    : null;
  const notFound_ = Boolean(rawCode && !result);
  const usagePercent = result?.radiusVoucher
    ? getUsagePercent(result.radiusVoucher.usedBytes, result.radiusVoucher.dataLimitBytes)
    : null;
  const displayStatus = result?.displayStatus ?? result?.poolStatus ?? "UNKNOWN";

  return (
    <main className="voucher-check-shell" style={shellStyle}>
      <div className="voucher-check-container">
        <VoucherHeader tenantName={tenant.name} slug={slug} />

        <section className="voucher-check-hero">
          <div className="voucher-check-copy">
            <p className="section-kicker">Voucher lookup</p>
            <h1>Check your Wi-Fi voucher</h1>
            <p>{voucherModeMeta.copy}</p>
            <div className="voucher-check-metrics">
              <InfoMetric icon={Search} label="Input" value="Voucher code only" />
              <InfoMetric icon={DatabaseZap} label="Source" value={voucherModeMeta.label} />
              <InfoMetric icon={ShieldCheck} label="Scope" value={tenant.name} />
            </div>
          </div>

          <form method="GET" action={`/t/${slug}/voucher`} className="voucher-check-form">
            <p className="section-kicker">Search</p>
            <h2>Enter voucher code</h2>
            <label htmlFor="code">Voucher code</label>
            <div className="voucher-check-input-row">
              <input
                id="code"
                type="text"
                name="code"
                defaultValue={rawCode}
                placeholder="ABC123XYZ"
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit">
                <Search aria-hidden="true" />
                Check
              </button>
            </div>
            {notFound_ ? (
              <div className="voucher-check-message bad">
                <strong>Voucher not found</strong>
                <span>{rawCode.toUpperCase()} was not found in this portal.</span>
              </div>
            ) : rawCode ? (
              <div className="voucher-check-message good">
                <strong>Current lookup</strong>
                <span>{rawCode.toUpperCase()}</span>
              </div>
            ) : (
              <div className="voucher-check-message muted">
                <strong>No code yet</strong>
                <span>Enter the voucher code you received after payment.</span>
              </div>
            )}
          </form>
        </section>

        {result ? (
          <section className="voucher-check-results">
            <article className="voucher-check-ticket">
              <div>
                <p className="section-kicker">Voucher</p>
                <h2>{result.code}</h2>
                <p>{result.pkg ? `${result.pkg.name} access voucher.` : "Voucher found in this portal."}</p>
              </div>
              <span className={`voucher-check-status ${statusTone(displayStatus)}`}>
                {statusLabel(displayStatus)}
              </span>
            </article>

            <div className="voucher-check-stat-grid">
              {result.pkg ? <ResultMetric label="Plan" value={result.pkg.name} tone="accent" /> : null}
              <ResultMetric label="Duration" value={formatDuration(result.pkg?.duration_minutes)} />
              <ResultMetric label="Purchased" value={formatDate(result.purchasedAt) ?? "-"} />
              <ResultMetric label="Estimated expiry" value={formatDate(result.estimatedExpiresAt) ?? "Not time-based"} />
            </div>

            <div className="voucher-check-detail-grid">
              <section className="voucher-check-card large">
                <div className="voucher-check-card-head">
                  <span>
                    <Activity aria-hidden="true" />
                  </span>
                  <div>
                    <p className="section-kicker">Accounting</p>
                    <h3>Usage</h3>
                  </div>
                </div>

                {result.radiusVoucher ? (
                  <div className="voucher-check-usage">
                    <div className="voucher-check-stat-grid compact">
                      <ResultMetric
                        label="Access state"
                        value={result.radiusVoucher.state === "active" ? "Active" : "Ended"}
                        tone="warn"
                      />
                      <ResultMetric label="Active sessions" value={String(result.radiusVoucher.activeSessions)} tone="warn" />
                      <ResultMetric label="Used data" value={formatBytes(result.radiusVoucher.usedBytes) ?? "-"} tone="warn" />
                      <ResultMetric
                        label="Remaining data"
                        value={
                          result.radiusVoucher.remainingBytes !== null
                            ? formatBytes(result.radiusVoucher.remainingBytes) ?? "-"
                            : "Unlimited"
                        }
                        tone="warn"
                      />
                    </div>

                    {result.radiusVoucher.dataLimitBytes !== null ? (
                      <div className="voucher-check-progress">
                        <div>
                          <span>Data cap progress</span>
                          <strong>{usagePercent ?? 0}%</strong>
                        </div>
                        <p>
                          {formatBytes(result.radiusVoucher.usedBytes) ?? "-"} used of{" "}
                          {formatBytes(result.radiusVoucher.dataLimitBytes) ?? "-"}
                        </p>
                        <div className="voucher-check-progress-track">
                          <span style={{ width: `${usagePercent ?? 0}%` }} />
                        </div>
                      </div>
                    ) : null}

                    <div className="voucher-check-stat-grid compact">
                      <ResultMetric
                        label="Access ends"
                        value={formatDate(result.radiusVoucher.endsAt) ?? "No time limit"}
                      />
                      <ResultMetric label="Reason" value={formatReason(result.radiusVoucher.reason)} />
                    </div>
                  </div>
                ) : (
                  <div className="voucher-check-empty">
                    <Gauge aria-hidden="true" />
                    <strong>Usage is not available for this voucher.</strong>
                    <span>Live usage appears here for RADIUS voucher mode.</span>
                  </div>
                )}
              </section>

              <aside className="voucher-check-side">
                <section className="voucher-check-card">
                  <div className="voucher-check-card-head">
                    <span>
                      <TimerReset aria-hidden="true" />
                    </span>
                    <div>
                      <p className="section-kicker">Access window</p>
                      <h3>Timing</h3>
                    </div>
                  </div>
                  <div className="voucher-check-mini-list">
                    <ResultMetric label="Purchased" value={formatDate(result.purchasedAt) ?? "-"} tone="accent" />
                    <ResultMetric
                      label="Estimated expiry"
                      value={formatDate(result.estimatedExpiresAt) ?? "Not time-based"}
                      tone="accent"
                    />
                  </div>
                </section>

                <section className="voucher-check-card">
                  <div className="voucher-check-card-head">
                    <span>
                      <Wifi aria-hidden="true" />
                    </span>
                    <div>
                      <p className="section-kicker">Portal scope</p>
                      <h3>{tenant.name}</h3>
                    </div>
                  </div>
                  <p className="voucher-check-note">Only vouchers issued for this tenant can be checked here.</p>
                </section>
              </aside>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
