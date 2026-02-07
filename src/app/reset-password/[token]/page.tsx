import { ResetPasswordForm } from "@/components/reset-password-form";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="mb-8 space-y-3">
          <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
            Vince Stack
          </span>
          <div className="space-y-2">
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              Create new password
            </h1>
            <p className="text-muted-foreground">Choose a strong password for your account</p>
          </div>
        </div>

        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
