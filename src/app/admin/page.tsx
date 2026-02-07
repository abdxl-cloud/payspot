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
      <div className="app-container max-w-6xl">
        <div className="mb-7 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-3">
            <div className="hero-chip">Platform admin</div>
            <h1 className="panel-title">Control every tenant from one command center.</h1>
            <p className="panel-copy">Create new portals, rotate credentials, and monitor readiness.</p>
            <div className="hero-metric-grid max-w-2xl">
              <div className="hero-metric"><strong>Tenants</strong><span>provisioned here</span></div>
              <div className="hero-metric"><strong>Keys</strong><span>paystack managed</span></div>
              <div className="hero-metric"><strong>Access</strong><span>roles and resets</span></div>
            </div>
          </div>
          <div className="pt-1">
            <LogoutButton />
          </div>
        </div>

        <AdminTenantsPanel />
      </div>
    </div>
  );
}