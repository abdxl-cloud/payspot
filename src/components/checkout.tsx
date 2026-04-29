"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, Lock, Mail, RefreshCcw, Search, ShieldCheck, Wifi } from "lucide-react";
import { CaptiveBrowserAuth } from "@/components/captive-browserauth";
import { VoucherHistory } from "@/components/voucher-history";
import { createCaptivePortalSearchParams, type CaptivePortalContext } from "@/lib/captive-portal";
import { readJsonResponse } from "@/lib/http";

declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction(
        accessCode: string,
        options?: {
          onSuccess?: (transaction: { reference: string }) => void;
          onCancel?: () => void;
          onError?: (error: unknown) => void;
        },
      ): void;
    };
  }
}

type Package = {
  code: string;
  name: string;
  durationMinutes: number | null;
  priceNgn: number;
  maxDevices: number | null;
  bandwidthProfile?: string | null;
  dataLimitMb?: number | null;
  description?: string | null;
  availableCount: number;
};

type Props = {
  tenantSlug: string;
  packages: Package[];
  accessMode: "voucher_access" | "account_access";
  voucherSourceMode?: string;
  portalContext?: CaptivePortalContext;
};

type SubscriberOverview = {
  subscriber: {
    email: string;
    phone?: string | null;
    fullName?: string | null;
  };
  entitlements: Array<{
    id: string;
    status: string;
    endsAt: string | null;
    maxDevices: number | null;
    dataLimitMb?: number | null;
    usage: {
      usedBytes: number;
      activeSessions: number;
    };
    package: {
      name: string;
      priceNgn: number;
    };
  }>;
};

