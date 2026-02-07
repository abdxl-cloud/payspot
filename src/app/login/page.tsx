import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
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
            <div className="hero-chip">PaySpot access</div>
            <h1 className="panel-title">Welcome back</h1>
            <p className="panel-copy">Sign in to manage vouchers, plans, and payouts.</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}