"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BadgeCheck, Check, CircleHelp, CreditCard, Link2, LogOut, Palette, Store, Upload, Wifi } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { readJsonResponse } from "@/lib/http";
import { isPaystackSecretKey } from "@/lib/paystack-key";

type Props = {
  tenantSlug: string;
  tenantName: string;
  currentSlug: string;
  requirePasswordChange: boolean;
  requirePaystackKey: boolean;
  subscriptionRequired: boolean;
  subscriptionAmountNgn: number;
  subscriptionInterval: "monthly" | "yearly";
  maxLocations: number;
  startAtSubscription?: boolean;
};

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";
type SetupStepKey =
  | "slug"
  | "password"
  | "paystack"
  | "locations"
  | "architecture"
  | "plan"
  | "locationAccess"
  | "voucher"
  | "launch"
  | "subscription";
type ArchitecturePreset = "import_csv" | "api_automation" | "radius_voucher" | "external_radius_portal";

type TenantArchitectureResponse = {
  architecture?: {
    accessMode: "voucher_access" | "account_access";
    voucherSourceMode: "import_csv" | "omada_openapi" | "mikrotik_rest" | "radius_voucher";
    appearance?: {
      storePrimaryColor: string;
      dashboardPrimaryColor: string;
    };
    omada: {
      apiBaseUrl: string;
      omadacId: string;
      siteId: string;
      clientId: string;
      hasClientSecret: boolean;
      hotspotOperatorUsername: string;
      hasHotspotOperatorPassword: boolean;
    };
  };
};

type PlanLite = {
  id: string;
  code: string;
  name: string;
};

type LocationForm = {
  id?: string;
  name: string;
  slug: string;
  storePrimaryColor: string;
  dashboardPrimaryColor: string;
  voucherSourceMode: "import_csv" | "radius_voucher";
  portalAuthMode: "omada_builtin" | "external_radius_portal" | "external_radius_voucher";
  isPrimary?: boolean;
};

type LocationCsvImportState = {
  file?: File | null;
  importing?: boolean;
  imported?: boolean;
  result?: string | null;
  error?: string | null;
};

const brandSwatches = [
  { name: "Lime", value: "#72f064" },
  { name: "Blue", value: "#5a8dff" },
  { name: "Orange", value: "#ffad42" },
  { name: "Purple", value: "#bf7cff" },
  { name: "Teal", value: "#3dd8c8" },
  { name: "Rose", value: "#ff6b8a" },
  { name: "Amber", value: "#ffd447" },
  { name: "Emerald", value: "#43d17a" },
] as const;

const setupWizardCss = `
.ob-layout{display:grid;grid-template-columns:272px minmax(0,1fr);min-height:calc(100vh - 40px);color:var(--tx)}
.ob-sidebar{background:var(--s1);border-right:1px solid var(--bd);padding:36px 24px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
.ob-logo{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:44px}
.ob-brand{display:flex;align-items:center;gap:9px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:16px;font-weight:900;letter-spacing:-.04em;text-decoration:none}
.ob-mark{width:40px;height:40px;border:1px solid var(--bd);border-radius:12px;background:var(--s2);display:grid;place-items:center;color:var(--ac);font-family:var(--font-mono),monospace;font-weight:900}
.ob-steps{display:flex;flex-direction:column;flex:1}
.ob-step{display:flex;align-items:flex-start;gap:12px;padding:8px 10px;border:0;border-radius:var(--r);position:relative;background:transparent;text-align:left;cursor:pointer}
.ob-step-col{display:flex;flex-direction:column;align-items:center}
.ob-step-dot{width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:var(--font-mono),monospace;background:var(--s2);border:1px solid var(--bd);color:var(--tx3);transition:all .25s}
.ob-step.done .ob-step-dot{background:oklch(0.72 0.17 155/.15);border-color:oklch(0.72 0.17 155/.3);color:var(--green)}
.ob-step.active .ob-step-dot{background:var(--ac-dim);border-color:var(--ac-bd);color:var(--ac)}
.ob-step-line{width:1px;flex:1;min-height:20px;background:var(--bd);margin:4px 0}
.ob-step-info{padding-top:3px;padding-bottom:16px}
.ob-step-label{font-size:13px;font-weight:700;color:var(--tx3);transition:color .2s}
.ob-step.active .ob-step-label{color:var(--tx)}
.ob-step.done .ob-step-label{color:var(--tx2)}
.ob-step-sub{font-size:11px;color:var(--tx3);margin-top:2px;line-height:1.35}
.ob-mobile-top{display:none;padding:14px 20px;border-bottom:1px solid var(--bd);background:var(--s1);align-items:center;gap:10px;position:sticky;top:0;z-index:5}
.ob-mob-dots{display:flex;gap:6px}.ob-mob-dot{width:6px;height:6px;border-radius:50%;background:var(--bd2);transition:all .25s}.ob-mob-dot.done{background:var(--green)}.ob-mob-dot.active{background:var(--ac);width:20px;border-radius:100px}
.ob-mob-label{font-size:13px;font-weight:700;color:var(--tx);margin-left:6px}.ob-mob-count{font-size:11px;color:var(--tx3);font-family:var(--font-mono),monospace;margin-left:auto}
.ob-main{display:flex;flex-direction:column;min-width:0}.ob-body{flex:1;overflow-y:auto}.ob-content{padding:clamp(28px,5vw,52px);max-width:720px}
.ob-kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);font-family:var(--font-mono),monospace;margin-bottom:14px;display:flex;align-items:center;gap:8px}.ob-kicker:before{content:"";width:20px;height:1px;background:var(--ac)}
.ob-title{font-family:var(--font-heading),sans-serif;font-size:clamp(24px,3.5vw,36px);font-weight:900;letter-spacing:-.05em;color:var(--tx);margin-bottom:8px;line-height:1}
.ob-desc{font-size:14px;color:var(--tx2);line-height:1.7;margin-bottom:28px;max-width:520px}
.ob-grid{display:grid;gap:14px}.ob-field{display:grid;gap:7px;margin-bottom:14px}.ob-field label{font-size:12px;font-weight:800;color:var(--tx2)}.ob-field input,.ob-field select{height:42px;background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:0 12px;color:var(--tx);outline:none}.ob-field input[type=color]{width:42px;border-radius:50%;padding:4px;cursor:pointer}.ob-field input[type=color]::-webkit-color-swatch-wrapper{padding:0}.ob-field input[type=color]::-webkit-color-swatch{border:0;border-radius:50%}.ob-field input[type=color]::-moz-color-swatch{border:0;border-radius:50%}.ob-field input:focus,.ob-field select:focus{border-color:var(--ac-bd)}.ob-field select option{background:#161616}.ob-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hint{font-size:11px;color:var(--tx3);line-height:1.5}
.ob-slug-row{display:flex;align-items:center}.ob-slug-prefix{height:42px;background:var(--s3);border:1px solid var(--bd);border-right:0;border-radius:var(--r) 0 0 var(--r);padding:0 12px;display:flex;align-items:center;font-size:12px;color:var(--tx3);white-space:nowrap;font-family:var(--font-mono),monospace}.ob-slug-row input{border-radius:0 var(--r) var(--r) 0;flex:1}
.ob-alert{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s2);padding:12px 14px;color:var(--tx2);font-size:13px;line-height:1.5}.ob-alert.info{border-color:var(--ac-bd);background:var(--ac-dim)}.ob-alert.err{border-color:oklch(0.65 0.18 25/.35);background:oklch(0.65 0.18 25/.12);color:var(--red)}.ob-alert.ok{border-color:oklch(0.72 0.17 155/.35);background:oklch(0.72 0.17 155/.12);color:var(--green)}
.color-swatches{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}.color-swatch{width:28px;height:28px;border-radius:50%;border:0;cursor:pointer;transition:transform .15s,box-shadow .15s}.color-swatch:hover{transform:scale(1.12)}.color-swatch.on{box-shadow:0 0 0 2px var(--bg),0 0 0 4px currentColor;transform:scale(1.08)}
.platform-pills{display:flex;gap:8px;flex-wrap:wrap}.platform-pill{border:1px solid var(--bd);border-radius:999px;background:var(--s2);color:var(--tx2);padding:8px 13px;font-size:12px;font-weight:800;cursor:pointer}.platform-pill.on{border-color:var(--ac-bd);background:var(--ac-dim);color:var(--ac)}
.ob-net-card,.ob-plan-builder,.ob-csv-card,.ob-location-card{border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1);padding:18px;margin-top:16px}.ob-location-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.ob-location-title{font-size:14px;font-weight:900;color:var(--tx)}.ob-location-badge{font-family:var(--font-mono),monospace;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--ac);background:var(--ac-dim);border:1px solid var(--ac-bd);border-radius:999px;padding:5px 8px}.ob-access-list{display:grid;gap:14px}.ob-access-card{border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1);padding:18px}.ob-access-card h3{margin:0 0 6px;color:var(--tx);font-size:16px}.ob-access-card p{margin:0;color:var(--tx2);font-size:13px;line-height:1.6}.ob-access-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.ob-plan-preview{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-top:16px}.ob-plan-preview-label{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;font-family:var(--font-mono),monospace;margin-bottom:10px}.ob-plan-preview-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ob-plan-preview-name{font-size:15px;font-weight:800;color:var(--tx)}.ob-plan-preview-price{font-family:var(--font-mono),monospace;font-size:20px;font-weight:800;color:var(--ac)}.ob-plan-preview-tags{display:flex;gap:10px;flex-wrap:wrap;margin-top:5px}.ob-plan-preview-tag{font-size:11px;color:var(--tx3)}
.ob-url-box{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:11px 14px;font-family:var(--font-mono),monospace;font-size:13px;color:var(--ac);display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:460px;margin-bottom:24px}.ob-checklist{display:flex;flex-direction:column;gap:8px;margin-bottom:32px;text-align:left;width:100%;max-width:460px}.ob-check{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--tx2)}
.ob-launch{display:flex;flex-direction:column;align-items:flex-start;padding:clamp(32px,5vw,52px);max-width:680px}.ob-launch-ring{width:72px;height:72px;border-radius:50%;background:var(--ac-dim);border:1px solid var(--ac-bd);display:flex;align-items:center;justify-content:center;margin-bottom:22px}
.ob-footer{border-top:1px solid var(--bd);padding:14px clamp(20px,5vw,52px);display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg);position:sticky;bottom:0}.ob-progress-dots{display:flex;gap:5px}.ob-prog-dot{width:5px;height:5px;border-radius:50%;background:var(--bd2);transition:all .2s}.ob-prog-dot.done{background:var(--green)}.ob-prog-dot.active{background:var(--ac);width:14px;border-radius:100px}.ob-footer-r{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--bd);border-radius:var(--r);padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none}.btn:disabled{opacity:.45;cursor:not-allowed}.btn-ac{background:var(--ac);border-color:transparent;color:#0d0d0d}.btn-muted{background:var(--s2);color:var(--tx2)}.btn-ghost{background:transparent;color:var(--tx2)}.btn-sm{padding:7px 11px;font-size:12px}.btn-lg{padding:12px 16px;font-size:14px}.btn-icon{padding:0;width:32px;height:32px;flex-shrink:0}.btn:hover:not(:disabled){filter:brightness(1.08)}
@media(max-width:760px){.ob-layout{grid-template-columns:1fr}.ob-sidebar{display:none}.ob-mobile-top{display:flex}.ob-row{grid-template-columns:1fr}.ob-content,.ob-launch{padding:28px 20px}.ob-footer{padding:12px 20px}.ob-footer{align-items:flex-start;flex-direction:column}.ob-footer-r{width:100%;justify-content:flex-end;flex-wrap:wrap}}
`;

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function getLocationImportKey(location: LocationForm) {
  return location.id || normalizeSlug(location.slug) || location.name;
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

function normalizePlanCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function formatMoney(value: string) {
  const amount = Number(value || 0);
  return `NGN ${Number.isFinite(amount) ? amount.toLocaleString("en-NG") : "0"}`;
}

function formatDuration(minutes: string) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return "Unlimited time";
  if (value % 10080 === 0) return `${value / 10080} week${value / 10080 === 1 ? "" : "s"}`;
  if (value % 1440 === 0) return `${value / 1440} day${value / 1440 === 1 ? "" : "s"}`;
  if (value % 60 === 0) return `${value / 60} hour${value / 60 === 1 ? "" : "s"}`;
  return `${value} minutes`;
}

