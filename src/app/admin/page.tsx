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
          <aside className="workspace-side">
            <div className="workspace-rail">
              <h3>Quick actions</h3>
              <p><a className="underline underline-offset-4" href="#tenant-provisioning">Open provisioning</a></p>
              <p><a className="underline underline-offset-4" href="#tenant-directory">Open tenant directory</a></p>
            </div>
            <div className="workspace-rail">
              <h3>Readiness checklist</h3>
              <p>[ ] Slug conventions validated</p>
              <p>[ ] Admin email ownership confirmed</p>
              <p>[ ] Credential handover completed</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
