"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Wifi } from "lucide-react";
import { saveVoucher } from "@/lib/voucher-storage";
import { Button } from "@/components/ui/button";

type Props = {
  code: string;
  tenantSlug?: string;
  voucherSourceMode?: string;
  planName?: string;
  reference?: string;
};

export function VoucherDisplay({ code, tenantSlug, voucherSourceMode, planName, reference }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || !tenantSlug) return;
    saveVoucher({ code, planName, reference, tenantSlug, voucherSourceMode, savedAt: Date.now() });
  }, [code, tenantSlug, voucherSourceMode, planName, reference]);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-accent/5 p-6 text-center shadow-[var(--shadow-md)] sm:rounded-3xl sm:p-8">
      {/* Success Icon */}
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[var(--status-success-soft)]">
        <Wifi className="size-8 text-[var(--status-success)]" />
      </div>

      {/* Label */}
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">
        Your Voucher Code
      </p>

      {/* Code Display - Large Touch Friendly */}
      <div className="mt-4 rounded-xl bg-card p-4 shadow-[var(--shadow-xs)]">
        <p className="break-all font-mono text-2xl font-bold tracking-[0.15em] text-foreground sm:text-3xl md:text-4xl md:tracking-[0.2em]">
          {code}
        </p>
      </div>

      {/* Plan Name */}
      {planName && (
        <p className="mt-3 text-sm text-muted-foreground">
          Plan: <span className="font-medium text-foreground">{planName}</span>
        </p>
      )}

      {/* Copy Button - Large Touch Target */}
      <Button
        onClick={handleCopy}
        variant={copied ? "success" : "outline"}
        className="mt-5"
      >
        {copied ? (
          <>
            <Check className="size-4" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="size-4" />
            Copy code
          </>
        )}
      </Button>

      {/* Reference */}
      {reference && (
        <p className="mt-4 text-xs text-muted-foreground">
          Reference: <span className="font-mono">{reference}</span>
        </p>
      )}
    </div>
  );
}