const checkoutCriticalCss = `
.prototype-checkout{width:100%;max-width:1080px;margin:0 auto;color:var(--tx)}
.prototype-checkout *{box-sizing:border-box}
.portal-mode-switch{display:flex!important;width:max-content;gap:4px;margin:0 auto 18px;padding:4px;border:1px solid var(--bd);border-radius:999px;background:var(--s1)}
.portal-mode-switch button,.portal-tabs button{border:0;background:transparent;color:var(--tx2);border-radius:999px;padding:7px 14px;font-size:13px;font-weight:700;cursor:pointer}
.portal-mode-switch button.on,.portal-tabs button.on{background:var(--ac);color:#0d0d0d}
.prototype-checkout-grid{display:grid!important;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.prototype-plan-panel,.prototype-pay-panel,.prototype-resume-panel,.prototype-active-plan,.prototype-captive-note,.prototype-powered,.portal-empty-panel{border:1px solid var(--bd);border-radius:var(--r3);background:var(--s1);box-shadow:var(--shadow-sm)}
.prototype-plan-panel{padding:16px}
.portal-tabs{display:flex!important;flex-wrap:wrap;gap:6px;margin-bottom:14px}
.prototype-plan-search{display:flex!important;align-items:center;gap:8px;height:40px;margin-bottom:12px;padding:0 12px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx3)}
.prototype-plan-search input{width:100%;border:0!important;background:transparent!important;color:var(--tx)!important;outline:none}
.prototype-plan-head{display:flex!important;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.prototype-plan-head-text{color:var(--tx3);font-size:12px}
.prototype-plan-head button{border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx2);padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer}
.prototype-plan-head button:hover{border-color:var(--ac-bd);color:var(--ac);background:var(--ac-dim)}
.prototype-plan-list{display:grid!important;gap:10px}
.prototype-plan-card{position:relative;display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;width:100%;padding:14px;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s2);color:var(--tx);text-align:left;cursor:pointer;transition:all .15s}
.prototype-plan-card:hover:not(:disabled),.prototype-plan-card.sel{border-color:var(--ac-bd);background:var(--ac-dim)}
.prototype-plan-card.disabled{opacity:.45;cursor:not-allowed}
.plan-main strong,.plan-price strong{display:block;color:var(--tx);font-size:16px;line-height:1.15}
.plan-main small,.plan-price small{display:block;margin-top:4px;color:var(--tx3);font-size:12px}
.plan-price{text-align:right}
.plan-check{position:absolute;right:10px;top:10px;color:var(--ac)}
.prototype-pay-panel{position:sticky;top:18px;padding:18px}
.section-kicker{margin-bottom:8px;color:var(--ac);font-family:var(--font-mono),monospace;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.prototype-pay-panel h2,.prototype-resume-panel h2,.prototype-active-plan h2,.portal-empty-panel h2{margin:0 0 14px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:24px;font-weight:800;letter-spacing:-.03em}
.prototype-order-card{display:grid!important;grid-template-columns:1fr auto;gap:8px;margin-bottom:14px;padding:12px;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s2)}
.prototype-order-card span{color:var(--tx3);font-size:12px}.prototype-order-card strong{color:var(--tx);font-family:var(--font-mono),monospace;font-size:13px}
.prototype-email-form label,.prototype-auth-box input,.prototype-resume-panel input{display:flex;align-items:center;gap:8px;width:100%;height:42px;margin-bottom:10px;padding:0 12px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx2)}
.prototype-email-form input,.prototype-auth-box input,.prototype-resume-panel input{border:0!important;background:transparent!important;color:var(--tx)!important;outline:none}
.prototype-auth-box{margin-bottom:14px;padding:12px;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s2)}
.prototype-auth-actions{display:grid!important;grid-template-columns:1fr 1fr;gap:8px}.prototype-auth-actions button,.prototype-resume-panel button{border:1px solid var(--bd);border-radius:var(--r);background:var(--s1);color:var(--tx2);padding:9px 12px;font-weight:700;cursor:pointer}
.prototype-pay-button{width:100%;height:48px;border:0;border-radius:var(--r2);background:var(--ac);color:#0d0d0d;font-size:15px;font-weight:800;cursor:pointer}.prototype-pay-button:disabled{opacity:.5;cursor:not-allowed}
.prototype-secure,.prototype-powered,.prototype-captive-note{display:flex;align-items:center;gap:8px;color:var(--tx2);font-size:13px}
.prototype-secure{margin-top:12px}
.prototype-captive-note{align-items:flex-start}
.prototype-captive-note strong{display:block;color:var(--tx);font-size:13px;margin-bottom:3px}
.prototype-captive-note span{display:block;color:var(--tx2);font-size:12px;line-height:1.55}
.prototype-reference,.prototype-error,.prototype-success{margin:10px 0;padding:10px 12px;border-radius:var(--r);font-size:12px}
.prototype-reference{border:1px solid var(--bd);background:var(--s2);color:var(--tx2)}.prototype-reference strong{display:block;color:var(--ac);font-family:var(--font-mono),monospace}
.prototype-error{border:1px solid oklch(0.65 0.18 25/.25);background:oklch(0.65 0.18 25/.12);color:var(--red)}
.prototype-success{border:1px solid oklch(0.72 0.17 155/.2);background:oklch(0.72 0.17 155/.12);color:var(--green)}
.prototype-resume-panel,.prototype-active-plan,.portal-empty-panel{padding:20px}
.prototype-resume-panel button{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;background:var(--ac);color:#0d0d0d;border-color:transparent}
.prototype-active-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;overflow:hidden;margin:1rem 0;border:1px solid var(--bd);border-radius:var(--r2);background:var(--bd)}
.prototype-active-grid span{background:var(--s2);color:var(--tx2);padding:12px;font-size:13px}
.prototype-captive-note,.prototype-powered{margin-top:14px;padding:12px 14px}
@media(max-width:760px){.prototype-checkout-grid{grid-template-columns:1fr}.prototype-pay-panel{position:static}.prototype-plan-card{grid-template-columns:1fr}.plan-price{text-align:left}}
`;

const SUBSCRIBER_SESSION_KEY_PREFIX = "payspot:subscriber-session:";
const CAPTIVE_AUTH_KEY_PREFIX = "payspot:captive-auth:";

function getSubscriberSessionKey(tenantSlug: string) {
  return `${SUBSCRIBER_SESSION_KEY_PREFIX}${tenantSlug}`;
}

