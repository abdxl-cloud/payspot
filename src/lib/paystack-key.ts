const PAYSTACK_SECRET_KEY_REGEX = /^sk_live_[A-Za-z0-9]+$/;
const PAYSTACK_PUBLIC_KEY_REGEX = /^pk_live_[A-Za-z0-9]+$/;

export function isPaystackSecretKey(value: string) {
  return PAYSTACK_SECRET_KEY_REGEX.test(value.trim());
}

export function isPaystackPublicKey(value: string) {
  return PAYSTACK_PUBLIC_KEY_REGEX.test(value.trim());
}

