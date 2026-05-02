import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantSetupPanel } from "@/components/tenant-setup-panel";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import {
  getSessionUser,
  getTenantBySlug,
  isTenantPaymentConfigured,
  tenantRequiresPlatformSubscription,
} from "@/lib/store";

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
  const subscriptionRequired = tenantRequiresPlatformSubscription(tenant);
  const readyForSubscriptionOnly = !user.mustChangePassword && paymentConfigured && subscriptionRequired;
  const setupComplete = !user.mustChangePassword && paymentConfigured && tenant.status === "active" && !subscriptionRequired;
  if (setupComplete) redirect(`/t/${tenant.slug}/admin`);

  return (
    <div id="s-onboarding" className="setup-prototype-shell screen on" data-screen-label="06 Onboarding">
      <TenantSetupPanel
        tenantSlug={tenant.slug}
        tenantName={tenant.name}
        currentSlug={tenant.slug}
        requirePasswordChange={user.mustChangePassword}
        requirePaystackKey={!paymentConfigured}
        subscriptionRequired={subscriptionRequired}
        subscriptionAmountNgn={Number(tenant.platform_subscription_amount_ngn ?? 0)}
        subscriptionInterval={tenant.platform_subscription_interval === "yearly" ? "yearly" : "monthly"}
        maxLocations={tenant.max_locations ?? 1}
        startAtSubscription={tenant.status === "pending_subscription" || readyForSubscriptionOnly}
      />
    </div>
  );
}
