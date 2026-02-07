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
      <div className="app-container max-w-6xl">
        <div className="mb-7 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-3">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="panel-title">Run your voucher operations like a real product team.</h1>
            <p className="panel-copy">
              Manage plans, stock, and cleanup flows for <span className="font-mono">/t/{tenant.slug}</span>.
            </p>
            <div className="hero-metric-grid max-w-2xl">
              <div className="hero-metric"><strong>Import</strong><span>bulk voucher csv</span></div>
              <div className="hero-metric"><strong>Price</strong><span>plan controls</span></div>
              <div className="hero-metric"><strong>Delete</strong><span>safe cleanup modes</span></div>
            </div>
          </div>
          <div className="pt-1">
            <LogoutButton />
          </div>
        </div>

        <TenantAdminPanel tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}