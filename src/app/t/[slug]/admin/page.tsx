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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="space-y-6">
          <div className="flex flex-col gap-3 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
                {tenant.name}
              </div>
              <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Tenant admin
              </h1>
              <p className="text-slate-600">
                Manage vouchers and track sales for your purchase link:{" "}
                <span className="font-mono">/t/{tenant.slug}</span>.
              </p>
            </div>
            <div className="flex justify-center sm:justify-end">
              <LogoutButton />
            </div>
          </div>

          <TenantAdminPanel tenantSlug={tenant.slug} />
        </div>
      </div>
    </div>
  );
}
