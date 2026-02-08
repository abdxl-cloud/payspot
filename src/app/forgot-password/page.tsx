import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? getSessionUser(token) : null;
  if (user) {
    if (user.role === "admin") {
      redirect("/admin");
    }
    if (user.tenantSlug) {
      redirect(`/t/${user.tenantSlug}/admin`);
    }
  }

  return (
    <div className="app-shell">
      <div className="auth-container">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="space-y-5 text-center lg:text-left">
            <div className="hero-chip">Account recovery</div>
            <h1 className="panel-title">Reset access securely without support tickets.</h1>
            <p className="panel-copy max-w-xl">
              Enter your admin email and we will send a one-time link so you can return to your dashboard quickly.
            </p>
          </section>

          <section className="surface-card p-5 sm:p-6">
            <ForgotPasswordForm />
          </section>
        </div>
      </div>
    </div>
  );
}
