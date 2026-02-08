import { TenantRequestForm } from "@/components/tenant-request-form";
import { AppTopbar } from "@/components/app-topbar";

export default function Home() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar breadcrumb="Platform onboarding" environment="Public" accountLabel="Operator" />
        <div className="grid gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-14">
          <section className="order-2 space-y-5 pt-1 text-center sm:space-y-6 lg:order-1 lg:space-y-7 lg:text-left">
            <div className="hero-chip">PaySpot operator suite</div>
            <h1 className="hero-title">
              Launch a modern <span className="text-gradient">Wi-Fi commerce</span> flow for every venue.
            </h1>
            <p className="hero-copy mx-auto lg:mx-0">
              Replace manual voucher sales with a clean buying journey, automated delivery, and operations tooling your team can run daily.
            </p>

            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Sell guest access faster</strong>
                <span>short payment flow for venue customers</span>
              </div>
              <div className="hero-metric">
                <strong>Instant voucher delivery</strong>
                <span>code sent by SMS right after payment</span>
              </div>
              <div className="hero-metric">
                <strong>Control pricing and stock</strong>
                <span>manage plans and voucher inventory centrally</span>
              </div>
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
