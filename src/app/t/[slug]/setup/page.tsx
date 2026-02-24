import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantSetupPanel } from "@/components/tenant-setup-panel";
import { AppTopbar } from "@/components/app-topbar";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, getStats, getTenantBySlug } from "@/lib/store";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantSetupPage({ params }: Props) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? await getSessionUser(token) : null;

  if (!user) redirect("/login");
  if (user.role !== "tenant") redirect("/admin");
  if (user.tenantSlug !== slug) redirect(`/t/${user.tenantSlug}/setup`);

  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const setupComplete = !user.mustChangePassword && !!tenant.paystack_secret_enc && tenant.status === "active";
  if (setupComplete) redirect(`/t/${tenant.slug}/admin`);
  const hasVoucherImport = (await getStats(tenant.id)).some((row) => row.total > 0);
  const renderedAt = new Date().toLocaleString();

  return (
    <div className="app-shell">
      <div className="app-container max-w-6xl">
        <AppTopbar
          breadcrumb={`Setup / ${tenant.slug}`}
          environment="Setup"
          accountLabel={tenant.name}
        />
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_380px]">
          <section className="order-2 panel-surface lg:order-1">
            <p className="section-kicker">Launch checklist</p>
            <h1 className="panel-title mt-1">Complete setup before going live</h1>
            <p className="panel-copy mt-3 max-w-2xl">
              Finish security, payment, and voucher inventory setup for{" "}
              <span className="font-mono break-all">/t/{tenant.slug}</span>.
            </p>
            <div className="dashboard-meta">
              <span>Tenant: {tenant.name}</span>
              <span>Mode: Setup gate</span>
              <span>Rendered: {renderedAt}</span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="dashboard-kpi"><p className="dashboard-kpi-label">Password hardening</p><p className="dashboard-kpi-value">Required</p></div>
              <div className="dashboard-kpi"><p className="dashboard-kpi-label">Paystack key</p><p className="dashboard-kpi-value">Required</p></div>
              <div className="dashboard-kpi"><p className="dashboard-kpi-label">Activation gate</p><p className="dashboard-kpi-value">Checks pass</p></div>
            </div>
          </section>

          <section className="order-1 grid gap-4 lg:order-2">
            <TenantSetupPanel
              tenantSlug={tenant.slug}
              currentSlug={tenant.slug}
              requirePasswordChange={user.mustChangePassword}
              requirePaystackKey={!tenant.paystack_secret_enc}
              requireVoucherImport={!hasVoucherImport}
            />
            <div className="dashboard-lane">
              <h3 className="dashboard-lane-title">Setup sequence</h3>
              <p className="dashboard-lane-copy">1. Set a strong admin password.</p>
              <p className="dashboard-lane-copy">2. Add Paystack secret key for payments.</p>
              <p className="dashboard-lane-copy">3. Import voucher inventory from Omada CSV.</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
