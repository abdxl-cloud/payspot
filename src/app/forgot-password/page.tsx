import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <div className="auth-prototype-shell">
      <div className="auth-prototype-grid">
        <section className="auth-prototype-copy">
          <div className="auth-prototype-nav">
            <Link href="/" className="auth-brand">PaySpot</Link>
            <ThemeToggle />
          </div>
          <p className="section-kicker">Account recovery</p>
          <h1>Recover access without losing the operation.</h1>
          <p>Enter your admin email and PaySpot will send a secure reset link if an account exists.</p>
          <div className="auth-signal-grid">
            <span>Tokenized reset</span>
            <span>Tenant protected</span>
            <span>Payment-safe</span>
          </div>
        </section>
        <div className="auth-prototype-card">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
