import { TenantRequestForm } from "@/components/tenant-request-form";
import { AppTopbar } from "@/components/app-topbar";
import Link from "next/link";

export default function Home() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb="Platform onboarding"
          environment="Public"
          accountLabel="Operator"
        />
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-14">
          <section className="order-2 space-y-5 pt-1 text-center sm:space-y-6 lg:order-1 lg:space-y-7 lg:text-left">
            <div className="hero-chip">PaySpot operator suite</div>
            <h1 className="hero-title">
              Build a trusted <span className="text-gradient">Wi-Fi commerce desk</span> for every venue.
            </h1>
            <p className="hero-copy mx-auto lg:mx-0">
              PaySpot unifies voucher inventory, Paystack collections, and SMS delivery into one operational workflow for telecom-grade reliability.
            </p>

            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Fast customer checkout</strong>
                <span>choose plan, pay, receive code in seconds</span>
              </div>
              <div className="hero-metric">
                <strong>Live stock visibility</strong>
                <span>monitor voucher pool health by plan</span>
              </div>
              <div className="hero-metric">
                <strong>Operator-grade controls</strong>
                <span>manage plans, imports, and architecture safely</span>
              </div>
            </div>

            <div className="soft-panel max-w-3xl p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                For tenant self-onboarding
              </p>
              <p className="mt-2 text-sm text-slate-700 sm:text-base">
                Share the Omada OpenAPI setup playbook with clients so they can provide the exact
                fields you need.
              </p>
              <Link
                href="/help/omada-openapi"
                className="mt-3 inline-flex rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:border-slate-400"
              >
                Open Omada setup guide
              </Link>
            </div>
          </section>

          <section className="order-1 lg:order-2">
            <TenantRequestForm />
          </section>
        </div>
      </div>
    </div>
  );
}
