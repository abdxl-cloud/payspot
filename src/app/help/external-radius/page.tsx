import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";

const endpoints = [
  "POST /api/t/<slug>/radius/authorize",
  "POST /api/t/<slug>/radius/accounting",
] as const;

const flow = [
  "Tenant chooses External RADIUS + portal mode.",
  "Set and save RADIUS adapter shared secret in architecture config.",
  "Subscriber signs up/logs in, buys a plan, entitlement becomes active.",
  "RADIUS adapter calls authorize endpoint with username/password + adapter secret.",
  "Adapter sends accounting start/interim/stop events for session tracking and limits.",
] as const;

export default function ExternalRadiusHelpPage() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb="External RADIUS setup"
          environment="Docs"
          accountLabel="Self-serve"
          action={
            <Link href="/" className="hero-chip">
              Back to PaySpot
            </Link>
          }
        />

        <main className="mt-6 grid gap-4">
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="section-kicker">Architecture Guide</p>
            <h1 className="section-title">External RADIUS + Account Access</h1>
            <p className="mt-2 text-sm text-amber-900">
              Use this mode for account-based purchases, simultaneous-use limits, and live session policy enforcement.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Adapter Endpoints</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {endpoints.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              All calls must include: <code>x-radius-adapter-secret</code>
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Operational Flow</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {flow.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>
        </main>
      </div>
    </div>
  );
}
