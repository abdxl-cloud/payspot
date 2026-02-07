import { TenantRequestForm } from "@/components/tenant-request-form";

export default function Home() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start xl:gap-16">
          <div className="space-y-6 pt-2 text-center lg:space-y-8 lg:text-left">
            <div className="hero-chip">PaySpot platform</div>
            <h1 className="hero-title">Build a Wi-Fi voucher business that feels premium from first tap.</h1>
            <p className="hero-copy mx-auto lg:mx-0">
              PaySpot gives venues a branded sales portal, automated voucher delivery, and
              clean admin operations in one system.
            </p>
            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>30s</strong>
                <span>checkout flow</span>
              </div>
              <div className="hero-metric">
                <strong>SMS</strong>
                <span>instant delivery</span>
              </div>
              <div className="hero-metric">
                <strong>24/7</strong>
                <span>self-service access</span>
              </div>
            </div>
          </div>

          <div className="surface-card p-5 sm:p-6 md:p-7">
            <TenantRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
