import crypto from "node:crypto";

const baseUrl = "https://api.paystack.co";

export type PaystackInitResponse = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export type PaystackVerifyResponse = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  customer: {
    email: string;
  };
  metadata?: Record<string, unknown>;
};

export async function initializeTransaction(params: {
  secretKey: string;
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  subaccount?: string | null;
  transactionChargeKobo?: number | null;
  bearer?: "account" | "subaccount";
  metadata?: Record<string, unknown>;
}) {
  const payload: Record<string, unknown> = {
    email: params.email,
    amount: params.amountKobo,
    reference: params.reference,
    callback_url: params.callbackUrl,
    metadata: params.metadata ?? {},
  };
  if (params.subaccount) {
    payload.subaccount = params.subaccount;
    payload.bearer = params.bearer ?? "subaccount";
    if (params.transactionChargeKobo && params.transactionChargeKobo > 0) {
      payload.transaction_charge = params.transactionChargeKobo;
    }
  }

  const response = await fetch(`${baseUrl}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: { status?: boolean; message?: string; data?: unknown } | null = null;
  let rawText = "";
  try {
    data = await response.json();
  } catch {
    rawText = await response.text();
  }

  if (!response.ok || !data?.status) {
    const details =
      data?.message?.trim() ||
      rawText.trim() ||
      `Paystack initialization failed (HTTP ${response.status}).`;
    throw new Error(details);
  }

  return data.data as PaystackInitResponse;
}

export async function verifyTransaction(params: {
  secretKey: string;
  reference: string;
}) {
  const response = await fetch(
    `${baseUrl}/transaction/verify/${params.reference}`,
    {
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
    },
  },
  );

  let data: { status?: boolean; message?: string; data?: unknown } | null = null;
  let rawText = "";
  try {
    data = await response.json();
  } catch {
    rawText = await response.text();
  }

  if (!response.ok || !data?.status) {
    const details =
      data?.message?.trim() ||
      rawText.trim() ||
      `Paystack verification failed (HTTP ${response.status}).`;
    throw new Error(details);
  }

  return data.data as PaystackVerifyResponse;
}

export function verifyWebhookSignature(params: {
  payload: string;
  signature: string;
  secretKey: string;
}) {
  const hash = crypto
    .createHmac("sha512", params.secretKey)
    .update(params.payload)
    .digest("hex");
  const hashBuffer = Buffer.from(hash);
  const signatureBuffer = Buffer.from(params.signature);
  if (hashBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(hashBuffer, signatureBuffer);
}
