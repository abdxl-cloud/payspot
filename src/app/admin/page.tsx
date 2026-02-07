import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTenantsPanel } from "@/components/admin-tenants-panel";
import { LogoutButton } from "@/components/logout-button";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;

  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    if (user.tenantSlug) {
      redirect(`/t/${user.tenantSlug}/admin`);
    }
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              Admin Portal
            </span>
            <div className="space-y-1">
              <h1 className="font-display text-4xl font-semibold tracking-tight">
                Tenant management
              </h1>
              <p className="text-muted-foreground text-base">
                Create, edit, and manage all venue accounts
              </p>
            </div>
          </div>
          <div className="flex justify-start sm:justify-end">
            <LogoutButton />
          </div>
        </div>

        <AdminTenantsPanel />
      </div>
    </div>
  );
}
