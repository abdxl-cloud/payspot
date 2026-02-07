"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { readJsonResponse } from "@/lib/http";

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
  const [deleteMode, setDeleteMode] = useState<"plan" | "codes" | "status">("plan");
  const [deleteStatus, setDeleteStatus] = useState("UNUSED");
  const [deletePackageId, setDeletePackageId] = useState("");
  const [deleteCodes, setDeleteCodes] = useState("");
  const [deleteFile, setDeleteFile] = useState<File | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/stats`);
      const data = await readJsonResponse<{ error?: string; stats?: AdminStats }>(response);
      if (!response.ok) {
        throw new Error(data?.error || response.statusText || "Unable to load stats.");
      }
      if (!data?.stats) {
        throw new Error("Unable to load stats.");
      }
      setStats(data.stats);
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

  const packages = useMemo(() => stats?.packages ?? [], [stats]);
  const hasImportedPlans = (stats?.voucherPool ?? []).some((pkg) => pkg.total > 0);

  useEffect(() => {
    if (!deletePackageId && packages.length > 0) {
      setDeletePackageId(packages[0].id);
    }
  }, [packages, deletePackageId]);

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
      const data = await readJsonResponse<
        | {
            error?: string;
            imported?: number;
            duplicates?: number;
            skipped?: number;
            expired?: number;
            inUse?: number;
            missingPlan?: number;
            packagesCreated?: number;
          }
        | null
      >(response);
      if (!response.ok) {
        throw new Error(data?.error || response.statusText || "Import failed.");
      }
      if (!data) {
        throw new Error("Import failed.");
      }
      const parts = [
        `Imported: ${data.imported ?? 0}`,
        `Duplicates: ${data.duplicates ?? 0}`,
        `Skipped: ${data.skipped ?? 0}`,
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

  const canImport = !!csvFile && !importLoading;

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
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || response.statusText || "Failed to update price.");
      }
      await loadStats();
    } catch (err) {
      setPackageError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPackageSaving((prev) => ({ ...prev, [packageId]: false }));
    }
  }

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault();
    setDeleteError(null);
    setDeleteResult(null);

    if (deleteMode === "plan" && !deletePackageId) {
      setDeleteError("Select a plan to delete.");
      return;
    }

    if (deleteMode === "codes" && !deleteCodes.trim() && !deleteFile) {
      setDeleteError("Provide voucher codes or upload a CSV.");
      return;
    }

    setDeleteLoading(true);
    try {
      const form = new FormData();
      form.append("mode", deleteMode);
      form.append("status", deleteStatus);
      if (deletePackageId) {
        form.append("packageId", deletePackageId);
      }
      if (deleteCodes.trim()) {
        form.append("codes", deleteCodes.trim());
      }
      if (deleteFile) {
        form.append("file", deleteFile);
      }

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/delete`, {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{ error?: string; deleted?: number }>(response);
      if (!response.ok) {
        throw new Error(data?.error || response.statusText || "Delete failed.");
      }
      setDeleteResult(`Deleted: ${data?.deleted ?? 0}`);
      setDeleteCodes("");
      setDeleteFile(null);
      await loadStats();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card className="border-white/90 bg-white/95">
        <CardHeader className="space-y-1">
          <p className="section-kicker">
            Add vouchers
          </p>
          <CardTitle className="section-title">Upload voucher codes (CSV)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={loadStats}
              disabled={statsLoading}
              variant="outline"
              className="h-9"
              type="button"
            >
              {statsLoading ? "Refreshing..." : "Refresh data"}
            </Button>
          </div>

          {statsError ? (
            <Alert variant="destructive">
              <AlertTitle>Stats failed</AlertTitle>
              <AlertDescription>{statsError}</AlertDescription>
            </Alert>
          ) : null}

          {!hasImportedPlans ? (
            <Alert>
              <AlertTitle>Plan management is locked</AlertTitle>
              <AlertDescription>
                Import voucher plans to unlock pricing and inventory controls.
              </AlertDescription>
            </Alert>
          ) : null}

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

      {hasImportedPlans ? (
        <>
          <Separator />

          <Card className="border-white/90 bg-white/95">
            <CardHeader className="space-y-1">
              <p className="section-kicker">
                Plans
              </p>
              <CardTitle className="section-title">Edit plan prices</CardTitle>
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
                      packageEdits[pkg.id] ??
                      (Number.isFinite(pkg.priceNgn) ? String(pkg.priceNgn) : "0");
                    return (
                      <div
                        key={pkg.id}
                        className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{pkg.name}</p>
                            <p className="text-xs text-slate-500">
                              {pkg.code} - {pkg.durationMinutes} mins
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

          <Card className="border-white/90 bg-white/95">
            <CardHeader className="space-y-1">
              <p className="section-kicker">
                Remove vouchers
              </p>
              <CardTitle className="section-title">Delete vouchers</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <form className="grid gap-4" onSubmit={handleDelete}>
                <div className="grid gap-2">
                  <Label htmlFor="delete-mode">Delete mode</Label>
                  <select
                    id="delete-mode"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    value={deleteMode}
                    onChange={(event) =>
                      setDeleteMode(event.target.value as "plan" | "codes" | "status")
                    }
                  >
                    <option value="plan">Delete by plan</option>
                    <option value="codes">Delete by codes (paste or CSV)</option>
                    <option value="status">Delete by status</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="delete-status">Status filter</Label>
                  <select
                    id="delete-status"
                    className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    value={deleteStatus}
                    onChange={(event) => setDeleteStatus(event.target.value)}
                  >
                    <option value="UNUSED">Unused only</option>
                    <option value="ASSIGNED">Assigned only</option>
                    <option value="ALL">All statuses</option>
                  </select>
                </div>

                {deleteMode === "plan" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="delete-plan">Plan</Label>
                    <select
                      id="delete-plan"
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      value={deletePackageId}
                      onChange={(event) => setDeletePackageId(event.target.value)}
                    >
                      {packages.map((pkg) => (
                        <option key={pkg.id} value={pkg.id}>
                          {pkg.name} ({pkg.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {deleteMode === "codes" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="delete-codes">Voucher codes</Label>
                      <textarea
                        id="delete-codes"
                        className="min-h-[96px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        placeholder="Paste codes separated by commas or new lines"
                        value={deleteCodes}
                        onChange={(event) => setDeleteCodes(event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="delete-csv">CSV file (optional)</Label>
                      <Input
                        id="delete-csv"
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(event) => setDeleteFile(event.target.files?.[0] ?? null)}
                      />
                    </div>
                  </>
                ) : null}

                <Button type="submit" disabled={deleteLoading} className="h-11">
                  {deleteLoading ? "Deleting..." : "Delete vouchers"}
                </Button>
              </form>

              {deleteError ? (
                <Alert variant="destructive">
                  <AlertTitle>Delete failed</AlertTitle>
                  <AlertDescription>{deleteError}</AlertDescription>
                </Alert>
              ) : null}

              {deleteResult ? (
                <Alert>
                  <AlertTitle>Delete complete</AlertTitle>
                  <AlertDescription>{deleteResult}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          {stats ? (
            <>
              <Separator />

              <Card className="border-white/90 bg-white/95">
                <CardHeader className="space-y-1">
                  <p className="section-kicker">
                    Inventory
                  </p>
                  <CardTitle className="section-title">Voucher pool</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {stats.voucherPool.length === 0 ? (
                    <p className="text-sm text-slate-600">No packages found.</p>
                  ) : (
                    <div className="grid gap-3">
                      {stats.voucherPool.map((pkg) => (
                        <div
                          key={pkg.code}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm"
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
                            <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                              <p className="font-semibold text-slate-900">{pkg.total}</p>
                              <p>Total</p>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-white p-2">
                              <p className="font-semibold text-slate-900">{pkg.unused}</p>
                              <p>Unused</p>
                            </div>
                            <div className="rounded-lg border border-slate-200/80 bg-white p-2">
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
        </>
      ) : null}
    </div>
  );
}

