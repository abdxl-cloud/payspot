import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  params: { token: string } | Promise<{ token: string }>;
};

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: Props) {
  const { token } = await params;
  return (
    <div className="auth-prototype-shell">
      <div className="auth-prototype-grid">
        <section className="auth-prototype-copy">
          <div className="auth-prototype-nav">
            <Link href="/" className="auth-brand">PaySpot</Link>
            <ThemeToggle />
          </div>
          <p className="section-kicker">Credential reset</p>
          <h1>Create a new secure operator password.</h1>
          <p>Use a strong password to protect tenant operations, voucher inventory, and payment configuration.</p>
          <div className="auth-signal-grid">
            <span>Minimum 8 chars</span>
            <span>Secure session</span>
            <span>Operator only</span>
          </div>
        </section>
        <div className="auth-prototype-card">
          <ResetPasswordForm token={token} />
        </div>
      </div>
    </div>
  );
}
