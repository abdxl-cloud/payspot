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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mb-6 flex flex-col gap-3 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
              Admin
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Tenant management
            </h1>
            <p className="text-slate-600">
              Create, edit, delete tenants and manage access.
            </p>
          </div>
          <div className="flex justify-center sm:justify-end">
            <LogoutButton />
          </div>
        </div>

        <AdminTenantsPanel />
      </div>
    </div>
  );
}
