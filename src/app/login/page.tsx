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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">
              Vince Stack
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Welcome back
            </h1>
            <p className="text-slate-600">Sign in to manage your portal.</p>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  );
}
