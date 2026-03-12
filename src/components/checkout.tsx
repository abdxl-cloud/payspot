"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Lock,
  MessageSquareText,
  RefreshCcw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CaptiveBrowserAuth } from "@/components/captive-browserauth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  createCaptivePortalSearchParams,
  type CaptivePortalContext,
} from "@/lib/captive-portal";
import { readJsonResponse } from "@/lib/http";
import { VoucherHistory } from "@/components/voucher-history";

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
  portalContext?: CaptivePortalContext;
};

type SubscriberOverview = {
  subscriber: {
    id: string;
    email: string;
    phone?: string | null;
    fullName?: string | null;
  };
  entitlements: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    maxDevices: number | null;
    bandwidthProfile?: string | null;
    dataLimitMb?: number | null;
    usage: {
      usedBytes: number;
      activeSessions: number;
    };
    package: {
      code: string;
      name: string;
      durationMinutes: number | null;
      priceNgn: number;
    };
  }>;
};

type StoredSubscriberSession = {
  token: string;
  email?: string;
  savedAt: number;
};

const SUBSCRIBER_SESSION_KEY_PREFIX = "payspot:subscriber-session:";
const CAPTIVE_AUTH_KEY_PREFIX = "payspot:captive-auth:";

function getSubscriberSessionKey(tenantSlug: string) {
  return `${SUBSCRIBER_SESSION_KEY_PREFIX}${tenantSlug}`;
}

function getCaptiveAuthKey(tenantSlug: string) {
  return `${CAPTIVE_AUTH_KEY_PREFIX}${tenantSlug}`;
}

function readStoredSubscriberSession(tenantSlug: string): StoredSubscriberSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getSubscriberSessionKey(tenantSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSubscriberSession;
    if (!parsed || typeof parsed.token !== "string" || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSubscriberSession(tenantSlug: string, payload: StoredSubscriberSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getSubscriberSessionKey(tenantSlug), JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

function clearStoredSubscriberSession(tenantSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getSubscriberSessionKey(tenantSlug));
  } catch {
    // Ignore storage failures.
  }
}

function clearStoredCaptiveAuth(tenantSlug: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(getCaptiveAuthKey(tenantSlug));
  } catch {
    // Ignore storage failures.
  }
}

async function fetchSubscriberOverview(params: {
  tenantSlug: string;
  token: string;
}) {
  const meResponse = await fetch(`/api/t/${params.tenantSlug}/portal/me`, {
    headers: { Authorization: `Bearer ${params.token}` },
    cache: "no-store",
  });
  const meData = await readJsonResponse<SubscriberOverview & { error?: string }>(meResponse);
  if (!meResponse.ok || !meData) {
    const error = new Error(meData?.error || "Unable to load subscriber profile.") as Error & {
      status?: number;
    };
    error.status = meResponse.status;
    throw error;
  }
  return meData;
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes || minutes <= 0) {
    return "Unlimited time";
  }
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

function formatDataLimitMb(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} TB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} GB`;
  }
  return `${value} MB`;
}

function formatPlanDataLabel(dataLimitMb: number | null | undefined) {
  if (!dataLimitMb || dataLimitMb <= 0) return "Unlimited data";
  return formatDataLimitMb(dataLimitMb);
}

function formatDeviceLimit(maxDevices: number | null | undefined) {
  if (!maxDevices || maxDevices <= 0) return "Unlimited devices";
  return `${maxDevices} device${maxDevices === 1 ? "" : "s"}`;
}

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getDefaultPlanDescription(params: {
  pkg: Package;
  mode: "voucher_access" | "account_access";
}) {
  const timeLabel = formatDuration(params.pkg.durationMinutes).toLowerCase();
  const dataLabel = formatPlanDataLabel(params.pkg.dataLimitMb).toLowerCase();
  const deviceLabel = formatDeviceLimit(params.pkg.maxDevices).toLowerCase();

  const voucherTemplates = [
    `Quick voucher access with ${timeLabel} and ${dataLabel}.`,
    `Guest Wi-Fi voucher plan: ${dataLabel}, ${timeLabel}.`,
    `Fast-connect voucher with ${deviceLabel} and ${dataLabel}.`,
    `Voucher plan tuned for short checkout and instant activation.`,
    `Simple prepaid voucher access for your Wi-Fi users.`,
  ];

  const accountTemplates = [
    `Account-based internet plan with ${timeLabel} and ${dataLabel}.`,
    `Sign in once and use this plan across ${deviceLabel}.`,
    `Subscriber plan with tracked usage: ${dataLabel}, ${timeLabel}.`,
    `Account access package with instant activation after payment.`,
    `Managed subscriber plan for recurring account-based access.`,
  ];

  const templates = params.mode === "account_access" ? accountTemplates : voucherTemplates;
  const seed = `${params.mode}:${params.pkg.code}:${params.pkg.name}:${params.pkg.priceNgn}`;
  return templates[hashText(seed) % templates.length];
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDataMbFromBytes(bytes: number) {
  return Math.max(0, bytes / (1024 * 1024));
}

function formatRemainingTime(endAt: string | null | undefined) {
  if (!endAt) return "Unlimited";
  const remainingMs = new Date(endAt).getTime() - Date.now();
  if (remainingMs <= 0) return "Expired";

  const totalMinutes = Math.ceil(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${Math.max(1, minutes)}m remaining`;
}

