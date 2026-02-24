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
  const user = token ? await getSessionUser(token) : null;

  if (!user) redirect("/login");

  if (user.role !== "admin") {
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb="Admin / Tenants"
          environment="Production"
          accountLabel="Platform Admin"
          action={<LogoutButton />}
        />

        <header className="dashboard-header">
          <h1 className="dashboard-title">Platform Tenant Operations</h1>
          <p className="dashboard-subtitle">
            Create and govern tenant workspaces, control access lifecycle, and verify payment readiness.
          </p>
        </header>

        <AdminTenantsPanel />
      </div>
    </div>
  );
}
