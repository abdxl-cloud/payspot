import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantSetupPanel } from "@/components/tenant-setup-panel";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, getTenantBySlug } from "@/lib/store";

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export default async function TenantSetupPage({ params }: Props) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "tenant") {
    redirect("/admin");
  }

  if (user.tenantSlug !== slug) {
    redirect(`/t/${user.tenantSlug}/setup`);
  }

  const tenant = getTenantBySlug(slug);
  if (!tenant) notFound();

  const setupComplete =
    !user.mustChangePassword && !!tenant.paystack_secret_enc && tenant.status === "active";
  if (setupComplete) {
    redirect(`/t/${tenant.slug}/admin`);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
              {tenant.name}
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Finish setup
            </h1>
            <p className="text-slate-600">
              Set a password and connect Paystack to activate your purchase link{" "}
              (<span className="font-mono">/t/{tenant.slug}</span>).
            </p>
          </div>

          <TenantSetupPanel
            tenantSlug={tenant.slug}
            requirePasswordChange={user.mustChangePassword}
            requirePaystackKey={!tenant.paystack_secret_enc}
          />
        </div>
      </div>
    </div>
  );
}
