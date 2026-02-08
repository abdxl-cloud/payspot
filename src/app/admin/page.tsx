import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTenantsPanel } from "@/components/admin-tenants-panel";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    if (user.tenantSlug) {
      redirect(`/t/${user.tenantSlug}/admin`);
    }
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-4">
            <div className="hero-chip">Platform administration</div>
            <h1 className="panel-title">Operate tenant rollout from one command layer.</h1>
            <p className="panel-copy max-w-3xl">
              Provision tenants, maintain credentials, and keep deployment health visible without switching tools.
            </p>
            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Tenant lifecycle</strong>
                <span>create, edit, reset, and remove</span>
              </div>
              <div className="hero-metric">
                <strong>Credential control</strong>
                <span>password reset and setup enforcement</span>
              </div>
              <div className="hero-metric">
                <strong>Operational visibility</strong>
                <span>status and configuration checks</span>
              </div>
            </div>
          </div>
          <div className="pt-1">
            <LogoutButton />
          </div>
        </div>
        <div className="workspace-grid">
          <div className="workspace-main">
            <AdminTenantsPanel />
          </div>
          <aside className="workspace-side">
            <div className="workspace-rail">
              <h3>Admin standards</h3>
              <p>Use predictable tenant slugs and verified admin email addresses to avoid login and routing issues later.</p>
            </div>
            <div className="workspace-rail">
              <h3>Provisioning flow</h3>
              <p>1. Create tenant. 2. Share temporary access details. 3. Confirm setup completion before go-live.</p>
            </div>
            <div className="workspace-rail">
              <h3>Security controls</h3>
              <p>Reset credentials immediately when role ownership changes or incident alerts are raised.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
