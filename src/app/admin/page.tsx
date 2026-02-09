import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTenantsPanel } from "@/components/admin-tenants-panel";
import { LogoutButton } from "@/components/logout-button";
import { AppTopbar } from "@/components/app-topbar";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;

  if (!user) redirect("/login");

  if (user.role !== "admin") {
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
    redirect("/login");
  }

  const renderedAt = new Date().toLocaleString();

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar breadcrumb="Admin / Tenants" environment="Production" accountLabel="Platform Admin" action={<LogoutButton />} />

        <header className="dashboard-header">
          <div className="dashboard-header-top">
            <div className="hero-chip">Platform administration</div>
          </div>
          <h1 className="dashboard-title">Tenant Operations Dashboard</h1>
          <p className="dashboard-subtitle">
            Provision tenants, manage credentials, and keep platform rollout health visible from a single control plane.
          </p>
          <div className="dashboard-meta">
            <span>Scope: Multi-tenant platform</span>
            <span>Access: Admin only</span>
            <span>Rendered: {renderedAt}</span>
          </div>
          <div className="dashboard-kpi-grid">
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Tenant lifecycle</p><p className="dashboard-kpi-value">Provisioning</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Credential control</p><p className="dashboard-kpi-value">Account security</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Visibility</p><p className="dashboard-kpi-value">Status tracking</p></div>
            <div className="dashboard-kpi"><p className="dashboard-kpi-label">Operator mode</p><p className="dashboard-kpi-value">High control</p></div>
          </div>
        </header>

        <div className="workspace-grid">
          <div className="workspace-main">
            <AdminTenantsPanel />
          </div>
          <aside className="workspace-side workspace-side-sticky">
            <div className="dashboard-lane">
              <h3 className="dashboard-lane-title">Navigation</h3>
              <div className="dashboard-quick-links">
                <a className="dashboard-quick-link" href="#tenant-provisioning">Tenant provisioning</a>
                <a className="dashboard-quick-link" href="#tenant-directory">Tenant directory</a>
              </div>
            </div>
            <div className="dashboard-lane">
              <h3 className="dashboard-lane-title">Management checks</h3>
              <p className="dashboard-lane-copy">Slug naming follows policy and avoids collisions.</p>
              <p className="dashboard-lane-copy">Primary admin email ownership is verified.</p>
              <p className="dashboard-lane-copy">Credentials are handed over through secure channels.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
