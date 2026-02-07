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
      <div className="min-h-screen bg-slate-950 text-white">
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 sm:py-24">
          <h1 className="text-3xl font-semibold">Transaction not found</h1>
          <p className="mt-4 text-slate-300">
            We could not locate this payment reference. Please contact support
            if you were charged.
          </p>
        </div>
      </div>
    );
  }

  redirect(`/t/${tenant.slug}/payment/verify/${reference}`);
}
