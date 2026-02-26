"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CircleAlert,
  Lock,
  MessageSquareText,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";

type Package = {
  code: string;
  name: string;
  durationMinutes: number;
  priceNgn: number;
  maxDevices: number;
  bandwidthProfile?: string | null;
  dataLimitMb?: number | null;
  description?: string | null;
  availableCount: number;
};

type Props = {
  tenantSlug: string;
  packages: Package[];
  portalAuthMode: "omada_builtin" | "external_portal_api" | "external_radius_portal";
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

function formatPriceCompact(value: number) {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1).replace(/\.0$/, "")}T`;
  }
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  return value.toLocaleString();
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { id: 1, label: "Select Plan" },
    { id: 2, label: "Phone Number" },
    { id: 3, label: "Pay Securely" },
  ] as const;

  return (
    <div aria-label="Checkout progress" className="grid gap-2 sm:grid-cols-3">
      {steps.map((item) => {
        const state = item.id < step ? "done" : item.id === step ? "active" : "todo";
        return (
          <div
            key={item.id}
            className={[
              "rounded-xl border px-3 py-2 text-xs font-semibold transition",
              state === "active"
                ? "border-sky-300 bg-sky-50 text-sky-800"
                : state === "done"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-500",
            ].join(" ")}
          >
            <span className="inline-flex items-center gap-2">
              <span
                className={[
                  "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                  state === "active"
                    ? "bg-sky-700 text-white"
                    : state === "done"
                      ? "bg-emerald-700 text-white"
                      : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {state === "done" ? <Check className="size-3" /> : item.id}
              </span>
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Checkout({ tenantSlug, packages, portalAuthMode }: Props) {
  const [selected, setSelected] = useState<Package | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [visiblePlanCount, setVisiblePlanCount] = useState(8);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);

  const [resumeReference, setResumeReference] = useState("");
  const [resumePhone, setResumePhone] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [flowMode, setFlowMode] = useState<"purchase" | "resume">("purchase");
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscriberPassword, setSubscriberPassword] = useState("");
  const [subscriberToken, setSubscriberToken] = useState<string | null>(null);
  const [subscriberAuthMessage, setSubscriberAuthMessage] = useState<string | null>(null);
  const [subscriberAuthError, setSubscriberAuthError] = useState<string | null>(null);
  const [subscriberAuthLoading, setSubscriberAuthLoading] = useState(false);

  const isAccountAccessMode = portalAuthMode === "external_radius_portal";
  const hasAvailable = packages.some((pkg) => pkg.availableCount > 0);
  const allSoldOut = packages.length > 0 && !hasAvailable;
  const isLongPlanList = packages.length > 12;

  const filteredPackages = useMemo(() => {
    const query = planQuery.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((pkg) => {
      return (
        pkg.name.toLowerCase().includes(query) ||
        pkg.code.toLowerCase().includes(query) ||
        formatDuration(pkg.durationMinutes).toLowerCase().includes(query)
      );
    });
  }, [packages, planQuery]);

  const hasHiddenPlans = isLongPlanList && filteredPackages.length > visiblePlanCount;
  const displayedPackages = hasHiddenPlans
    ? filteredPackages.slice(0, visiblePlanCount)
    : filteredPackages;

  useEffect(() => {
    const firstAvailable = packages.find((pkg) => pkg.availableCount > 0) ?? null;
    setSelected((prev) => {
      if (!firstAvailable) return null;
      if (!prev) return firstAvailable;
      if (prev.availableCount <= 0) return firstAvailable;
      return prev;
    });
  }, [packages]);

  useEffect(() => {
    if (!selected) return;
    const selectedIndex = filteredPackages.findIndex((pkg) => pkg.code === selected.code);
    if (selectedIndex >= 0 && selectedIndex + 1 > visiblePlanCount) {
      setVisiblePlanCount(selectedIndex + 1);
    }
  }, [filteredPackages, selected, visiblePlanCount]);

  const bestValueCode = useMemo(() => {
    const available = packages.filter((pkg) => pkg.availableCount > 0);
    if (available.length === 0) return null;
    const sorted = [...available].sort((a, b) => b.durationMinutes - a.durationMinutes);
    return sorted[0]?.code ?? null;
  }, [packages]);

  const step: 1 | 2 | 3 = allSoldOut ? 1 : loading ? 3 : selected ? 2 : 1;

  const canSubmit = useMemo(() => {
    if (isAccountAccessMode && !subscriberToken) return false;
    return !!selected && selected.availableCount > 0 && phone.length > 6 && !loading;
  }, [selected, phone, loading, isAccountAccessMode, subscriberToken]);

  function redirectToPaystack(url: string, newTab = false) {
    if (newTab) {
      const tab = window.open(url, "_blank", "noopener,noreferrer");
      if (!tab) {
        window.location.assign(url);
      }
      return;
    }
    window.location.assign(url);
  }

  async function copyReference(reference: string) {
    setCopyMessage(null);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reference);
        setCopyMessage("Reference copied.");
        return true;
      }
    } catch {
      // Fallback below.
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = reference;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (!ok) throw new Error("copy failed");
      setCopyMessage("Reference copied.");
      return true;
    } catch {
      setCopyMessage("Copy failed. Please write it down manually.");
      return false;
    }
  }

  async function authenticateSubscriber(mode: "login" | "signup") {
    setSubscriberAuthLoading(true);
    setSubscriberAuthError(null);
    setSubscriberAuthMessage(null);
    try {
      const endpoint = mode === "signup" ? "signup" : "login";
      const response = await fetch(`/api/t/${tenantSlug}/portal/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: subscriberEmail.trim(),
          password: subscriberPassword,
          phone: phone.trim() || undefined,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        token?: string;
      }>(response);
      if (!response.ok || !data?.token) {
        throw new Error(data?.error || "Authentication failed.");
      }
      setSubscriberToken(data.token);
      setSubscriberAuthMessage(
        mode === "signup"
          ? "Account created. You can now purchase a plan."
          : "Signed in. You can now purchase a plan.",
      );
    } catch (error) {
      setSubscriberAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setSubscriberAuthLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || selected.availableCount <= 0) return;

    setError(null);
    setAuthorizationUrl(null);
    setPaymentReference(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/payments/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(subscriberToken ? { Authorization: `Bearer ${subscriberToken}` } : {}),
        },
        body: JSON.stringify({
          phone,
          packageCode: selected.code,
          subscriberToken: subscriberToken ?? undefined,
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
        const copied = await copyReference(data.reference);
        if (!copied) {
          setCopyMessage(`Reference: ${data.reference}. Copy failed, please save it manually.`);
        }
      }
      setAuthorizationUrl(data.authorizationUrl);
      setResumePhone(phone.trim());
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
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
          phone: resumePhone.trim(),
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
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setResumeMessage(message);
    } finally {
      setResumeLoading(false);
    }
  }

  return (
    <div className="grid gap-4 sm:gap-5">
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
          <AlertTitle>All plans are temporarily unavailable</AlertTitle>
          <AlertDescription>
            Voucher inventory is currently empty. Please refresh and try again.
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

      <Card className="border-slate-200/80 bg-white/90">
        <CardHeader className="space-y-3 pb-3">
          <Stepper step={step} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
              1. Choose a plan
            </CardTitle>
            {selected ? (
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                Selected: {selected.name}
              </Badge>
            ) : (
              <Badge variant="secondary">Select a plan to continue</Badge>
            )}
          </div>

          {isLongPlanList ? (
            <div className="grid gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 sm:grid-cols-[1fr_260px] sm:items-center">
              <p className="text-xs text-slate-600 sm:text-sm">
                {filteredPackages.length} plans available
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={planQuery}
                  onChange={(event) => {
                    setPlanQuery(event.target.value);
                    setVisiblePlanCount(8);
                  }}
                  placeholder="Search by plan, code, or duration"
                  className="h-10 pl-9"
                  aria-label="Search plans"
                />
              </div>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={[
              "grid gap-3",
              displayedPackages.length <= 1
                ? "grid-cols-1"
                : displayedPackages.length === 2
                  ? "sm:grid-cols-2"
                  : "sm:grid-cols-2 xl:grid-cols-3",
            ].join(" ")}
          >
            {displayedPackages.map((pkg) => {
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
                    "gap-0 border-slate-200/90 bg-white py-0 transition",
                    !isSoldOut ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "cursor-not-allowed opacity-60",
                    isSelected ? "ring-2 ring-sky-300" : "",
                    displayedPackages.length === 1 ? "mx-auto w-full max-w-xl" : "",
                  ].join(" ")}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900" title={pkg.name}>
                          {pkg.name}
                        </p>
                        <p className="text-xs text-slate-500">{formatDuration(pkg.durationMinutes)}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isBestValue ? (
                          <Badge className="bg-sky-700 text-white">Best Value</Badge>
                        ) : null}
                        {isSoldOut ? (
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                            Sold out
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                            {pkg.availableCount} left
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">NGN</p>
                        <p
                          className="font-display text-[clamp(1.5rem,5.2vw,2.1rem)] font-semibold leading-none tracking-tight text-slate-900"
                          title={pkg.priceNgn.toLocaleString()}
                        >
                          <span className="sm:hidden">{formatPriceCompact(pkg.priceNgn)}</span>
                          <span className="hidden sm:inline">{pkg.priceNgn.toLocaleString()}</span>
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">Code: {pkg.code}</p>
                      </div>
                      {isSelected ? (
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-sky-700 text-white">
                          <Check className="size-4" />
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-3 text-xs leading-relaxed text-slate-600">
                      {pkg.description || "Instant access voucher for your Wi-Fi network."}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {isLongPlanList && filteredPackages.length === 0 ? (
            <Alert>
              <AlertTitle>No plans match your search</AlertTitle>
              <AlertDescription>Try another name, code, or duration.</AlertDescription>
            </Alert>
          ) : null}

          {hasHiddenPlans ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVisiblePlanCount((count) => count + 8)}
              >
                Show more plans
              </Button>
              <span className="text-xs text-slate-600">
                Showing {displayedPackages.length} of {filteredPackages.length}
              </span>
            </div>
          ) : null}

          {isLongPlanList && filteredPackages.length > 8 && !hasHiddenPlans ? (
            <div className="flex justify-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setVisiblePlanCount(8)}>
                Collapse list
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!allSoldOut && flowMode === "purchase" ? (
        <Card className="max-w-4xl border-slate-200/80 bg-white/90">
          <CardHeader className="space-y-2 pb-2">
            <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setFlowMode("purchase")}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition sm:px-4"
                aria-pressed={true}
              >
                New purchase
              </button>
              <button
                type="button"
                onClick={() => setFlowMode("resume")}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 sm:px-4"
                aria-pressed={false}
              >
                Resume payment
              </button>
            </div>
            <p className="section-kicker">Customer details</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                2. Enter phone number
              </CardTitle>
              {selected ? (
                <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                  {selected.name} • NGN {selected.priceNgn.toLocaleString()}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-end" onSubmit={handleSubmit}>
              {isAccountAccessMode ? (
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 lg:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Subscriber account
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="subscriberEmail">Email</Label>
                      <Input
                        id="subscriberEmail"
                        type="email"
                        value={subscriberEmail}
                        onChange={(event) => setSubscriberEmail(event.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="subscriberPassword">Password</Label>
                      <Input
                        id="subscriberPassword"
                        type="password"
                        value={subscriberPassword}
                        onChange={(event) => setSubscriberPassword(event.target.value)}
                        placeholder="At least 8 characters"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={subscriberAuthLoading || !subscriberEmail || subscriberPassword.length < 8}
                      onClick={() => authenticateSubscriber("login")}
                    >
                      Sign in
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={subscriberAuthLoading || !subscriberEmail || subscriberPassword.length < 8}
                      onClick={() => authenticateSubscriber("signup")}
                    >
                      Sign up
                    </Button>
                  </div>
                  {subscriberAuthError ? (
                    <p className="text-xs text-rose-700">{subscriberAuthError}</p>
                  ) : null}
                  {subscriberAuthMessage ? (
                    <p className="text-xs text-emerald-700">{subscriberAuthMessage}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="phone">Phone number</Label>
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
                  Nigeria format (e.g. 080...). Used for payment checks and support follow-up.
                </p>
              </div>

              <Button type="submit" disabled={!canSubmit} className="h-11 lg:mb-[22px]">
                {loading
                  ? "Preparing payment..."
                  : selected
                    ? `Pay NGN ${selected.priceNgn.toLocaleString()}`
                    : "Select a plan"}
              </Button>

              {paymentReference ? (
                <Alert className="border-emerald-200 bg-emerald-50/90 lg:col-span-2">
                  <AlertTitle>Reference saved: {paymentReference}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>Keep this reference. You can resume payment with it if interrupted.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => copyReference(paymentReference)}
                      >
                        Copy reference
                      </Button>
                      {authorizationUrl ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => redirectToPaystack(authorizationUrl)}
                        >
                          Continue to Paystack
                        </Button>
                      ) : null}
                      {authorizationUrl ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => redirectToPaystack(authorizationUrl, true)}
                        >
                          Open in browser
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-600">
                      Continue to Paystack when you are ready.
                    </p>
                    {copyMessage ? <p className="text-xs text-slate-600">{copyMessage}</p> : null}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 lg:col-span-2">
                <Lock className="size-4 text-slate-500" />
                <MessageSquareText className="size-4 text-slate-500" />
                {isAccountAccessMode
                  ? "Paystack-secured checkout with instant account plan activation."
                  : "Paystack-secured checkout with instant SMS voucher delivery."}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {flowMode === "resume" ? (
        <Card className="max-w-3xl border-slate-200/80 bg-white/90">
          <CardHeader className="space-y-2 pb-2">
            <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setFlowMode("purchase")}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 sm:px-4"
                aria-pressed={false}
              >
                New purchase
              </button>
              <button
                type="button"
                onClick={() => setFlowMode("resume")}
                className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition sm:px-4"
                aria-pressed={true}
              >
                Resume payment
              </button>
            </div>
            <p className="section-kicker">Recover interrupted checkout</p>
            <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
              Resume a payment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleResume}>
              {resumeMessage ? (
                <Alert className="md:col-span-2">
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
                <Label htmlFor="resume-phone">Phone used</Label>
                <Input
                  id="resume-phone"
                  type="tel"
                  className="h-11"
                  placeholder="08012345678"
                  value={resumePhone}
                  onChange={(event) => setResumePhone(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="outline" disabled={resumeLoading} className="md:col-span-2">
                {resumeLoading ? "Checking status..." : "Resume payment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