function defaultLocationSlug(baseSlug: string, index: number) {
  const base = normalizeSlug(baseSlug) || "store";
  return index === 0 ? base : `${base}-${index + 1}`;
}

function ensureLocationSlots(
  locations: LocationForm[],
  allowedCount: number,
  tenantName: string,
  baseSlug: string,
) {
  const slots = [...locations]
    .sort((a, b) => Number(b.isPrimary ?? false) - Number(a.isPrimary ?? false))
    .slice(0, allowedCount);
  while (slots.length < allowedCount) {
    const index = slots.length;
    slots.push({
      name: index === 0 ? tenantName : `${tenantName} Location ${index + 1}`,
      slug: defaultLocationSlug(baseSlug, index),
      storePrimaryColor: "#72f064",
      dashboardPrimaryColor: "#72f064",
      voucherSourceMode: "import_csv",
      portalAuthMode: "omada_builtin",
      isPrimary: index === 0,
    });
  }
  return slots;
}

function normalizeLocationNetworkMode(value: string | null | undefined): LocationForm["voucherSourceMode"] {
  return value === "radius_voucher" ? "radius_voucher" : "import_csv";
}

function portalModeForLocationNetwork(value: LocationForm["voucherSourceMode"]): LocationForm["portalAuthMode"] {
  return value === "radius_voucher" ? "external_radius_voucher" : "omada_builtin";
}

