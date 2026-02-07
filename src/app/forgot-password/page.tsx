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
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 space-y-3 text-center">
            <div className="hero-chip">Password reset</div>
            <h1 className="panel-title">Forgot password</h1>
            <p className="panel-copy">Enter your email and we will send a reset link.</p>
          </div>

          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}