function getCaptiveAuthKey(tenantSlug: string) {
  return `${CAPTIVE_AUTH_KEY_PREFIX}${tenantSlug}`;
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function replaceQueryParams(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }
  const query = url.searchParams.toString();
  window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) return "Unlimited time";
  if (minutes % (60 * 24 * 7) === 0) {
    const weeks = minutes / (60 * 24 * 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

function formatDataLimitMb(value: number | null | undefined) {
  if (!value || value <= 0) return "Unlimited data";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} TB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} GB`;
  return `${value} MB`;
}

function formatDevices(value: number | null | undefined) {
  if (!value || value <= 0) return "Unlimited devices";
  return `${value} device${value === 1 ? "" : "s"}`;
}

function formatPrice(value: number) {
  return `NGN ${value.toLocaleString()}`;
}

function readStoredSubscriberSession(tenantSlug: string) {
  try {
    const raw = window.localStorage.getItem(getSubscriberSessionKey(tenantSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; email?: string };
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchSubscriberOverview(params: { tenantSlug: string; token: string }) {
  const response = await fetch(`/api/t/${params.tenantSlug}/portal/me`, {
    headers: { Authorization: `Bearer ${params.token}` },
    cache: "no-store",
  });
  const data = await readJsonResponse<SubscriberOverview & { error?: string }>(response);
  if (!response.ok || !data) throw new Error(data?.error || "Unable to load subscriber profile.");
  return data;
}

export function Checkout({ tenantSlug, packages, accessMode, voucherSourceMode, portalContext }: Props) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [focusSelectedPlan, setFocusSelectedPlan] = useState(false);
  const [query, setQuery] = useState("");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [flowMode, setFlowMode] = useState<"purchase" | "resume">("purchase");
  const restoredUrlState = useRef(false);
  const skipNextUrlWrite = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [resumeReference, setResumeReference] = useState("");
  const [resumeLookup, setResumeLookup] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscriberPassword, setSubscriberPassword] = useState("");
  const [subscriberToken, setSubscriberToken] = useState<string | null>(null);
  const [subscriberOverview, setSubscriberOverview] = useState<SubscriberOverview | null>(null);
  const [subscriberMessage, setSubscriberMessage] = useState<string | null>(null);
  const [subscriberError, setSubscriberError] = useState<string | null>(null);
  const [subscriberLoading, setSubscriberLoading] = useState(false);

  const isAccountAccessMode = accessMode === "account_access";
  const portalQuery = createCaptivePortalSearchParams(portalContext).toString();
  const selected = packages.find((pkg) => pkg.code === selectedCode) ?? null;
  const activeEntitlement = subscriberOverview?.entitlements[0] ?? null;

  const visiblePackages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return packages.filter((pkg) => {
      if (focusSelectedPlan && selectedCode && pkg.code !== selectedCode) return false;
      if (!normalizedQuery) return true;
      return [
        pkg.name,
        pkg.code,
        pkg.description ?? "",
        formatDuration(pkg.durationMinutes),
        formatDataLimitMb(pkg.dataLimitMb),
        formatDevices(pkg.maxDevices),
        formatPrice(pkg.priceNgn),
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
  }, [packages, focusSelectedPlan, selectedCode, query]);

  useEffect(() => {
    const firstAvailable = packages.find((pkg) => pkg.availableCount > 0);
    if (firstAvailable && !selectedCode) setSelectedCode(firstAvailable.code);
  }, [packages, selectedCode]);

  useEffect(() => {
    if (!isAccountAccessMode) return;
    const stored = readStoredSubscriberSession(tenantSlug);
    if (!stored?.token) return;
    setSubscriberToken(stored.token);
    if (stored.email) {
      setSubscriberEmail(stored.email);
      setResumeLookup(stored.email);
    }
  }, [isAccountAccessMode, tenantSlug]);

  useEffect(() => {
    if (!isAccountAccessMode || !subscriberToken) return;
    let cancelled = false;
    fetchSubscriberOverview({ tenantSlug, token: subscriberToken })
      .then((overview) => {
        if (!cancelled) setSubscriberOverview(overview);
      })
      .catch(() => {
        if (!cancelled) setSubscriberToken(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAccountAccessMode, subscriberToken, tenantSlug]);

  useEffect(() => {
    if (document.querySelector('script[src="https://js.paystack.co/v2/inline.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get("checkout");
    if (mode === "resume" || mode === "purchase") {
      setFlowMode(mode);
    }
    restoredUrlState.current = true;
  }, []);

  useEffect(() => {
    if (!restoredUrlState.current) return;
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    replaceQueryParams({ checkout: flowMode === "purchase" ? null : flowMode });
  }, [flowMode]);

  async function copyReference(nextReference: string) {
    setCopyMessage(null);
    try {
      await navigator.clipboard.writeText(nextReference);
      setCopyMessage("Reference copied.");
    } catch {
      setCopyMessage(`Reference: ${nextReference}`);
    }
  }

  function openPaystackPopup(accessCode: string, verifyUrl: string, authorizationUrl: string) {
    if (!window.PaystackPop) {
      window.location.assign(authorizationUrl);
      return;
    }
    try {
      const popup = new window.PaystackPop();
      if (typeof popup.resumeTransaction !== "function") {
        window.location.assign(authorizationUrl);
        return;
      }
      popup.resumeTransaction(accessCode, {
        onSuccess: () => window.location.assign(verifyUrl),
        onCancel: () => {
          setLoading(false);
          setError("Payment was cancelled. You can retry with the saved reference.");
        },
        onError: () => {
          setLoading(false);
          setError("Paystack popup could not load. Redirect checkout is still available.");
          window.location.assign(authorizationUrl);
        },
      });
    } catch {
      window.location.assign(authorizationUrl);
    }
  }

  async function authenticateSubscriber(mode: "login" | "signup") {
    const email = subscriberEmail.trim().toLowerCase();
    if (!isValidEmailAddress(email) || subscriberPassword.length < 8) {
      setSubscriberError("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    setSubscriberLoading(true);
    setSubscriberError(null);
    setSubscriberMessage(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/portal/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: subscriberPassword }),
      });
      const data = await readJsonResponse<{ error?: string; token?: string }>(response);
      if (!response.ok || !data?.token) throw new Error(data?.error || "Authentication failed.");
      setSubscriberToken(data.token);
      window.localStorage.setItem(
        getSubscriberSessionKey(tenantSlug),
        JSON.stringify({ token: data.token, email, savedAt: Date.now() }),
      );
      window.sessionStorage.setItem(
        getCaptiveAuthKey(tenantSlug),
        JSON.stringify({ username: email, password: subscriberPassword, savedAt: Date.now() }),
      );
      const overview = await fetchSubscriberOverview({ tenantSlug, token: data.token });
      setSubscriberOverview(overview);
      setSubscriberMessage(mode === "signup" ? "Account created. Choose a plan." : "Signed in. Choose a plan.");
    } catch (err) {
      setSubscriberError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setSubscriberLoading(false);
    }
  }

  async function initiatePayment(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || selected.availableCount <= 0) return;
    if (isAccountAccessMode && !subscriberToken) {
      setError("Sign in or create an account before payment.");
      return;
    }
    if (!isAccountAccessMode && !isValidEmailAddress(voucherEmail)) {
      setError("Enter a valid email address before payment.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/payments/init`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(subscriberToken ? { Authorization: `Bearer ${subscriberToken}` } : {}),
        },
        body: JSON.stringify({
          email: isAccountAccessMode ? undefined : voucherEmail.trim(),
          packageCode: selected.code,
          subscriberToken: subscriberToken ?? undefined,
          portalContext,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        authorizationUrl?: string;
        accessCode?: string;
        verifyUrl?: string;
        reference?: string;
      }>(response);
      if (!response.ok || !data?.authorizationUrl) throw new Error(data?.error || "Payment initialization failed.");
      if (data.reference) {
        setReference(data.reference);
        setResumeReference(data.reference);
        setResumeLookup(isAccountAccessMode ? subscriberEmail.trim() : voucherEmail.trim());
        await copyReference(data.reference);
      }
      if (data.accessCode && data.verifyUrl) {
        openPaystackPopup(data.accessCode, data.verifyUrl, data.authorizationUrl);
      } else {
        window.location.assign(data.authorizationUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  async function handleResume(event: FormEvent) {
    event.preventDefault();
    setResumeLoading(true);
    setResumeMessage(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/payments/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: resumeReference.trim(), email: resumeLookup.trim() }),
      });
      const data = await readJsonResponse<{ error?: string; status?: string; authorizationUrl?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to resume payment.");
      if (data?.status === "success") {
        const verifyPath = `/t/${tenantSlug}/payment/verify/${resumeReference.trim()}`;
        window.location.href = portalQuery ? `${verifyPath}?${portalQuery}` : verifyPath;
        return;
      }
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      setResumeMessage("Payment cannot be resumed.");
    } catch (err) {
      setResumeMessage(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setResumeLoading(false);
    }
  }

  if (packages.length === 0) {
    return (
      <div className="portal-empty-panel">
        <p className="section-kicker">No plans</p>
        <h2>Plans are not available yet.</h2>
        <p>The operator will publish pricing soon.</p>
      </div>
    );
  }

  return (
    <>
    <style>{checkoutCriticalCss}</style>
    <div className="prototype-checkout">
      {activeEntitlement ? (
        <section className="prototype-active-plan">
          <p className="section-kicker">Current plan</p>
          <h2>{activeEntitlement.package.name} is active</h2>
          <div className="prototype-active-grid">
            <span>{activeEntitlement.usage.activeSessions} active session(s)</span>
            <span>{activeEntitlement.endsAt ? new Date(activeEntitlement.endsAt).toLocaleString() : "No expiry"}</span>
            <span>{activeEntitlement.maxDevices ?? "Unlimited"} device limit</span>
          </div>
          <CaptiveBrowserAuth
            tenantSlug={tenantSlug}
            portalContext={portalContext}
            defaultUsername={subscriberOverview?.subscriber.email || subscriberEmail.trim()}
            defaultPassword={subscriberPassword}
            autoSubmitWhenReady
          />
        </section>
      ) : null}

      <div className="portal-mode-switch">
        <button type="button" className={flowMode === "purchase" ? "on" : ""} onClick={() => setFlowMode("purchase")}>
          New purchase
        </button>
        <button type="button" className={flowMode === "resume" ? "on" : ""} onClick={() => setFlowMode("resume")}>
          Resume payment
        </button>
      </div>

      {flowMode === "purchase" ? (
        <div className="prototype-checkout-grid">
          <section className="prototype-plan-panel">
            <div className="prototype-plan-head">
              <span className="prototype-plan-head-text">
                {focusSelectedPlan && selected ? "Selected plan" : "Choose a plan"}
              </span>
              {focusSelectedPlan ? (
                <button className="btn btn-muted btn-sm" type="button" onClick={() => setFocusSelectedPlan(false)}>
                  Change plan
                </button>
              ) : null}
            </div>

            {!focusSelectedPlan && packages.length > 8 ? (
              <div className="prototype-plan-search">
                <Search className="size-4" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search plans" />
              </div>
            ) : null}

            <div className="prototype-plan-list">
              {visiblePackages.map((pkg) => {
                const isSelected = selected?.code === pkg.code;
                const isSoldOut = pkg.availableCount <= 0;
                return (
                  <button
                    key={pkg.code}
                    type="button"
                    disabled={isSoldOut}
                    className={`prototype-plan-card${isSelected ? " sel" : ""}${isSoldOut ? " disabled" : ""}`}
                    onClick={() => {
                      setSelectedCode(pkg.code);
                      setFocusSelectedPlan(true);
                    }}
                  >
                    <span className="plan-main">
                      <strong>{pkg.name}</strong>
                      <small>
                        {formatDuration(pkg.durationMinutes)} / {formatDevices(pkg.maxDevices)} / {formatDataLimitMb(pkg.dataLimitMb)}
                      </small>
                    </span>
                    <span className="plan-price">
                      <strong>{formatPrice(pkg.priceNgn)}</strong>
                      {isSoldOut ? <small>Sold out</small> : null}
                    </span>
                    {isSelected ? <Check className="plan-check size-4" /> : null}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="prototype-pay-panel">
            <p className="section-kicker">Checkout</p>
            <h2>{selected ? selected.name : "Select a plan"}</h2>
            {selected ? (
              <div className="prototype-order-card">
                <span>Plan</span>
                <strong>{selected.name}</strong>
                <span>Duration</span>
                <strong>{formatDuration(selected.durationMinutes)}</strong>
                <span>Total</span>
                <strong>{formatPrice(selected.priceNgn)}</strong>
              </div>
            ) : null}

            {isAccountAccessMode ? (
              <div className="prototype-auth-box">
                <p className="section-kicker">Subscriber account</p>
                <input type="email" value={subscriberEmail} onChange={(event) => setSubscriberEmail(event.target.value)} placeholder="you@example.com" />
                <input type="password" value={subscriberPassword} onChange={(event) => setSubscriberPassword(event.target.value)} placeholder="Password" />
                <div className="prototype-auth-actions">
                  <button type="button" disabled={subscriberLoading} onClick={() => authenticateSubscriber("login")}>Sign in</button>
                  <button type="button" disabled={subscriberLoading} onClick={() => authenticateSubscriber("signup")}>Create</button>
                </div>
                {subscriberError ? <p className="prototype-error">{subscriberError}</p> : null}
                {subscriberMessage ? <p className="prototype-success">{subscriberMessage}</p> : null}
              </div>
            ) : (
              <form className="prototype-email-form" onSubmit={initiatePayment}>
                <label>
                  <Mail className="size-4" />
                  <input type="email" value={voucherEmail} onChange={(event) => setVoucherEmail(event.target.value)} placeholder="you@example.com" />
                </label>
              </form>
            )}

            {error ? <p className="prototype-error">{error}</p> : null}
            {reference ? (
              <div className="prototype-reference">
                <span>Saved reference</span>
                <strong>{reference}</strong>
                {copyMessage ? <small>{copyMessage}</small> : null}
              </div>
            ) : null}

            <button type="button" className="prototype-pay-button" disabled={!selected || loading} onClick={() => void initiatePayment()}>
              {loading ? "Preparing payment..." : selected ? `Pay ${formatPrice(selected.priceNgn)}` : "Select a plan"}
            </button>
            <p className="prototype-secure">
              <Lock className="size-3.5" />
              Paystack-secured checkout with instant access delivery.
            </p>
          </aside>
        </div>
      ) : (
        <form className="prototype-resume-panel" onSubmit={handleResume}>
          <p className="section-kicker">Recover interrupted checkout</p>
          <h2>Resume a payment</h2>
          <input value={resumeReference} onChange={(event) => setResumeReference(event.target.value)} placeholder="Payment reference" />
          <input type="email" value={resumeLookup} onChange={(event) => setResumeLookup(event.target.value)} placeholder="Email used" />
          <button type="submit" disabled={resumeLoading}>
            <RefreshCcw className="size-4" />
            {resumeLoading ? "Checking..." : "Resume payment"}
          </button>
          {resumeMessage ? <p className="prototype-error">{resumeMessage}</p> : null}
        </form>
      )}

      {portalContext ? (
        <div className="prototype-captive-note">
          <ShieldCheck className="size-4" />
          <div>
            <strong>Captive portal browser detected</strong>
            <span>
              For the smoothest checkout, open this page in your normal browser if your phone gives you that option.
              If Paystack shows a bank-transfer account and you close this page, your payment can still succeed when
              you transfer to the correct account within the transfer window, usually around 30 minutes. Your voucher
              will be sent to the email you entered after PaySpot confirms the payment.
            </span>
          </div>
        </div>
      ) : null}

      <VoucherHistory tenantSlug={tenantSlug} voucherSourceMode={voucherSourceMode} />
      <div className="prototype-powered">
        <Wifi className="size-4" />
        Powered by PaySpot
      </div>
    </div>
    </>
  );
}
