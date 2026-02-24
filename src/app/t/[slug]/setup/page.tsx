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
        <section className="mx-auto w-full max-w-3xl">
          <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Tenant: {tenant.name} | Rendered: {renderedAt}
          </p>
          <div className="mx-auto">
            <TenantSetupPanel
              tenantSlug={tenant.slug}
              currentSlug={tenant.slug}
              requirePasswordChange={user.mustChangePassword}
              requirePaystackKey={!tenant.paystack_secret_enc}
              requireVoucherImport={!hasVoucherImport}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
