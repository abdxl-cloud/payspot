"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BadgeCheck, Check, CircleHelp, CreditCard, Link2, Palette, Store, Upload, Wifi } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { readJsonResponse } from "@/lib/http";
import { isPaystackSecretKey } from "@/lib/paystack-key";

type Props = {
  tenantSlug: string;
  tenantName: string;
  currentSlug: string;
  requirePasswordChange: boolean;
  requirePaystackKey: boolean;
  requireVoucherImport: boolean;
};

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";
type SetupStepKey = "slug" | "password" | "paystack" | "architecture" | "plan" | "voucher" | "launch";
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
.ob-grid{display:grid;gap:14px}.ob-field{display:grid;gap:7px;margin-bottom:14px}.ob-field label{font-size:12px;font-weight:800;color:var(--tx2)}.ob-field input,.ob-field select{height:42px;background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:0 12px;color:var(--tx);outline:none}.ob-field input:focus,.ob-field select:focus{border-color:var(--ac-bd)}.ob-field select option{background:#161616}.ob-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hint{font-size:11px;color:var(--tx3);line-height:1.5}
.ob-slug-row{display:flex;align-items:center}.ob-slug-prefix{height:42px;background:var(--s3);border:1px solid var(--bd);border-right:0;border-radius:var(--r) 0 0 var(--r);padding:0 12px;display:flex;align-items:center;font-size:12px;color:var(--tx3);white-space:nowrap;font-family:var(--font-mono),monospace}.ob-slug-row input{border-radius:0 var(--r) var(--r) 0;flex:1}
.ob-alert{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s2);padding:12px 14px;color:var(--tx2);font-size:13px;line-height:1.5}.ob-alert.info{border-color:var(--ac-bd);background:var(--ac-dim)}.ob-alert.err{border-color:oklch(0.65 0.18 25/.35);background:oklch(0.65 0.18 25/.12);color:var(--red)}.ob-alert.ok{border-color:oklch(0.72 0.17 155/.35);background:oklch(0.72 0.17 155/.12);color:var(--green)}
.color-swatches{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}.color-swatch{width:28px;height:28px;border-radius:50%;border:0;cursor:pointer;transition:transform .15s,box-shadow .15s}.color-swatch:hover{transform:scale(1.12)}.color-swatch.on{box-shadow:0 0 0 2px var(--bg),0 0 0 4px currentColor;transform:scale(1.08)}
.platform-pills{display:flex;gap:8px;flex-wrap:wrap}.platform-pill{border:1px solid var(--bd);border-radius:999px;background:var(--s2);color:var(--tx2);padding:8px 13px;font-size:12px;font-weight:800;cursor:pointer}.platform-pill.on{border-color:var(--ac-bd);background:var(--ac-dim);color:var(--ac)}
.ob-net-card,.ob-plan-builder,.ob-csv-card{border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1);padding:18px;margin-top:16px}.ob-plan-preview{background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:14px;margin-top:16px}.ob-plan-preview-label{font-size:10px;color:var(--tx3);text-transform:uppercase;letter-spacing:.06em;font-family:var(--font-mono),monospace;margin-bottom:10px}.ob-plan-preview-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.ob-plan-preview-name{font-size:15px;font-weight:800;color:var(--tx)}.ob-plan-preview-price{font-family:var(--font-mono),monospace;font-size:20px;font-weight:800;color:var(--ac)}.ob-plan-preview-tags{display:flex;gap:10px;flex-wrap:wrap;margin-top:5px}.ob-plan-preview-tag{font-size:11px;color:var(--tx3)}
.ob-url-box{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r);padding:11px 14px;font-family:var(--font-mono),monospace;font-size:13px;color:var(--ac);display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;max-width:460px;margin-bottom:24px}.ob-checklist{display:flex;flex-direction:column;gap:8px;margin-bottom:32px;text-align:left;width:100%;max-width:460px}.ob-check{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--tx2)}
.ob-launch{display:flex;flex-direction:column;align-items:flex-start;padding:clamp(32px,5vw,52px);max-width:680px}.ob-launch-ring{width:72px;height:72px;border-radius:50%;background:var(--ac-dim);border:1px solid var(--ac-bd);display:flex;align-items:center;justify-content:center;margin-bottom:22px}
.ob-footer{border-top:1px solid var(--bd);padding:14px clamp(20px,5vw,52px);display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg);position:sticky;bottom:0}.ob-progress-dots{display:flex;gap:5px}.ob-prog-dot{width:5px;height:5px;border-radius:50%;background:var(--bd2);transition:all .2s}.ob-prog-dot.done{background:var(--green)}.ob-prog-dot.active{background:var(--ac);width:14px;border-radius:100px}.ob-footer-r{display:flex;gap:8px;align-items:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--bd);border-radius:var(--r);padding:9px 14px;font-size:13px;font-weight:800;cursor:pointer;text-decoration:none}.btn:disabled{opacity:.45;cursor:not-allowed}.btn-ac{background:var(--ac);border-color:transparent;color:#0d0d0d}.btn-muted{background:var(--s2);color:var(--tx2)}.btn-ghost{background:transparent;color:var(--tx2)}.btn-sm{padding:7px 11px;font-size:12px}.btn-lg{padding:12px 16px;font-size:14px}.btn:hover:not(:disabled){filter:brightness(1.08)}
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

export function TenantSetupPanel({
  tenantSlug,
  tenantName,
  currentSlug,
  requirePasswordChange,
  requirePaystackKey,
  requireVoucherImport,
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
  const [voucherImported, setVoucherImported] = useState(!requireVoucherImport);
  const [voucherSkipped, setVoucherSkipped] = useState(false);

  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const restoredUrlState = useRef(false);
  const skipNextUrlWrite = useRef(true);

  const normalizedPortalSlug = normalizeSlug(portalSlug);
  const storeUrl = `${origin || "https://payspot.app"}/t/${normalizedPortalSlug || currentSlug}`;
  const planCode = normalizePlanCode(`${planName}-${planDuration || "plan"}`) || "starter-plan";

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

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
        const [architectureResponse, plansResponse] = await Promise.all([
          fetch(`/api/t/${tenantSlug}/admin/architecture`),
          fetch(`/api/t/${tenantSlug}/admin/plans`),
        ]);
        const architectureData = await readJsonResponse<TenantArchitectureResponse>(architectureResponse);
        const plansData = await readJsonResponse<{ plans?: PlanLite[] }>(plansResponse);
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
      } catch {
        // Setup can still proceed with local defaults.
      }
    }

    void loadDefaults();
    return () => {
      ignore = true;
    };
  }, [tenantSlug]);

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

  const planComplete = useMemo(() => {
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
  }, [existingPlans.length, firstPlanCreated, planDataLimit, planDevices, planDuration, planName, planPrice]);

  const requiresVoucherImport = requireVoucherImport && architecturePreset === "import_csv";
  const voucherReady = !requiresVoucherImport || voucherImported || voucherSkipped;

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

    built.push({ key: "architecture", label: "Network", sub: "Configure your hotspot", complete: architectureComplete });
    built.push({ key: "plan", label: "First Plan", sub: "Create your first Wi-Fi plan", complete: planComplete });

    if (requiresVoucherImport) {
      built.push({
        key: "voucher",
        label: "Inventory",
        sub: "Import vouchers or skip",
        complete: voucherReady,
      });
    }

    built.push({
      key: "launch",
      label: "Launch",
      sub: "Review and go live",
      complete: false,
    });

    return built;
  }, [
    architectureComplete,
    confirmPassword,
    newPassword,
    paystackSecretKey,
    planComplete,
    requirePasswordChange,
    requirePaystackKey,
    requiresVoucherImport,
    slugState,
    voucherReady,
  ]);

  useEffect(() => {
    setCurrentStepIndex((index) => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  useEffect(() => {
    if (restoredUrlState.current) return;
    const requestedStep = new URLSearchParams(window.location.search).get("step");
    const requestedIndex = steps.findIndex((step) => step.key === requestedStep);
    if (requestedIndex >= 0) {
      setCurrentStepIndex(requestedIndex);
    }
    restoredUrlState.current = true;
  }, [steps]);

  useEffect(() => {
    if (!restoredUrlState.current) return;
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }
    replaceQueryParams({ step: currentStepIndex === 0 ? null : steps[currentStepIndex]?.key ?? null });
  }, [currentStepIndex, steps]);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStep?.key === "launch";
  const canContinue = currentStep?.key === "launch" ? true : (currentStep?.complete ?? false);
  const canSubmit =
    !loading &&
    slugState === "available" &&
    architectureComplete &&
    planComplete &&
    voucherReady &&
    (!requirePasswordChange || (!!newPassword && newPassword === confirmPassword && !validatePassword(newPassword))) &&
    (!requirePaystackKey || isPaystackSecretKey(paystackSecretKey));
  const setupStyle = {
    "--ac": brandColor,
    "--ac-dim": `${brandColor}1a`,
    "--ac-bd": `${brandColor}55`,
  } as CSSProperties;

  async function createFirstPlanIfNeeded() {
    if (firstPlanCreated || existingPlans.length > 0) return;
    const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
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
      await createFirstPlanIfNeeded();
      const form = new FormData();
      form.append("file", voucherFile);
      form.append("packageCode", planCode);

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, {
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
      setVoucherSkipped(false);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isLastStep) {
      if (canContinue) setCurrentStepIndex((index) => Math.min(index + 1, steps.length - 1));
      return;
    }
    if (!canSubmit) return;

    setLoading(true);
    try {
      await createFirstPlanIfNeeded();
      const response = await fetch(`/api/t/${tenantSlug}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: newPassword ? newPassword : undefined,
          paystackPublicKey: paystackPublicKey.trim() ? paystackPublicKey.trim() : undefined,
          paystackSecretKey: paystackSecretKey.trim() ? paystackSecretKey.trim() : undefined,
          newSlug: normalizedPortalSlug,
          architecture: {
            accessMode:
              architecturePreset === "external_radius_portal"
                ? "account_access"
                : "voucher_access",
            voucherSourceMode:
              architecturePreset === "api_automation"
                ? "omada_openapi"
                : architecturePreset === "radius_voucher"
                  ? "radius_voucher"
                  : "import_csv",
            appearance: {
              storePrimaryColor: brandColor,
              dashboardPrimaryColor: brandColor,
            },
            omada:
              architecturePreset === "api_automation"
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
              architecturePreset === "external_radius_portal" || architecturePreset === "radius_voucher"
                ? {}
                : undefined,
          },
        }),
      });
      const data = await readJsonResponse<{ error?: string; redirectTo?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Setup failed.");
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
            <ThemeToggle />
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
                    <div className="ob-alert info"><Upload size={16} /> CSV mode uses pre-generated Omada vouchers. You can import now or skip inventory until after launch.</div>
                    <Link href="/help/csv-import" className="btn btn-muted btn-sm" style={{ marginTop: 14 }}><CircleHelp size={14} /> Open CSV import guide</Link>
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

            {currentStep?.key === "voucher" ? (
              <section className="ob-content">
                <div className="ob-kicker">Step {currentStepIndex + 1} of {steps.length}</div>
                <h1 className="ob-title">Upload voucher inventory</h1>
                <p className="ob-desc">Import an Omada CSV now, or skip and add inventory from the dashboard when you are ready.</p>
                <div className="ob-csv-card">
                  {voucherImported ? (
                    <div className="ob-alert ok"><BadgeCheck size={16} /> Voucher CSV imported.</div>
                  ) : voucherSkipped ? (
                    <div className="ob-alert info"><Upload size={16} /> Inventory skipped. The store can launch, but CSV plans need stock before customers can buy.</div>
                  ) : (
                    <>
                      <div className="ob-field">
                        <label>Omada voucher CSV</label>
                        <input type="file" accept=".csv,text/csv" onChange={(event) => setVoucherFile(event.target.files?.[0] ?? null)} />
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" className="btn btn-ac" disabled={!voucherFile || voucherImporting} onClick={handleVoucherImport}>
                          {voucherImporting ? "Importing..." : "Import CSV"}
                        </button>
                        <button type="button" className="btn btn-muted" onClick={() => setVoucherSkipped(true)}>
                          Skip for now
                        </button>
                      </div>
                    </>
                  )}
                  {voucherError ? <p className="hint" style={{ color: "var(--red)", marginTop: 10 }}>{voucherError}</p> : null}
                  {voucherResult ? <p className="hint" style={{ marginTop: 10 }}>{voucherResult}</p> : null}
                </div>
              </section>
            ) : null}

            {currentStep?.key === "launch" ? (
              <section className="ob-launch">
                <div className="ob-launch-ring"><Check size={34} color="var(--ac)" /></div>
                <h1 className="ob-title">You&apos;re almost live</h1>
                <p className="ob-desc">Review the essentials, then complete setup and enter the tenant dashboard.</p>
                <div className="ob-url-box">
                  <span>{storeUrl}</span>
                </div>
                <div className="ob-checklist">
                  <ChecklistItem done={slugState === "available"} label="Store identity ready" icon={<Store size={16} />} />
                  <ChecklistItem done={!requirePaystackKey || isPaystackSecretKey(paystackSecretKey)} label="Paystack connected" icon={<CreditCard size={16} />} />
                  <ChecklistItem done={architectureComplete} label="Hotspot architecture selected" icon={<Wifi size={16} />} />
                  <ChecklistItem done={planComplete} label="First plan ready" icon={<Palette size={16} />} />
                  <ChecklistItem done={voucherReady} label={requiresVoucherImport ? "Voucher inventory handled" : "Inventory automation selected"} icon={<Upload size={16} />} />
                  {paystackPublicKey ? <ChecklistItem done label="Public key captured for operator reference" icon={<Link2 size={16} />} /> : null}
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
              {currentStep?.key === "voucher" && !voucherReady ? (
                <button type="button" className="btn btn-muted btn-sm" onClick={() => setVoucherSkipped(true)}>
                  Skip for now
                </button>
              ) : null}
              {isLastStep ? (
                <button type="submit" className="btn btn-ac" disabled={!canSubmit}>
                  {loading ? "Saving..." : "Complete setup"}
                </button>
              ) : (
                <button type="submit" className="btn btn-ac" disabled={!canContinue || loading}>
                  Continue
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
