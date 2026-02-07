"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

type VoucherStat = {
  code: string;
  name: string;
  total: number;
  unused: number;
  assigned: number;
  percentageRemaining: number;
};

type PackageStat = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
  priceNgn: number;
  active: number;
};

type AdminStats = {
  voucherPool: VoucherStat[];
  packages: PackageStat[];
  transactions: {
    total: number;
    success: number;
    pending: number;
    processing: number;
    failed: number;
    revenueNgn: number;
  };
};

type Props = {
  tenantSlug: string;
};

export function TenantAdminPanel({ tenantSlug }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [packageCode, setPackageCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [packageEdits, setPackageEdits] = useState<Record<string, string>>({});
  const [packageSaving, setPackageSaving] = useState<Record<string, boolean>>({});
  const [packageError, setPackageError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/stats`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to load stats.");
      }
      setStats(data.stats as AdminStats);
    } catch (err) {
      setStats(null);
      setStatsError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStatsLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile) return;

    setImportError(null);
    setImportResult(null);
    setImportLoading(true);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      if (packageCode.trim()) {
        form.append("packageCode", packageCode.trim());
      }

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Import failed.");
      }
      const parts = [
        `Imported: ${data.imported}`,
        `Duplicates: ${data.duplicates}`,
        `Skipped: ${data.skipped}`,
      ];
      if (typeof data.expired === "number") {
        parts.push(`Expired: ${data.expired}`);
      }
      if (typeof data.inUse === "number") {
        parts.push(`In use: ${data.inUse}`);
      }
      if (typeof data.missingPlan === "number") {
        parts.push(`Missing plan: ${data.missingPlan}`);
      }
      if (typeof data.packagesCreated === "number") {
        parts.push(`New plans: ${data.packagesCreated}`);
      }
      setImportResult(parts.join(" | "));
      setCsvFile(null);
      setPackageCode("");
      await loadStats();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setImportLoading(false);
    }
  }

  const canLoadStats = !statsLoading;
  const canImport = !!csvFile && !importLoading;

  const packages = stats?.packages ?? [];

  function handlePackagePriceChange(packageId: string, value: string) {
    setPackageEdits((prev) => ({ ...prev, [packageId]: value }));
  }

  async function handlePackageSave(packageId: string) {
    const raw = packageEdits[packageId];
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPackageError("Enter a valid price (0 or higher).");
      return;
    }
    setPackageError(null);
    setPackageSaving((prev) => ({ ...prev, [packageId]: true }));
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, priceNgn: Math.round(parsed) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to update price.");
      }
      await loadStats();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPackageSaving((prev) => ({ ...prev, [packageId]: false }));
    }
  }

  return (
    <div className="grid gap-6">
      <Card className="border-slate-200/70 bg-white/60 shadow-sm">
        <CardHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Overview
          </p>
          <CardTitle className="text-base">Stats</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Button onClick={loadStats} disabled={!canLoadStats} className="h-11">
            {statsLoading ? "Refreshing..." : "Refresh stats"}
          </Button>

          {statsError ? (
            <Alert variant="destructive">
              <AlertTitle>Stats failed</AlertTitle>
              <AlertDescription>{statsError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-slate-200/70 bg-white/60 shadow-sm">
        <CardHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Plans
          </p>
          <CardTitle className="text-base">Edit plan prices</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {packageError ? (
            <Alert variant="destructive">
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>{packageError}</AlertDescription>
            </Alert>
          ) : null}

          {packages.length === 0 ? (
            <p className="text-sm text-slate-600">No plans found.</p>
          ) : (
            <div className="grid gap-3">
              {packages.map((pkg) => {
                const value =
                  packageEdits[pkg.id] ?? (Number.isFinite(pkg.priceNgn) ? String(pkg.priceNgn) : "0");
                return (
                  <div
                    key={pkg.id}
                    className="rounded-xl border border-slate-200 bg-white/70 p-4 text-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">{pkg.name}</p>
                        <p className="text-xs text-slate-500">
                          {pkg.code} · {pkg.durationMinutes} mins
                        </p>
                      </div>
                      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                        <div className="grid gap-1">
                          <Label htmlFor={`price-${pkg.id}`} className="text-xs">
                            Price (NGN)
                          </Label>
                          <Input
                            id={`price-${pkg.id}`}
                            className="h-10 w-full sm:w-32"
                            inputMode="numeric"
                            value={value}
                            onChange={(event) =>
                              handlePackagePriceChange(pkg.id, event.target.value)
                            }
                          />
                        </div>
                        <Button
                          className="h-10"
                          type="button"
                          disabled={packageSaving[pkg.id]}
                          onClick={() => handlePackageSave(pkg.id)}
                        >
                          {packageSaving[pkg.id] ? "Saving..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-slate-200/70 bg-white/60 shadow-sm">
        <CardHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Add vouchers
          </p>
          <CardTitle className="text-base">Upload voucher codes (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form className="grid gap-4" onSubmit={handleImport}>
            <div className="grid gap-2">
              <Label htmlFor="csv">CSV file</Label>
              <Input
                id="csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="packageCode">Plan code (optional)</Label>
              <Input
                id="packageCode"
                className="h-11"
                placeholder="3h"
                value={packageCode}
                onChange={(e) => setPackageCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the duration in your CSV.
              </p>
            </div>

            <Button type="submit" disabled={!canImport} className="h-11">
              {importLoading ? "Importing..." : "Import vouchers"}
            </Button>
          </form>

          {importError ? (
            <Alert variant="destructive">
              <AlertTitle>Import failed</AlertTitle>
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          ) : null}

          {importResult ? (
            <Alert>
              <AlertTitle>Import complete</AlertTitle>
              <AlertDescription>{importResult}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {stats ? (
        <>
          <Separator />

          <Card className="border-slate-200/70 bg-white/60 shadow-sm">
            <CardHeader className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Sales
              </p>
              <CardTitle className="text-base">Transactions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-semibold">{stats.transactions.total}</span>
              </div>
              <div className="flex justify-between">
                <span>Success</span>
                <span className="font-semibold">{stats.transactions.success}</span>
              </div>
              <div className="flex justify-between">
                <span>Pending</span>
                <span className="font-semibold">{stats.transactions.pending}</span>
              </div>
              <div className="flex justify-between">
                <span>Processing</span>
                <span className="font-semibold">{stats.transactions.processing}</span>
              </div>
              <div className="flex justify-between">
                <span>Failed</span>
                <span className="font-semibold">{stats.transactions.failed}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2">
                <span>Revenue (NGN)</span>
                <span className="font-semibold">
                  {stats.transactions.revenueNgn.toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 bg-white/60 shadow-sm">
            <CardHeader className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Inventory
              </p>
              <CardTitle className="text-base">Voucher pool</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {stats.voucherPool.length === 0 ? (
                <p className="text-sm text-slate-600">No packages found.</p>
              ) : (
                <div className="grid gap-3">
                  {stats.voucherPool.map((pkg) => (
                    <div
                      key={pkg.code}
                      className="rounded-xl border border-slate-200 bg-white/70 p-4 text-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{pkg.name}</p>
                          <p className="text-xs text-slate-500">{pkg.code}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">
                            {pkg.percentageRemaining}%
                          </p>
                          <p className="text-xs text-slate-500">remaining</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-600">
                        <div className="rounded-lg border border-slate-200 bg-white/60 p-2">
                          <p className="font-semibold text-slate-900">{pkg.total}</p>
                          <p>Total</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white/60 p-2">
                          <p className="font-semibold text-slate-900">{pkg.unused}</p>
                          <p>Unused</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white/60 p-2">
                          <p className="font-semibold text-slate-900">{pkg.assigned}</p>
                          <p>Assigned</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
