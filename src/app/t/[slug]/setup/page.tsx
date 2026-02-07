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
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {tenant.name}
            </span>
            <div className="space-y-2">
              <h1 className="font-display text-4xl font-semibold tracking-tight">
                Complete your setup
              </h1>
              <p className="text-muted-foreground text-base">
                Secure your account and connect Paystack to activate your purchase link at{" "}
                <span className="font-mono bg-muted px-2 py-1 rounded">/t/{tenant.slug}</span>
              </p>
            </div>
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
