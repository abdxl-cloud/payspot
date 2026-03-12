"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock, Copy, Trash2 } from "lucide-react";
import { type StoredVoucher, readStoredVouchers, removeStoredVoucher } from "@/lib/voucher-storage";

function formatTimeAgo(savedAt: number) {
  const diff = Date.now() - savedAt;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function VoucherHistory({ tenantSlug }: { tenantSlug: string }) {
  const [vouchers, setVouchers] = useState<StoredVoucher[]>([]);
  const [open, setOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    setVouchers(readStoredVouchers(tenantSlug));
  }, [tenantSlug]);

  if (vouchers.length === 0) return null;

  function handleCopy(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  }

  function handleRemove(code: string) {
    removeStoredVoucher(tenantSlug, code);
    setVouchers((prev) => prev.filter((v) => v.code !== code));
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-indigo-400" />
          <span className="text-sm font-semibold text-slate-900">
            My vouchers
          </span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
            {vouchers.length}
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        )}
      </button>

      {open ? (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3 sm:px-5">
          <p className="mb-3 text-xs text-slate-500">
            Vouchers bought on this device, saved in your browser. Enter these codes on the Wi-Fi login page.
          </p>
          <div className="space-y-2">
            {vouchers.map((v) => (
              <div
                key={v.code}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-sm font-bold tracking-wide text-indigo-900">
                    {v.code}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                    {v.planName ? <span>{v.planName}</span> : null}
                    {v.planName ? <span aria-hidden>·</span> : null}
                    <span>{formatTimeAgo(v.savedAt)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopy(v.code)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50"
                  >
                    {copiedCode === v.code ? (
                      <>
                        <Check className="size-3 text-emerald-600" />
                        <span className="text-emerald-600">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(v.code)}
                    aria-label={`Remove voucher ${v.code}`}
                    className="inline-flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
