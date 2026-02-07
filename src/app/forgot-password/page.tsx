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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="mb-8 space-y-3">
          <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            Vince Stack
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              Reset your password
            </h1>
            <p className="text-muted-foreground">Enter your email and we'll send you a reset link</p>
          </div>
        </div>

        <ForgotPasswordForm />
      </div>
    </div>
  );
}
