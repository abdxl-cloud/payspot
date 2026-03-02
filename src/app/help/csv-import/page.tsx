import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";

const steps = [
  "Choose architecture: Voucher source = import_csv, Portal auth = omada_builtin.",
  "Create plans in tenant admin first (code, duration, price).",
  "Open Voucher operations and import your Omada CSV file.",
  "Verify imported counts (unused/assigned) per plan.",
  "Run one real payment test and confirm voucher delivery.",
] as const;

const checklist = [
  "CSV contains voucher code column (Code, Voucher Code, or csvCode).",
  "Plan codes in PaySpot match your intended voucher durations/pricing.",
  "Enough unused vouchers exist before traffic campaigns.",
] as const;

const navigationPaths = [
  "PaySpot tenant admin: /t/<slug>/admin -> Quick actions -> Configure architecture.",
  "PaySpot voucher import: /t/<slug>/admin -> Quick actions -> Import voucher CSV.",
  "Omada export source: Omada Controller -> Hotspot/Portal -> Voucher export (CSV).",
] as const;

export default function CsvImportHelpPage() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb="CSV voucher setup"
          environment="Docs"
          accountLabel="Self-serve"
          action={
            <Link href="/" className="hero-chip">
              Back to PaySpot
            </Link>
          }
        />

        <main className="mt-6 grid gap-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="section-kicker">Architecture Guide</p>
            <h1 className="section-title">CSV Import (Voucher Mode)</h1>
            <p className="mt-2 text-sm text-slate-700">
              Use this mode when you want the safest rollout with manual voucher control.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Setup Steps</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {steps.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Where to Click</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {navigationPaths.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Pre-Go-Live Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {checklist.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
