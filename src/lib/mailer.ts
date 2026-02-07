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

