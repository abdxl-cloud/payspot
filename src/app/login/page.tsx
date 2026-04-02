import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { AppTopbar } from "@/components/app-topbar";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? await getSessionUser(token) : null;
  if (user) {
    if (user.role === "admin") redirect("/admin");
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
  }

  return (
    <div className="app-shell">
      <div className="auth-container">
        <div className="w-full">
          <AppTopbar
            breadcrumb="Authentication / Login"
            environment="Public"
            accountLabel="Guest"
          />
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center lg:gap-12 xl:gap-20">
            <section className="order-2 panel-surface space-y-4 lg:order-1 lg:space-y-6">
              <p className="section-kicker">Secure operator access</p>
              <h1 className="panel-title lg:text-4xl xl:text-5xl">Access your PaySpot control center</h1>
              <p className="panel-copy max-w-xl lg:text-lg">
                Manage tenant operations, voucher inventory, and payment flow from a single secure workspace.
              </p>
            </section>
            <div className="order-1 mx-auto w-full max-w-md lg:order-2 lg:max-w-lg">
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
