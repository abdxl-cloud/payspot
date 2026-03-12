export type StoredVoucher = {
  code: string;
  planName?: string;
  reference?: string;
  tenantSlug: string;
  savedAt: number;
};

const STORAGE_KEY_PREFIX = "payspot:vouchers:";
const MAX_STORED_VOUCHERS = 30;

function storageKey(tenantSlug: string) {
  return `${STORAGE_KEY_PREFIX}${tenantSlug}`;
}

export function readStoredVouchers(tenantSlug: string): StoredVoucher[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug));
    if (!raw) return [];
    return JSON.parse(raw) as StoredVoucher[];
  } catch {
    return [];
  }
}

export function saveVoucher(voucher: StoredVoucher): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(voucher.tenantSlug);
    const existing = readStoredVouchers(voucher.tenantSlug);
    // Dedup by code — move to front if already stored
    const filtered = existing.filter((v) => v.code !== voucher.code);
    const updated = [voucher, ...filtered].slice(0, MAX_STORED_VOUCHERS);
    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Ignore storage errors silently.
  }
}

export function removeStoredVoucher(tenantSlug: string, code: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(tenantSlug);
    const existing = readStoredVouchers(tenantSlug);
    window.localStorage.setItem(key, JSON.stringify(existing.filter((v) => v.code !== code)));
  } catch {
    // Ignore storage errors silently.
  }
}

export function clearStoredVouchers(tenantSlug: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(tenantSlug));
  } catch {
    // Ignore storage errors silently.
  }
}
