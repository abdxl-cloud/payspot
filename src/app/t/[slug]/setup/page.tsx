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
    <div className="app-shell">
      <div className="app-container max-w-5xl">
        <div className="mx-auto grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <section className="space-y-5 text-center lg:text-left">
            <div className="hero-chip">{tenant.name}</div>
            <h1 className="panel-title">Complete launch setup before going live.</h1>
            <p className="panel-copy max-w-xl">
              Finish security and payments to activate <span className="font-mono">/t/{tenant.slug}</span> for customers.
            </p>
            <div className="ops-grid max-w-2xl text-left">
              <div className="ops-card">
                <strong>Password hardening</strong>
                <span>Require secure account credentials.</span>
              </div>
              <div className="ops-card">
                <strong>Paystack key</strong>
                <span>Enable live transaction processing.</span>
              </div>
              <div className="ops-card">
                <strong>Activation gate</strong>
                <span>Portal opens only when checks pass.</span>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6">
            <TenantSetupPanel
              tenantSlug={tenant.slug}
              requirePasswordChange={user.mustChangePassword}
              requirePaystackKey={!tenant.paystack_secret_enc}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
