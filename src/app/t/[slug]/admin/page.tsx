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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="space-y-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                {tenant.name}
              </span>
              <div className="space-y-2">
                <h1 className="font-display text-4xl font-semibold tracking-tight">
                  Sales dashboard
                </h1>
                <p className="text-muted-foreground text-base">
                  Manage inventory, track sales, and monitor revenue for your link at{" "}
                  <span className="font-mono bg-muted px-2 py-1 rounded">/t/{tenant.slug}</span>
                </p>
              </div>
            </div>
            <div className="flex justify-start sm:justify-end">
              <LogoutButton />
            </div>
          </div>

          <TenantAdminPanel tenantSlug={tenant.slug} />
        </div>
      </div>
    </div>
  );
}
