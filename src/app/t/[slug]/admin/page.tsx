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

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  const tenantPortalUrl = appUrl ? `${appUrl}/t/${tenant.slug}` : `/t/${tenant.slug}`;

  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar breadcrumb={`Tenant Admin / ${tenant.slug}`} environment="Production" accountLabel={tenant.name} action={<LogoutButton />} />

        <header className="dashboard-header">
          <h1 className="dashboard-title">Voucher Operations Dashboard</h1>
          <p className="dashboard-subtitle">
            Manage plans, voucher codes, and imports.
            {" "}
            Tenant link:
            {" "}
            <span className="font-mono">
              {tenantPortalUrl}
            </span>
          </p>
        </header>

        <TenantAdminPanel tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}
