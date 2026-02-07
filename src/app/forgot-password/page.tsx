import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";
import Link from "next/link";

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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-block font-display text-3xl font-bold text-primary hover:text-primary/80 transition">
            PaySpot
          </Link>
          <h1 className="font-display text-3xl font-bold">Forgot password?</h1>
          <p className="text-foreground/70">Enter your email and we'll send you a reset link</p>
        </div>

        <ForgotPasswordForm />

        <p className="text-center text-sm text-foreground/60">
          Remember your password?{" "}
          <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
