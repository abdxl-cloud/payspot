"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

type AdminView = "overview" | "import" | "pricing" | "cleanup" | "inventory";

export function TenantAdminPanel({ tenantSlug }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const [activeView, setActiveView] = useState<AdminView>("overview");

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [packageCode, setPackageCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [packageEdits, setPackageEdits] = useState<Record<string, string>>({});
  const [packageSaving, setPackageSaving] = useState<Record<string, boolean>>({});
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packageQuery, setPackageQuery] = useState("");

  const [deleteMode, setDeleteMode] = useState<"plan" | "codes" | "status">("plan");
  const [deleteStatus, setDeleteStatus] = useState("UNUSED");
  const [deletePackageId, setDeletePackageId] = useState("");
  const [deleteCodes, setDeleteCodes] = useState("");
  const [deleteFile, setDeleteFile] = useState<File | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [inventoryQuery, setInventoryQuery] = useState("");

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
      setLastRefreshedAt(new Date());
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

  const filteredPackages = useMemo(() => {
    const normalized = packageQuery.trim().toLowerCase();
    if (!normalized) return packages;
    return packages.filter((pkg) => {
      return (
        pkg.name.toLowerCase().includes(normalized) ||
        pkg.code.toLowerCase().includes(normalized)
      );
    });
  }, [packages, packageQuery]);

  const filteredInventory = useMemo(() => {
    const pool = stats?.voucherPool ?? [];
    const normalized = inventoryQuery.trim().toLowerCase();
    if (!normalized) return pool;
    return pool.filter((pkg) => {
      return (
        pkg.name.toLowerCase().includes(normalized) ||
        pkg.code.toLowerCase().includes(normalized)
      );
    });
  }, [stats, inventoryQuery]);

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
      setActiveView("pricing");
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
      setActiveView("inventory");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeleteLoading(false);
    }
  }

  const transactionStats = stats?.transactions;

  return (
    <div className="grid gap-6">
      <Card className="border-slate-200/80 bg-white/88">
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="section-kicker">Operations command</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                Manage stock, pricing, and cleanup in one workflow
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {lastRefreshedAt ? `Last synced ${lastRefreshedAt.toLocaleTimeString()}` : "Syncing data..."}
              </p>
            </div>
            <Button variant="outline" onClick={loadStats} disabled={statsLoading} className="h-11" type="button">
              {statsLoading ? "Refreshing..." : "Refresh data"}
            </Button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ViewButton label="Overview" view="overview" activeView={activeView} onChange={setActiveView} />
            <ViewButton label="Import" view="import" activeView={activeView} onChange={setActiveView} />
            <ViewButton label="Pricing" view="pricing" activeView={activeView} onChange={setActiveView} />
            <ViewButton label="Cleanup" view="cleanup" activeView={activeView} onChange={setActiveView} />
            <ViewButton label="Inventory" view="inventory" activeView={activeView} onChange={setActiveView} />
          </div>

          {statsError ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Stats failed</AlertTitle>
              <AlertDescription>{statsError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {activeView === "overview" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Revenue" value={`NGN ${(transactionStats?.revenueNgn ?? 0).toLocaleString()}`} />
            <StatTile label="Successful payments" value={String(transactionStats?.success ?? 0)} />
            <StatTile label="Pending / Processing" value={`${transactionStats?.pending ?? 0} / ${transactionStats?.processing ?? 0}`} />
            <StatTile label="Failed" value={String(transactionStats?.failed ?? 0)} />
          </div>

          <Card className="border-slate-200/80 bg-white/88">
            <CardHeader className="space-y-1">
              <p className="section-kicker">Readiness</p>
              <CardTitle className="section-title">Operational checklist</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm text-slate-700">
              <p>1. Import voucher CSV with consistent package mapping.</p>
              <p>2. Confirm each package price and available quantities.</p>
              <p>3. Use cleanup tools only when reconciliation is complete.</p>
            </CardContent>
          </Card>
        </>
      ) : null}

      {activeView === "import" ? (
        <Card className="border-slate-200/80 bg-white/88">
          <CardHeader className="space-y-1">
            <p className="section-kicker">Voucher ingestion</p>
            <CardTitle className="section-title">Upload voucher codes (CSV)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
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
                  onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="packageCode">Plan code (optional)</Label>
                <Input
                  id="packageCode"
                  className="h-11"
                  placeholder="3h"
                  value={packageCode}
                  onChange={(event) => setPackageCode(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use duration data from your CSV.
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
      ) : null}

      {activeView === "pricing" ? (
        <Card className="border-slate-200/80 bg-white/88">
          <CardHeader className="space-y-3">
            <div>
              <p className="section-kicker">Pricing controls</p>
              <CardTitle className="section-title">Edit plan prices</CardTitle>
            </div>
            <Input
              placeholder="Search plan by name or code"
              value={packageQuery}
              onChange={(event) => setPackageQuery(event.target.value)}
            />
          </CardHeader>
          <CardContent className="grid gap-4">
            {packageError ? (
              <Alert variant="destructive">
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{packageError}</AlertDescription>
              </Alert>
            ) : null}

            {filteredPackages.length === 0 ? (
              <p className="text-sm text-slate-600">No plans match your filter.</p>
            ) : (
              <div className="grid gap-3">
                {filteredPackages.map((pkg) => {
                  const value =
                    packageEdits[pkg.id] ?? (Number.isFinite(pkg.priceNgn) ? String(pkg.priceNgn) : "0");
                  return (
                    <div
                      key={pkg.id}
                      className="rounded-xl border border-slate-200/80 bg-slate-50/75 p-4 text-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{pkg.name}</p>
                          <p className="text-xs text-slate-500">
                            {pkg.code} | {pkg.durationMinutes} mins | {pkg.active} active vouchers
                          </p>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          <div className="grid gap-1">
                            <Label htmlFor={`price-${pkg.id}`} className="text-xs">
                              Price (NGN)
                            </Label>
                            <Input
                              id={`price-${pkg.id}`}
                              className="h-10 w-full sm:w-36"
                              inputMode="numeric"
                              value={value}
                              onChange={(event) => handlePackagePriceChange(pkg.id, event.target.value)}
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
      ) : null}

      {activeView === "cleanup" ? (
        <Card className="border-rose-200/85 bg-white/88">
          <CardHeader className="space-y-1">
            <p className="section-kicker text-rose-600">Danger zone</p>
            <CardTitle className="section-title">Delete vouchers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-4" onSubmit={handleDelete}>
              <div className="grid gap-2">
                <Label htmlFor="delete-mode">Delete mode</Label>
                <select
                  id="delete-mode"
                  className="h-11 w-full"
                  value={deleteMode}
                  onChange={(event) => setDeleteMode(event.target.value as "plan" | "codes" | "status")}
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
                  className="h-11 w-full"
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
                    className="h-11 w-full"
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
                      className="min-h-[110px]"
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

              <Button type="submit" disabled={deleteLoading} className="h-11" variant="destructive">
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
      ) : null}

      {activeView === "inventory" ? (
        <Card className="border-slate-200/80 bg-white/88">
          <CardHeader className="space-y-3">
            <div>
              <p className="section-kicker">Inventory analytics</p>
              <CardTitle className="section-title">Voucher pool</CardTitle>
            </div>
            <Input
              placeholder="Search package by name or code"
              value={inventoryQuery}
              onChange={(event) => setInventoryQuery(event.target.value)}
            />
          </CardHeader>
          <CardContent className="grid gap-3">
            {filteredInventory.length === 0 ? (
              <p className="text-sm text-slate-600">No packages found.</p>
            ) : (
              <div className="grid gap-3">
                {filteredInventory.map((pkg) => (
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
                        <p className="font-semibold text-slate-900">{pkg.percentageRemaining}%</p>
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
      ) : null}
    </div>
  );
}

function ViewButton({
  label,
  view,
  activeView,
  onChange,
}: {
  label: string;
  view: AdminView;
  activeView: AdminView;
  onChange: (view: AdminView) => void;
}) {
  return (
    <Button
      type="button"
      variant={activeView === view ? "default" : "outline"}
      size="sm"
      onClick={() => onChange(view)}
    >
      {label}
    </Button>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/82 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
