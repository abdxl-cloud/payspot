import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantAdminPanel } from "@/components/tenant-admin-panel";
import { LogoutButton } from "@/components/logout-button";
import { AppTopbar } from "@/components/app-topbar";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, getTenantBySlug } from "@/lib/store";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantAdminPage({ params }: Props) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;
  if (!user) redirect("/login");

  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  if (user.role === "tenant" && user.tenantId !== tenant.id) {
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
    redirect("/login");
  }

  if (user.role === "tenant" && (user.mustChangePassword || !tenant.paystack_secret_enc || tenant.status !== "active")) {
    redirect(`/t/${tenant.slug}/setup`);
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar breadcrumb={`Tenant Admin / ${tenant.slug}`} environment="Production" accountLabel={tenant.name} action={<LogoutButton />} />

        <header className="dashboard-header">
          <div className="dashboard-header-top">
            <div className="hero-chip">{tenant.name}</div>
          </div>
          <h1 className="dashboard-title">Voucher Operations Dashboard</h1>
          <p className="dashboard-subtitle">
            Manage pricing, imports, and inventory for <span className="font-mono">/t/{tenant.slug}</span> with production-safe workflows.
          </p>
          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Bulk import</p><p className="dashboard-kpi-value">CSV ingestion</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Pricing</p><p className="dashboard-kpi-value">Plan controls</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Inventory</p><p className="dashboard-kpi-value">Live tracking</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Cleanup</p><p className="dashboard-kpi-value">Guarded actions</p></div>
          </div>
        </header>

        <div className="workspace-grid">
          <div className="workspace-main">
            <TenantAdminPanel tenantSlug={tenant.slug} />
          </div>
          <aside className="workspace-side">
            <div className="workspace-rail">
              <h3>Quick actions</h3>
              <p><a className="underline underline-offset-4" href="#ops-import">Go to import</a></p>
              <p><a className="underline underline-offset-4" href="#ops-pricing">Go to pricing</a></p>
              <p><a className="underline underline-offset-4" href="#ops-inventory">Go to inventory</a></p>
            </div>
            <div className="workspace-rail">
              <h3>Action checklist</h3>
              <p>[ ] Import completed</p>
              <p>[ ] Pricing validated</p>
              <p>[ ] Cleanup reconciliation done</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
