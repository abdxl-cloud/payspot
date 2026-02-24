const PAYSTACK_SECRET_KEY_REGEX = /^sk_(?:test|live)_[A-Za-z0-9]+$/;

export function isPaystackSecretKey(value: string) {
  return PAYSTACK_SECRET_KEY_REGEX.test(value.trim());
}

