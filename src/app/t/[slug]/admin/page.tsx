import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TenantAdminPanel } from "@/components/tenant-admin-panel";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, getTenantBySlug, isTenantPaymentConfigured, tenantRequiresPlatformSubscription } from "@/lib/store";

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

  if (
    user.role === "tenant" &&
    (user.mustChangePassword ||
      !isTenantPaymentConfigured(tenant) ||
      tenant.status !== "active" ||
      tenantRequiresPlatformSubscription(tenant))
  ) {
    redirect(`/t/${tenant.slug}/setup`);
  }

  return <TenantAdminPanel tenantSlug={tenant.slug} tenantName={tenant.name} viewerRole={user.role} />;
}
