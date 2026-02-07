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
      <div className="app-container max-w-4xl">
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <div className="hero-chip">{tenant.name}</div>
          <h1 className="panel-title">Finish setup</h1>
          <p className="panel-copy">
            Complete required setup to activate <span className="font-mono">/t/{tenant.slug}</span>.
          </p>

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