function Stepper({
  step,
  accessMode,
}: {
  step: 1 | 2 | 3;
  accessMode: "voucher_access" | "account_access";
}) {
  const steps = accessMode === "account_access"
    ? [
        { id: 1, label: "Sign In" },
        { id: 2, label: "Choose Plan" },
        { id: 3, label: "Pay Securely" },
      ]
    : [
        { id: 1, label: "Select Plan" },
        { id: 2, label: "Email Address" },
        { id: 3, label: "Pay Securely" },
      ];

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

export function Checkout({ tenantSlug, packages, accessMode, portalContext }: Props) {
  const [selected, setSelected] = useState<Package | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [visiblePlanCount, setVisiblePlanCount] = useState(8);
  const [phone, setPhone] = useState("");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);

  const [resumeReference, setResumeReference] = useState("");
  const [resumeLookup, setResumeLookup] = useState("");
  const [resumeLoading, setResumeLoading] = useState(false);
  const [resumeMessage, setResumeMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [flowMode, setFlowMode] = useState<"purchase" | "resume">("purchase");
  const [purchaseStage, setPurchaseStage] = useState<"auth" | "plan" | "payment">(
    accessMode === "account_access" ? "auth" : "plan",
  );
  const [subscriberEmail, setSubscriberEmail] = useState("");
  const [subscriberPassword, setSubscriberPassword] = useState("");
  const [subscriberToken, setSubscriberToken] = useState<string | null>(null);
  const [subscriberOverview, setSubscriberOverview] = useState<SubscriberOverview | null>(null);
  const [subscriberAuthMessage, setSubscriberAuthMessage] = useState<string | null>(null);
  const [subscriberAuthError, setSubscriberAuthError] = useState<string | null>(null);
  const [subscriberAuthLoading, setSubscriberAuthLoading] = useState(false);

  const customerCardRef = useRef<HTMLDivElement>(null);

  const isAccountAccessMode = accessMode === "account_access";
  const portalQuery = createCaptivePortalSearchParams(portalContext).toString();
  const hasAuthenticatedSubscriber = !!subscriberToken;
  const activeEntitlement = subscriberOverview?.entitlements[0] ?? null;
  const activeEntitlementDataLimitReached = !!(
    activeEntitlement &&
    activeEntitlement.dataLimitMb &&
    activeEntitlement.dataLimitMb > 0 &&
    activeEntitlement.usage.usedBytes >= activeEntitlement.dataLimitMb * 1024 * 1024
  );
  const hasTrackedActivePlan =
    isAccountAccessMode && !!activeEntitlement && !activeEntitlementDataLimitReached;
  const hasAvailable = packages.some((pkg) => pkg.availableCount > 0);
  const allSoldOut = packages.length > 0 && !hasAvailable;
  const isLongPlanList = packages.length > 12;

  const filteredPackages = useMemo(() => {
    const query = planQuery.trim().toLowerCase();
    if (!query) return packages;
    return packages.filter((pkg) => {
      const durationMinutes = pkg.durationMinutes ?? 0;
      const durationHours = durationMinutes / 60;
      const durationDays = durationMinutes / (24 * 60);
      const durationWeeks = durationMinutes / (7 * 24 * 60);
      const dataTokens = pkg.dataLimitMb
        ? [
            `${pkg.dataLimitMb}mb`,
            `${(pkg.dataLimitMb / 1024).toFixed(2)}gb`,
            `${(pkg.dataLimitMb / (1024 * 1024)).toFixed(3)}tb`,
            formatDataLimitMb(pkg.dataLimitMb).toLowerCase(),
          ]
        : [];
      const searchable = [
        pkg.name,
        pkg.code,
        pkg.description ?? "",
        formatDuration(pkg.durationMinutes),
        `${durationMinutes}m`,
        `${durationHours.toFixed(2)}h`,
        `${durationDays.toFixed(2)}d`,
        `${durationWeeks.toFixed(2)}w`,
        `ngn ${pkg.priceNgn}`,
        `₦${pkg.priceNgn}`,
        formatPriceCompact(pkg.priceNgn),
        `${pkg.maxDevices ?? "unlimited"} device`,
        `${pkg.maxDevices ?? "unlimited"} devices`,
        ...dataTokens,
      ].join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }, [packages, planQuery]);

  const hasHiddenPlans = isLongPlanList && filteredPackages.length > visiblePlanCount;
  const displayedPackages = hasHiddenPlans
    ? filteredPackages.slice(0, visiblePlanCount)
    : filteredPackages;
  const collapsePlansAfterSelection = !!selected;
  const visiblePlans = collapsePlansAfterSelection && selected ? [selected] : displayedPackages;

  useEffect(() => {
    const firstAvailable = packages.find((pkg) => pkg.availableCount > 0) ?? null;
    setSelected((prev) => {
      if (!firstAvailable) return null;
      if (!prev) return null;
      if (prev.availableCount <= 0) return firstAvailable;
      return prev;
    });
  }, [packages, isAccountAccessMode]);

  useEffect(() => {
    if (!selected) return;
    const selectedIndex = filteredPackages.findIndex((pkg) => pkg.code === selected.code);
    if (selectedIndex >= 0 && selectedIndex + 1 > visiblePlanCount) {
      setVisiblePlanCount(selectedIndex + 1);
    }
  }, [filteredPackages, selected, visiblePlanCount]);

  useEffect(() => {
    if (flowMode !== "purchase") {
      return;
    }

    if (isAccountAccessMode) {
      if (hasTrackedActivePlan) {
        return;
      }

      if (hasAuthenticatedSubscriber && purchaseStage === "auth") {
        setPurchaseStage("plan");
        return;
      }

      if (!hasAuthenticatedSubscriber && purchaseStage !== "auth") {
        setPurchaseStage("auth");
      }
      return;
    }

    if (purchaseStage === "auth") {
      setPurchaseStage("plan");
    }
  }, [
    flowMode,
    hasAuthenticatedSubscriber,
    hasTrackedActivePlan,
    isAccountAccessMode,
    purchaseStage,
  ]);

  const bestValueCode = useMemo(() => {
    const available = packages.filter((pkg) => pkg.availableCount > 0);
    if (available.length === 0) return null;

    const maxDuration = Math.max(
      1,
      ...available.map((pkg) => (pkg.durationMinutes && pkg.durationMinutes > 0 ? pkg.durationMinutes : 0)),
    );
    const maxData = Math.max(
      1,
      ...available.map((pkg) => (pkg.dataLimitMb && pkg.dataLimitMb > 0 ? pkg.dataLimitMb : 0)),
    );
    const maxDevices = Math.max(
      1,
      ...available.map((pkg) => (pkg.maxDevices && pkg.maxDevices > 0 ? pkg.maxDevices : 0)),
    );

    const sorted = [...available].sort((a, b) => {
      const score = (pkg: Package) => {
        const durationScore = pkg.durationMinutes && pkg.durationMinutes > 0
          ? pkg.durationMinutes / maxDuration
          : 1;
        const dataScore = pkg.dataLimitMb && pkg.dataLimitMb > 0
          ? pkg.dataLimitMb / maxData
          : 1;
        const deviceScore = pkg.maxDevices && pkg.maxDevices > 0
          ? pkg.maxDevices / maxDevices
          : 1;
        const capabilityScore = (durationScore * 0.35) + (dataScore * 0.55) + (deviceScore * 0.1);
        return capabilityScore / Math.max(1, pkg.priceNgn);
      };

      const diff = score(b) - score(a);
      if (Math.abs(diff) > 0.000001) return diff;
      return a.priceNgn - b.priceNgn;
    });

    return sorted[0]?.code ?? null;
  }, [packages]);

  const step: 1 | 2 | 3 = allSoldOut
    ? 1
    : loading
      ? 3
      : isAccountAccessMode
        ? hasTrackedActivePlan
          ? 3
          : purchaseStage === "payment"
            ? 3
            : purchaseStage === "plan"
              ? 2
              : 1
        : selected
          ? purchaseStage === "payment"
            ? 2
            : 1
          : 1;

  const canSubmit = useMemo(() => {
    if (isAccountAccessMode && !subscriberToken) return false;
    return !!selected &&
      selected.availableCount > 0 &&
      (isAccountAccessMode || isValidEmailAddress(voucherEmail)) &&
      !loading;
  }, [selected, voucherEmail, loading, isAccountAccessMode, subscriberToken]);

  const canSubmitSubscriberAuth =
    !subscriberAuthLoading && isValidEmailAddress(subscriberEmail) && subscriberPassword.length >= 8;

  const activePlanUsedMb = activeEntitlement
    ? formatDataMbFromBytes(activeEntitlement.usage.usedBytes)
    : 0;
  const activePlanLimitMb = activeEntitlement?.dataLimitMb ?? null;
  const activePlanRemainingMb = activePlanLimitMb
    ? Math.max(0, activePlanLimitMb - activePlanUsedMb)
    : null;
  const activePlanUsagePercent = activeEntitlement && activePlanLimitMb && activePlanLimitMb > 0
    ? Math.min(100, (activePlanUsedMb / activePlanLimitMb) * 100)
    : null;
  const isPurchaseFlow = flowMode === "purchase";
  const showPlanSelection =
    !hasTrackedActivePlan &&
    isPurchaseFlow &&
    (!isAccountAccessMode || purchaseStage !== "auth");
  const showPaymentStep =
    !allSoldOut &&
    !hasTrackedActivePlan &&
    isPurchaseFlow &&
    !isAccountAccessMode &&
    purchaseStage === "payment";

  useEffect(() => {
    if (!isAccountAccessMode) return;
    const storedSession = readStoredSubscriberSession(tenantSlug);
    if (!storedSession) return;
    setSubscriberToken(storedSession.token);
    if (storedSession.email) {
      setSubscriberEmail((current) => current || storedSession.email || "");
      setResumeLookup((current) => current || storedSession.email || "");
    }
  }, [isAccountAccessMode, tenantSlug]);

  function selectPlan(pkg: Package) {
    setSelected(pkg);
    setPaymentReference(null);
    setAuthorizationUrl(null);
    setCopyMessage(null);
  }

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

  function continueToPaymentStep() {
    if (!selected || selected.availableCount <= 0) {
      return;
    }
    if (isAccountAccessMode && !hasAuthenticatedSubscriber) {
      return;
    }
    setError(null);
    if (isAccountAccessMode) {
      void initiatePayment();
      return;
    }
    setPurchaseStage("payment");
    setTimeout(() => {
      customerCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  async function authenticateSubscriber(mode: "login" | "signup") {
    const normalizedEmail = subscriberEmail.trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      setSubscriberAuthError("Enter a valid email address.");
      setSubscriberAuthMessage(null);
      return;
    }

    setSubscriberAuthLoading(true);
    setSubscriberAuthError(null);
    setSubscriberAuthMessage(null);
    try {
      const endpoint = mode === "signup" ? "signup" : "login";
      const response = await fetch(`/api/t/${tenantSlug}/portal/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: subscriberPassword,
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
      persistSubscriberSession(tenantSlug, {
        token: data.token,
        email: normalizedEmail,
        savedAt: Date.now(),
      });
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          getCaptiveAuthKey(tenantSlug),
          JSON.stringify({
            username: normalizedEmail,
            password: subscriberPassword,
            savedAt: Date.now(),
          }),
        );
      }
      const meData = await fetchSubscriberOverview({
        tenantSlug,
        token: data.token,
      });
      setSubscriberOverview(meData);
      if (meData.subscriber.phone) {
        setPhone(meData.subscriber.phone);
      }
      setSubscriberAuthMessage(
        meData.entitlements.length > 0
          ? "Active plan found. Your current usage is shown below."
          : mode === "signup"
            ? "Account created. You can now purchase a plan."
            : "Signed in. You can now purchase a plan.",
      );
      if (meData.entitlements.length > 0) {
        setSubscriberPassword("");
      }
    } catch (error) {
      setSubscriberAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setSubscriberAuthLoading(false);
    }
  }

  async function initiatePayment() {
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
          email: isAccountAccessMode ? undefined : voucherEmail.trim(),
          packageCode: selected.code,
          subscriberToken: subscriberToken ?? undefined,
          portalContext,
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
      setResumeLookup(
        isAccountAccessMode
          ? subscriberOverview?.subscriber.email || subscriberEmail.trim()
          : voucherEmail.trim(),
      );
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await initiatePayment();
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
          email: resumeLookup.trim(),
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
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setResumeMessage(message);
    } finally {
      setResumeLoading(false);
    }
  }

  function forgetThisDevice() {
    clearStoredSubscriberSession(tenantSlug);
    clearStoredCaptiveAuth(tenantSlug);
    setSubscriberToken(null);
    setSubscriberOverview(null);
    setSubscriberPassword("");
    setSubscriberAuthError(null);
    setSubscriberAuthMessage("This device was forgotten. Sign in again to continue.");
    setPurchaseStage("auth");
  }

  useEffect(() => {
    if (!isAccountAccessMode || !subscriberToken) {
      return;
    }

    let cancelled = false;

    const refreshOverview = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const next = await fetchSubscriberOverview({
          tenantSlug,
          token: subscriberToken,
        });
        if (!cancelled) {
          setSubscriberOverview(next);
          if (next.subscriber.phone) {
            setPhone((current) => current || next.subscriber.phone || "");
          }
        }
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 401) {
          clearStoredSubscriberSession(tenantSlug);
          clearStoredCaptiveAuth(tenantSlug);
          if (!cancelled) {
            setSubscriberToken(null);
            setSubscriberOverview(null);
            setSubscriberAuthMessage(null);
            setSubscriberAuthError("Session expired. Please sign in again.");
          }
          return;
        }
        // Keep the last known usage panel visible if refresh fails.
      }
    };

    void refreshOverview();
    const intervalId = window.setInterval(refreshOverview, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAccountAccessMode, subscriberToken, tenantSlug]);

  function renderAccountAccessAuthCard() {
    if (!isAccountAccessMode || allSoldOut || flowMode !== "purchase") {
      return null;
    }

    if (hasTrackedActivePlan && activeEntitlement) {
      return (
        <Card className="max-w-4xl border-emerald-200 bg-white/95">
          <CardHeader className="space-y-2 pb-2">
            <p className="section-kicker">Current plan</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                {activeEntitlement.package.name} is active
              </CardTitle>
              <Badge className="bg-emerald-700 text-white">Connected account</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Time remaining
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {formatRemainingTime(activeEntitlement.endsAt)}
                </p>
                {activeEntitlement.endsAt ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Ends {formatDateTime(activeEntitlement.endsAt)}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    No expiry date
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Active devices
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeEntitlement.usage.activeSessions} / {activeEntitlement.maxDevices ?? "Unlimited"}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Data remaining
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activePlanRemainingMb !== null ? `${activePlanRemainingMb.toFixed(1)} MB` : "Unlimited"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Used {activePlanUsedMb.toFixed(1)} MB
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Data limit
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activePlanLimitMb ? `${activePlanLimitMb.toLocaleString()} MB` : "Unlimited"}
                </p>
              </div>
            </div>

            {activePlanUsagePercent !== null ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-700">Usage progress</p>
                  <p className="text-xs font-semibold text-slate-500">
                    {activePlanUsagePercent.toFixed(0)}%
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-600"
                    style={{ width: `${activePlanUsagePercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <p className="text-xs text-slate-500">
              Usage refreshes automatically every 45 seconds while this page stays open.
            </p>

            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={forgetThisDevice}
              >
                Forget this device
              </Button>
            </div>

            <CaptiveBrowserAuth
              tenantSlug={tenantSlug}
              portalContext={portalContext}
              defaultUsername={subscriberOverview?.subscriber.email || subscriberEmail.trim()}
              defaultPassword={subscriberPassword}
              autoSubmitWhenReady
            />

            <Alert variant="info">
              <AlertTitle>No purchase needed right now</AlertTitle>
              <AlertDescription>
                This account already has an active tracked plan. The purchase flow is hidden while this entitlement remains active.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="max-w-4xl border-slate-200/80 bg-white/95">
        <CardHeader className="space-y-2 pb-2">
          <p className="section-kicker">Subscriber access</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
              1. Sign in or create your account
            </CardTitle>
            {hasAuthenticatedSubscriber ? (
              <Badge className="bg-emerald-700 text-white">Ready to choose a plan</Badge>
            ) : (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                Required before purchase
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm text-slate-600">
              Start with your subscriber account. After sign-in, you can select a plan and pay.
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
                disabled={!canSubmitSubscriberAuth}
                onClick={() => authenticateSubscriber("login")}
              >
                Sign in
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canSubmitSubscriberAuth}
                onClick={() => authenticateSubscriber("signup")}
              >
                Create account
              </Button>
            </div>
            {subscriberAuthError ? (
              <p className="text-xs text-rose-700">{subscriberAuthError}</p>
            ) : null}
            {subscriberAuthMessage ? (
              <p className="text-xs text-emerald-700">{subscriberAuthMessage}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
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

      {portalContext ? (
        <Alert variant="info">
          <AlertTitle>Captive portal session detected</AlertTitle>
          <AlertDescription>
            Continue with payment here. Your network session details will be preserved so you can
            return to the Wi-Fi sign-in flow after payment.
          </AlertDescription>
        </Alert>
      ) : null}

      {renderAccountAccessAuthCard()}

      {!hasTrackedActivePlan ? (
        <div className="inline-flex w-fit rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setFlowMode("purchase")}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4",
              isPurchaseFlow
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            aria-pressed={isPurchaseFlow}
          >
            New purchase
          </button>
          <button
            type="button"
            onClick={() => setFlowMode("resume")}
            className={[
              "rounded-lg px-3 py-2 text-xs font-semibold transition sm:px-4",
              !isPurchaseFlow
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            aria-pressed={!isPurchaseFlow}
          >
            Resume payment
          </button>
        </div>
      ) : null}

      {showPlanSelection ? (
      <Card className="border-slate-200/80 bg-white/90">
        <CardHeader className="space-y-3 pb-3">
          <Stepper step={step} accessMode={accessMode} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
              {isAccountAccessMode ? "2. Choose a plan" : "1. Choose a plan"}
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
                  placeholder="Search by plan, code, duration, price, or data"
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
              visiblePlans.length <= 1
                ? "grid-cols-1"
                : visiblePlans.length === 2
                  ? "sm:grid-cols-2"
                  : "sm:grid-cols-2 lg:grid-cols-3",
            ].join(" ")}
          >
            {visiblePlans.map((pkg) => {
              const isSoldOut = pkg.availableCount <= 0;
              const isSelected = selected?.code === pkg.code;
              const isBestValue = bestValueCode === pkg.code && !isSoldOut;
              const description = pkg.description?.trim()
                || getDefaultPlanDescription({
                  pkg,
                  mode: isAccountAccessMode ? "account_access" : "voucher_access",
                });

              return (
                <Card
                  key={pkg.code}
                  role="button"
                  tabIndex={isSoldOut ? -1 : 0}
                  aria-disabled={isSoldOut}
                  aria-pressed={isSelected}
                  onClick={() => {
                    if (!isSoldOut) selectPlan(pkg);
                  }}
                  onKeyDown={(event) => {
                    if (isSoldOut) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectPlan(pkg);
                    }
                  }}
                  className={[
                    "gap-0 border-slate-200/90 bg-white py-0 transition",
                    !isSoldOut ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "cursor-not-allowed opacity-60",
                    isSelected ? "ring-2 ring-sky-300" : "",
                    visiblePlans.length === 1 ? "mx-auto w-full max-w-xl" : "",
                  ].join(" ")}
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900" title={pkg.name}>
                          {pkg.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                            {formatDuration(pkg.durationMinutes)}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                            {formatPlanDataLabel(pkg.dataLimitMb)}
                          </span>
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                            {formatDeviceLimit(pkg.maxDevices)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isBestValue ? (
                          <Badge className="bg-sky-700 text-white">Best Value</Badge>
                        ) : null}
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
                      {description}
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

          {hasHiddenPlans && !collapsePlansAfterSelection ? (
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

          {isLongPlanList && filteredPackages.length > 8 && !hasHiddenPlans && !collapsePlansAfterSelection ? (
            <div className="flex justify-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => setVisiblePlanCount(8)}>
                Collapse list
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {selected ? `${selected.name} selected` : "Select a plan to continue"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isAccountAccessMode
                  ? "After selecting a plan, continue directly to secure checkout."
                  : "Continue when you are ready to enter your phone number and start payment."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {collapsePlansAfterSelection ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  Change plan
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={
                  !selected ||
                  selected.availableCount <= 0 ||
                  (isAccountAccessMode && (!hasAuthenticatedSubscriber || loading))
                }
                onClick={continueToPaymentStep}
              >
                {loading && isAccountAccessMode
                  ? "Preparing payment..."
                  : selected
                    ? `Pay NGN ${selected.priceNgn.toLocaleString()}`
                    : "Select a plan"}
              </Button>
            </div>
          </div>

          {isAccountAccessMode && paymentReference ? (
            <Alert className="border-emerald-200 bg-emerald-50/90">
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

          {isAccountAccessMode ? (
            <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <Lock className="size-4 text-slate-500" />
              <MessageSquareText className="size-4 text-slate-500" />
              Paystack-secured checkout with instant account plan activation.
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {showPaymentStep ? (
        <Card ref={customerCardRef} className="max-w-4xl border-slate-200/80 bg-white/90">
          <CardHeader className="space-y-2 pb-2">
            <p className="section-kicker">Customer details</p>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base font-semibold text-slate-900 sm:text-lg">
                {isAccountAccessMode ? "3. Confirm account and pay" : "2. Enter email address"}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {selected ? (
                  <Badge variant="outline" className="border-sky-200 bg-sky-50 text-sky-700">
                    {selected.name} • NGN {selected.priceNgn.toLocaleString()}
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPurchaseStage("plan")}
                >
                  Change plan
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-end" onSubmit={handleSubmit}>
              {isAccountAccessMode && !hasAuthenticatedSubscriber ? (
                <Alert className="border-amber-200 bg-amber-50/90 lg:col-span-2">
                  <AlertTitle>Complete account sign-in first</AlertTitle>
                  <AlertDescription>
                    Sign in or create your subscriber account above before continuing to payment.
                  </AlertDescription>
                </Alert>
              ) : null}

              {isAccountAccessMode ? (
                <div className="grid gap-2">
                  <Label>Account email</Label>
                  <p className="h-11 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm text-slate-700">
                    {subscriberOverview?.subscriber.email || subscriberEmail.trim()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your signed-in email is used for this plan purchase.
                  </p>
                </div>
              ) : (
                <div className="grid gap-2">
                  <Label htmlFor="voucherEmail">Email address</Label>
                  <Input
                    id="voucherEmail"
                    type="email"
                    className="h-11"
                    placeholder="you@example.com"
                    value={voucherEmail}
                    onChange={(event) => setVoucherEmail(event.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Used for payment confirmation and your voucher receipt.
                  </p>
                </div>
              )}

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

      {flowMode === "resume" && !hasTrackedActivePlan ? (
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
                <Label htmlFor="resume-lookup">
                  {isAccountAccessMode ? "Account email used" : "Email used"}
                </Label>
                <Input
                  id="resume-lookup"
                  type="email"
                  className="h-11"
                  placeholder="you@example.com"
                  value={resumeLookup}
                  onChange={(event) => setResumeLookup(event.target.value)}
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

      <VoucherHistory tenantSlug={tenantSlug} />

    </div>
  );
}
