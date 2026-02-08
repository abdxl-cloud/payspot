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
  const user = token ? getSessionUser(token) : null;
  if (user) {
    if (user.role === "admin") redirect("/admin");
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
  }

  return (
    <div className="app-shell">
      <div className="app-container max-w-4xl">
        <AppTopbar breadcrumb="Authentication / Reset request" environment="Public" accountLabel="Guest" />
        <div className="mx-auto w-full max-w-xl">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  );
}
