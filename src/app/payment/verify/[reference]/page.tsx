import { redirect } from "next/navigation";
import { getTenantForReference } from "@/lib/store";

type Props = {
  params: { reference: string } | Promise<{ reference: string }>;
};

export const dynamic = "force-dynamic";

export default async function PaymentVerifyRedirect({ params }: Props) {
  const { reference } = await params;
  const tenant = getTenantForReference(reference);

  if (!tenant) {
    return (
      <div className="app-shell">
        <div className="app-container max-w-3xl py-20 sm:py-24">
          <div className="status-card">
            <h1 className="status-title">Transaction not found</h1>
            <p className="status-copy">
              We could not locate this payment reference. Contact support if you were charged.
            </p>
          </div>
        </div>
      </div>
    );
  }

  redirect(`/t/${tenant.slug}/payment/verify/${reference}`);
}
