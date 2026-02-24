"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Link2, LockKeyhole, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";

type Props = {
  tenantSlug: string;
  currentSlug: string;
  requirePasswordChange: boolean;
  requirePaystackKey: boolean;
  requireVoucherImport: boolean;
};

type SlugState = "idle" | "checking" | "available" | "taken" | "invalid";

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

  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [voucherImporting, setVoucherImporting] = useState(false);
  const [voucherResult, setVoucherResult] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [voucherImported, setVoucherImported] = useState(!requireVoucherImport);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!voucherImported) return false;
    if (slugState !== "available") return false;
    if (requirePasswordChange) {
      if (!newPassword || !confirmPassword) return false;
      if (newPassword !== confirmPassword) return false;
      if (validatePassword(newPassword)) return false;
    }
    if (requirePaystackKey) {
      if (paystackSecretKey.trim().length < 10) return false;
    }
    return true;
  }, [
    loading,
    voucherImported,
    slugState,
    requirePasswordChange,
    newPassword,
    confirmPassword,
    requirePaystackKey,
    paystackSecretKey,
  ]);

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
        <CardTitle className="section-title">Finish required setup</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <StatusPill label="Password" done={!requirePasswordChange} />
          <StatusPill label="Paystack key" done={!requirePaystackKey} />
          <StatusPill label="Voucher import" done={voucherImported} />
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

          {requirePasswordChange ? (
            <>
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
            </>
          ) : null}

          {requirePaystackKey ? (
            <div className="grid gap-2">
              <Label htmlFor="paystackKey">Paystack secret key</Label>
              <Input
                id="paystackKey"
                type="password"
                className="h-11"
                placeholder="sk_live_..."
                value={paystackSecretKey}
                onChange={(event) => setPaystackSecretKey(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Stored securely and required to accept payments.
              </p>
            </div>
          ) : null}

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

          <Button type="submit" className="h-12" disabled={!canSubmit}>
            {loading ? "Saving..." : "Complete setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function StatusPill({ label, done }: { label: string; done: boolean }) {
  return done ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      <BadgeCheck className="size-3.5" />
      {label}
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      {label}
    </span>
  );
}
