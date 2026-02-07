"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Lock,
  MessageSquareText,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { readJsonResponse } from "@/lib/http";

type Package = {
  code: string;
  name: string;
  durationMinutes: number;
  priceNgn: number;
  description?: string | null;
  availableCount: number;
};

type Props = {
  tenantSlug: string;
  packages: Package[];
};

function formatDuration(minutes: number) {
  if (minutes % (60 * 24 * 7) === 0) {
    const w = minutes / (60 * 24 * 7);
    return `${w} week${w === 1 ? "" : "s"}`;
  }
  if (minutes % (60 * 24) === 0) {
    const d = minutes / (60 * 24);
    return `${d} day${d === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60;
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { id: 1, label: "Plan" },
    { id: 2, label: "Details" },
    { id: 3, label: "Pay" },
  ] as const;

  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
      {steps.map((s, idx) => {
        const state =
          s.id < step ? "complete" : s.id === step ? "active" : "upcoming";

        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={[
                "flex size-7 items-center justify-center rounded-full border text-[11px]",
                state === "active"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : state === "complete"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white/70 text-slate-500",
              ].join(" ")}
            >
              {state === "complete" ? <Check className="size-4" /> : s.id}
            </div>
            <span className={state === "active" ? "text-slate-900" : ""}>
              {s.label}
            </span>
            {idx < steps.length - 1 ? (
              <div className="mx-1 hidden h-px w-10 bg-slate-200 sm:block" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function Checkout({ tenantSlug, packages }: Props) {
  const [selected, setSelected] = useState<Package | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);

  const [resumeReference, setResumeReference] = useState("");
  const [resumeEmail, setResumeEmail] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);

  const hasAvailable = packages.some((pkg) => pkg.availableCount > 0);
  const allSoldOut = packages.length > 0 && !hasAvailable;

  useEffect(() => {
    const firstAvailable = packages.find((pkg) => pkg.availableCount > 0) ?? null;
    setSelected((prev) => {
      if (!firstAvailable) return null;
      if (!prev) return firstAvailable;
      if (prev.availableCount <= 0) return firstAvailable;
      return prev;
    });
  }, [packages]);

  const bestValueCode = useMemo(() => {
    const available = packages.filter((pkg) => pkg.availableCount > 0);
    if (available.length === 0) return null;
    const sorted = [...available].sort(
      (a, b) => b.durationMinutes - a.durationMinutes,
    );
    return sorted[0]?.code ?? null;
  }, [packages]);

  const step: 1 | 2 | 3 = allSoldOut ? 1 : loading ? 3 : selected ? 2 : 1;

  const canSubmit = useMemo(() => {
    return (
      !!selected &&
      selected.availableCount > 0 &&
      email.length > 3 &&
      phone.length > 6 &&
      !loading
    );
  }, [selected, email, phone, loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || selected.availableCount <= 0) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/payments/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          phone,
          packageCode: selected.code,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        authorizationUrl?: string;
        reference?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Payment initialization failed.");
      }
      if (!data?.authorizationUrl) {
        throw new Error("Payment initialization failed.");
      }
      if (data?.reference) {
        setPaymentReference(data.reference);
        setResumeReference(data.reference);
      }
      setResumeEmail(email.trim());
      setTimeout(() => {
        window.location.href = data.authorizationUrl!;
      }, 1200);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setLoading(false);
    }
  }

  async function handleResume(event: React.FormEvent) {
    event.preventDefault();
    setResumeMessage(null);
    setResumeLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/payments/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: resumeReference.trim(),
          email: resumeEmail.trim(),
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        status?: string;
        authorizationUrl?: string;
      }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to resume payment.");
      }
      if (data?.status === "success") {
        window.location.href = `/t/${tenantSlug}/payment/verify/${resumeReference.trim()}`;
        return;
      }
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      setResumeMessage("Payment cannot be resumed.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setResumeMessage(message);
    } finally {
      setResumeLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="space-y-2">
        <Stepper step={step} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="section-kicker">
              Choose a plan
            </p>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Buy WiFi access
            </h2>
          </div>
          {selected ? (
            <Badge
              variant="outline"
              className="self-start whitespace-nowrap sm:self-auto"
            >
              Selected: {formatDuration(selected.durationMinutes)}
            </Badge>
          ) : (
            <Badge variant="secondary" className="self-start sm:self-auto">
              Select a plan to continue
            </Badge>
          )}
        </div>
      </div>

      {packages.length === 0 ? (
        <Alert>
          <AlertTitle>No plans imported yet</AlertTitle>
          <AlertDescription>
            Import voucher plans to make purchases available.
          </AlertDescription>
        </Alert>
      ) : null}

      {allSoldOut ? (
        <Alert>
          <CircleAlert className="size-4" />
          <AlertTitle>All plans currently unavailable</AlertTitle>
          <AlertDescription>
            Import more vouchers or try again in a few minutes.
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCcw className="size-4" />
                Refresh availability
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Payment setup failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {paymentReference ? (
        <Alert>
          <AlertTitle>Payment reference: {paymentReference}</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Save this reference in case you need to resume payment.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(paymentReference)}
              >
                Copy reference
              </Button>
              <span className="text-xs text-slate-500 self-center">
                Redirecting to Paystack...
              </span>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-3">
        {packages.map((pkg) => {
          const isSoldOut = pkg.availableCount <= 0;
          const isSelected = selected?.code === pkg.code;
          const isBestValue = bestValueCode === pkg.code && !isSoldOut;

          return (
            <Card
              key={pkg.code}
              role="button"
              tabIndex={isSoldOut ? -1 : 0}
              aria-disabled={isSoldOut}
              aria-pressed={isSelected}
              onClick={() => {
                if (!isSoldOut) setSelected(pkg);
              }}
              onKeyDown={(event) => {
                if (isSoldOut) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(pkg);
                }
              }}
              className={[
                "min-w-[240px] select-none gap-0 border-slate-200/80 bg-white/90 py-0 shadow-sm transition sm:min-w-0",
                !isSoldOut ? "hover:-translate-y-0.5 hover:bg-white/80 hover:shadow-md" : "",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/20",
                isSelected ? "ring-2 ring-slate-900/15 bg-white/90" : "",
                isSoldOut ? "cursor-not-allowed opacity-60" : "cursor-pointer",
              ].join(" ")}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{pkg.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDuration(pkg.durationMinutes)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {isBestValue ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-700"
                      >
                        Best value
                      </Badge>
                    ) : null}
                    {isSoldOut ? (
                      <Badge
                        variant="outline"
                        className="border-rose-200 bg-rose-50 text-rose-700"
                      >
                        Sold out
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{pkg.availableCount} left</Badge>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex items-end justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                      NGN
                    </p>
                    <p className="font-display text-3xl font-semibold tracking-tight text-slate-900">
                      {pkg.priceNgn.toLocaleString()}
                    </p>
                  </div>
                  {isSelected ? (
                    <div className="flex size-9 items-center justify-center rounded-full bg-slate-900 text-white">
                      <Check className="size-4" />
                    </div>
                  ) : null}
                </div>

                <p className="mt-4 min-h-[2.25rem] text-xs leading-relaxed text-slate-600">
                  {pkg.description || "Instant access voucher for your WiFi network."}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator />

      {!allSoldOut ? (
        <Card className="border-white/90 bg-white/95">
          <CardHeader className="space-y-1">
            <p className="section-kicker">
              Your details
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="section-title">Where should we send the voucher?</CardTitle>
              {selected ? (
                <Badge
                  variant="outline"
                  className="self-start whitespace-nowrap sm:self-auto"
                >
                  {selected.name} - NGN {selected.priceNgn.toLocaleString()}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  className="h-11"
                  placeholder="you@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  className="h-11"
                  placeholder="08012345678"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Nigeria (+234). We&apos;ll format your number automatically.
                </p>
              </div>

              <Button
                type="submit"
                disabled={!canSubmit}
                className="h-12 sm:col-span-2"
              >
                {loading
                  ? "Processing..."
                  : selected
                    ? `Pay NGN ${selected.priceNgn.toLocaleString()}`
                    : "Select a plan"}
              </Button>

              <div className="grid gap-2 text-xs text-slate-600 sm:col-span-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-slate-500" />
                  Secured by Paystack
                </div>
                <div className="flex items-center gap-2">
                  <MessageSquareText className="size-4 text-slate-500" />
                  Voucher delivered via SMS in seconds
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <details className="group rounded-xl border border-white/90 bg-white/95">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <span>Resume a payment</span>
          <ChevronDown className="size-4 text-slate-500 transition group-open:rotate-180" />
        </summary>
        <div className="px-6 pb-6">
          <form className="grid gap-4" onSubmit={handleResume}>
            {resumeMessage ? (
              <Alert>
                <AlertTitle>Resume status</AlertTitle>
                <AlertDescription>{resumeMessage}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="resume-reference">Payment reference</Label>
              <Input
                id="resume-reference"
                type="text"
                className="h-11"
                placeholder="WIFI-ABC123"
                value={resumeReference}
                onChange={(event) => setResumeReference(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="resume-email">Email used</Label>
              <Input
                id="resume-email"
                type="email"
                className="h-11"
                placeholder="you@email.com"
                value={resumeEmail}
                onChange={(event) => setResumeEmail(event.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={resumeLoading}>
              {resumeLoading ? "Checking..." : "Resume payment"}
            </Button>
          </form>
        </div>
      </details>
    </div>
  );
}
