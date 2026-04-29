import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantSetupPanel } from "@/components/tenant-setup-panel";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, getStats, getTenantBySlug, isTenantPaymentConfigured } from "@/lib/store";

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

  const paymentConfigured = isTenantPaymentConfigured(tenant);
  const setupComplete = !user.mustChangePassword && paymentConfigured && tenant.status === "active";
  if (setupComplete) redirect(`/t/${tenant.slug}/admin`);
  const hasVoucherImport = (await getStats(tenant.id)).some((row) => row.total > 0);

  return (
    <div id="s-onboarding" className="setup-prototype-shell screen on" data-screen-label="06 Onboarding">
      <TenantSetupPanel
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        currentSlug={tenant.slug}
        requirePasswordChange={user.mustChangePassword}
        requirePaystackKey={!paymentConfigured}
        requireVoucherImport={!hasVoucherImport}
      />
    </div>
  );
}
