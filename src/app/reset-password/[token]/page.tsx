import { ResetPasswordForm } from "@/components/reset-password-form";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.35),_transparent_55%),_linear-gradient(135deg,_#fef6e4,_#e3f5ff_40%,_#f1f1ff_70%,_#fff)] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 space-y-2 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Vince Stack
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Reset password
            </h1>
            <p className="text-slate-600">
              Choose a new password for your account.
            </p>
          </div>

          <ResetPasswordForm token={token} />
        </div>
      </div>
    </div>
  );
}
