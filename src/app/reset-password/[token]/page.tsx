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
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 space-y-3 text-center">
            <div className="hero-chip">Account security</div>
            <h1 className="panel-title">Reset password</h1>
            <p className="panel-copy">Choose a new secure password for your account.</p>
          </div>

          <ResetPasswordForm token={token} />
        </div>
      </div>
    </div>
  );
}