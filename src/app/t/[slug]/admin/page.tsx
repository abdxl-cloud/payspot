import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantAdminPanel } from "@/components/tenant-admin-panel";
import { LogoutButton } from "@/components/logout-button";
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
  if (!user) {
    redirect("/login");
  }

  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  if (user.role === "tenant" && user.tenantId !== tenant.id) {
    if (user.tenantSlug) {
      redirect(`/t/${user.tenantSlug}/admin`);
    }
    redirect("/login");
  }

  if (
    user.role === "tenant" &&
    (user.mustChangePassword || !tenant.paystack_secret_enc || tenant.status !== "active")
  ) {
    redirect(`/t/${tenant.slug}/setup`);
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="mb-8 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-4">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="panel-title">Run voucher sales like a disciplined product operation.</h1>
            <p className="panel-copy max-w-3xl">
              Maintain plans, control pricing, and manage voucher inventory for <span className="font-mono">/t/{tenant.slug}</span>.
            </p>
            <div className="hero-metric-grid max-w-3xl">
              <div className="hero-metric">
                <strong>Bulk import</strong>
                <span>upload CSV voucher inventories</span>
              </div>
              <div className="hero-metric">
                <strong>Price control</strong>
                <span>set sell price per package</span>
              </div>
              <div className="hero-metric">
                <strong>Safe cleanup</strong>
                <span>delete by plan, status, or code list</span>
              </div>
            </div>
          </div>
          <div className="pt-1">
            <LogoutButton />
          </div>
        </div>
        <div className="workspace-grid">
          <div className="workspace-main">
            <TenantAdminPanel tenantSlug={tenant.slug} />
          </div>
          <aside className="workspace-side">
            <div className="workspace-rail">
              <h3>Daily operations</h3>
              <p>Review payment health and inventory each morning before editing plans or running cleanup tasks.</p>
            </div>
            <div className="workspace-rail">
              <h3>Import quality</h3>
              <p>Validate CSV files in staging format first. Duplicates and missing plan codes slow down rollout.</p>
            </div>
            <div className="workspace-rail">
              <h3>Cleanup caution</h3>
              <p>Use deletion modes after reconciliation only. Once removed, voucher records cannot be restored.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
