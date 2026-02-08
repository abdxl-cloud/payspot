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
      <div className="app-container max-w-4xl">
        <AppTopbar breadcrumb="Authentication / Set new password" environment="Public" accountLabel="Guest" />
        <div className="mx-auto w-full max-w-xl">
          <ResetPasswordForm token={token} />
        </div>
      </div>
    </div>
  );
}
