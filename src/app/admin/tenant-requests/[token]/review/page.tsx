import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Building2, Mail, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { getTenantRequestByReviewToken } from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function TenantRequestReviewPage({ params }: Props) {
  const { token } = await params;
  const request = await getTenantRequestByReviewToken(token);
  if (!request) notFound();

  const isPending = request.status === "pending";

  return (
    <main className="approval-review-shell">
      <div className="approval-review-wrap">
        <header className="approval-review-head">
          <Link href="/" className="approval-review-brand">
            <span>PS</span>
            <div>
              <strong>PaySpot</strong>
              <small>tenant approval</small>
            </div>
          </Link>
          <ThemeToggle />
        </header>

        <section className="approval-review-grid">
          <aside className="approval-review-copy">
            <p className="section-kicker">Operator request</p>
            <h1>Configure before approval.</h1>
            <p>
              Choose how this tenant should be billed by PaySpot, add the message they should see in their
              approval email, then approve the portal.
            </p>

            <div className="approval-review-summary">
              <div>
                <Building2 aria-hidden="true" />
                <span>Business</span>
                <strong>{request.requested_name}</strong>
              </div>
              <div>
                <Mail aria-hidden="true" />
                <span>Admin email</span>
                <strong>{request.requested_email}</strong>
              </div>
              <div>
                <ShieldCheck aria-hidden="true" />
                <span>Request status</span>
                <strong>{request.status}</strong>
              </div>
            </div>
          </aside>

          <section className="approval-review-card">
            <div className="approval-review-card-head">
              <div>
                <p className="section-kicker">Approval settings</p>
                <h2>{request.requested_name}</h2>
              </div>
              <span>{formatDate(request.created_at)}</span>
            </div>

            {!isPending ? (
              <div className="approval-review-closed">
                <strong>This request has already been reviewed.</strong>
                <span>Status: {request.status}</span>
                <Link href="/admin">Open admin dashboard</Link>
              </div>
            ) : (
              <form method="POST" action={`/api/admin/tenant-requests/${token}/approve`} className="approval-review-form">
                <label className="approval-review-radio">
                  <input type="radio" name="billingModel" value="percent" defaultChecked />
                  <span>
                    <strong>Percentage per transaction</strong>
                    <small>PaySpot takes a percentage of each successful tenant transaction.</small>
                  </span>
                </label>

                <div className="approval-review-field">
                  <label htmlFor="feePercent">Platform fee percent</label>
                  <input id="feePercent" name="feePercent" type="number" min="0" max="100" step="0.01" defaultValue="5" />
                </div>

                <div className="approval-review-field">
                  <label htmlFor="paystackSubaccountCode">Tenant Paystack subaccount code</label>
                  <input
                    id="paystackSubaccountCode"
                    name="paystackSubaccountCode"
                    placeholder="ACCT_..."
                  />
                  <small>
                    Required for percentage billing. This is the tenant subaccount inside the PaySpot/admin Paystack integration.
                  </small>
                </div>

                <label className="approval-review-radio">
                  <input type="radio" name="billingModel" value="fixed_subscription" />
                  <span>
                    <strong>Fixed tenant subscription</strong>
                    <small>Tenant pays a fixed platform subscription instead of per-transaction percentage.</small>
                  </span>
                </label>

                <div className="approval-review-split">
                  <div className="approval-review-field">
                    <label htmlFor="subscriptionAmountNgn">Subscription amount</label>
                    <input id="subscriptionAmountNgn" name="subscriptionAmountNgn" type="number" min="0" step="100" defaultValue="0" />
                  </div>
                  <div className="approval-review-field">
                    <label htmlFor="subscriptionInterval">Interval</label>
                    <select id="subscriptionInterval" name="subscriptionInterval" defaultValue="monthly">
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>

                <div className="approval-review-field">
                  <label htmlFor="approvalMessage">Message to tenant approval email</label>
                  <textarea
                    id="approvalMessage"
                    name="approvalMessage"
                    maxLength={1200}
                    placeholder="Example: Welcome aboard. Your first month is free while we help you complete setup."
                  />
                </div>

                <div className="approval-review-actions">
                  <Link href={`/api/admin/tenant-requests/${token}/deny`} className="approval-review-deny">
                    Deny request
                  </Link>
                  <button type="submit">
                    Approve tenant
                    <ArrowRight aria-hidden="true" />
                  </button>
                </div>
              </form>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
