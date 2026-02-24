import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { AppTopbar } from "@/components/app-topbar";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
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
            breadcrumb="Authentication / Reset request"
            environment="Public"
            accountLabel="Guest"
          />
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="order-2 panel-surface space-y-4 lg:order-1">
              <p className="section-kicker">Account recovery</p>
              <h1 className="panel-title">Recover access quickly</h1>
              <p className="panel-copy max-w-xl">
                Enter your admin email and we will send a secure reset link if an account exists.
              </p>
            </section>
            <div className="order-1 mx-auto w-full max-w-xl lg:order-2">
              <ForgotPasswordForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
