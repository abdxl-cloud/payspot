import { ResetPasswordForm } from "@/components/reset-password-form";
import Link from "next/link";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <Link href="/" className="inline-block font-display text-3xl font-bold text-primary hover:text-primary/80 transition">
            PaySpot
          </Link>
          <h1 className="font-display text-3xl font-bold">Reset password</h1>
          <p className="text-foreground/70">Choose a new password for your account</p>
        </div>

        <ResetPasswordForm token={token} />

        <p className="text-center text-sm text-foreground/60">
          <Link href="/login" className="text-primary hover:text-primary/80 font-semibold transition">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
