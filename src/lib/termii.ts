import { getSmsEnv } from "@/lib/env";

const baseUrl = "https://api.ng.termii.com/api";

export function normalizeNigerianPhone(input: string) {
  let phone = input.trim();
  if (phone.startsWith("+")) {
    phone = phone.slice(1);
  }
  if (phone.startsWith("0")) {
    phone = `234${phone.slice(1)}`;
  }
  if (!phone.startsWith("234")) {
    phone = `234${phone}`;
  }
  return phone;
}

export async function sendVoucherSms(params: {
  phone: string;
  message: string;
  channel?: "dnd" | "generic";
}) {
  const { TERMII_API_KEY, TERMII_SENDER_ID } = getSmsEnv();
  const response = await fetch(`${baseUrl}/sms/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: normalizeNigerianPhone(params.phone),
      from: TERMII_SENDER_ID,
      sms: params.message,
      type: "plain",
      channel: params.channel ?? "dnd",
      api_key: TERMII_API_KEY,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Termii SMS failed: ${text}`);
  }

  const data = await response.json();
  return data;
}
