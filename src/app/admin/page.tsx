import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminTenantsPanel } from "@/components/admin-tenants-panel";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? await getSessionUser(token) : null;

  if (!user) redirect("/login");

  if (user.role !== "admin") {
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
    redirect("/login");
  }

  return <AdminTenantsPanel />;
}
