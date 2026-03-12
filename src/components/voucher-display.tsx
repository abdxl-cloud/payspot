"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { saveVoucher } from "@/lib/voucher-storage";

type Props = {
  code: string;
  tenantSlug?: string;
  planName?: string;
  reference?: string;
};

export function VoucherDisplay({ code, tenantSlug, planName, reference }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || !tenantSlug) return;
    saveVoucher({ code, planName, reference, tenantSlug, savedAt: Date.now() });
  }, [code, tenantSlug, planName, reference]);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/70 px-5 py-7 text-center shadow-[0_8px_28px_rgba(79,70,229,0.1)] sm:px-6 sm:py-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-indigo-400">Voucher code</p>
      <p className="mt-3 break-all font-mono text-3xl font-black tracking-[0.2em] text-indigo-950 sm:text-4xl sm:tracking-[0.24em]">
        {code}
      </p>
      <button
        onClick={handleCopy}
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:shadow-[0_6px_16px_rgba(79,70,229,0.15)] active:scale-95"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 text-emerald-600" />
            <span className="text-emerald-600">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            Copy code
          </>
        )}
      </button>
    </div>
  );
}
