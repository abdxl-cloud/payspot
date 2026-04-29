import { getPlatformPaystackEnv } from "@/lib/env";
import { isPaystackPublicKey, isPaystackSecretKey } from "@/lib/paystack-key";
import { requireTenantPaystackSecretKey, type TransactionRow } from "@/lib/store";

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

export function requirePlatformPaystackSecretKey() {
  const { PAYSTACK_SECRET_KEY } = getPlatformPaystackEnv();
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("Platform Paystack key is not configured");
  }
  if (!isPaystackSecretKey(PAYSTACK_SECRET_KEY)) {
    throw new Error("Platform Paystack key is invalid");
  }
  return PAYSTACK_SECRET_KEY;
}

export function requirePlatformPaystackKeys() {
  const secretKey = requirePlatformPaystackSecretKey();
  const { PAYSTACK_PUBLIC_KEY } = getPlatformPaystackEnv();
  if (!PAYSTACK_PUBLIC_KEY) {
    throw new Error("Platform Paystack public key is not configured");
  }
  if (!isPaystackPublicKey(PAYSTACK_PUBLIC_KEY)) {
    throw new Error("Platform Paystack public key is invalid");
  }
  return {
    secretKey,
    publicKey: PAYSTACK_PUBLIC_KEY,
  };
}

export async function requirePaystackSecretForTransaction(params: {
  tenantId: string;
  transaction: PaystackRoutableTransaction;
}) {
  if (usesPlatformPaystack(params.transaction)) {
    return requirePlatformPaystackSecretKey();
  }
  return requireTenantPaystackSecretKey(params.tenantId);
}
