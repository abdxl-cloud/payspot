import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import type { PlatformSubscriptionInterval, TenantRow } from "@/lib/store";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value: number | null | undefined) {
  return `NGN ${Number(value ?? 0).toLocaleString("en-NG")}`;
}

function formatInterval(value: PlatformSubscriptionInterval | null | undefined) {
  return value === "yearly" ? "year" : "month";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-NG", {
    dateStyle: "medium",
  });
}

export async function sendTenantSubscriptionReceiptEmail(params: {
  tenant: TenantRow;
  reference: string;
}) {
  const { APP_URL } = getAppEnv();
  const dashboardUrl = new URL(`/t/${params.tenant.slug}/admin`, APP_URL).toString();
  const storeUrl = new URL(`/t/${params.tenant.slug}`, APP_URL).toString();
  const amount = formatMoney(params.tenant.platform_subscription_amount_ngn);
  const interval = formatInterval(params.tenant.platform_subscription_interval);
  const paidAt = formatDate(params.tenant.platform_subscription_paid_at);
  const expiresAt = formatDate(params.tenant.platform_subscription_expires_at);

  const text = [
    "Your PaySpot subscription payment was confirmed.",
    "",
    `Tenant: ${params.tenant.name}`,
    `Amount: ${amount} per ${interval}`,
    `Reference: ${params.reference}`,
    `Paid: ${paidAt}`,
    `Valid until: ${expiresAt}`,
    "",
    "Your storefront and dashboard are now active.",
    `Dashboard: ${dashboardUrl}`,
    `Storefront: ${storeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#0d0d0d;color:#efefef;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:30px 14px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#141414;border:1px solid #262626;border-radius:24px;overflow:hidden">
        <tr>
          <td style="padding:30px;border-bottom:1px solid #262626;background:linear-gradient(135deg,#101010,#1b281d)">
            <p style="margin:0 0 8px;color:#72f064;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Subscription receipt</p>
            <h1 style="margin:0;color:#ffffff;font-size:34px;line-height:1.03;letter-spacing:-.05em">${escapeHtml(params.tenant.name)} is active</h1>
            <p style="margin:12px 0 0;color:#9a9a9a;font-size:14px">Your PaySpot subscription payment was confirmed.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 30px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px">
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Amount</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right;font-weight:800">${amount} / ${interval}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Reference</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#bdbdbd;font-size:12px;text-align:right;font-family:monospace">${escapeHtml(params.reference)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Paid</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(paidAt)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Valid until</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#72f064;font-size:14px;text-align:right;font-weight:800">${escapeHtml(expiresAt)}</td></tr>
            </table>
            <p style="margin:0 0 20px;color:#c8c8c8;font-size:14px;line-height:1.6">Your dashboard and storefront are unlocked until the subscription expiry date above.</p>
            <a href="${dashboardUrl}" style="display:inline-block;background:#72f064;color:#101010;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:800">Open dashboard</a>
            <a href="${storeUrl}" style="display:inline-block;margin-left:8px;background:#1f1f1f;color:#efefef;text-decoration:none;border:1px solid #333;border-radius:10px;padding:12px 17px;font-weight:800">Open storefront</a>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendMail({
    to: params.tenant.admin_email,
    subject: `PaySpot subscription confirmed: ${params.tenant.name}`,
    text,
    html,
  });
}
