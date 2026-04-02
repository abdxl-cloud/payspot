"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  Clock,
  CreditCard,
  Lock,
  MessageSquareText,
  RefreshCcw,
  Search,
  Signal,
  Smartphone,
  User,
  Wifi,
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

declare global {
  interface Window {
    PaystackPop?: {
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
    return "Unlimited";
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
  return `${minutes} min`;
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
  if (!dataLimitMb || dataLimitMb <= 0) return "Unlimited";
  return formatDataLimitMb(dataLimitMb);
}

function formatDeviceLimit(maxDevices: number | null | undefined) {
  if (!maxDevices || maxDevices <= 0) return "Unlimited";
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
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(1, minutes)}m`;
}

/* ===== Progress Stepper - Mobile Optimized ===== */
function Stepper({
  step,
  accessMode,
}: {
  step: 1 | 2 | 3;
  accessMode: "voucher_access" | "account_access";
}) {
  const steps = accessMode === "account_access"
    ? [
        { id: 1, label: "Sign In", icon: User },
        { id: 2, label: "Plan", icon: Wifi },
        { id: 3, label: "Pay", icon: CreditCard },
      ]
    : [
        { id: 1, label: "Plan", icon: Wifi },
        { id: 2, label: "Email", icon: User },
        { id: 3, label: "Pay", icon: CreditCard },
      ];

  return (
    <div className="flex items-center justify-between gap-2">
      {steps.map((item, index) => {
        const state = item.id < step ? "done" : item.id === step ? "active" : "todo";
        const Icon = item.icon;
        return (
          <div key={item.id} className="flex flex-1 items-center">
            <div
              className={`
                flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-all
                ${state === "active"
                  ? "bg-primary/10 text-primary"
                  : state === "done"
                    ? "bg-[var(--status-success-soft)] text-[var(--status-success)]"
                    : "bg-muted text-muted-foreground"}
              `}
            >
              <span
                className={`
                  flex size-6 items-center justify-center rounded-full text-xs
                  ${state === "active"
                    ? "bg-primary text-primary-foreground"
                    : state === "done"
                      ? "bg-[var(--status-success)] text-white"
                      : "bg-secondary text-muted-foreground"}
                `}
              >
                {state === "done" ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
              </span>
              <span className="hidden sm:inline">{item.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 rounded-full ${
                  item.id < step ? "bg-[var(--status-success)]" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Plan Card - Touch Optimized ===== */
function PlanCard({
  pkg,
  isSelected,
  isSoldOut,
  isBestValue,
  description,
  onSelect,
}: {
  pkg: Package;
  isSelected: boolean;
  isSoldOut: boolean;
  isBestValue: boolean;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={isSoldOut}
      onClick={onSelect}
      className={`
        plan-card w-full text-left
        ${isSoldOut ? "cursor-not-allowed opacity-50" : ""}
      `}
      data-selected={isSelected}
    >
      {/* Best Value Badge */}
      {isBestValue && (
        <div className="absolute -top-2 right-3">
          <Badge variant="default" size="sm" className="shadow-sm">
            Best Value
          </Badge>
        </div>
      )}

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute right-3 top-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-4" />
          </span>
        </div>
      )}

      {/* Plan name */}
      <p className="plan-card-name pr-10">{pkg.name}</p>

      {/* Price */}
      <div className="plan-card-price">
        <span className="text-lg font-normal text-muted-foreground">NGN </span>
        {formatPriceCompact(pkg.priceNgn)}
      </div>

      {/* Features */}
      <div className="plan-card-details">
        <span className="plan-card-badge flex items-center gap-1">
          <Clock className="size-3" />
          {formatDuration(pkg.durationMinutes)}
        </span>
        <span className="plan-card-badge flex items-center gap-1">
          <Signal className="size-3" />
          {formatPlanDataLabel(pkg.dataLimitMb)}
        </span>
        <span className="plan-card-badge flex items-center gap-1">
          <Smartphone className="size-3" />
          {formatDeviceLimit(pkg.maxDevices)}
        </span>
      </div>

      {/* Description - hidden on mobile, visible on larger screens */}
      <p className="mt-3 hidden text-xs leading-relaxed text-muted-foreground sm:block">
        {description}
      </p>

      {/* Sold out overlay */}
      {isSoldOut && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-background/80">
          <Badge variant="muted">Sold Out</Badge>
        </div>
      )}
    </button>
  );
}

export function Checkout({ tenantSlug, packages, accessMode, voucherSourceMode, portalContext }: Props) {
  const [selected, setSelected] = useState<Package | null>(null);
  const [planQuery, setPlanQuery] = useState("");
  const [visiblePlanCount, setVisiblePlanCount] = useState(8);
  const [phone, setPhone] = useState("");
  const [voucherEmail, setVoucherEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

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
    setAccessCode(null);
    setVerifyUrl(null);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.querySelector('script[src="https://js.paystack.co/v2/inline.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  function openPaystackPopup(code: string, successUrl: string, fallbackUrl?: string) {
    if (!window.PaystackPop || typeof window.PaystackPop.resumeTransaction !== "function") {
      if (fallbackUrl) window.location.assign(fallbackUrl);
      return;
    }
    window.PaystackPop.resumeTransaction(code, {
      onSuccess: () => {
        window.location.assign(successUrl);
      },
      onCancel: () => {
        setError("Payment was cancelled. Click 'Retry payment' to try again.");
      },
    });
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
        accessCode?: string;
        verifyUrl?: string;
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
      const newAccessCode = data.accessCode ?? null;
      const newVerifyUrl = data.verifyUrl ?? null;
      setAccessCode(newAccessCode);
      setVerifyUrl(newVerifyUrl);
      setResumeLookup(
        isAccountAccessMode
          ? subscriberOverview?.subscriber.email || subscriberEmail.trim()
          : voucherEmail.trim(),
      );
      setLoading(false);
      if (newAccessCode && newVerifyUrl) {
        openPaystackPopup(newAccessCode, newVerifyUrl, data.authorizationUrl);
      } else {
        window.location.assign(data.authorizationUrl);
      }
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
      }
    };

    void refreshOverview();
    const intervalId = window.setInterval(refreshOverview, 45_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAccountAccessMode, subscriberToken, tenantSlug]);

  /* ===== Render: Account Access Auth Card ===== */
  function renderAccountAccessAuthCard() {
    if (!isAccountAccessMode || allSoldOut || flowMode !== "purchase") {
      return null;
    }

    if (hasTrackedActivePlan && activeEntitlement) {
      return (
        <Card className="border-[var(--status-success)]/30 bg-[var(--status-success-soft)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="section-kicker text-[var(--status-success)]">Active Plan</p>
                <CardTitle className="mt-1">{activeEntitlement.package.name}</CardTitle>
              </div>
              <Badge variant="success">Connected</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Usage Stats Grid - Mobile Optimized */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="stat-card-icon">
                    <Clock className="size-5" />
                  </div>
                  <div>
                    <p className="stat-card-label">Time Left</p>
                    <p className="stat-card-value">{formatRemainingTime(activeEntitlement.endsAt)}</p>
                  </div>
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="stat-card-icon">
                    <Smartphone className="size-5" />
                  </div>
                  <div>
                    <p className="stat-card-label">Devices</p>
                    <p className="stat-card-value">
                      {activeEntitlement.usage.activeSessions}/{activeEntitlement.maxDevices ?? "Unlimited"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="stat-card-icon">
                    <Signal className="size-5" />
                  </div>
                  <div>
                    <p className="stat-card-label">Data Left</p>
                    <p className="stat-card-value">
                      {activePlanRemainingMb !== null ? `${activePlanRemainingMb.toFixed(0)} MB` : "Unlimited"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-3">
                  <div className="stat-card-icon">
                    <Wifi className="size-5" />
                  </div>
                  <div>
                    <p className="stat-card-label">Data Limit</p>
                    <p className="stat-card-value">
                      {activePlanLimitMb ? `${activePlanLimitMb.toLocaleString()} MB` : "Unlimited"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage Progress Bar */}
            {activePlanUsagePercent !== null && (
              <div className="rounded-xl border border-border/50 bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">Data Usage</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {activePlanUsagePercent.toFixed(0)}%
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[var(--status-success)] transition-all duration-500"
                    style={{ width: `${activePlanUsagePercent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Used {activePlanUsedMb.toFixed(1)} MB of {activePlanLimitMb?.toLocaleString() ?? "unlimited"} MB
                </p>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Usage refreshes automatically every 45 seconds.
            </p>

            <Button variant="outline" size="sm" onClick={forgetThisDevice}>
              Sign out from this device
            </Button>

            <CaptiveBrowserAuth
              tenantSlug={tenantSlug}
              portalContext={portalContext}
              defaultUsername={subscriberOverview?.subscriber.email || subscriberEmail.trim()}
              defaultPassword={subscriberPassword}
              autoSubmitWhenReady
            />

            <Alert variant="info">
              <AlertTitle>You are all set</AlertTitle>
              <AlertDescription>
                Your account has an active plan. The purchase flow is hidden while your entitlement remains active.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="section-kicker">Step 1</p>
              <CardTitle className="mt-1">Sign in or create account</CardTitle>
            </div>
            {hasAuthenticatedSubscriber ? (
              <Badge variant="success">Ready to choose plan</Badge>
            ) : (
              <Badge variant="warning">Required</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Start with your subscriber account. After sign-in, you can select a plan and pay.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="subscriberEmail">Email</Label>
                <Input
                  id="subscriberEmail"
                  type="email"
                  value={subscriberEmail}
                  onChange={(event) => setSubscriberEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
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
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                disabled={!canSubmitSubscriberAuth}
                onClick={() => authenticateSubscriber("login")}
                className="flex-1"
              >
                Sign in
              </Button>
              <Button
                disabled={!canSubmitSubscriberAuth}
                onClick={() => authenticateSubscriber("signup")}
                className="flex-1"
              >
                Create account
              </Button>
            </div>
            {subscriberAuthError && (
              <p className="mt-3 text-sm text-[var(--status-danger)]">{subscriberAuthError}</p>
            )}
            {subscriberAuthMessage && (
              <p className="mt-3 text-sm text-[var(--status-success)]">{subscriberAuthMessage}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Empty State */}
      {packages.length === 0 && (
        <Alert>
          <AlertTitle>No plans available</AlertTitle>
          <AlertDescription>
            Plans will appear here once they are configured by the administrator.
          </AlertDescription>
        </Alert>
      )}

      {/* Sold Out State */}
      {allSoldOut && (
        <Alert variant="warning">
          <CircleAlert className="size-5" />
          <AlertTitle>All plans temporarily unavailable</AlertTitle>
          <AlertDescription>
            Voucher inventory is currently empty. Please refresh and try again.
            <div className="mt-4">
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCcw className="size-4" />
                Refresh availability
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Payment setup failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Captive Portal Info */}
      {portalContext && (
        <Alert variant="info">
          <AlertTitle>Captive portal session detected</AlertTitle>
          <AlertDescription>
            Your network session details will be preserved so you can return to the Wi-Fi sign-in flow after payment.
          </AlertDescription>
        </Alert>
      )}

      {/* Account Access Auth Card */}
      {renderAccountAccessAuthCard()}

      {/* Flow Mode Toggle */}
      {!hasTrackedActivePlan && (
        <div className="flex rounded-xl border border-border/50 bg-card p-1 sm:w-fit">
          <button
            type="button"
            onClick={() => setFlowMode("purchase")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all tap-target sm:flex-none ${
              isPurchaseFlow
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            New purchase
          </button>
          <button
            type="button"
            onClick={() => setFlowMode("resume")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all tap-target sm:flex-none ${
              !isPurchaseFlow
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Resume payment
          </button>
        </div>
      )}

      {/* Plan Selection */}
      {showPlanSelection && (
        <Card>
          <CardHeader>
            <Stepper step={step} accessMode={accessMode} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="section-kicker">
                  {isAccountAccessMode ? "Step 2" : "Step 1"}
                </p>
                <CardTitle className="mt-1">Choose a plan</CardTitle>
              </div>
              {selected && (
                <Badge variant="outline">
                  {selected.name} selected
                </Badge>
              )}
            </div>

            {/* Search for long plan lists */}
            {isLongPlanList && (
              <div className="mt-4 rounded-xl border border-border/50 bg-muted/30 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {filteredPackages.length} plans available
                  </p>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={planQuery}
                      onChange={(event) => {
                        setPlanQuery(event.target.value);
                        setVisiblePlanCount(8);
                      }}
                      placeholder="Search plans..."
                      className="pl-10 sm:w-64"
                    />
                  </div>
                </div>
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Plan Grid - Responsive */}
            <div
              className={`grid gap-4 ${
                visiblePlans.length <= 1
                  ? "grid-cols-1 sm:max-w-md"
                  : visiblePlans.length === 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {visiblePlans.map((pkg) => {
                const isSoldOut = pkg.availableCount <= 0;
                const isSelected = selected?.code === pkg.code;
                const isBestValue = bestValueCode === pkg.code && !isSoldOut;
                const description =
                  pkg.description?.trim() ||
                  getDefaultPlanDescription({
                    pkg,
                    mode: isAccountAccessMode ? "account_access" : "voucher_access",
                  });

                return (
                  <PlanCard
                    key={pkg.code}
                    pkg={pkg}
                    isSelected={isSelected}
                    isSoldOut={isSoldOut}
                    isBestValue={isBestValue}
                    description={description}
                    onSelect={() => selectPlan(pkg)}
                  />
                );
              })}
            </div>

            {/* No results */}
            {isLongPlanList && filteredPackages.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Search className="size-6" />
                </div>
                <p className="empty-state-title">No plans match your search</p>
                <p className="empty-state-description">Try another name, code, or duration.</p>
              </div>
            )}

            {/* Show more / collapse */}
            {hasHiddenPlans && !collapsePlansAfterSelection && (
              <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <Button variant="outline" onClick={() => setVisiblePlanCount((count) => count + 8)}>
                  Show more plans
                </Button>
                <span className="text-xs text-muted-foreground">
                  Showing {displayedPackages.length} of {filteredPackages.length}
                </span>
              </div>
            )}

            {isLongPlanList && filteredPackages.length > 8 && !hasHiddenPlans && !collapsePlansAfterSelection && (
              <div className="flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => setVisiblePlanCount(8)}>
                  Collapse list
                </Button>
              </div>
            )}

            {/* Action bar */}
            <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-foreground">
                  {selected ? `${selected.name} selected` : "Select a plan to continue"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isAccountAccessMode
                    ? "Continue directly to secure checkout."
                    : "Enter your email and start payment."}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {collapsePlansAfterSelection && (
                  <Button variant="outline" onClick={() => setSelected(null)}>
                    Change plan
                  </Button>
                )}
                <Button
                  disabled={
                    !selected ||
                    selected.availableCount <= 0 ||
                    (isAccountAccessMode && (!hasAuthenticatedSubscriber || loading))
                  }
                  onClick={continueToPaymentStep}
                >
                  {loading && isAccountAccessMode
                    ? "Preparing..."
                    : selected
                      ? `Pay NGN ${formatPriceCompact(selected.priceNgn)}`
                      : "Select a plan"}
                </Button>
              </div>
            </div>

            {/* Payment reference alert */}
            {isAccountAccessMode && paymentReference && (
              <Alert variant="success">
                <AlertTitle>Reference: {paymentReference}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>Keep this reference to resume payment if interrupted.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyReference(paymentReference)}>
                      Copy reference
                    </Button>
                    {(accessCode && verifyUrl) || authorizationUrl ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          if (accessCode && verifyUrl) {
                            openPaystackPopup(accessCode, verifyUrl, authorizationUrl ?? undefined);
                          } else if (authorizationUrl) {
                            window.location.assign(authorizationUrl);
                          }
                        }}
                      >
                        Retry payment
                      </Button>
                    ) : null}
                  </div>
                  {copyMessage && <p className="text-xs">{copyMessage}</p>}
                </AlertDescription>
              </Alert>
            )}

            {/* Security note */}
            {isAccountAccessMode && (
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                <Lock className="size-4" />
                <MessageSquareText className="size-4" />
                <span>Paystack-secured checkout with instant account activation.</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment Step (Voucher Mode) */}
      {showPaymentStep && (
        <Card ref={customerCardRef}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="section-kicker">Step 2</p>
                <CardTitle className="mt-1">Enter email address</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selected && (
                  <Badge variant="info">
                    {selected.name} - NGN {formatPriceCompact(selected.priceNgn)}
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={() => setPurchaseStage("plan")}>
                  Change plan
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="voucherEmail">Email address</Label>
                <Input
                  id="voucherEmail"
                  type="email"
                  placeholder="you@example.com"
                  value={voucherEmail}
                  onChange={(event) => setVoucherEmail(event.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Used for payment confirmation and your voucher receipt.
                </p>
              </div>

              <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
                {loading
                  ? "Preparing payment..."
                  : selected
                    ? `Pay NGN ${formatPriceCompact(selected.priceNgn)}`
                    : "Select a plan"}
              </Button>

              {/* Payment reference */}
              {paymentReference && (
                <Alert variant="success">
                  <AlertTitle>Reference: {paymentReference}</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>Keep this reference to resume payment if interrupted.</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyReference(paymentReference)}>
                        Copy reference
                      </Button>
                      {(accessCode && verifyUrl) || authorizationUrl ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            if (accessCode && verifyUrl) {
                              openPaystackPopup(accessCode, verifyUrl, authorizationUrl ?? undefined);
                            } else if (authorizationUrl) {
                              window.location.assign(authorizationUrl);
                            }
                          }}
                        >
                          Retry payment
                        </Button>
                      ) : null}
                    </div>
                    {copyMessage && <p className="text-xs">{copyMessage}</p>}
                  </AlertDescription>
                </Alert>
              )}

              {/* Security note */}
              <div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                <Lock className="size-4" />
                <MessageSquareText className="size-4" />
                <span>Paystack-secured checkout with instant email voucher delivery.</span>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Resume Payment Flow */}
      {flowMode === "resume" && !hasTrackedActivePlan && (
        <Card>
          <CardHeader>
            <p className="section-kicker">Recover interrupted checkout</p>
            <CardTitle className="mt-1">Resume a payment</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleResume}>
              {resumeMessage && (
                <Alert>
                  <AlertTitle>Resume status</AlertTitle>
                  <AlertDescription>{resumeMessage}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resume-reference">Payment reference</Label>
                  <Input
                    id="resume-reference"
                    type="text"
                    placeholder="WIFI-ABC123"
                    value={resumeReference}
                    onChange={(event) => setResumeReference(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resume-lookup">
                    {isAccountAccessMode ? "Account email used" : "Email used"}
                  </Label>
                  <Input
                    id="resume-lookup"
                    type="email"
                    placeholder="you@example.com"
                    value={resumeLookup}
                    onChange={(event) => setResumeLookup(event.target.value)}
                    required
                  />
                </div>
              </div>
              <Button type="submit" variant="outline" disabled={resumeLoading} className="w-full sm:w-auto">
                {resumeLoading ? "Checking status..." : "Resume payment"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Voucher History */}
      <VoucherHistory tenantSlug={tenantSlug} voucherSourceMode={voucherSourceMode} />
    </div>
  );
}
