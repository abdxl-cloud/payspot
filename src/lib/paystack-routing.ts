import { getPlatformPaystackEnv } from "@/lib/env";
import { isPaystackPublicKey, isPaystackSecretKey } from "@/lib/paystack-key";
import {
  getPlatformPaystackPublicKey,
  getPlatformPaystackSecretKey,
  requireTenantPaystackSecretKey,
  type TransactionRow,
} from "@/lib/store";

type PaystackRoutableTransaction = Pick<
  TransactionRow,
  "platform_billing_model" | "platform_fee_ngn" | "paystack_subaccount_code"
>;

export function usesPlatformPaystack(transaction: PaystackRoutableTransaction) {
  return (
    transaction.platform_billing_model === "percent" &&
    Number(transaction.platform_fee_ngn ?? 0) > 0 &&
    !!transaction.paystack_subaccount_code
  );
}

export async function requirePlatformPaystackSecretKey() {
  const { PAYSTACK_SECRET_KEY } = getPlatformPaystackEnv();
  const secretKey = await getPlatformPaystackSecretKey() || PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Platform Paystack key is not configured");
  }
  if (!isPaystackSecretKey(secretKey)) {
    throw new Error("Platform Paystack key is invalid");
  }
  return secretKey;
}

export async function requirePlatformPaystackKeys() {
  const secretKey = await requirePlatformPaystackSecretKey();
  const { PAYSTACK_PUBLIC_KEY } = getPlatformPaystackEnv();
  const publicKey = await getPlatformPaystackPublicKey() || PAYSTACK_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("Platform Paystack public key is not configured");
  }
  if (!isPaystackPublicKey(publicKey)) {
    throw new Error("Platform Paystack public key is invalid");
  }
  return {
    secretKey,
    publicKey,
  };
}

export async function requirePaystackSecretForTransaction(params: {
  tenantId: string;
  transaction: PaystackRoutableTransaction;
}) {
  if (usesPlatformPaystack(params.transaction)) {
    return await requirePlatformPaystackSecretKey();
  }
  return requireTenantPaystackSecretKey(params.tenantId);
}
