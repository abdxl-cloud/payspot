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
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="space-y-5 text-center lg:text-left">
            <div className="hero-chip">PaySpot access</div>
            <h1 className="panel-title">
              Sign in to your <span className="text-gradient">operations workspace</span>
            </h1>
            <p className="panel-copy max-w-xl">
              Manage voucher plans, inventory, and payment activity from a single admin surface built for daily execution.
            </p>
            <div className="hero-metric-grid max-w-2xl text-left">
              <div className="hero-metric">
                <strong>Plans</strong>
                <span>pricing and stock control</span>
              </div>
              <div className="hero-metric">
                <strong>Payments</strong>
                <span>reference and status tracking</span>
              </div>
              <div className="hero-metric">
                <strong>Access</strong>
                <span>tenant and admin account tools</span>
              </div>
            </div>
          </section>

          <section className="surface-card p-5 sm:p-6">
            <LoginForm />
          </section>
        </div>
      </div>
    </div>
  );
}
