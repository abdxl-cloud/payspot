export type StoredVoucher = {
  code: string;
  planName?: string;
  reference?: string;
  tenantSlug: string;
  voucherSourceMode?: string;
  savedAt: number;
};

const STORAGE_KEY_PREFIX = "payspot:vouchers:";
const MAX_STORED_VOUCHERS = 30;

function normalizeVoucherSourceMode(value: string | null | undefined) {
  if (value === "omada_openapi") return "omada_openapi";
  if (value === "mikrotik_rest") return "mikrotik_rest";
  if (value === "radius_voucher") return "radius_voucher";
  return "import_csv";
}

function storageKey(tenantSlug: string, voucherSourceMode?: string) {
  return `${STORAGE_KEY_PREFIX}${tenantSlug}:${normalizeVoucherSourceMode(voucherSourceMode)}`;
}

export function readStoredVouchers(tenantSlug: string, voucherSourceMode?: string): StoredVoucher[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantSlug, voucherSourceMode));
    if (!raw) return [];
    return JSON.parse(raw) as StoredVoucher[];
  } catch {
    return [];
  }
}

export function saveVoucher(voucher: StoredVoucher): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(voucher.tenantSlug, voucher.voucherSourceMode);
    const existing = readStoredVouchers(voucher.tenantSlug, voucher.voucherSourceMode);
    const filtered = existing.filter((v) => v.code !== voucher.code);
    const updated = [voucher, ...filtered].slice(0, MAX_STORED_VOUCHERS);
    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch {
    // Ignore storage errors silently.
  }
}

export function removeStoredVoucher(
  tenantSlug: string,
  voucherSourceMode: string | undefined,
  code: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(tenantSlug, voucherSourceMode);
    const existing = readStoredVouchers(tenantSlug, voucherSourceMode);
    window.localStorage.setItem(key, JSON.stringify(existing.filter((v) => v.code !== code)));
  } catch {
    // Ignore storage errors silently.
  }
}

export function clearStoredVouchers(tenantSlug: string, voucherSourceMode?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(tenantSlug, voucherSourceMode));
  } catch {
    // Ignore storage errors silently.
  }
}
