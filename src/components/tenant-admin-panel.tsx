"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readJsonResponse } from "@/lib/http";

type VoucherStat = {
  code: string;
  name: string;
  total: number;
  unused: number;
  assigned: number;
  percentageRemaining: number;
};

type AdminStats = {
  voucherPool: VoucherStat[];
  transactions: {
    total: number;
    success: number;
    pending: number;
    processing: number;
    failed: number;
    revenueNgn: number;
  };
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
  priceNgn: number;
  active: number;
  totalCount: number;
  unusedCount: number;
  assignedCount: number;
};

type VoucherRow = {
  id: string;
  voucherCode: string;
  status: "UNUSED" | "ASSIGNED";
  packageId: string;
  packageCode: string;
  packageName: string;
  createdAt: string;
  assignedAt: string | null;
  assignedToEmail: string | null;
  assignedToPhone: string | null;
};

type Props = {
  tenantSlug: string;
};

const PAGE_SIZE = 20;

function money(value: number) {
  return `NGN ${Math.round(value || 0).toLocaleString()}`;
}

function dt(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

export function TenantAdminPanel({ tenantSlug }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [vouchersError, setVouchersError] = useState<string | null>(null);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [voucherNotice, setVoucherNotice] = useState<string | null>(null);
  const [voucherQuery, setVoucherQuery] = useState("");
  const [voucherStatus, setVoucherStatus] = useState("all");
  const [voucherPlan, setVoucherPlan] = useState("all");
  const [voucherPage, setVoucherPage] = useState(1);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [voucherTotalPages, setVoucherTotalPages] = useState(1);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);

  const [newPlanCode, setNewPlanCode] = useState("");
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDuration, setNewPlanDuration] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [planDrafts, setPlanDrafts] = useState<
    Record<string, { name: string; code: string; duration: string; price: string; active: boolean }>
  >({});
  const [savingPlanIds, setSavingPlanIds] = useState<Record<string, boolean>>({});

  const [newVoucherCode, setNewVoucherCode] = useState("");
  const [newVoucherPackageId, setNewVoucherPackageId] = useState("");
  const [creatingVoucher, setCreatingVoucher] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importPackageCode, setImportPackageCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setStatsError(null);
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/stats`);
      const data = await readJsonResponse<{ error?: string; stats?: AdminStats }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load stats.");
      setStats(data?.stats ?? null);
    } catch (error) {
      setStats(null);
      setStatsError(error instanceof Error ? error.message : "Unable to load stats.");
    } finally {
      setStatsLoading(false);
    }
  }, [tenantSlug]);

  const loadPlans = useCallback(async () => {
    setPlansError(null);
    setPlansLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`);
      const data = await readJsonResponse<{ error?: string; plans?: PlanRow[] }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load plans.");
      setPlans(data?.plans ?? []);
    } catch (error) {
      setPlans([]);
      setPlansError(error instanceof Error ? error.message : "Unable to load plans.");
    } finally {
      setPlansLoading(false);
    }
  }, [tenantSlug]);

  const loadVouchers = useCallback(async () => {
    setVouchersError(null);
    setVouchersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(voucherPage),
        pageSize: String(PAGE_SIZE),
      });
      if (voucherQuery.trim()) params.set("q", voucherQuery.trim());
      if (voucherStatus !== "all") params.set("status", voucherStatus);
      if (voucherPlan !== "all") params.set("packageId", voucherPlan);

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers?${params.toString()}`);
      const data = await readJsonResponse<{
        error?: string;
        vouchers?: VoucherRow[];
        pagination?: { total: number; totalPages: number };
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load vouchers.");
      setVouchers(data?.vouchers ?? []);
      setVoucherTotal(data?.pagination?.total ?? 0);
      setVoucherTotalPages(data?.pagination?.totalPages ?? 1);
      setSelectedVoucherIds([]);
    } catch (error) {
      setVouchers([]);
      setVouchersError(error instanceof Error ? error.message : "Unable to load vouchers.");
    } finally {
      setVouchersLoading(false);
    }
  }, [tenantSlug, voucherPage, voucherPlan, voucherQuery, voucherStatus]);

  useEffect(() => {
    void loadStats();
    void loadPlans();
  }, [loadPlans, loadStats]);

  useEffect(() => {
    void loadVouchers();
  }, [loadVouchers]);

  useEffect(() => {
    setVoucherPage(1);
  }, [voucherQuery, voucherStatus, voucherPlan]);

  useEffect(() => {
    const drafts: Record<string, { name: string; code: string; duration: string; price: string; active: boolean }> = {};
    for (const plan of plans) {
      drafts[plan.id] = {
        name: plan.name,
        code: plan.code,
        duration: String(plan.durationMinutes),
        price: String(plan.priceNgn),
        active: plan.active === 1,
      };
    }
    setPlanDrafts(drafts);
    if (!newVoucherPackageId && plans.length > 0) setNewVoucherPackageId(plans[0].id);
  }, [plans, newVoucherPackageId]);

  const voucherTotals = useMemo(() => {
    return (stats?.voucherPool ?? []).reduce(
      (acc, item) => {
        acc.total += item.total;
        acc.unused += item.unused;
        acc.assigned += item.assigned;
        return acc;
      },
      { total: 0, unused: 0, assigned: 0 },
    );
  }, [stats]);

  async function refreshAll() {
    await Promise.all([loadStats(), loadPlans(), loadVouchers()]);
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    const duration = Number.parseInt(newPlanDuration, 10);
    const price = Number.parseFloat(newPlanPrice);
    if (!newPlanCode.trim() || !newPlanName.trim() || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(price) || price < 0) {
      setPlansError("Provide valid plan code, name, duration, and price.");
      return;
    }
    setCreatingPlan(true);
    setPlansError(null);
    setPlanNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newPlanCode.trim(),
          name: newPlanName.trim(),
          durationMinutes: duration,
          priceNgn: Math.round(price),
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to create plan.");
      setPlanNotice("Plan created.");
      setNewPlanCode("");
      setNewPlanName("");
      setNewPlanDuration("");
      setNewPlanPrice("");
      await Promise.all([loadPlans(), loadStats()]);
    } catch (error) {
      setPlansError(error instanceof Error ? error.message : "Unable to create plan.");
    } finally {
      setCreatingPlan(false);
    }
  }

  async function savePlan(plan: PlanRow) {
    const draft = planDrafts[plan.id];
    if (!draft) return;
    const duration = Number.parseInt(draft.duration, 10);
    const price = Number.parseFloat(draft.price);
    if (!draft.name.trim() || !draft.code.trim() || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(price) || price < 0) {
      setPlansError(`Invalid values for ${plan.name}.`);
      return;
    }
    setSavingPlanIds((prev) => ({ ...prev, [plan.id]: true }));
    setPlansError(null);
    setPlanNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          name: draft.name.trim(),
          code: draft.code.trim(),
          durationMinutes: duration,
          priceNgn: Math.round(price),
          active: draft.active,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save plan.");
      setPlanNotice(`Saved ${draft.name}.`);
      await Promise.all([loadPlans(), loadStats(), loadVouchers()]);
    } catch (error) {
      setPlansError(error instanceof Error ? error.message : "Unable to save plan.");
    } finally {
      setSavingPlanIds((prev) => ({ ...prev, [plan.id]: false }));
    }
  }

  async function createVoucher(event: React.FormEvent) {
    event.preventDefault();
    if (!newVoucherCode.trim() || !newVoucherPackageId) {
      setVouchersError("Voucher code and plan are required.");
      return;
    }
    setCreatingVoucher(true);
    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherCode: newVoucherCode.trim(),
          packageId: newVoucherPackageId,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to create voucher.");
      setVoucherNotice("Voucher created.");
      setNewVoucherCode("");
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to create voucher.");
    } finally {
      setCreatingVoucher(false);
    }
  }

  async function reclaimSelected() {
    if (selectedVoucherIds.length === 0) return;
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherIds: selectedVoucherIds, status: "UNUSED" }),
      });
      const data = await readJsonResponse<{ error?: string; updated?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to reclaim vouchers.");
      setVoucherNotice(`Reclaimed ${data?.updated ?? 0} voucher(s).`);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to reclaim vouchers.");
    }
  }

  async function deleteSelected() {
    if (selectedVoucherIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedVoucherIds.length} selected voucher(s)?`);
    if (!ok) return;
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherIds: selectedVoucherIds }),
      });
      const data = await readJsonResponse<{ error?: string; deleted?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to delete vouchers.");
      setVoucherNotice(`Deleted ${data?.deleted ?? 0} voucher(s).`);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to delete vouchers.");
    }
  }

  async function importCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile) {
      setImportError("Choose a CSV file.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      if (importPackageCode.trim()) form.append("packageCode", importPackageCode.trim());
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, { method: "POST", body: form });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        duplicates?: number;
        skipped?: number;
        packagesCreated?: number;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Import failed.");
      setImportNotice(
        `Imported ${data?.imported ?? 0} | Duplicates ${data?.duplicates ?? 0} | Skipped ${data?.skipped ?? 0} | Plans created ${data?.packagesCreated ?? 0}`,
      );
      setCsvFile(null);
      setImportPackageCode("");
      await refreshAll();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="section-title">Overview</h2>
            <p className="mt-1 text-sm text-slate-600">Live business metrics and inventory health.</p>
          </div>
          <Button type="button" variant="outline" onClick={refreshAll} disabled={statsLoading || plansLoading || vouchersLoading}>
            Refresh all
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Revenue" value={money(stats?.transactions.revenueNgn ?? 0)} />
          <StatTile label="Successful payments" value={String(stats?.transactions.success ?? 0)} />
          <StatTile label="Total vouchers" value={String(voucherTotals.total)} />
          <StatTile label="Unused vouchers" value={String(voucherTotals.unused)} />
          <StatTile label="Assigned vouchers" value={String(voucherTotals.assigned)} />
        </div>
        {statsError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Stats failed</AlertTitle>
            <AlertDescription>{statsError}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section id="ops-plans" className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <h2 className="section-title">Plans</h2>
          <form id="ops-plan-create" className="grid gap-2 sm:grid-cols-4 md:grid-cols-5" onSubmit={createPlan}>
            <Input value={newPlanCode} onChange={(event) => setNewPlanCode(event.target.value)} placeholder="Code" />
            <Input value={newPlanName} onChange={(event) => setNewPlanName(event.target.value)} placeholder="Name" />
            <Input value={newPlanDuration} inputMode="numeric" onChange={(event) => setNewPlanDuration(event.target.value)} placeholder="Minutes" />
            <Input value={newPlanPrice} inputMode="numeric" onChange={(event) => setNewPlanPrice(event.target.value)} placeholder="Price (NGN)" />
            <Button type="submit" disabled={creatingPlan}>
              {creatingPlan ? "Creating..." : "Add plan"}
            </Button>
          </form>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Minutes</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Unused</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const draft = planDrafts[plan.id];
                if (!draft) return null;
                return (
                  <tr key={plan.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Input value={draft.code} onChange={(event) => setPlanDrafts((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], code: event.target.value } }))} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.name} onChange={(event) => setPlanDrafts((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], name: event.target.value } }))} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.duration} inputMode="numeric" onChange={(event) => setPlanDrafts((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], duration: event.target.value } }))} />
                    </td>
                    <td className="px-3 py-2">
                      <Input value={draft.price} inputMode="numeric" onChange={(event) => setPlanDrafts((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], price: event.target.value } }))} />
                    </td>
                    <td className="px-3 py-2">{plan.unusedCount}</td>
                    <td className="px-3 py-2">{plan.assignedCount}</td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={draft.active} onChange={(event) => setPlanDrafts((prev) => ({ ...prev, [plan.id]: { ...prev[plan.id], active: event.target.checked } }))} />
                    </td>
                    <td className="px-3 py-2">
                      <Button type="button" size="sm" onClick={() => savePlan(plan)} disabled={savingPlanIds[plan.id]}>
                        {savingPlanIds[plan.id] ? "Saving..." : "Save"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {plans.length === 0 && !plansLoading ? <p className="p-4 text-sm text-slate-600">No plans available.</p> : null}
        </div>

        {plansError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Plan action failed</AlertTitle>
            <AlertDescription>{plansError}</AlertDescription>
          </Alert>
        ) : null}
        {planNotice ? (
          <Alert className="mt-4">
            <AlertTitle>Plan update</AlertTitle>
            <AlertDescription>{planNotice}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section id="ops-vouchers" className="panel-surface">
        <h2 className="section-title">Vouchers</h2>
        <p className="mt-1 text-sm text-slate-600">Search and manage voucher codes in one table.</p>

        <details className="mt-4 rounded-xl border border-slate-200/80 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Add voucher code</summary>
          <form id="ops-voucher-create" className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={createVoucher}>
            <Input value={newVoucherCode} onChange={(event) => setNewVoucherCode(event.target.value)} placeholder="Voucher code" />
            <select value={newVoucherPackageId} onChange={(event) => setNewVoucherPackageId(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={creatingVoucher}>
              {creatingVoucher ? "Adding..." : "Add voucher"}
            </Button>
          </form>
        </details>

        <details id="ops-import" className="mt-3 rounded-xl border border-slate-200/80 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Import CSV vouchers</summary>
          <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={importCsv}>
            <Input type="file" accept=".csv,text/csv" onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)} />
            <Input value={importPackageCode} onChange={(event) => setImportPackageCode(event.target.value)} placeholder="Optional forced plan code" />
            <Button type="submit" disabled={importLoading}>
              {importLoading ? "Importing..." : "Import"}
            </Button>
          </form>
        </details>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_170px_170px_auto]">
          <Input placeholder="Search voucher, plan, or email" value={voucherQuery} onChange={(event) => setVoucherQuery(event.target.value)} />
          <select value={voucherStatus} onChange={(event) => setVoucherStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="UNUSED">Unused</option>
            <option value="ASSIGNED">Assigned</option>
          </select>
          <select value={voucherPlan} onChange={(event) => setVoucherPlan(event.target.value)}>
            <option value="all">All plans</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={loadVouchers} disabled={vouchersLoading}>
            {vouchersLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned email</th>
                <th className="px-3 py-2">Assigned phone</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedVoucherIds.includes(row.id)}
                      onChange={(event) =>
                        setSelectedVoucherIds((prev) =>
                          event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{row.voucherCode}</td>
                  <td className="px-3 py-2">{row.packageName}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${row.status === "UNUSED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.assignedToEmail || "-"}</td>
                  <td className="px-3 py-2">{row.assignedToPhone || "-"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{dt(row.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{dt(row.assignedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {vouchers.length === 0 && !vouchersLoading ? <p className="p-4 text-sm text-slate-600">No vouchers found.</p> : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            Showing {vouchers.length} / {voucherTotal} | Selected {selectedVoucherIds.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={reclaimSelected} disabled={selectedVoucherIds.length === 0}>
              Reclaim
            </Button>
            <Button type="button" variant="destructive" onClick={deleteSelected} disabled={selectedVoucherIds.length === 0}>
              Delete
            </Button>
            <Button type="button" variant="outline" onClick={() => setVoucherPage((prev) => Math.max(1, prev - 1))} disabled={voucherPage <= 1}>
              Prev
            </Button>
            <span className="text-xs text-slate-600">
              {voucherPage} / {voucherTotalPages}
            </span>
            <Button type="button" variant="outline" onClick={() => setVoucherPage((prev) => Math.min(voucherTotalPages, prev + 1))} disabled={voucherPage >= voucherTotalPages}>
              Next
            </Button>
          </div>
        </div>

        {vouchersError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Voucher action failed</AlertTitle>
            <AlertDescription>{vouchersError}</AlertDescription>
          </Alert>
        ) : null}
        {voucherNotice ? (
          <Alert className="mt-4">
            <AlertTitle>Voucher update</AlertTitle>
            <AlertDescription>{voucherNotice}</AlertDescription>
          </Alert>
        ) : null}
        {importError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Import failed</AlertTitle>
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        ) : null}
        {importNotice ? (
          <Alert className="mt-4">
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>{importNotice}</AlertDescription>
          </Alert>
        ) : null}
      </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-kpi">
      <p className="dashboard-kpi-label">{label}</p>
      <p className="dashboard-kpi-value">{value}</p>
    </div>
  );
}
