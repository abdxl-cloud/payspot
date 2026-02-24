import { ResetPasswordForm } from "@/components/reset-password-form";
import { AppTopbar } from "@/components/app-topbar";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="app-shell">
      <div className="auth-container">
        <div className="w-full">
          <AppTopbar
            breadcrumb="Authentication / Set new password"
            environment="Public"
            accountLabel="Guest"
          />
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
            <section className="order-2 panel-surface space-y-4 lg:order-1">
              <p className="section-kicker">Credential reset</p>
              <h1 className="panel-title">Create a new secure password</h1>
              <p className="panel-copy max-w-xl">
                Use a strong password to protect tenant operations and payment configurations.
              </p>
            </section>
            <div className="order-1 mx-auto w-full max-w-xl lg:order-2">
              <ResetPasswordForm token={token} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
