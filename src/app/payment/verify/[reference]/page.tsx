import { redirect } from "next/navigation";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";
import { getTenantForReference } from "@/lib/store";

type Props = {
  params: { reference: string } | Promise<{ reference: string }>;
};

export const dynamic = "force-dynamic";

export default async function PaymentVerifyRedirect({ params }: Props) {
  const { reference } = await params;
  const tenant = await getTenantForReference(reference);

  if (!tenant) {
    return (
      <PrototypeDocsShell title="Payment verification">
          <div className="status-card">
            <h1 className="status-title">Transaction not found</h1>
            <p className="status-copy">
              We could not locate this payment reference. Contact us at payspot@abdxl.cloud if you were charged.
            </p>
          </div>
      </PrototypeDocsShell>
    );
  }

  redirect(`/t/${tenant.slug}/payment/verify/${reference}`);
}
