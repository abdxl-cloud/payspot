import { TenantRequestForm } from "@/components/tenant-request-form";

export default function Home() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-14">
          <section className="space-y-7 pt-1 text-center lg:text-left">
            <div className="hero-chip">PaySpot operator suite</div>
            <h1 className="hero-title">
              Launch a modern <span className="text-gradient">Wi-Fi commerce</span> flow for every venue.
            </h1>
            <p className="hero-copy mx-auto lg:mx-0">
              Replace manual voucher sales with a clean buying journey, automated delivery, and operations tooling your team can run daily.
            </p>

            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Fast checkout</strong>
                <span>plan to payment in under a minute</span>
              </div>
              <div className="hero-metric">
                <strong>Automated SMS</strong>
                <span>voucher delivered after payment</span>
              </div>
              <div className="hero-metric">
                <strong>Admin controls</strong>
                <span>pricing, stock, and tenant management</span>
              </div>
            </div>

            <div className="ops-grid max-w-3xl text-left">
              <div className="ops-card">
                <strong>Multi-tenant ready</strong>
                <span>Run many venue portals from one platform.</span>
              </div>
              <div className="ops-card">
                <strong>Paystack integrated</strong>
                <span>Secure payments without custom checkout plumbing.</span>
              </div>
              <div className="ops-card">
                <strong>Zero paper slips</strong>
                <span>Digital voucher handling from import to delivery.</span>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6 md:p-7">
            <TenantRequestForm />
          </section>
        </div>
      </div>
    </div>
  );
}
