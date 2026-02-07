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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.35),_transparent_55%),_linear-gradient(135deg,_#fef6e4,_#e3f5ff_40%,_#f1f1ff_70%,_#fff)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Vince Stack
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Forgot password
            </h1>
            <p className="text-slate-600">
              We will email you a reset link if your account exists.
            </p>
          </div>

          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
