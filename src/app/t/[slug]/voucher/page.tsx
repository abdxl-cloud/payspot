import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  ArrowRight,
  DatabaseZap,
  Search,
  ShieldCheck,
  TimerReset,
  Wifi,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getPackageById,
  getRadiusVoucherAccessState,
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
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return null;
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
  if (!reason) return null;
  if (reason === "data_limit_reached") return "Data limit reached";
  if (reason === "plan_expired") return "Plan expired";
  if (reason === "no_active_voucher") return "Voucher is no longer active";
  return reason.replaceAll("_", " ");
}

function getUsagePercent(usedBytes: number, dataLimitBytes: number | null) {
  if (dataLimitBytes == null || dataLimitBytes <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((usedBytes / dataLimitBytes) * 100)));
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    UNUSED: { label: "Unused", cls: "bg-amber-100 text-amber-800" },
    ASSIGNED: { label: "Issued", cls: "bg-sky-100 text-sky-800" },
    USED: { label: "Used", cls: "bg-emerald-100 text-emerald-800" },
    EXPIRED: { label: "Expired", cls: "bg-red-100 text-red-800" },
    ACTIVE: { label: "Active", cls: "bg-emerald-100 text-emerald-800" },
    UNKNOWN: { label: "Unknown", cls: "bg-slate-100 text-slate-600" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function getVoucherModeMeta(mode: VoucherSourceMode) {
  if (mode === "radius_voucher") {
    return {
      label: "RADIUS voucher",
      title: "Check your voucher",
      copy: "Enter your code to see usage.",
    };
  }
  if (mode === "mikrotik_rest") {
    return {
      label: "MikroTik direct",
      title: "Check your voucher",
      copy: "Enter your code to see details.",
    };
  }
  if (mode === "omada_openapi") {
    return {
      label: "Omada API",
      title: "Check your voucher",
      copy: "Enter your code to see details.",
    };
  }
  return {
    label: "Imported vouchers",
    title: "Check your voucher",
    copy: "Enter your code to see details.",
  };
}

async function lookupVoucher(params: {
  tenantId: string;
  rawCode: string;
  voucherSourceMode: VoucherSourceMode;
  radiusVoucherMode: boolean;
}) {
  const code = params.rawCode.trim();
  if (!code) return null;

  const shouldCheckTransactions = true;
  const shouldCheckPool = params.voucherSourceMode === "import_csv";

  const [transaction, poolEntry] = await Promise.all([
    shouldCheckTransactions
      ? getTransactionByVoucherCode(
          params.tenantId,
          code,
          params.voucherSourceMode === "import_csv" ? "import_csv" : params.voucherSourceMode,
        )
      : Promise.resolve(null),
    shouldCheckPool ? getVoucherPoolEntryByCode(params.tenantId, code) : Promise.resolve(null),
  ]);

  if (!transaction && !poolEntry) return null;

  const packageId = transaction?.package_id ?? poolEntry?.package_id;
  const pkg = packageId ? await getPackageById(params.tenantId, packageId) : null;

  let estimatedExpiresAt: string | null = null;
  if (transaction?.paid_at && pkg?.duration_minutes && pkg.duration_minutes > 0) {
    const paidMs = new Date(transaction.paid_at).getTime();
    if (!Number.isNaN(paidMs)) {
      estimatedExpiresAt = new Date(
        paidMs + pkg.duration_minutes * 60 * 1000,
      ).toISOString();
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
  const dataLimitBytes =
    pkg?.data_limit_mb && pkg.data_limit_mb > 0 ? pkg.data_limit_mb * 1024 * 1024 : null;
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
    pkg,
    purchasedAt: transaction?.paid_at ?? poolEntry?.assigned_at ?? null,
    estimatedExpiresAt,
    poolStatus,
    displayStatus,
    radiusVoucher: radiusVoucher
      ? {
          state: radiusVoucher.state,
          reason: radiusVoucher.reason,
          usedBytes: radiusVoucher.usage?.usedBytes ?? 0,
          activeSessions: radiusVoucher.usage?.activeSessions ?? 0,
          endsAt: radiusVoucher.endsAt,
          dataLimitBytes,
          remainingBytes,
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
    <div className="hero-metric">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="size-4 text-sky-700" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <strong className="mt-2">{value}</strong>
    </div>
  );
}

function ResultMetric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "sky" | "amber";
}) {
  const toneClass =
    tone === "sky"
      ? "border-sky-200 bg-sky-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-4 shadow-[var(--shadow-sm)] ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

export default async function VoucherCheckPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const radiusVoucherMode =
    tenant.portal_auth_mode === "external_radius_voucher" ||
    tenant.voucher_source_mode === "radius_voucher";
  const voucherSourceMode = normalizeVoucherSourceMode(tenant.voucher_source_mode) as VoucherSourceMode;
  const voucherModeMeta = getVoucherModeMeta(voucherSourceMode);

  const rawCode =
    typeof resolvedSearchParams.code === "string" ? resolvedSearchParams.code : "";

  const result = rawCode
    ? await lookupVoucher({
        tenantId: tenant.id,
        rawCode,
        voucherSourceMode,
        radiusVoucherMode,
      })
    : null;
  const notFound_ = rawCode && !result;
  const usagePercent = result?.radiusVoucher
    ? getUsagePercent(result.radiusVoucher.usedBytes, result.radiusVoucher.dataLimitBytes)
    : null;

  return (
    <div className="voucher-prototype-shell">
      <div className="voucher-prototype-container">
        <header className="prototype-nav">
          <Link href={`/t/${slug}`} className="prototype-brand">
            <Wifi className="size-4" />
            {tenant.name}
          </Link>
          <div className="prototype-actions">
            <ThemeToggle />
            <Link href={`/t/${slug}`} className="prototype-nav-button">
              Buy a plan <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </header>
        <div className="mx-auto grid w-full max-w-5xl gap-4 sm:gap-5">
          <section className="panel-surface overflow-hidden">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
              <div className="space-y-5">
                <div className="space-y-3">
                  <span className="hero-chip">Voucher accounting</span>
                  <h1 className="hero-title">{voucherModeMeta.title}</h1>
                  <p className="hero-copy">
                    {voucherModeMeta.copy}
                  </p>
                </div>

                <div className="hero-metric-grid">
                  <InfoMetric icon={Search} label="Input" value="Voucher code only" />
                  <InfoMetric icon={DatabaseZap} label="Voucher source" value={voucherModeMeta.label} />
                  <InfoMetric icon={ShieldCheck} label="Scope" value="Only codes from this tenant" />
                </div>
              </div>

              <div className="soft-panel border-slate-200/95 bg-white/95 p-5 sm:p-6">
                <p className="section-kicker">Search</p>
                <h2 className="mt-1 section-title">Enter voucher code</h2>
                <p className="mt-2 panel-copy">
                  Enter your voucher code.
                </p>

                <form method="GET" action={`/t/${slug}/voucher`} className="mt-5 grid gap-3">
                  <label htmlFor="code" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Voucher code
                  </label>
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <input
                      id="code"
                      type="text"
                      name="code"
                      defaultValue={rawCode}
                      placeholder="Enter voucher code"
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm uppercase tracking-[0.18em] text-slate-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 active:scale-[0.99]"
                    >
                      <Search className="size-4" />
                      Check
                    </button>
                  </div>
                </form>

                {notFound_ ? (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                    <p className="text-sm font-semibold text-red-700">Voucher not found</p>
                    <p className="mt-1 text-sm text-red-600">
                      The code <span className="font-mono font-bold">{rawCode.toUpperCase()}</span> was not found in this portal.
                    </p>
                  </div>
                ) : rawCode ? (
                  <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">Current lookup</p>
                    <p className="mt-2 break-all font-mono text-lg font-black tracking-[0.18em] text-sky-950">
                      {rawCode.toUpperCase()}
                    </p>
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <p className="text-sm font-semibold text-slate-800">No code yet</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Enter your voucher code above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {result ? (
            <>
              <section className="panel-surface overflow-hidden">
                <div className="rounded-[28px] border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/80 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="section-kicker">Voucher</p>
                      <h2 className="mt-1 panel-title text-[clamp(1.6rem,4vw,2.5rem)]">{result.code}</h2>
                      <p className="mt-2 panel-copy max-w-2xl">
                        {result.pkg ? `${result.pkg.name} voucher.` : "Voucher found."}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusBadge status={result.displayStatus ?? result.poolStatus ?? "UNKNOWN"} />
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {result.pkg ? <ResultMetric label="Plan" value={result.pkg.name} tone="sky" /> : null}
                    {result.pkg?.duration_minutes != null ? (
                      <ResultMetric
                        label="Duration"
                        value={formatDuration(result.pkg.duration_minutes) ?? "Unlimited"}
                      />
                    ) : null}
                    {result.purchasedAt ? (
                      <ResultMetric label="Purchased" value={formatDate(result.purchasedAt) ?? "-"} />
                    ) : null}
                    {result.estimatedExpiresAt ? (
                      <ResultMetric label="Estimated expiry" value={formatDate(result.estimatedExpiresAt) ?? "-"} />
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                <div className="panel-surface">
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-amber-100 p-2 text-amber-800">
                      <Activity className="size-5" />
                    </div>
                    <div>
                      <p className="section-kicker">Accounting</p>
                      <h2 className="mt-1 section-title">Usage</h2>
                      <p className="mt-2 panel-copy">
                        {result.radiusVoucher
                          ? "Current voucher usage."
                          : "Usage is not available for this voucher."}
                      </p>
                    </div>
                  </div>

                  {result.radiusVoucher ? (
                    <div className="mt-5 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <ResultMetric label="Access state" value={result.radiusVoucher.state === "active" ? "Active" : "Ended"} tone="amber" />
                        <ResultMetric label="Active sessions" value={String(result.radiusVoucher.activeSessions)} tone="amber" />
                        <ResultMetric label="Used data" value={formatBytes(result.radiusVoucher.usedBytes) ?? "-"} tone="amber" />
                        <ResultMetric
                          label="Remaining data"
                          value={
                            result.radiusVoucher.remainingBytes !== null
                              ? (formatBytes(result.radiusVoucher.remainingBytes) ?? "-")
                              : "Unlimited"
                          }
                          tone="amber"
                        />
                      </div>

                      {result.radiusVoucher.dataLimitBytes !== null ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                        Data cap progress
                      </p>
                              <p className="mt-1 text-sm text-amber-900">
                                {formatBytes(result.radiusVoucher.usedBytes) ?? "-"} used of{" "}
                                {formatBytes(result.radiusVoucher.dataLimitBytes) ?? "-"}
                              </p>
                            </div>
                            <p className="text-lg font-semibold text-amber-950">
                              {usagePercent ?? 0}%
                            </p>
                          </div>
                          <div className="mt-3 h-3 overflow-hidden rounded-full bg-amber-100">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                              style={{ width: `${usagePercent ?? 0}%` }}
                            />
                          </div>
                        </div>
                      ) : null}

                      <div className="grid gap-3 sm:grid-cols-2">
                        {result.radiusVoucher.endsAt ? (
                          <ResultMetric label="Access ends" value={formatDate(result.radiusVoucher.endsAt) ?? "-"} />
                        ) : (
                          <ResultMetric label="Access ends" value="No time limit" />
                        )}
                        {result.radiusVoucher.reason ? (
                          <ResultMetric label="Reason" value={formatReason(result.radiusVoucher.reason) ?? "-"} />
                        ) : (
                          <ResultMetric label="Reason" value="Voucher is active" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Usage is only available for RADIUS vouchers.
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <section className="panel-surface">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-sky-100 p-2 text-sky-800">
                        <TimerReset className="size-5" />
                      </div>
                      <div>
                        <p className="section-kicker">Access window</p>
                        <h2 className="mt-1 section-title">Timing</h2>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3">
                      <ResultMetric label="Purchased" value={formatDate(result.purchasedAt) ?? "-"} tone="sky" />
                      <ResultMetric
                        label="Estimated expiry"
                        value={formatDate(result.estimatedExpiresAt) ?? "Not time-based"}
                        tone="sky"
                      />
                    </div>
                  </section>

                  <section className="panel-surface">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl bg-indigo-100 p-2 text-indigo-800">
                        <Wifi className="size-5" />
                      </div>
                      <div>
                        <p className="section-kicker">Portal scope</p>
                        <h2 className="mt-1 section-title">Scope</h2>
                      </div>
                    </div>
                    <p className="mt-4 panel-copy">
                      Only vouchers from <span className="font-semibold text-slate-900">{tenant.name}</span>.
                    </p>
                  </section>
                </div>
              </section>

            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