export function TenantSetupPanel({
  tenantSlug,
  tenantName,
  currentSlug,
  requirePasswordChange,
  requirePaystackKey,
  subscriptionRequired,
  subscriptionAmountNgn,
  subscriptionInterval,
  maxLocations,
  startAtSubscription = false,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paystackPublicKey, setPaystackPublicKey] = useState("");
  const [paystackSecretKey, setPaystackSecretKey] = useState("");
  const [portalSlug, setPortalSlug] = useState(currentSlug);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [slugMessage, setSlugMessage] = useState("Keep this short and brand-specific. Example: walstreet");
  const [brandColor, setBrandColor] = useState("#72f064");

  const [architecturePreset, setArchitecturePreset] = useState<ArchitecturePreset>("import_csv");
  const [omadaApiBaseUrl, setOmadaApiBaseUrl] = useState("");
  const [omadaOmadacId, setOmadaOmadacId] = useState("");
  const [omadaSiteId, setOmadaSiteId] = useState("");
  const [omadaClientId, setOmadaClientId] = useState("");
  const [omadaClientSecret, setOmadaClientSecret] = useState("");
  const [hasSavedOmadaClientSecret, setHasSavedOmadaClientSecret] = useState(false);
  const [omadaHotspotOperatorUsername, setOmadaHotspotOperatorUsername] = useState("");
  const [omadaHotspotOperatorPassword, setOmadaHotspotOperatorPassword] = useState("");
  const [hasSavedOmadaHotspotOperatorPassword, setHasSavedOmadaHotspotOperatorPassword] = useState(false);

  const [planName, setPlanName] = useState("1 Day Wi-Fi");
  const [planPrice, setPlanPrice] = useState("1000");
  const [planDuration, setPlanDuration] = useState("1440");
  const [planSpeed, setPlanSpeed] = useState("10 Mbps");
  const [planDevices, setPlanDevices] = useState("2");
  const [planDataLimit, setPlanDataLimit] = useState("");
  const [existingPlans, setExistingPlans] = useState<PlanLite[]>([]);
  const [firstPlanCreated, setFirstPlanCreated] = useState(false);

  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherResult, setVoucherResult] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherImported, setVoucherImported] = useState(false);
  const [locationCsvImports, setLocationCsvImports] = useState<Record<string, LocationCsvImportState>>({});
  const [locationForms, setLocationForms] = useState<LocationForm[]>([]);
  const [savingLocations, setSavingLocations] = useState(false);

  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [setupSaved, setSetupSaved] = useState(startAtSubscription);
  const [apiTenantSlug, setApiTenantSlug] = useState(tenantSlug);
  const restoredUrlState = useRef(false);
  const skipNextUrlWrite = useRef(true);

  const normalizedPortalSlug = normalizeSlug(portalSlug);
  const allowedLocationCount = Math.max(1, Math.min(50, Math.floor(Number(maxLocations || 1))));
  const hasMultipleLocations = allowedLocationCount > 1;
  const storeUrl = `${origin || "https://payspot.app"}/t/${normalizedPortalSlug || currentSlug}`;
  const planCode = normalizePlanCode(`${planName}-${planDuration || "plan"}`) || "starter-plan";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!hasMultipleLocations) return;
    setLocationForms((current) => {
      const slots = ensureLocationSlots(current, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug);
      const [primary, ...rest] = slots;
      return [
        {
          ...primary,
          name: tenantName,
          slug: normalizedPortalSlug || currentSlug,
          storePrimaryColor: brandColor,
          dashboardPrimaryColor: brandColor,
        },
        ...rest,
      ];
    });
  }, [allowedLocationCount, brandColor, currentSlug, hasMultipleLocations, normalizedPortalSlug, tenantName]);

  useEffect(() => {
    const normalized = normalizeSlug(portalSlug);
    if (!normalized || normalized.length < 2) {
      setSlugState("invalid");
      setSlugMessage("Use at least 2 lowercase letters or numbers.");
      return;
    }
    if (normalized === currentSlug) {
      setSlugState("available");
      setSlugMessage("Current link name is valid.");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSlugState("checking");
      try {
        const response = await fetch(
          `/api/t/${tenantSlug}/setup/slug-availability?slug=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        const data = await readJsonResponse<{ available?: boolean }>(response);
        if (!response.ok) {
          setSlugState("invalid");
          setSlugMessage("Unable to validate link right now.");
          return;
        }
        setSlugState(data?.available ? "available" : "taken");
        setSlugMessage(data?.available ? "Link name is available." : "This link name is already taken.");
      } catch {
        if (!controller.signal.aborted) {
          setSlugState("invalid");
          setSlugMessage("Unable to validate link right now.");
        }
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [portalSlug, tenantSlug, currentSlug]);

  useEffect(() => {
    let ignore = false;
    async function loadDefaults() {
      try {
        const [architectureResponse, plansResponse, locationsResponse] = await Promise.all([
          fetch(`/api/t/${tenantSlug}/admin/architecture`),
          fetch(`/api/t/${tenantSlug}/admin/plans`),
          fetch(`/api/t/${tenantSlug}/admin/locations`),
        ]);
        const architectureData = await readJsonResponse<TenantArchitectureResponse>(architectureResponse);
        const plansData = await readJsonResponse<{ plans?: PlanLite[] }>(plansResponse);
        const locationsData = await readJsonResponse<{
          locations?: Array<{
            id: string;
            name: string;
            slug: string;
            isPrimary: boolean;
            voucherSourceMode?: string;
            portalAuthMode?: LocationForm["portalAuthMode"];
            appearance?: {
              storePrimaryColor: string;
              dashboardPrimaryColor: string;
            };
          }>;
        }>(locationsResponse);
        if (ignore) return;

        if (architectureResponse.ok && architectureData?.architecture) {
          const { architecture } = architectureData;
          if (architecture.accessMode === "account_access") {
            setArchitecturePreset("external_radius_portal");
          } else if (architecture.voucherSourceMode === "omada_openapi") {
            setArchitecturePreset("api_automation");
          } else if (architecture.voucherSourceMode === "radius_voucher") {
            setArchitecturePreset("radius_voucher");
          } else {
            setArchitecturePreset("import_csv");
          }

          setBrandColor(architecture.appearance?.storePrimaryColor || "#72f064");
          setOmadaApiBaseUrl(architecture.omada.apiBaseUrl || "");
          setOmadaOmadacId(architecture.omada.omadacId || "");
          setOmadaSiteId(architecture.omada.siteId || "");
          setOmadaClientId(architecture.omada.clientId || "");
          setHasSavedOmadaClientSecret(architecture.omada.hasClientSecret);
          setOmadaHotspotOperatorUsername(architecture.omada.hotspotOperatorUsername || "");
          setHasSavedOmadaHotspotOperatorPassword(architecture.omada.hasHotspotOperatorPassword);
        }

        if (plansResponse.ok && plansData?.plans?.length) {
          setExistingPlans(plansData.plans);
          setFirstPlanCreated(true);
        }

        if (locationsResponse.ok && locationsData?.locations?.length) {
          const loadedLocations = locationsData.locations.map((location) => ({
            id: location.id,
            name: location.name,
            slug: location.slug,
            isPrimary: location.isPrimary,
            storePrimaryColor: location.appearance?.storePrimaryColor || "#72f064",
            dashboardPrimaryColor: location.appearance?.dashboardPrimaryColor || "#72f064",
            voucherSourceMode: normalizeLocationNetworkMode(location.voucherSourceMode),
            portalAuthMode: portalModeForLocationNetwork(normalizeLocationNetworkMode(location.voucherSourceMode)),
          }));
          setLocationForms(ensureLocationSlots(loadedLocations, allowedLocationCount, tenantName, currentSlug));
        } else {
          setLocationForms(ensureLocationSlots([], allowedLocationCount, tenantName, currentSlug));
        }
      } catch {
        // Setup can still proceed with local defaults.
        setLocationForms(ensureLocationSlots([], allowedLocationCount, tenantName, currentSlug));
      }
    }

    void loadDefaults();
    return () => {
      ignore = true;
    };
  }, [allowedLocationCount, currentSlug, tenantName, tenantSlug]);

  const architectureComplete = useMemo(() => {
    if (architecturePreset === "external_radius_portal" || architecturePreset === "radius_voucher") return true;
    if (architecturePreset !== "api_automation") return true;
    if (!omadaApiBaseUrl.trim()) return false;
    if (!omadaOmadacId.trim()) return false;
    if (!omadaSiteId.trim()) return false;
    if (!omadaClientId.trim()) return false;
    if (!omadaClientSecret.trim() && !hasSavedOmadaClientSecret) return false;
    return true;
  }, [
    architecturePreset,
    omadaApiBaseUrl,
    omadaOmadacId,
    omadaSiteId,
    omadaClientId,
    omadaClientSecret,
    hasSavedOmadaClientSecret,
  ]);

  const multiCsvLocations = useMemo(
    () => locationForms.slice(0, allowedLocationCount).filter((location) => location.voucherSourceMode === "import_csv"),
    [allowedLocationCount, locationForms],
  );
  const multiRadiusLocations = useMemo(
    () => locationForms.slice(0, allowedLocationCount).filter((location) => location.voucherSourceMode === "radius_voucher"),
    [allowedLocationCount, locationForms],
  );
  const csvPlanMode = hasMultipleLocations ? multiCsvLocations.length > 0 : architecturePreset === "import_csv";
  const manualPlanRequired = !csvPlanMode;
  const requiresVoucherImport = csvPlanMode;
  const multiCsvImportComplete =
    hasMultipleLocations &&
    multiCsvLocations.length > 0 &&
    multiCsvLocations.every((location) => locationCsvImports[getLocationImportKey(location)]?.imported);
  const voucherReady = !requiresVoucherImport || (hasMultipleLocations ? multiCsvImportComplete : voucherImported || existingPlans.length > 0);
  const locationsComplete = useMemo(() => {
    if (!hasMultipleLocations) return true;
    if (locationForms.length < allowedLocationCount) return false;
    const slugs = new Set<string>();
    return locationForms.slice(0, allowedLocationCount).every((location) => {
      const slug = normalizeSlug(location.slug);
      if (!location.name.trim() || slug.length < 2 || slugs.has(slug)) return false;
      slugs.add(slug);
      return true;
    });
  }, [allowedLocationCount, hasMultipleLocations, locationForms]);

  const planComplete = useMemo(() => {
    if (csvPlanMode) return true;
    if (firstPlanCreated || existingPlans.length > 0) return true;
    const price = Number(planPrice);
    const duration = Number(planDuration);
    const devices = Number(planDevices);
    const dataLimit = planDataLimit ? Number(planDataLimit) : null;
    return (
      planName.trim().length >= 2 &&
      Number.isFinite(price) &&
      price >= 0 &&
      (Number.isFinite(duration) && duration > 0 || dataLimit !== null && Number.isFinite(dataLimit) && dataLimit > 0) &&
      (!planDevices || Number.isFinite(devices) && devices >= 1 && devices <= 32)
    );
  }, [
    csvPlanMode,
    existingPlans.length,
    firstPlanCreated,
    planDataLimit,
    planDevices,
    planDuration,
    planName,
    planPrice,
  ]);

  const steps = useMemo(() => {
    const built: Array<{ key: SetupStepKey; label: string; sub: string; complete: boolean }> = [
      { key: "slug", label: "Welcome", sub: "Name your venue and store", complete: slugState === "available" },
    ];

    if (requirePasswordChange) {
      built.push({
        key: "password",
        label: "Password",
        sub: "Secure your admin login",
        complete: !!newPassword && newPassword === confirmPassword && !validatePassword(newPassword),
      });
    }

    if (requirePaystackKey) {
      built.push({
        key: "paystack",
        label: "Paystack",
        sub: "Connect your payment account",
        complete: isPaystackSecretKey(paystackSecretKey),
      });
    }

    if (hasMultipleLocations) {
      built.push({
        key: "locations",
        label: "Locations",
        sub: `${allowedLocationCount} storefronts assigned`,
        complete: locationsComplete,
      });
    }

    if (!hasMultipleLocations) {
      built.push({ key: "architecture", label: "Network", sub: "Configure your hotspot", complete: architectureComplete });
    }
    if (manualPlanRequired) {
      built.push({ key: "plan", label: "First Plan", sub: "Create your first Wi-Fi plan", complete: planComplete });
    }

    if (hasMultipleLocations) {
      built.push({
        key: "locationAccess",
        label: "Access Setup",
        sub: "Inventory and RADIUS per location",
        complete: locationsComplete && (manualPlanRequired ? planComplete : true),
      });
    }

    if (requiresVoucherImport) {
      built.push({
        key: "voucher",
        label: "Inventory",
        sub: hasMultipleLocations ? "Import each location CSV" : "Import voucher CSV",
        complete: voucherReady,
      });
    }

    built.push({
      key: "launch",
      label: "Launch",
      sub: subscriptionRequired ? "Save setup before billing" : "Review and go live",
      complete: setupSaved,
    });

    if (subscriptionRequired) {
      built.push({
        key: "subscription",
        label: "Subscription",
        sub: "Pay and unlock access",
        complete: false,
      });
    }

    return built;
  }, [
    architectureComplete,
    allowedLocationCount,
    confirmPassword,
    hasMultipleLocations,
    locationsComplete,
    manualPlanRequired,
    newPassword,
    paystackSecretKey,
    planComplete,
    requirePasswordChange,
    requirePaystackKey,
    requiresVoucherImport,
    slugState,
    setupSaved,
    subscriptionRequired,
    voucherReady,
  ]);

  useEffect(() => {
    setCurrentStepIndex((index) => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  useEffect(() => {
    if (restoredUrlState.current) return;
    const requestedStep = new URLSearchParams(window.location.search).get("step");
    const savedStep = window.localStorage.getItem(`payspot:onboarding-step:${apiTenantSlug}`);
    const fallbackStep = startAtSubscription ? "subscription" : requestedStep || savedStep;
    const requestedIndex = steps.findIndex((step) => step.key === fallbackStep);
    if (requestedIndex >= 0) {
      setCurrentStepIndex(requestedIndex);
    }
    restoredUrlState.current = true;
  }, [apiTenantSlug, startAtSubscription, steps]);

  useEffect(() => {
    if (!restoredUrlState.current) return;
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    window.localStorage.setItem(
      `payspot:onboarding-step:${apiTenantSlug}`,
      steps[currentStepIndex]?.key ?? "slug",
    );
    replaceQueryParams({ step: currentStepIndex === 0 ? null : steps[currentStepIndex]?.key ?? null });
  }, [apiTenantSlug, currentStepIndex, steps]);

  useEffect(() => {
    if (!hasMultipleLocations || multiCsvLocations.length === 0) return;
    setLocationCsvImports((current) => {
      let changed = false;
      const next = { ...current };
      for (const location of multiCsvLocations) {
        const key = getLocationImportKey(location);
        const stored = window.localStorage.getItem(`payspot:onboarding-csv:${apiTenantSlug}:${key}`);
        if (stored === "imported" && !next[key]?.imported) {
          next[key] = {
            ...next[key],
            imported: true,
            result: "CSV inventory was already imported for this location.",
            error: null,
          };
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [apiTenantSlug, hasMultipleLocations, multiCsvLocations]);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const canContinue = currentStep?.key === "launch" ? true : (currentStep?.complete ?? false);
  const setupCanSubmit =
    !loading &&
    slugState === "available" &&
    locationsComplete &&
    (hasMultipleLocations || architectureComplete) &&
    planComplete &&
    voucherReady &&
    (!requirePasswordChange || (!!newPassword && newPassword === confirmPassword && !validatePassword(newPassword))) &&
    (!requirePaystackKey || isPaystackSecretKey(paystackSecretKey));
  const canSubmit = currentStep?.key === "subscription" ? setupSaved || startAtSubscription : setupCanSubmit;
  const setupStyle = {
    "--ac": brandColor,
    "--ac-dim": `${brandColor}1a`,
    "--ac-bd": `${brandColor}55`,
  } as CSSProperties;

  async function createFirstPlanIfNeeded() {
    if (firstPlanCreated || existingPlans.length > 0) return;
    const response = await fetch(`/api/t/${apiTenantSlug}/admin/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: planCode,
        name: planName.trim(),
        priceNgn: Number(planPrice),
        durationMinutes: planDuration ? Number(planDuration) : null,
        maxDevices: planDevices ? Number(planDevices) : null,
        bandwidthProfile: planSpeed.trim() || null,
        dataLimitMb: planDataLimit ? Number(planDataLimit) : null,
        description: `${planName.trim()} created during onboarding.`,
        active: true,
      }),
    });
    const data = await readJsonResponse<{ error?: string }>(response);
    if (!response.ok) throw new Error(data?.error || "Unable to create first plan.");
    setFirstPlanCreated(true);
  }

  async function handleVoucherImport() {
    if (!voucherFile || voucherImporting) return;
    setVoucherError(null);
    setVoucherResult(null);
    setVoucherImporting(true);
    try {
      if (manualPlanRequired) {
        await createFirstPlanIfNeeded();
      }
      const form = new FormData();
      form.append("file", voucherFile);
      if (manualPlanRequired) {
        form.append("packageCode", planCode);
      }

      const response = await fetch(`/api/t/${apiTenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        duplicates?: number;
        skipped?: number;
        missingPlan?: number;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Import failed.");
      setVoucherImported(true);
      setVoucherResult(
        `Imported: ${data?.imported ?? 0} | Duplicates: ${data?.duplicates ?? 0} | Skipped: ${data?.skipped ?? 0}`,
      );
      setVoucherFile(null);
    } catch (err) {
      setVoucherError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setVoucherImporting(false);
    }
  }

  function setLocationCsvFile(location: LocationForm, file: File | null) {
    const key = getLocationImportKey(location);
    setLocationCsvImports((current) => ({
      ...current,
      [key]: {
        ...current[key],
        file,
        error: null,
        result: current[key]?.imported ? current[key]?.result : null,
      },
    }));
  }

  async function handleLocationVoucherImport(location: LocationForm) {
    const key = getLocationImportKey(location);
    const state = locationCsvImports[key];
    if (!state?.file || state.importing) return;
    if (!location.id) {
      setLocationCsvImports((current) => ({
        ...current,
        [key]: {
          ...current[key],
          error: "Save this location first, then import its CSV.",
        },
      }));
      return;
    }

    setLocationCsvImports((current) => ({
      ...current,
      [key]: {
        ...current[key],
        importing: true,
        error: null,
        result: null,
      },
    }));

    try {
      const form = new FormData();
      form.append("file", state.file);
      form.append("locationId", location.id);

      const response = await fetch(`/api/t/${apiTenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        duplicates?: number;
        skipped?: number;
        missingPlan?: number;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Import failed.");
      window.localStorage.setItem(`payspot:onboarding-csv:${apiTenantSlug}:${key}`, "imported");
      setLocationCsvImports((current) => ({
        ...current,
        [key]: {
          file: null,
          importing: false,
          imported: true,
          error: null,
          result: `Imported: ${data?.imported ?? 0} | Duplicates: ${data?.duplicates ?? 0} | Skipped: ${data?.skipped ?? 0}`,
        },
      }));
    } catch (err) {
      setLocationCsvImports((current) => ({
        ...current,
        [key]: {
          ...current[key],
          importing: false,
          error: err instanceof Error ? err.message : "Something went wrong.",
        },
      }));
    }
  }

  function buildSetupPayload(draft: boolean) {
    const primaryLocationMode = normalizeLocationNetworkMode(locationForms[0]?.voucherSourceMode);
    const effectiveVoucherSourceMode = hasMultipleLocations
      ? csvPlanMode ? "import_csv" : primaryLocationMode
      : architecturePreset === "api_automation"
        ? "omada_openapi"
        : architecturePreset === "radius_voucher"
          ? "radius_voucher"
          : "import_csv";
    return {
      draft,
      newPassword: newPassword ? newPassword : undefined,
      paystackPublicKey: paystackPublicKey.trim() ? paystackPublicKey.trim() : undefined,
      paystackSecretKey: paystackSecretKey.trim() ? paystackSecretKey.trim() : undefined,
      newSlug: normalizedPortalSlug,
      architecture: {
        accessMode:
          !hasMultipleLocations && architecturePreset === "external_radius_portal"
            ? "account_access"
            : "voucher_access",
        voucherSourceMode: effectiveVoucherSourceMode,
        portalAuthMode: hasMultipleLocations
          ? portalModeForLocationNetwork(primaryLocationMode)
          : undefined,
        appearance: {
          storePrimaryColor: brandColor,
          dashboardPrimaryColor: brandColor,
        },
        omada:
          !hasMultipleLocations && architecturePreset === "api_automation"
            ? {
                apiBaseUrl: omadaApiBaseUrl.trim(),
                omadacId: omadaOmadacId.trim(),
                siteId: omadaSiteId.trim(),
                clientId: omadaClientId.trim(),
                clientSecret: omadaClientSecret.trim() ? omadaClientSecret.trim() : undefined,
                hotspotOperatorUsername: omadaHotspotOperatorUsername.trim() || undefined,
                hotspotOperatorPassword: omadaHotspotOperatorPassword.trim()
                  ? omadaHotspotOperatorPassword.trim()
                  : undefined,
              }
            : undefined,
        radius:
          hasMultipleLocations || architecturePreset === "external_radius_portal" || architecturePreset === "radius_voucher"
            ? {}
            : undefined,
      },
    };
  }

  async function saveSetup(draft = false) {
    if (!draft) {
      if (manualPlanRequired) {
        await createFirstPlanIfNeeded();
      }
    }
      const response = await fetch(`/api/t/${apiTenantSlug}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSetupPayload(draft)),
      });
      const data = await readJsonResponse<{
        error?: string;
        tenantSlug?: string;
        redirectTo?: string;
        requiresSubscription?: boolean;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Setup failed.");
      if (data?.tenantSlug) {
        setApiTenantSlug(data.tenantSlug);
        if (data.tenantSlug !== apiTenantSlug) {
          const url = new URL(window.location.href);
          url.pathname = `/t/${data.tenantSlug}/setup`;
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      return data;
  }

  async function saveLocations() {
    if (!hasMultipleLocations) return;
    setSavingLocations(true);
    try {
      const normalizedLocations = ensureLocationSlots(
        locationForms,
        allowedLocationCount,
        tenantName,
        normalizedPortalSlug || currentSlug,
      ).slice(0, allowedLocationCount);

      for (const [index, location] of normalizedLocations.entries()) {
        const payload = {
          name: index === 0 ? tenantName : location.name.trim(),
          slug: index === 0 ? normalizedPortalSlug || currentSlug : normalizeSlug(location.slug),
          voucherSourceMode: location.voucherSourceMode,
          portalAuthMode: portalModeForLocationNetwork(location.voucherSourceMode),
          appearance: {
            storePrimaryColor: index === 0 ? brandColor : location.storePrimaryColor,
            dashboardPrimaryColor: index === 0 ? brandColor : location.dashboardPrimaryColor,
          },
        };
        const response = await fetch(`/api/t/${apiTenantSlug}/admin/locations`, {
          method: location.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(location.id ? { locationId: location.id, ...payload } : payload),
        });
        const data = await readJsonResponse<{ error?: string; location?: {
          id: string;
          name: string;
          slug: string;
          isPrimary: boolean;
          voucherSourceMode?: string;
          portalAuthMode?: LocationForm["portalAuthMode"];
          appearance?: {
            storePrimaryColor: string;
            dashboardPrimaryColor: string;
          };
        } }>(response);
        if (!response.ok || !data?.location) {
          throw new Error(data?.error || `Unable to save location ${index + 1}.`);
        }
        normalizedLocations[index] = {
          id: data.location.id,
          name: data.location.name,
          slug: data.location.slug,
          isPrimary: data.location.isPrimary,
          voucherSourceMode: normalizeLocationNetworkMode(data.location.voucherSourceMode),
          portalAuthMode: portalModeForLocationNetwork(normalizeLocationNetworkMode(data.location.voucherSourceMode)),
          storePrimaryColor: data.location.appearance?.storePrimaryColor || "#72f064",
          dashboardPrimaryColor: data.location.appearance?.dashboardPrimaryColor || "#72f064",
        };
      }
      setLocationForms(normalizedLocations);
    } finally {
      setSavingLocations(false);
    }
  }

  async function startSubscriptionPayment() {
    const response = await fetch(`/api/t/${normalizedPortalSlug || tenantSlug}/subscription/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await readJsonResponse<{ error?: string; authorizationUrl?: string }>(response);
    if (!response.ok || !data?.authorizationUrl) {
      throw new Error(data?.error || "Unable to start subscription payment.");
    }
    window.location.href = data.authorizationUrl;
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (currentStep?.key !== "launch" && currentStep?.key !== "subscription") {
      if (canContinue) {
        setLoading(true);
        try {
          if (currentStep?.key === "plan") {
            await createFirstPlanIfNeeded();
          }
          if (currentStep?.key === "locations") {
            await saveLocations();
          }
          await saveSetup(true);
          setCurrentStepIndex((index) => Math.min(index + 1, steps.length - 1));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Unable to save this step.");
        } finally {
          setLoading(false);
        }
      }
      return;
    }

    if (!currentStep) return;
    if (!canSubmit) return;

    setLoading(true);
    try {
      if (currentStep.key === "subscription") {
        if (!setupSaved && !startAtSubscription) {
          await saveSetup();
          setSetupSaved(true);
        }
        await startSubscriptionPayment();
        return;
      }

      const data = await saveSetup();
      if (subscriptionRequired || data?.requiresSubscription) {
        setSetupSaved(true);
        setSuccess("Setup saved. One last payment unlocks the store and dashboard.");
        const subscriptionStepIndex = steps.findIndex((step) => step.key === "subscription");
        setCurrentStepIndex(subscriptionStepIndex >= 0 ? subscriptionStepIndex : currentStepIndex);
        setLoading(false);
        return;
      }

      setSuccess("Setup complete. Redirecting...");
      window.location.href = data?.redirectTo || `/t/${normalizedPortalSlug || tenantSlug}/admin`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <>
      <style suppressHydrationWarning>{setupWizardCss}</style>
      <form className="ob-layout" style={setupStyle} onSubmit={handleSubmit}>
        <aside className="ob-sidebar">
          <div className="ob-logo">
            <Link href="/" className="ob-brand">
              <span className="ob-mark">PS</span>
              <span>PaySpot</span>
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <ThemeToggle />
              <button className="btn btn-ghost btn-icon" type="button" onClick={logout} aria-label="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
          <div className="ob-steps">
            {steps.map((step, index) => (
              <button
                key={step.key}
                type="button"
                className={`ob-step${index === currentStepIndex ? " active" : ""}${step.complete || index < currentStepIndex ? " done" : ""}`}
                onClick={() => setCurrentStepIndex(index)}
              >
                <div className="ob-step-col">
                  <div className="ob-step-dot">{step.complete || index < currentStepIndex ? <Check size={13} /> : index + 1}</div>
                  {index < steps.length - 1 ? <div className="ob-step-line" /> : null}
                </div>
                <div className="ob-step-info">
                  <div className="ob-step-label">{step.label}</div>
                  <div className="ob-step-sub">{step.sub}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="ob-main">
          <div className="ob-mobile-top">
            <div className="ob-mob-dots">
              {steps.map((step, index) => (
                <span
                  key={step.key}
                  className={`ob-mob-dot${index === currentStepIndex ? " active" : ""}${step.complete || index < currentStepIndex ? " done" : ""}`}
                />
              ))}
            </div>
            <span className="ob-mob-label">{currentStep?.label}</span>
            <span className="ob-mob-count">{currentStepIndex + 1} of {steps.length}</span>
            <button className="btn btn-ghost btn-icon" type="button" onClick={logout} aria-label="Sign out">
              <LogOut size={15} />
            </button>
          </div>

          <div className="ob-body">
            {error ? <div className="ob-content"><div className="ob-alert err">{error}</div></div> : null}
            {success ? <div className="ob-content"><div className="ob-alert ok">{success}</div></div> : null}

            {currentStep?.key === "slug" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Let&apos;s set up your Wi-Fi store</h1>
                <p className="ob-desc">
                  This creates the branded purchase page customers will use to buy access from {tenantName}.
                </p>
                <div className="ob-field">
                  <label>Venue Name</label>
                  <input value={tenantName} readOnly />
                </div>
                <div className="ob-field">
                  <label>Store URL Slug</label>
                  <div className="ob-slug-row">
                    <span className="ob-slug-prefix">{origin || "https://payspot.app"}/t/</span>
                    <input value={portalSlug} onChange={(event) => setPortalSlug(event.target.value)} placeholder="your-venue" />
                  </div>
                  <div className={`hint ${slugState === "taken" || slugState === "invalid" ? "text-red-700" : ""}`}>
                    {slugState === "checking" ? "Checking availability..." : slugMessage}
                  </div>
                </div>
                <div className="ob-field">
                  <label>Brand Color</label>
                  <div className="color-swatches">
                    {brandSwatches.map((swatch) => (
                      <button
                        key={swatch.value}
                        type="button"
                        title={swatch.name}
                        className={`color-swatch${brandColor === swatch.value ? " on" : ""}`}
                        style={{ background: swatch.value, color: swatch.value }}
                        onClick={() => setBrandColor(swatch.value)}
                      />
                    ))}
                  </div>
                  <div className="hint">Applied to the customer store, dashboard accents, and receipts.</div>
                </div>
              </section>
            ) : null}

            {currentStep?.key === "password" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Secure your admin login</h1>
                <p className="ob-desc">Create a real tenant admin password before opening the dashboard.</p>
                <div className="ob-field">
                  <label>New password</label>
                  <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                  <div className="hint">At least 8 characters with uppercase, lowercase, and a number.</div>
                </div>
                <div className="ob-field">
                  <label>Confirm password</label>
                  <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                </div>
                {newPassword && validatePassword(newPassword) ? <div className="ob-alert err">{validatePassword(newPassword)}</div> : null}
              </section>
            ) : null}

            {currentStep?.key === "paystack" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Connect Paystack</h1>
                <p className="ob-desc">
                  PaySpot initializes payments on the server and opens Paystack Popup V2 in the browser. Redirect checkout remains as fallback.
                </p>
                <div className="ob-alert info">
                  <CreditCard size={16} />
                  <span>
                    Log in to dashboard.paystack.com, open Settings, then API Keys &amp; Webhooks. Copy the live public key
                    starting with pk_live_ and the matching live secret key starting with sk_live_.
                  </span>
                </div>
                <div className="ob-field" style={{ marginTop: 18 }}>
                  <label>Public Key</label>
                  <input
                    value={paystackPublicKey}
                    onChange={(event) => setPaystackPublicKey(event.target.value)}
                    placeholder="pk_live_..."
                  />
                  <div className="hint">
                    The public key is listed beside your secret key in Paystack Settings -&gt; API Keys &amp; Webhooks.
                    Use the live key so customers can complete real payments.
                  </div>
                </div>
                <div className="ob-field">
                  <label>Secret Key</label>
                  <input
                    type="password"
                    value={paystackSecretKey}
                    onChange={(event) => setPaystackSecretKey(event.target.value)}
                    placeholder="sk_live_..."
                  />
                </div>
                <div className="ob-field">
                  <label>Webhook URL</label>
                  <div className="ob-url-box" style={{ maxWidth: "100%", marginBottom: 0 }}>
                    <span>{`${origin || "https://payspot.app"}/api/t/${normalizedPortalSlug || tenantSlug}/payments/webhook`}</span>
                  </div>
                  <div className="hint">Paste this URL in Paystack -&gt; Settings -&gt; Webhooks.</div>
                </div>
              </section>
            ) : null}

            {currentStep?.key === "locations" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Set up each storefront location</h1>
                <p className="ob-desc">
                  Your PaySpot plan allows {allowedLocationCount} storefront locations. The first location stays tied
                  to your main store link; add the details and access mode for the other storefronts now.
                </p>
                <div className="ob-alert info">
                  <Store size={16} />
                  <span>
                    Each location can have its own public slug, circular brand color, and network mode. For now the
                    supported setup choices are CSV vouchers or a RADIUS server.
                  </span>
                </div>
                {ensureLocationSlots(locationForms, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug).map((location, index) => (
                  <div className="ob-location-card" key={location.id || `new-${index}`}>
                    <div className="ob-location-head">
                      <div className="ob-location-title">Location {index + 1}</div>
                      {index === 0 ? <span className="ob-location-badge">Primary</span> : null}
                    </div>
                    <div className="ob-row">
                      <div className="ob-field">
                        <label>Location name</label>
                        <input
                          value={index === 0 ? tenantName : location.name}
                          readOnly={index === 0}
                          onChange={(event) => {
                            const value = event.target.value;
                            setLocationForms((current) => {
                              const next = ensureLocationSlots(current, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug);
                              next[index] = { ...next[index], name: value };
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div className="ob-field">
                        <label>Store slug</label>
                        <input
                          value={index === 0 ? normalizedPortalSlug || currentSlug : location.slug}
                          readOnly={index === 0}
                          onChange={(event) => {
                            const value = normalizeSlug(event.target.value);
                            setLocationForms((current) => {
                              const next = ensureLocationSlots(current, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug);
                              next[index] = { ...next[index], slug: value };
                              return next;
                            });
                          }}
                        />
                        <div className="hint">
                          {origin || "https://payspot.app"}/t/{index === 0 ? normalizedPortalSlug || currentSlug : normalizeSlug(location.slug)}
                        </div>
                      </div>
                    </div>
                    <div className="ob-row">
                      <div className="ob-field">
                        <label>Store color</label>
                        <input
                          type="color"
                          value={index === 0 ? brandColor : location.storePrimaryColor}
                          disabled={index === 0}
                          onChange={(event) => {
                            const value = event.target.value;
                            setLocationForms((current) => {
                              const next = ensureLocationSlots(current, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug);
                              next[index] = { ...next[index], storePrimaryColor: value };
                              return next;
                            });
                          }}
                        />
                      </div>
                      <div className="ob-field">
                        <label>Network mode</label>
                        <select
                          value={location.voucherSourceMode}
                          onChange={(event) => {
                            const value = event.target.value as LocationForm["voucherSourceMode"];
                            setLocationForms((current) => {
                              const next = ensureLocationSlots(current, allowedLocationCount, tenantName, normalizedPortalSlug || currentSlug);
                              next[index] = {
                                ...next[index],
                                voucherSourceMode: value,
                                portalAuthMode: portalModeForLocationNetwork(value),
                              };
                              return next;
                            });
                          }}
                        >
                          <option value="import_csv">CSV vouchers</option>
                          <option value="radius_voucher">RADIUS server</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                {!locationsComplete ? (
                  <div className="ob-alert err" style={{ marginTop: 16 }}>
                    Every location needs a unique slug and a name before you continue.
                  </div>
                ) : null}
              </section>
            ) : null}

            {currentStep?.key === "architecture" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Configure your hotspot</h1>
                <p className="ob-desc">Choose how PaySpot should deliver access after a successful payment.</p>
                <div className="platform-pills">
                  <button type="button" className={`platform-pill ${architecturePreset === "api_automation" ? "on" : ""}`} onClick={() => setArchitecturePreset("api_automation")}>Omada Cloud</button>
                  <button type="button" className="platform-pill" disabled title="Available from dashboard after launch">MikroTik</button>
                  <button type="button" className={`platform-pill ${architecturePreset === "radius_voucher" || architecturePreset === "external_radius_portal" ? "on" : ""}`} onClick={() => setArchitecturePreset("radius_voucher")}>RADIUS</button>
                  <button type="button" className={`platform-pill ${architecturePreset === "import_csv" ? "on" : ""}`} onClick={() => setArchitecturePreset("import_csv")}>CSV Only</button>
                </div>

                {architecturePreset === "api_automation" ? (
                  <div className="ob-net-card">
                    <div className="ob-row">
                      <div className="ob-field"><label>Omada API Base URL</label><input value={omadaApiBaseUrl} onChange={(event) => setOmadaApiBaseUrl(event.target.value)} placeholder="https://use1-omada-northbound.tplinkcloud.com" /></div>
                      <div className="ob-field"><label>Omada ID</label><input value={omadaOmadacId} onChange={(event) => setOmadaOmadacId(event.target.value)} placeholder="Controller ID" /></div>
                    </div>
                    <div className="ob-row">
                      <div className="ob-field"><label>Site ID</label><input value={omadaSiteId} onChange={(event) => setOmadaSiteId(event.target.value)} placeholder="Site ID" /></div>
                      <div className="ob-field"><label>Client ID</label><input value={omadaClientId} onChange={(event) => setOmadaClientId(event.target.value)} placeholder="Client ID" /></div>
                    </div>
                    <div className="ob-row">
                      <div className="ob-field"><label>Client Secret</label><input type="password" value={omadaClientSecret} onChange={(event) => setOmadaClientSecret(event.target.value)} placeholder={hasSavedOmadaClientSecret ? "Leave blank to keep saved secret" : "Client secret"} /></div>
                      <div className="ob-field"><label>Operator Username</label><input value={omadaHotspotOperatorUsername} onChange={(event) => setOmadaHotspotOperatorUsername(event.target.value)} placeholder="Optional" /></div>
                    </div>
                    <div className="ob-field">
                      <label>Operator Password</label>
                      <input type="password" value={omadaHotspotOperatorPassword} onChange={(event) => setOmadaHotspotOperatorPassword(event.target.value)} placeholder={hasSavedOmadaHotspotOperatorPassword ? "Leave blank to keep saved password" : "Optional"} />
                    </div>
                    <Link href="/help/omada-openapi" className="btn btn-muted btn-sm"><CircleHelp size={14} /> Open Omada guide</Link>
                  </div>
                ) : null}

                {architecturePreset === "radius_voucher" ? (
                  <div className="ob-net-card">
                    <div className="ob-alert info"><Wifi size={16} /> RADIUS voucher mode issues PaySpot vouchers and lets your external RADIUS service enforce usage.</div>
                    <Link href="/help/radius-voucher" className="btn btn-muted btn-sm" style={{ marginTop: 14 }}><CircleHelp size={14} /> Open RADIUS voucher guide</Link>
                  </div>
                ) : null}

                {architecturePreset === "external_radius_portal" ? (
                  <div className="ob-net-card">
                    <div className="ob-alert info"><Wifi size={16} /> Account access uses external RADIUS plus PaySpot subscriber entitlements.</div>
                    <Link href="/help/external-radius" className="btn btn-muted btn-sm" style={{ marginTop: 14 }}><CircleHelp size={14} /> Open external RADIUS guide</Link>
                  </div>
                ) : null}

                {architecturePreset === "import_csv" ? (
                  <div className="ob-net-card">
                    <div className="ob-alert info"><Upload size={16} /> CSV mode uses pre-generated vouchers. The CSV import step will create plans and stock before launch.</div>
                    <Link href="/help/csv-import" className="btn btn-muted btn-sm" style={{ marginTop: 14 }}><CircleHelp size={14} /> Open CSV import guide</Link>
                    <Link href="/help/omada-access-list" className="btn btn-muted btn-sm" style={{ marginTop: 14, marginLeft: 8 }}><CircleHelp size={14} /> Open access list guide</Link>
                    <Link href="/help/custom-portal" className="btn btn-muted btn-sm" style={{ marginTop: 14, marginLeft: 8 }}><CircleHelp size={14} /> Open custom portal guide</Link>
                  </div>
                ) : null}
              </section>
            ) : null}

            {currentStep?.key === "plan" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Set up your first plan</h1>
                <p className="ob-desc">
                  Create the first plan customers will see. You can edit or add more plans from the dashboard later.
                </p>
                {existingPlans.length > 0 ? (
                  <div className="ob-alert ok"><BadgeCheck size={16} /> {existingPlans.length} plan(s) already exist. You can continue.</div>
                ) : (
                  <div className="ob-plan-builder">
                    <div className="ob-row">
                      <div className="ob-field"><label>Name</label><input value={planName} onChange={(event) => setPlanName(event.target.value)} /></div>
                      <div className="ob-field"><label>Price (NGN)</label><input type="number" min="0" value={planPrice} onChange={(event) => setPlanPrice(event.target.value)} /></div>
                    </div>
                    <div className="ob-row">
                      <div className="ob-field"><label>Duration (minutes)</label><input type="number" min="1" value={planDuration} onChange={(event) => setPlanDuration(event.target.value)} /></div>
                      <div className="ob-field"><label>Devices</label><input type="number" min="1" max="32" value={planDevices} onChange={(event) => setPlanDevices(event.target.value)} /></div>
                    </div>
                    <div className="ob-row">
                      <div className="ob-field"><label>Speed / Profile</label><input value={planSpeed} onChange={(event) => setPlanSpeed(event.target.value)} /></div>
                      <div className="ob-field"><label>Data Limit (MB)</label><input type="number" min="1" value={planDataLimit} onChange={(event) => setPlanDataLimit(event.target.value)} placeholder="Optional" /></div>
                    </div>
                    <div className="ob-plan-preview">
                      <div className="ob-plan-preview-label">Customer preview</div>
                      <div className="ob-plan-preview-row">
                        <div>
                          <div className="ob-plan-preview-name">{planName || "Starter plan"}</div>
                          <div className="ob-plan-preview-tags">
                            <span className="ob-plan-preview-tag">{formatDuration(planDuration)}</span>
                            <span className="ob-plan-preview-tag">{planDevices || 1} device(s)</span>
                            <span className="ob-plan-preview-tag">{planSpeed || "Standard"}</span>
                          </div>
                        </div>
                        <div className="ob-plan-preview-price">{formatMoney(planPrice)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {currentStep?.key === "locationAccess" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Finish access setup per location</h1>
                <p className="ob-desc">
                  This replaces the old single “configure hotspot” step. CSV locations need voucher inventory;
                  RADIUS locations need their RADIUS server pointed at PaySpot.
                </p>
                <div className="ob-access-list">
                  {multiCsvLocations.map((location) => (
                    <div className="ob-access-card" key={`csv-${location.slug}`}>
                      <span className="ob-location-badge">CSV vouchers</span>
                      <h3>{location.name}</h3>
                      <p>
                        Export voucher CSVs from the controller for this location, then import them into PaySpot
                        inventory for the matching plan. Keep each location&apos;s voucher stock separate when you upload.
                      </p>
                      <div className="ob-access-actions">
                        <Link href="/help/csv-import" className="btn btn-muted btn-sm"><CircleHelp size={14} /> CSV import guide</Link>
                        <Link href="/help/omada-access-list" className="btn btn-muted btn-sm"><CircleHelp size={14} /> Captive access-list guide</Link>
                      </div>
                    </div>
                  ))}
                  {multiRadiusLocations.map((location) => (
                    <div className="ob-access-card" key={`radius-${location.slug}`}>
                      <span className="ob-location-badge">RADIUS server</span>
                      <h3>{location.name}</h3>
                      <p>
                        Configure this location&apos;s hotspot/controller to use PaySpot as the RADIUS-backed access
                        source. No CSV upload is needed for this location.
                      </p>
                      <div className="ob-access-actions">
                        <Link href="/help/radius-voucher" className="btn btn-muted btn-sm"><CircleHelp size={14} /> RADIUS setup guide</Link>
                        <Link href="/help/external-radius" className="btn btn-muted btn-sm"><CircleHelp size={14} /> External RADIUS guide</Link>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="ob-alert info" style={{ marginTop: 16 }}>
                  <Upload size={16} />
                  <span>
                    You can continue now and complete CSV imports from the dashboard per location. RADIUS locations
                    only need their server/controller settings completed.
                  </span>
                </div>
              </section>
            ) : null}

            {currentStep?.key === "voucher" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">{hasMultipleLocations ? "Import each location CSV" : "Import CSV plans and vouchers"}</h1>
                <p className="ob-desc">
                  {hasMultipleLocations
                    ? "Each CSV-backed location has its own voucher stock. Upload the CSV exported for that exact location so PaySpot can create its plans and keep the inventory separate."
                    : "CSV import is the source of truth for this setup. PaySpot will create the plans from the voucher CSV and import the matching voucher inventory during onboarding."}
                </p>
                {hasMultipleLocations ? (
                  <div className="ob-access-list">
                    {multiCsvLocations.map((location) => {
                      const key = getLocationImportKey(location);
                      const importState = locationCsvImports[key] ?? {};
                      return (
                        <div className="ob-csv-card" key={`location-csv-${key}`}>
                          <div className="ob-location-head">
                            <div>
                              <div className="ob-location-title">{location.name}</div>
                              <div className="hint">/{normalizeSlug(location.slug)}</div>
                            </div>
                            <span className="ob-location-badge">CSV vouchers</span>
                          </div>
                          {importState.imported ? (
                            <div className="ob-alert ok"><BadgeCheck size={16} /> CSV plans and voucher inventory imported for {location.name}.</div>
                          ) : (
                            <>
                              <div className="ob-field">
                                <label>{location.name} voucher CSV</label>
                                <input
                                  type="file"
                                  accept=".csv,text/csv"
                                  onChange={(event) => setLocationCsvFile(location, event.target.files?.[0] ?? null)}
                                />
                                <div className="hint">
                                  Use the CSV exported from this location&apos;s controller. The file must include voucher codes and plan data such as duration or data limit.
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-ac"
                                disabled={!importState.file || importState.importing}
                                onClick={() => void handleLocationVoucherImport(location)}
                              >
                                {importState.importing ? "Importing..." : `Import ${location.name} CSV`}
                              </button>
                            </>
                          )}
                          {importState.error ? <p className="hint" style={{ color: "var(--red)", marginTop: 10 }}>{importState.error}</p> : null}
                          {importState.result ? <p className="hint" style={{ marginTop: 10 }}>{importState.result}</p> : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ob-csv-card">
                    {voucherImported ? (
                      <div className="ob-alert ok"><BadgeCheck size={16} /> CSV plans and voucher inventory imported.</div>
                    ) : (
                      <>
                        <div className="ob-field">
                          <label>Voucher CSV</label>
                          <input type="file" accept=".csv,text/csv" onChange={(event) => setVoucherFile(event.target.files?.[0] ?? null)} />
                          <div className="hint">The CSV must include voucher codes and enough plan data, such as duration or data limit, for PaySpot to create plans.</div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" className="btn btn-ac" disabled={!voucherFile || voucherImporting} onClick={handleVoucherImport}>
                            {voucherImporting ? "Importing..." : "Import CSV and create plans"}
                          </button>
                        </div>
                      </>
                    )}
                    {voucherError ? <p className="hint" style={{ color: "var(--red)", marginTop: 10 }}>{voucherError}</p> : null}
                    {voucherResult ? <p className="hint" style={{ marginTop: 10 }}>{voucherResult}</p> : null}
                  </div>
                )}
              </section>
            ) : null}

            {currentStep?.key === "launch" ? (
              <section className="ob-launch">
                <div className="ob-launch-ring"><Check size={34} color="var(--ac)" /></div>
                <h1 className="ob-title">{subscriptionRequired ? "Save setup before billing" : "You&apos;re almost live"}</h1>
                <p className="ob-desc">
                  {subscriptionRequired
                    ? "Review the essentials, then save setup. The platform subscription payment is the final onboarding step."
                    : "Review the essentials, then complete setup and enter the tenant dashboard."}
                </p>
                <div className="ob-url-box">
                  <span>{storeUrl}</span>
                </div>
                <div className="ob-checklist">
                  <ChecklistItem done={slugState === "available"} label="Store identity ready" icon={<Store size={16} />} />
                  {hasMultipleLocations ? (
                    <ChecklistItem done={locationsComplete} label={`${allowedLocationCount} storefront locations configured`} icon={<Store size={16} />} />
                  ) : null}
                  <ChecklistItem done={!requirePaystackKey || isPaystackSecretKey(paystackSecretKey)} label="Paystack connected" icon={<CreditCard size={16} />} />
                  {hasMultipleLocations ? (
                    <ChecklistItem done={locationsComplete} label="Per-location access modes selected" icon={<Wifi size={16} />} />
                  ) : (
                    <ChecklistItem done={architectureComplete} label="Hotspot architecture selected" icon={<Wifi size={16} />} />
                  )}
                  <ChecklistItem done={planComplete} label={csvPlanMode ? "Plans created from CSV" : "First plan ready"} icon={<Palette size={16} />} />
                  <ChecklistItem done={voucherReady} label={requiresVoucherImport ? "CSV inventory imported" : "Inventory automation selected"} icon={<Upload size={16} />} />
                  {paystackPublicKey ? <ChecklistItem done label="Public key captured for operator reference" icon={<Link2 size={16} />} /> : null}
                </div>
              </section>
            ) : null}

            {currentStep?.key === "subscription" ? (
              <section className="ob-launch">
                <div className="ob-launch-ring"><CreditCard size={34} color="var(--ac)" /></div>
                <h1 className="ob-title">Final step: platform subscription</h1>
                <p className="ob-desc">
                  Pay the PaySpot subscription to unlock your dashboard and activate the storefront.
                </p>
                <div className="ob-url-box">
                  <span>{formatMoney(String(subscriptionAmountNgn))} / {subscriptionInterval}</span>
                </div>
                <div className="ob-checklist">
                  <ChecklistItem done={setupSaved || startAtSubscription} label="Setup details saved" icon={<Check size={16} />} />
                  <ChecklistItem done label="Payment handled by Paystack secure checkout" icon={<CreditCard size={16} />} />
                  <ChecklistItem done={false} label="Store unlocks immediately after confirmation" icon={<Store size={16} />} />
                </div>
              </section>
            ) : null}
          </div>

          <footer className="ob-footer">
            <div className="ob-progress-dots">
              {steps.map((step, index) => (
                <span key={step.key} className={`ob-prog-dot${index === currentStepIndex ? " active" : ""}${step.complete || index < currentStepIndex ? " done" : ""}`} />
              ))}
            </div>
            <div className="ob-footer-r">
              <button type="button" className="btn btn-ghost btn-sm" disabled={loading || currentStepIndex === 0} onClick={() => setCurrentStepIndex((index) => Math.max(index - 1, 0))}>
                Back
              </button>
              {isLastStep ? (
                <button type="submit" className="btn btn-ac" disabled={!canSubmit}>
                  {loading
                    ? currentStep?.key === "subscription" ? "Opening Paystack..." : "Saving..."
                    : currentStep?.key === "subscription" ? "Pay subscription" : "Complete setup"}
                </button>
              ) : (
                <button type="submit" className="btn btn-ac" disabled={!canContinue || loading || savingLocations}>
                  {savingLocations ? "Saving locations..." : "Continue"}
                </button>
              )}
            </div>
          </footer>
        </main>
      </form>
    </>
  );
}

function ChecklistItem({ done, label, icon }: { done: boolean; label: string; icon: ReactNode }) {
  return (
    <div className="ob-check">
      {done ? <Check size={16} color="var(--green)" /> : icon}
      <span>{label}</span>
    </div>
  );
}
