import { ResetPasswordForm } from "@/components/reset-password-form";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="app-shell">
      <div className="auth-container">
        <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="space-y-5 text-center lg:text-left">
            <div className="hero-chip">Account security</div>
            <h1 className="panel-title">Create a new password and restore account access.</h1>
            <p className="panel-copy max-w-xl">
              Use a strong password with mixed character types. This update will replace your previous credentials immediately.
            </p>
          </section>

          <section className="surface-card p-5 sm:p-6">
            <ResetPasswordForm token={token} />
          </section>
        </div>
      </div>
    </div>
  );
}
