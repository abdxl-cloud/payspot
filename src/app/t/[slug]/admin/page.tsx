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
  const user = token ? await getSessionUser(token) : null;
  if (!user) redirect("/login");

  const tenant = await getTenantBySlug(slug);
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
        <AppTopbar
          breadcrumb={`Tenant admin / ${tenant.slug}`}
          environment="Production"
          accountLabel={tenant.name}
          action={<LogoutButton />}
        />

        <TenantAdminPanel tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}
