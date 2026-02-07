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
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between mb-10">
          <div className="space-y-3">
            <h1 className="font-display text-5xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground">Manage inventory and track sales for {tenant.name}</p>
          </div>
          <LogoutButton />
        </div>

        <TenantAdminPanel tenantSlug={tenant.slug} />
      </div>
    </div>
  );
}
