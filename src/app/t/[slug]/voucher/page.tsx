import { notFound } from "next/navigation";
import { AppTopbar } from "@/components/app-topbar";
import {
  getPackageById,
  getTenantBySlug,
  getTransactionByVoucherCode,
  getVoucherPoolEntryByCode,
  resolveTenantOmadaConfigIfPresent,
} from "@/lib/store";
import { lookupOmadaVoucherStatus, type OmadaVoucherLookupResult } from "@/lib/omada";

export const dynamic = "force-dynamic";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
  searchParams?:
    | Record<string, string | string[] | undefined>
    | Promise<Record<string, string | string[] | undefined>>;
};

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    UNUSED:   { label: "Unused",   cls: "bg-amber-100 text-amber-800" },
    ASSIGNED: { label: "Issued",   cls: "bg-sky-100 text-sky-800" },
    USED:     { label: "Used",     cls: "bg-emerald-100 text-emerald-800" },
    EXPIRED:  { label: "Expired",  cls: "bg-red-100 text-red-800" },
    UNKNOWN:  { label: "Unknown",  cls: "bg-slate-100 text-slate-600" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

async function lookupVoucher(tenantId: string, rawCode: string) {
  const code = rawCode.trim();
  if (!code) return null;

  const [transaction, poolEntry] = await Promise.all([
    getTransactionByVoucherCode(tenantId, code),
    getVoucherPoolEntryByCode(tenantId, code),
  ]);

  if (!transaction && !poolEntry) return null;

  const packageId = transaction?.package_id ?? poolEntry?.package_id;
  const pkg = packageId ? await getPackageById(tenantId, packageId) : null;

  let estimatedExpiresAt: string | null = null;
  if (transaction?.paid_at && pkg?.duration_minutes && pkg.duration_minutes > 0) {
    const paidMs = new Date(transaction.paid_at).getTime();
    if (!isNaN(paidMs)) {
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

  let omadaResult: OmadaVoucherLookupResult | null = null;
  try {
    const omadaConfig = await resolveTenantOmadaConfigIfPresent(tenantId);
    if (omadaConfig) {
      omadaResult = await lookupOmadaVoucherStatus(omadaConfig, code);
    }
  } catch {
    // best-effort
  }

  return {
    code: code.toUpperCase(),
    pkg,
    purchasedAt: transaction?.paid_at ?? poolEntry?.assigned_at ?? null,
    estimatedExpiresAt,
    poolStatus,
    omadaResult,
  };
}

export default async function VoucherCheckPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const rawCode =
    typeof resolvedSearchParams.code === "string" ? resolvedSearchParams.code : "";

  const result = rawCode ? await lookupVoucher(tenant.id, rawCode) : null;
  const notFound_ = rawCode && !result;

  return (
    <div className="app-shell">
      <div className="app-container max-w-3xl py-12 sm:py-20">
        <AppTopbar
          breadcrumb="Check voucher"
          environment="Live"
          accountLabel={tenant.name}
        />

        <div className="status-card">
          <p className="section-kicker">Voucher lookup</p>
          <h1 className="mt-2 status-title">Check voucher status</h1>
          <p className="mt-2 status-copy">
            Enter your voucher code to see its current status and usage details.
          </p>

          {/* Search form — GET method so the code appears in the URL */}
          <form method="GET" action={`/t/${slug}/voucher`} className="mt-6 flex gap-2">
            <input
              type="text"
              name="code"
              defaultValue={rawCode}
              placeholder="Enter voucher code"
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-mono text-sm uppercase tracking-widest text-slate-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
            <button
              type="submit"
              className="rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800 active:scale-95"
            >
              Check
            </button>
          </form>

          {/* Not found */}
          {notFound_ && (
            <div className="mt-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-5">
              <p className="text-sm font-semibold text-red-700">Voucher not found</p>
              <p className="mt-1 text-sm text-red-600">
                The code <span className="font-mono font-bold">{rawCode.toUpperCase()}</span> was
                not found in this portal. Please double-check the code and try again.
              </p>
            </div>
          )}

          {/* Found */}
          {result && (
            <div className="mt-6 space-y-4">
              {/* Code + DB status */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 px-5 py-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-400">
                  Voucher code
                </p>
                <p className="mt-2 break-all font-mono text-2xl font-black tracking-[0.18em] text-indigo-950 sm:text-3xl">
                  {result.code}
                </p>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {result.pkg && (
                    <div>
                      <p className="font-medium text-slate-500">Plan</p>
                      <p className="font-semibold text-slate-800">{result.pkg.name}</p>
                    </div>
                  )}
                  {result.pkg?.duration_minutes != null && (
                    <div>
                      <p className="font-medium text-slate-500">Duration</p>
                      <p className="font-semibold text-slate-800">
                        {formatDuration(result.pkg.duration_minutes) ?? "—"}
                      </p>
                    </div>
                  )}
                  {result.purchasedAt && (
                    <div>
                      <p className="font-medium text-slate-500">Purchased</p>
                      <p className="font-semibold text-slate-800">
                        {formatDate(result.purchasedAt) ?? "—"}
                      </p>
                    </div>
                  )}
                  {result.estimatedExpiresAt && (
                    <div>
                      <p className="font-medium text-slate-500">Est. expiry</p>
                      <p className="font-semibold text-slate-800">
                        {formatDate(result.estimatedExpiresAt) ?? "—"}
                      </p>
                    </div>
                  )}
                  {result.poolStatus && (
                    <div>
                      <p className="font-medium text-slate-500">Status</p>
                      <StatusBadge status={result.poolStatus} />
                    </div>
                  )}
                </div>
              </div>

              {/* Omada live status */}
              {result.omadaResult && (
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Omada controller — live status
                  </p>

                  {!result.omadaResult.found && result.omadaResult.unavailable ? (
                    <p className="mt-2 text-sm text-slate-500">
                      The Omada controller could not be reached or does not support live
                      voucher lookup (requires controller v5.15+ or Cloud controller).
                    </p>
                  ) : !result.omadaResult.found ? (
                    <p className="mt-2 text-sm text-slate-500">
                      This code was not found in the most recent voucher groups on the
                      controller. It may have been issued in an earlier batch.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="font-medium text-slate-500">Controller status</p>
                        <StatusBadge status={result.omadaResult.status} />
                      </div>
                      {result.omadaResult.durationMinutes != null && (
                        <div>
                          <p className="font-medium text-slate-500">Duration (controller)</p>
                          <p className="font-semibold text-slate-800">
                            {formatDuration(result.omadaResult.durationMinutes) ?? "—"}
                          </p>
                        </div>
                      )}
                      {result.omadaResult.usedAt && (
                        <div>
                          <p className="font-medium text-slate-500">Used at</p>
                          <p className="font-semibold text-slate-800">
                            {formatDate(result.omadaResult.usedAt) ?? "—"}
                          </p>
                        </div>
                      )}
                      {result.omadaResult.expireAt && (
                        <div>
                          <p className="font-medium text-slate-500">Expires (controller)</p>
                          <p className="font-semibold text-slate-800">
                            {formatDate(result.omadaResult.expireAt) ?? "—"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Only vouchers purchased through this portal can be looked up here.
        </p>
      </div>
    </div>
  );
}
