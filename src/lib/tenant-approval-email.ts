import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { absoluteAppUrl, getTenantOnboardingDocs } from "@/lib/tenant-onboarding-docs";
import type { PlatformBillingModel, PlatformSubscriptionInterval, TenantRow } from "@/lib/store";

type Params = {
  tenant: TenantRow;
  email: string;
  temporaryPassword: string;
  approvalMessage?: string | null;
  billingModel?: PlatformBillingModel | null;
  feePercent?: number | null;
  subscriptionAmountNgn?: number | null;
  subscriptionInterval?: PlatformSubscriptionInterval | null;
  hotspotType?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatBillingTerms(params: Params) {
  if (params.billingModel === "fixed_subscription") {
    const amount = Number(params.subscriptionAmountNgn ?? 0).toLocaleString("en-NG");
    const interval = params.subscriptionInterval === "yearly" ? "year" : "month";
    return `Fixed subscription: NGN ${amount} per ${interval}`;
  }

  const percent = Number(params.feePercent ?? 0);
  return `Percentage billing: ${percent}% platform fee`;
}

export async function sendTenantApprovalEmail(params: Params) {
  const { APP_URL } = getAppEnv();
  const loginUrl = new URL("/login", APP_URL).toString();
  const purchaseUrl = new URL(`/t/${params.tenant.slug}`, APP_URL).toString();
  const billingTerms = formatBillingTerms(params);
  const message = params.approvalMessage?.trim();
  const onboardingDocs = getTenantOnboardingDocs({
    tenant: params.tenant,
    hotspotType: params.hotspotType,
  });
  const docsUrl = absoluteAppUrl(onboardingDocs.personalizedGuidePath);
  const docsText = onboardingDocs.links.flatMap((link) => [
    `${link.primary ? "Start here" : link.label}: ${absoluteAppUrl(link.path)}`,
    `- ${link.description}`,
  ]);
  const docsHtml = onboardingDocs.links.map((link) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #262626">
        <a href="${absoluteAppUrl(link.path)}" style="color:${link.primary ? "#72f064" : "#efefef"};font-size:14px;font-weight:800;text-decoration:none">${escapeHtml(link.label)}</a>
        <p style="margin:5px 0 0;color:#9a9a9a;font-size:12px;line-height:1.5">${escapeHtml(link.description)}</p>
      </td>
    </tr>
  `).join("");

  const text = [
    "Your tenant portal has been approved.",
    "",
    `Tenant: ${params.tenant.name}`,
    `Slug: ${params.tenant.slug}`,
    `Purchase link: ${purchaseUrl}`,
    `Setup path: ${onboardingDocs.setupTitle}`,
    `Billing terms: ${billingTerms}`,
    message ? "" : null,
    message ? "Message from PaySpot:" : null,
    message ?? null,
    "",
    "Login details:",
    `Email: ${params.email}`,
    `Temporary password: ${params.temporaryPassword}`,
    "",
    "Sign in here:",
    loginUrl,
    "",
    "Your onboarding documentation:",
    onboardingDocs.setupNote,
    "",
    ...docsText,
    "",
    "Personalized setup guide:",
    docsUrl,
    "",
    "On first login, you must set your password and Paystack key before using the portal.",
  ].filter((line): line is string => line !== null).join("\n");

  const html = `
<!doctype html>
<html>
<body style="margin:0;background:#0d0d0d;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:28px 14px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#141414;border:1px solid #262626;border-radius:22px;overflow:hidden">
        <tr>
          <td style="padding:30px;border-bottom:1px solid #262626;background:linear-gradient(135deg,#101010,#142016)">
            <p style="margin:0 0 8px;color:#72f064;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Tenant approved</p>
            <h1 style="margin:0;color:#ffffff;font-size:34px;line-height:1.02;letter-spacing:-.05em">${escapeHtml(params.tenant.name)} is ready</h1>
            <p style="margin:12px 0 0;color:#9a9a9a;font-size:14px">Your PaySpot portal has been approved. Finish setup to start selling access.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 30px">
            ${message ? `
              <div style="margin-bottom:20px;border:1px solid #35542d;background:#162114;border-radius:16px;padding:16px">
                <p style="margin:0 0 7px;color:#72f064;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Message from PaySpot</p>
                <p style="margin:0;color:#efefef;font-size:14px;line-height:1.65">${escapeHtml(message)}</p>
              </div>
            ` : ""}
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Portal</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(purchaseUrl)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Setup path</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(onboardingDocs.setupTitle)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Billing</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(billingTerms)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Email</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(params.email)}</td></tr>
              <tr><td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">Temporary password</td><td style="padding:12px 0;border-bottom:1px solid #262626;color:#72f064;font-size:14px;text-align:right;font-weight:800">${escapeHtml(params.temporaryPassword)}</td></tr>
            </table>
            <div style="margin-top:22px;border:1px solid #2e3f27;background:#111a10;border-radius:16px;padding:16px">
              <p style="margin:0 0 7px;color:#72f064;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Onboarding docs for ${escapeHtml(onboardingDocs.hotspotLabel)}</p>
              <p style="margin:0 0 12px;color:#c8c8c8;font-size:13px;line-height:1.6">${escapeHtml(onboardingDocs.setupNote)}</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${docsHtml}</table>
            </div>
            <div style="margin-top:24px">
              <a href="${loginUrl}" style="display:inline-block;background:#72f064;color:#101010;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:800">Sign in and finish setup</a>
              <a href="${docsUrl}" style="display:inline-block;margin-left:8px;background:#1f1f1f;color:#efefef;text-decoration:none;border:1px solid #333;border-radius:10px;padding:12px 17px;font-weight:800">Open setup guide</a>
            </div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendMail({
    to: params.tenant.admin_email,
    subject: `Your tenant portal is approved: ${params.tenant.name}`,
    text,
    html,
  });
}
