import nodemailer from "nodemailer";
import { getMailEnv } from "@/lib/env";

let cachedTransporter: nodemailer.Transporter | null = null;

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
    html: params.html,
  });
}

export async function sendVoucherEmail(params: {
  to: string;
  voucherCode: string;
  packageName: string;
  reference: string;
}) {
  // Skip generated guest emails — they're not real inboxes
  if (params.to.endsWith("@guest.payspot.co")) return;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
        <tr>
          <td style="background:#0369a1;padding:28px 32px">
            <p style="margin:0;color:#bae6fd;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Payment Confirmed</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700">Your Wi-Fi voucher is ready</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px">
            <p style="margin:0 0 20px;color:#475569;font-size:14px">Thank you for your purchase. Your voucher code is below.</p>

            <div style="background:#f0f9ff;border:2px dashed #7dd3fc;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px">
              <p style="margin:0 0 6px;color:#64748b;font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase">Voucher Code</p>
              <p style="margin:0;color:#0c4a6e;font-size:28px;font-weight:700;letter-spacing:0.12em">${params.voucherCode}</p>
            </div>

            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin-bottom:24px">
              <tr style="background:#f8fafc">
                <td style="padding:10px 16px;color:#64748b;font-size:12px;font-weight:600;border-bottom:1px solid #e2e8f0">Plan</td>
                <td style="padding:10px 16px;color:#1e293b;font-size:13px;font-weight:600;border-bottom:1px solid #e2e8f0;text-align:right">${params.packageName}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#64748b;font-size:12px">Reference</td>
                <td style="padding:10px 16px;color:#475569;font-size:12px;font-family:monospace;text-align:right">${params.reference}</td>
              </tr>
            </table>

            <p style="margin:0 0 8px;color:#1e293b;font-size:13px;font-weight:600">How to connect:</p>
            <p style="margin:0 0 4px;color:#475569;font-size:13px">1. Connect to the Wi-Fi network.</p>
            <p style="margin:0 0 4px;color:#475569;font-size:13px">2. Open any browser — the login page will appear.</p>
            <p style="margin:0 0 20px;color:#475569;font-size:13px">3. Enter the voucher code above to start browsing.</p>

            <p style="margin:0;color:#94a3b8;font-size:11px">Keep this email safe — your voucher code is here if you ever need it again.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center">Sent by Payspot · payspot@abdxl.cloud</p>
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

