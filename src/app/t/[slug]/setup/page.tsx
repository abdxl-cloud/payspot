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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl space-y-10">
          <div className="space-y-3">
            <h1 className="font-display text-5xl font-bold">Setup</h1>
            <p className="text-lg text-muted-foreground">
              Secure your account and connect Paystack to activate your link
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
