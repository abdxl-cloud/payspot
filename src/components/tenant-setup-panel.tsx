"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleHelp, Link2, LockKeyhole, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";
import { isPaystackSecretKey } from "@/lib/paystack-key";

type Props = {
  tenantSlug: string;
  currentSlug: string;
  requirePasswordChange: boolean;
  requirePaystackKey: boolean;
  requireVoucherImport: boolean;
};

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";
type SetupStepKey = "slug" | "password" | "paystack" | "architecture" | "voucher";
type ArchitecturePreset = "import_csv" | "api_automation" | "external_radius_portal";

type TenantArchitectureResponse = {
  architecture?: {
    accessMode: "voucher_access" | "account_access";
    voucherSourceMode: "import_csv" | "omada_openapi";
    omada: {
      apiBaseUrl: string;
      omadacId: string;
      siteId: string;
      clientId: string;
      hasClientSecret: boolean;
      hotspotOperatorUsername: string;
      hasHotspotOperatorPassword: boolean;
    };
    radius: {
      hasAdapterSecret: boolean;
      adapterSecretLast4: string;
    };
  };
};

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

export function TenantSetupPanel({
  tenantSlug,
  currentSlug,
  requirePasswordChange,
  requirePaystackKey,
  requireVoucherImport,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paystackSecretKey, setPaystackSecretKey] = useState("");
  const [portalSlug, setPortalSlug] = useState(currentSlug);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  const [slugMessage, setSlugMessage] = useState<string>(
    "Keep this short and brand-specific. Example: walstreet",
  );

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

  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherResult, setVoucherResult] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherImported, setVoucherImported] = useState(!requireVoucherImport);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);

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
        if (data?.available) {
          setSlugState("available");
          setSlugMessage("Link name is available.");
        } else {
          setSlugState("taken");
          setSlugMessage("This link name is already taken.");
        }
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
    async function loadArchitectureDefaults() {
      try {
        const response = await fetch(`/api/t/${tenantSlug}/admin/architecture`);
        const data = await readJsonResponse<TenantArchitectureResponse>(response);
        if (!response.ok || !data?.architecture || ignore) return;

        const { architecture } = data;
        if (architecture.accessMode === "account_access") {
          setArchitecturePreset("external_radius_portal");
        } else if (architecture.voucherSourceMode === "omada_openapi") {
          setArchitecturePreset("api_automation");
        } else {
          setArchitecturePreset("import_csv");
        }

        setOmadaApiBaseUrl(architecture.omada.apiBaseUrl || "");
        setOmadaOmadacId(architecture.omada.omadacId || "");
        setOmadaSiteId(architecture.omada.siteId || "");
        setOmadaClientId(architecture.omada.clientId || "");
        setHasSavedOmadaClientSecret(architecture.omada.hasClientSecret);
        setOmadaHotspotOperatorUsername(architecture.omada.hotspotOperatorUsername || "");
        setHasSavedOmadaHotspotOperatorPassword(architecture.omada.hasHotspotOperatorPassword);
      } catch {
        // Keep local defaults when architecture fetch fails during setup.
      }
    }

    void loadArchitectureDefaults();
    return () => {
      ignore = true;
    };
  }, [tenantSlug]);

  const requiresVoucherImport = requireVoucherImport && architecturePreset === "import_csv";

  const architectureComplete = useMemo(() => {
    if (architecturePreset === "external_radius_portal") return true;
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

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!architectureComplete) return false;
    if (requiresVoucherImport && !voucherImported) return false;
    if (slugState !== "available") return false;
    if (requirePasswordChange) {
      if (!newPassword || !confirmPassword) return false;
      if (newPassword !== confirmPassword) return false;
      if (validatePassword(newPassword)) return false;
    }
    if (requirePaystackKey) {
      if (!isPaystackSecretKey(paystackSecretKey)) return false;
    }
    return true;
  }, [
    loading,
    architectureComplete,
    requiresVoucherImport,
    voucherImported,
    slugState,
    requirePasswordChange,
    newPassword,
    confirmPassword,
    requirePaystackKey,
    paystackSecretKey,
  ]);

  const steps = useMemo(() => {
    const built: Array<{ key: SetupStepKey; label: string; complete: boolean }> = [
      { key: "slug", label: "Portal link", complete: slugState === "available" },
    ];

    if (requirePasswordChange) {
      built.push({
        key: "password",
        label: "Password",
        complete:
          !!newPassword &&
          !!confirmPassword &&
          newPassword === confirmPassword &&
          !validatePassword(newPassword),
      });
    }

    if (requirePaystackKey) {
      built.push({
        key: "paystack",
        label: "Paystack",
        complete: isPaystackSecretKey(paystackSecretKey),
      });
    }

    built.push({ key: "architecture", label: "Architecture", complete: architectureComplete });

    if (requiresVoucherImport) {
      built.push({ key: "voucher", label: "Vouchers", complete: voucherImported });
    }

    return built;
  }, [
    slugState,
    requirePasswordChange,
    newPassword,
    confirmPassword,
    requirePaystackKey,
    paystackSecretKey,
    architectureComplete,
    requiresVoucherImport,
    voucherImported,
  ]);

  useEffect(() => {
    setCurrentStepIndex((index) => Math.min(index, Math.max(steps.length - 1, 0)));
  }, [steps.length]);

  const currentStep = steps[currentStepIndex];
  const isLastStep = currentStepIndex === steps.length - 1;
  const canContinue = currentStep?.complete ?? false;

  async function handleVoucherImport() {
    if (!voucherFile || voucherImporting) return;

    setVoucherError(null);
    setVoucherResult(null);
    setVoucherImporting(true);
    try {
      const form = new FormData();
      form.append("file", voucherFile);

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        duplicates?: number;
        skipped?: number;
      }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Import failed.");
      }
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isLastStep) {
      if (canContinue) setCurrentStepIndex((index) => Math.min(index + 1, steps.length - 1));
      return;
    }
    if (!canSubmit) return;

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: newPassword ? newPassword : undefined,
          paystackSecretKey: paystackSecretKey.trim() ? paystackSecretKey.trim() : undefined,
          newSlug: normalizeSlug(portalSlug),
          architecture: {
            accessMode:
              architecturePreset === "external_radius_portal"
                ? "account_access"
                : "voucher_access",
            voucherSourceMode: architecturePreset === "api_automation" ? "omada_openapi" : "import_csv",
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
              architecturePreset === "external_radius_portal" ? {} : undefined,
          },
        }),
      });
      const data = await readJsonResponse<{ error?: string; redirectTo?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Setup failed.");
      }
      setSuccess("Setup complete. Redirecting...");
      window.location.href = data?.redirectTo || `/t/${tenantSlug}/admin`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200/85 bg-white/92">
      <CardHeader className="space-y-2">
        <p className="section-kicker">Launch checklist</p>
        <CardTitle className="section-title">Tenant setup wizard</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {steps.map((step, index) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setCurrentStepIndex(index)}
              className={[
                "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition",
                index === currentStepIndex
                  ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white",
              ].join(" ")}
            >
              <span>{step.label}</span>
              {step.complete ? <BadgeCheck className="size-4 text-emerald-600" /> : null}
            </button>
          ))}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Setup failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          {currentStep?.key === "slug" ? (
            <div className="grid gap-2">
              <Label htmlFor="portalSlug">Portal link name</Label>
              <div className="relative">
                <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="portalSlug"
                  className="h-11 pl-9"
                  placeholder="walstreet"
                  value={portalSlug}
                  onChange={(event) => setPortalSlug(event.target.value)}
                  required
                />
              </div>
              <p
                className={[
                  "text-xs",
                  slugState === "taken" || slugState === "invalid"
                    ? "text-red-700"
                    : slugState === "available"
                      ? "text-emerald-700"
                      : "text-muted-foreground",
                ].join(" ")}
              >
                {slugState === "checking" ? "Checking availability..." : slugMessage}
              </p>
            </div>
          ) : null}

          {currentStep?.key === "password" && requirePasswordChange ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="newPassword"
                    type="password"
                    className="h-11 pl-9"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  At least 8 characters, with upper/lowercase and a number.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  className="h-11"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </div>
            </div>
          ) : null}

          {currentStep?.key === "paystack" && requirePaystackKey ? (
            <div className="grid gap-2">
              <Label htmlFor="paystackKey">Paystack secret key</Label>
              <Input
                id="paystackKey"
                type="password"
                className="h-11"
                placeholder="sk_test_... or sk_live_..."
                value={paystackSecretKey}
                onChange={(event) => setPaystackSecretKey(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Stored securely. Test keys (`sk_test_...`) are supported.
              </p>
            </div>
          ) : null}

          {currentStep?.key === "architecture" ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold text-slate-900">Access mode</p>
              <p className="text-xs text-slate-600">
                Choose how users get online: voucher flow or account flow.
              </p>

              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setArchitecturePreset((prev) =>
                      prev === "api_automation" ? "api_automation" : "import_csv",
                    )
                  }
                  className={[
                    "rounded-xl border px-3 py-3 text-left transition",
                    architecturePreset !== "external_radius_portal"
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold text-slate-900">Voucher access</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Users buy voucher-based plans. Choose CSV or Omada OpenAPI provisioning below.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setArchitecturePreset("external_radius_portal")}
                  className={[
                    "rounded-xl border px-3 py-3 text-left transition",
                    architecturePreset === "external_radius_portal"
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:bg-slate-50",
                  ].join(" ")}
                >
                  <p className="text-sm font-semibold text-slate-900">Account access (External RADIUS)</p>
                  <p className="mt-1 text-xs text-slate-600">Users sign in with account and access is enforced via RADIUS.</p>
                </button>
              </div>

              {architecturePreset !== "external_radius_portal" ? (
                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Voucher provisioning
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setArchitecturePreset("import_csv")}
                      className={[
                        "rounded-xl border px-3 py-2 text-left transition",
                        architecturePreset === "import_csv"
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      ].join(" ")}
                    >
                      CSV import
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchitecturePreset("api_automation")}
                      className={[
                        "rounded-xl border px-3 py-2 text-left transition",
                        architecturePreset === "api_automation"
                          ? "border-indigo-300 bg-indigo-50"
                          : "border-slate-200 bg-white hover:bg-slate-50",
                      ].join(" ")}
                    >
                      Omada OpenAPI
                    </button>
                  </div>
                </div>
              ) : null}

              {architecturePreset === "api_automation" ? (
                <div className="rounded-2xl border border-slate-200/85 bg-slate-50/75 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Omada OpenAPI credentials
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Input
                      value={omadaApiBaseUrl}
                      onChange={(event) => setOmadaApiBaseUrl(event.target.value)}
                      placeholder="https://use1-omada-northbound.tplinkcloud.com"
                      required
                    />
                    <Input
                      value={omadaOmadacId}
                      onChange={(event) => setOmadaOmadacId(event.target.value)}
                      placeholder="Omada ID"
                      required
                    />
                    <Input
                      value={omadaSiteId}
                      onChange={(event) => setOmadaSiteId(event.target.value)}
                      placeholder="Site ID"
                      required
                    />
                    <Input
                      value={omadaClientId}
                      onChange={(event) => setOmadaClientId(event.target.value)}
                      placeholder="Client ID"
                      required
                    />
                    <Input
                      type="password"
                      value={omadaClientSecret}
                      onChange={(event) => setOmadaClientSecret(event.target.value)}
                      placeholder={
                        hasSavedOmadaClientSecret
                          ? "Client secret (leave blank to keep)"
                          : "Client secret"
                      }
                      required={!hasSavedOmadaClientSecret}
                    />
                    <Input
                      value={omadaHotspotOperatorUsername}
                      onChange={(event) => setOmadaHotspotOperatorUsername(event.target.value)}
                      placeholder="Hotspot operator username (optional)"
                    />
                    <Input
                      type="password"
                      value={omadaHotspotOperatorPassword}
                      onChange={(event) => setOmadaHotspotOperatorPassword(event.target.value)}
                      placeholder={
                        hasSavedOmadaHotspotOperatorPassword
                          ? "Hotspot operator password (leave blank to keep)"
                          : "Hotspot operator password (optional)"
                      }
                    />
                  </div>
                  <Link
                    href="/help/omada-openapi"
                    className="inline-flex w-fit rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    Open Omada setup guide
                  </Link>
                </div>
              ) : architecturePreset === "external_radius_portal" ? (
                <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="rounded-xl border border-amber-300 bg-white/70 p-3 text-xs text-amber-900">
                    External mode selected. Your auth flow will use{" "}
                    <span className="font-semibold">external RADIUS + portal</span>.
                  </div>
                  <p className="text-xs text-amber-900/80">
                    Shared secret is generated and managed automatically by the system.
                  </p>
                  <Link
                    href="/help/external-radius"
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    <CircleHelp className="size-3.5" />
                    Open External RADIUS setup guide
                  </Link>
                </div>
              ) : (
                <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <p>CSV mode selected. You will import vouchers from file in the next step.</p>
                  <p>
                    Recommended for fastest launch and lowest integration complexity.
                  </p>
                  <Link
                    href="/help/csv-import"
                    className="inline-flex w-fit rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100"
                  >
                    Open CSV import guide
                  </Link>
                </div>
              )}
            </div>
          ) : null}

          {currentStep?.key === "voucher" ? (
            <div className="rounded-2xl border border-slate-200/85 bg-slate-50/75 p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <Upload className="size-3.5" /> Voucher import
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Upload your Omada CSV so your portal launches with available voucher inventory.
              </p>

              {voucherImported ? (
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <BadgeCheck className="size-4" /> Voucher CSV imported.
                </p>
              ) : (
                <div className="mt-3 grid gap-3">
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setVoucherFile(event.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!voucherFile || voucherImporting}
                    onClick={handleVoucherImport}
                  >
                    {voucherImporting ? "Importing..." : "Import voucher CSV"}
                  </Button>
                </div>
              )}

              {voucherError ? <p className="mt-2 text-sm text-red-700">{voucherError}</p> : null}
              {voucherResult ? <p className="mt-2 text-sm text-slate-600">{voucherResult}</p> : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading || currentStepIndex === 0}
              onClick={() => setCurrentStepIndex((index) => Math.max(index - 1, 0))}
            >
              Back
            </Button>
            {isLastStep ? (
              <Button type="submit" className="h-11" disabled={!canSubmit}>
                {loading ? "Saving..." : "Complete setup"}
              </Button>
            ) : (
              <Button type="submit" className="h-11" disabled={!canContinue || loading}>
                Next step
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
