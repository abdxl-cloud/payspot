import nodemailer from "nodemailer";
import { getMailEnv } from "@/lib/env";

let cachedTransporter: nodemailer.Transporter | null = null;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(text: string) {
  return escapeHtml(text)
    .split("\n")
    .map((line) => line.trim() === "" ? "<br>" : `<p style="margin:0 0 8px">${line}</p>`)
    .join("");
}

function buildPaySpotEmailHtml(params: {
  title: string;
  kicker?: string;
  bodyHtml: string;
  primaryColor?: string;
}) {
  const primary = params.primaryColor && /^#[0-9a-f]{6}$/i.test(params.primaryColor)
    ? params.primaryColor
    : "#72f064";
  return `
<!doctype html>
<html>
<body style="margin:0;background:#0d0d0d;color:#efefef;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:30px 14px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#141414;border:1px solid #262626;border-radius:24px;overflow:hidden">
        <tr>
          <td style="padding:28px 30px;background:linear-gradient(135deg,#101010,#1b281d);border-bottom:1px solid #262626">
            <p style="margin:0 0 8px;color:${primary};font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">${escapeHtml(params.kicker ?? "PaySpot")}</p>
            <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.05;letter-spacing:-.04em">${escapeHtml(params.title)}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 30px;color:#d7d7d7;font-size:14px;line-height:1.55">
            ${params.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 30px;border-top:1px solid #262626;color:#626262;font-size:11px;text-align:center">
            Powered by PaySpot
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  const env = getMailEnv();
  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
  return cachedTransporter;
}

export async function sendMail(params: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}) {
  const env = getMailEnv();
  const transporter = getTransporter();

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html ?? buildPaySpotEmailHtml({
      title: params.subject,
      bodyHtml: textToHtml(params.text ?? ""),
    }),
  });
}

export async function sendVoucherEmail(params: {
  to: string;
  voucherCode: string;
  packageName: string;
  reference: string;
  tenantName?: string;
  tenantSlug?: string;
  amountNgn?: number;
  primaryColor?: string;
}) {
  // Skip generated guest emails — they're not real inboxes
  if (params.to.endsWith("@guest.payspot.co")) return;

  const primary = params.primaryColor && /^#[0-9a-f]{6}$/i.test(params.primaryColor)
    ? params.primaryColor
    : "#72f064";
  const amount = params.amountNgn
    ? `NGN ${params.amountNgn.toLocaleString("en-NG")}`
    : null;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Payment receipt</title></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#141414;border:1px solid #262626;border-radius:24px;overflow:hidden">
        <tr>
          <td style="background:linear-gradient(135deg,#101010,#1b281d);padding:30px 32px;border-bottom:1px solid #262626">
            <p style="margin:0;color:${primary};font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase">Payment receipt</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:32px;line-height:1.05;font-weight:900;letter-spacing:-0.04em">Your Wi-Fi access is ready</h1>
            <p style="margin:10px 0 0;color:#9a9a9a;font-size:14px">${escapeHtml(params.tenantName ?? "Your hotspot")} confirmed your payment.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 20px;color:#bdbdbd;font-size:14px;line-height:1.6">Thank you for your purchase. Keep this receipt safe. Your voucher code is below.</p>

            <div style="background:#101010;border:2px dashed ${primary};border-radius:18px;padding:24px;text-align:center;margin-bottom:24px">
              <p style="margin:0 0 8px;color:#9a9a9a;font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase">Voucher Code</p>
              <p style="margin:0;color:${primary};font-size:34px;font-weight:900;letter-spacing:0.14em">${escapeHtml(params.voucherCode)}</p>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #262626;border-radius:14px;overflow:hidden;margin-bottom:24px">
              <tr>
                <td style="padding:12px 16px;color:#626262;font-size:12px;font-weight:800;border-bottom:1px solid #262626;text-transform:uppercase;letter-spacing:.08em">Store</td>
                <td style="padding:12px 16px;color:#efefef;font-size:13px;font-weight:800;border-bottom:1px solid #262626;text-align:right">${escapeHtml(params.tenantName ?? "PaySpot")}</td>
              </tr>
              <tr>
                <td style="padding:12px 16px;color:#626262;font-size:12px;font-weight:800;border-bottom:1px solid #262626;text-transform:uppercase;letter-spacing:.08em">Plan</td>
                <td style="padding:12px 16px;color:#efefef;font-size:13px;font-weight:800;border-bottom:1px solid #262626;text-align:right">${escapeHtml(params.packageName)}</td>
              </tr>
              ${amount ? `<tr>
                <td style="padding:12px 16px;color:#626262;font-size:12px;font-weight:800;border-bottom:1px solid #262626;text-transform:uppercase;letter-spacing:.08em">Amount</td>
                <td style="padding:12px 16px;color:#efefef;font-size:13px;font-weight:800;border-bottom:1px solid #262626;text-align:right">${amount}</td>
              </tr>` : ""}
              <tr>
                <td style="padding:12px 16px;color:#626262;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em">Reference</td>
                <td style="padding:12px 16px;color:#bdbdbd;font-size:12px;font-family:monospace;text-align:right">${escapeHtml(params.reference)}</td>
              </tr>
            </table>

            <p style="margin:0 0 8px;color:#ffffff;font-size:13px;font-weight:800">How to connect:</p>
            <p style="margin:0 0 4px;color:#bdbdbd;font-size:13px">1. Connect to the Wi-Fi network.</p>
            <p style="margin:0 0 4px;color:#bdbdbd;font-size:13px">2. Open any browser and wait for the login page.</p>
            <p style="margin:0 0 20px;color:#bdbdbd;font-size:13px">3. Enter the voucher code above to start browsing.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#101010;padding:16px 32px;border-top:1px solid #262626">
            <p style="margin:0;color:#626262;font-size:11px;text-align:center">Sent by PaySpot${params.tenantSlug ? ` for ${escapeHtml(params.tenantSlug)}.payspot.app` : ""}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    "Your Wi-Fi voucher is ready!",
    "",
    `Voucher Code: ${params.voucherCode}`,
    `Plan: ${params.packageName}`,
    `Reference: ${params.reference}`,
    "",
    "How to connect:",
    "1. Connect to the Wi-Fi network.",
    "2. Open any browser — the login page will appear.",
    "3. Enter the voucher code above to start browsing.",
  ].join("\n");

  await sendMail({
    to: params.to,
    subject: `Your voucher code: ${params.voucherCode}`,
    text,
    html,
  });
}

