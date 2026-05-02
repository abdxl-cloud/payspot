import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { verifyTransaction } from "@/lib/paystack";
import { requirePlatformPaystackSecretKey } from "@/lib/paystack-routing";
import { sendTenantSubscriptionReceiptEmail } from "@/lib/tenant-subscription-email";
import { getTenantBySlug, markTenantSubscriptionPaid } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string; reference: string }>;
};

function money(value: number) {
  return `NGN ${value.toLocaleString("en-NG")}`;
}

const subscriptionVerifyCss = `
.sub-result{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bd);border-radius:16px;background:var(--s2);padding:12px 14px;color:var(--tx2);font-size:13px;line-height:1.5;margin-bottom:18px}
.sub-result.ok{border-color:oklch(0.72 0.17 155/.35);background:oklch(0.72 0.17 155/.12);color:var(--green)}
.sub-result.err{border-color:oklch(0.65 0.18 25/.35);background:oklch(0.65 0.18 25/.12);color:var(--red)}
.sub-title{font-family:var(--font-heading),sans-serif;font-size:clamp(28px,4vw,44px);font-weight:900;letter-spacing:-.05em;color:var(--tx);line-height:1;margin:0 0 10px}
.sub-copy{font-size:14px;color:var(--tx2);line-height:1.7;margin:0 0 22px;max-width:560px}
`;

export default async function TenantSubscriptionVerifyPage({ params }: Props) {
  const { slug, reference } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  let ok = false;
  let title = "Subscription payment pending";
  let copy = "We could not confirm this payment yet. If you paid successfully, refresh this page in a moment.";

  try {
    const secretKey = await requirePlatformPaystackSecretKey();
    const verification = await verifyTransaction({ secretKey, reference });
    const expectedAmount = Math.round(Number(tenant.platform_subscription_amount_ngn ?? 0)) * 100;
    const amountMatches = !expectedAmount || Number(verification.amount) === expectedAmount;

    if (verification.status?.toLowerCase() === "success" && amountMatches) {
      const result = await markTenantSubscriptionPaid({ tenantId: tenant.id, reference });
      if (result.status === "ok" || result.status === "already_paid") {
        ok = true;
        title = "Subscription active";
        copy = "Your setup is complete. The storefront and tenant dashboard are now unlocked.";
        if (result.status === "ok") {
          await sendTenantSubscriptionReceiptEmail({
            tenant: result.tenant,
            reference,
          }).catch((error) => {
            console.error("Tenant subscription receipt email failed", error);
          });
        }
      } else {
        title = "Payment reference mismatch";
        copy = "This payment did not match the latest pending subscription reference for this tenant.";
      }
    }
  } catch (error) {
    console.error("Tenant subscription verification failed", error);
  }

  return (
    <main className="setup-prototype-shell screen on" data-screen-label="Subscription Verify">
      <style>{subscriptionVerifyCss}</style>
      <div className="approval-review-wrap">
        <header className="approval-review-head">
          <Link href="/" className="approval-review-brand">
            <span>PS</span>
            <div>
              <strong>PaySpot</strong>
              <small>subscription</small>
            </div>
          </Link>
          <ThemeToggle />
        </header>

        <section className="approval-review-card" style={{ maxWidth: 720, margin: "60px auto" }}>
          <div className="approval-review-card-head">
            <div>
              <p className="section-kicker">Tenant subscription</p>
              <h2>{tenant.name}</h2>
            </div>
            <span>{money(Number(tenant.platform_subscription_amount_ngn ?? 0))}</span>
          </div>

          <div className={`sub-result ${ok ? "ok" : "err"}`}>
            {ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
            <span>{copy}</span>
          </div>

          <h1 className="sub-title">{title}</h1>
          <p className="sub-copy">
            Reference: {reference}. Subscription interval: {tenant.platform_subscription_interval === "yearly" ? "yearly" : "monthly"}.
          </p>

          <div className="approval-review-actions">
            <Link href={ok ? `/t/${tenant.slug}/admin` : `/t/${tenant.slug}/setup?step=subscription`} className="approval-review-deny">
              {ok ? "Open dashboard" : "Back to setup"}
            </Link>
            {ok ? (
              <Link href={`/t/${tenant.slug}`} className="approval-review-deny">
                Open storefront
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
