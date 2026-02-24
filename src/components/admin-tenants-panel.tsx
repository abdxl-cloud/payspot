"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readJsonResponse } from "@/lib/http";
import { isPaystackSecretKey } from "@/lib/paystack-key";

type TenantDto = {
  id: string;
  slug: string;
  name: string;
  adminEmail: string;
  status: string;
  paystackLast4: string | null;
  createdAt: string;
  updatedAt: string;
};

type TenantUpdatePayload = Partial<TenantDto> & {
  paystackSecretKey?: string;
};

const COMMON_STATUSES = ["active", "pending", "inactive", "suspended"];

function statusBadge(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active") {
    return <Badge className="bg-emerald-700 text-white">Active</Badge>;
  }
  if (normalized === "pending") {
    return <Badge className="bg-amber-600 text-white">Pending</Badge>;
  }
  if (normalized === "suspended") {
    return <Badge variant="destructive">Suspended</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function AdminTenantsPanel() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [editingTenant, setEditingTenant] = useState<TenantDto | null>(null);
  const [editSlug, setEditSlug] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editPaystackSecretKey, setEditPaystackSecretKey] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const canCreate = useMemo(() => {
    return (
      newSlug.trim().length >= 2 &&
      newName.trim().length >= 2 &&
      newEmail.includes("@") &&
      !loading
    );
  }, [newSlug, newName, newEmail, loading]);

  const canSaveEdit = useMemo(() => {
    if (!editingTenant || loading) return false;
    if (editSlug.trim().length < 2) return false;
    if (editName.trim().length < 2) return false;
    if (!editEmail.includes("@")) return false;
    if (editPaystackSecretKey.trim().length > 0 && !isPaystackSecretKey(editPaystackSecretKey)) return false;

    const changed =
      editSlug.trim() !== editingTenant.slug ||
      editName.trim() !== editingTenant.name ||
      editEmail.trim() !== editingTenant.adminEmail ||
      editStatus.toLowerCase() !== editingTenant.status.toLowerCase() ||
      isPaystackSecretKey(editPaystackSecretKey);

    return changed;
  }, [editingTenant, loading, editSlug, editName, editEmail, editStatus, editPaystackSecretKey]);

  const tenantStats = useMemo(() => {
    const active = tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length;
    const pending = tenants.filter((tenant) => tenant.status.toLowerCase() === "pending").length;
    const configuredPayments = tenants.filter((tenant) => !!tenant.paystackLast4).length;
    return {
      total: tenants.length,
      active,
      pending,
      configuredPayments,
    };
  }, [tenants]);

  const filteredTenants = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const matchStatus =
        statusFilter === "all" || tenant.status.toLowerCase() === statusFilter.toLowerCase();
      if (!matchStatus) return false;
      if (!normalizedQuery) return true;
      return (
        tenant.slug.toLowerCase().includes(normalizedQuery) ||
        tenant.name.toLowerCase().includes(normalizedQuery) ||
        tenant.adminEmail.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [tenants, query, statusFilter]);

  async function loadTenants() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/tenants");
      const data = await readJsonResponse<{ error?: string; tenants?: TenantDto[] }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load tenants.");
      if (!data?.tenants) throw new Error("Unable to load tenants.");
      setTenants(data.tenants);
      setLastRefreshedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;

    setNotice(null);
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newSlug.trim(),
          name: newName.trim(),
          adminEmail: newEmail.trim(),
          password: newPassword.trim() ? newPassword.trim() : undefined,
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        tenant?: TenantDto;
        credentials?: {
          email: string;
          temporaryPassword: string;
          mailSent: boolean;
        };
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to create tenant.");
      if (!data?.tenant || !data.credentials) throw new Error("Unable to create tenant.");

      const creds = data.credentials;
      setNotice(
        `Created ${data.tenant.slug} | Email: ${creds.email} | Temp password: ${creds.temporaryPassword} | mailSent: ${creds.mailSent}`,
      );

      setNewSlug("");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setShowCreateModal(false);
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(tenantId: string, patch: TenantUpdatePayload) {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: patch.slug,
          name: patch.name,
          adminEmail: patch.adminEmail,
          status: patch.status,
          paystackSecretKey: patch.paystackSecretKey,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to update tenant.");
      setNotice("Tenant updated.");
      await loadTenants();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(tenantId: string) {
    const ok = window.confirm("Delete this tenant and ALL its data? This cannot be undone.");
    if (!ok) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: "DELETE",
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to delete tenant.");
      setNotice("Tenant deleted.");
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(tenantId: string) {
    const ok = window.confirm("Reset this tenant's password and email new login details?");
    if (!ok) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/reset-password`, {
        method: "POST",
      });
      const data = await readJsonResponse<{
        error?: string;
        temporaryPassword?: string;
        mailSent?: boolean;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to reset password.");
      if (!data?.temporaryPassword) throw new Error("Unable to reset password.");
      setNotice(`Password reset | Temp password: ${data.temporaryPassword} | mailSent: ${data.mailSent}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function openEditModal(tenant: TenantDto) {
    setEditingTenant(tenant);
    setEditSlug(tenant.slug);
    setEditName(tenant.name);
    setEditEmail(tenant.adminEmail);
    setEditStatus(tenant.status.toLowerCase());
    setEditPaystackSecretKey("");
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingTenant || !canSaveEdit) return;

    const saved = await handleUpdate(editingTenant.id, {
      slug: editSlug.trim(),
      name: editName.trim(),
      adminEmail: editEmail.trim(),
      status: editStatus,
      paystackSecretKey: editPaystackSecretKey.trim() ? editPaystackSecretKey.trim() : undefined,
    });

    if (saved) {
      setEditingTenant(null);
    }
  }

  const statusOptions = useMemo(() => {
    const fromData = tenants.map((tenant) => tenant.status.toLowerCase());
    return Array.from(new Set([...COMMON_STATUSES, ...fromData]));
  }, [tenants]);

  return (
    <>
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Total tenants" value={String(tenantStats.total)} />
          <StatTile label="Active" value={String(tenantStats.active)} />
          <StatTile label="Pending" value={String(tenantStats.pending)} />
          <StatTile label="Paystack configured" value={String(tenantStats.configuredPayments)} />
        </div>

        <p className="text-xs text-slate-500">
          {lastRefreshedAt ? `Last synced ${lastRefreshedAt.toLocaleTimeString()}` : "No sync yet"}
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert>
            <AlertTitle>Update</AlertTitle>
            <AlertDescription className="break-words">{notice}</AlertDescription>
          </Alert>
        ) : null}

        <section id="tenant-directory" className="panel-surface w-full max-w-full overflow-hidden rounded-lg">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="size-4 text-indigo-600" />
            <h2 className="text-base font-semibold text-slate-900">Tenant directory</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_200px] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by slug, name, email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search tenants"
                className="pl-9"
              />
            </div>
            <select
              className="w-full"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter tenants by status"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Showing {filteredTenants.length} of {tenants.length} tenants
          </p>

          <div className="mt-3 space-y-3 lg:hidden">
            {filteredTenants.length === 0 ? (
              <div className="rounded-xl border border-slate-200/85 bg-white p-4 text-sm text-slate-600">
                {loading ? "Loading tenants..." : "No tenants match your filters."}
              </div>
            ) : (
              filteredTenants.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  disabled={loading}
                  onEdit={() => openEditModal(tenant)}
                  onDelete={() => handleDelete(tenant.id)}
                  onResetPassword={() => handleResetPassword(tenant.id)}
                />
              ))
            )}
          </div>

          <div className="mt-3 hidden overflow-x-auto border border-slate-200/85 bg-white lg:block">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Paystack</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600" colSpan={5}>
                      {loading ? "Loading tenants..." : "No tenants match your filters."}
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((tenant) => (
                    <TenantRow
                      key={tenant.id}
                      tenant={tenant}
                      disabled={loading}
                      onEdit={() => openEditModal(tenant)}
                      onDelete={() => handleDelete(tenant.id)}
                      onResetPassword={() => handleResetPassword(tenant.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 lg:flex lg:flex-col lg:gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={loadTenants}
          disabled={loading}
          type="button"
          aria-label="Refresh tenants"
          className="bg-white shadow-[var(--shadow-sm)]"
        >
          <RefreshCw className={["size-4", loading ? "animate-spin" : ""].join(" ")} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          onClick={() => setShowCreateModal(true)}
          aria-label="Create tenant"
          className="bg-white shadow-[var(--shadow-sm)]"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2 lg:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={loadTenants}
          disabled={loading}
          type="button"
          aria-label="Refresh tenants"
          className="bg-white shadow-[var(--shadow-sm)]"
        >
          <RefreshCw className={["size-4", loading ? "animate-spin" : ""].join(" ")} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          type="button"
          onClick={() => setShowCreateModal(true)}
          aria-label="Create tenant"
          className="bg-white shadow-[var(--shadow-sm)]"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {showCreateModal ? (
        <ModalShell title="Create tenant" onClose={() => setShowCreateModal(false)}>
          <form className="grid gap-3" onSubmit={handleCreate}>
            <Input
              placeholder="Slug"
              value={newSlug}
              onChange={(event) => setNewSlug(event.target.value)}
              required
            />
            <Input
              placeholder="Name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              required
            />
            <Input
              type="email"
              placeholder="Admin email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              required
            />
            <Input
              type="text"
              placeholder="Temp password (optional)"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate}>
                {loading ? "Working..." : "Create tenant"}
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {editingTenant ? (
        <ModalShell title={`Edit ${editingTenant.name}`} onClose={() => setEditingTenant(null)}>
          <form className="grid gap-3" onSubmit={saveEdit}>
            <Input value={editSlug} onChange={(event) => setEditSlug(event.target.value)} required />
            <Input value={editName} onChange={(event) => setEditName(event.target.value)} required />
            <Input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} required />
            <select className="w-full" value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <div className="rounded-lg border border-slate-200/85 bg-slate-50 p-3">
              <p className="text-xs text-slate-600">
                Current Paystack key: {editingTenant.paystackLast4 ? `****${editingTenant.paystackLast4}` : "not set"}
              </p>
              <Input
                className="mt-2"
                type="password"
                placeholder="New Paystack secret (sk_test_... or sk_live_...)"
                value={editPaystackSecretKey}
                onChange={(event) => setEditPaystackSecretKey(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditingTenant(null)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSaveEdit}>
                Save changes
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/85 bg-slate-50/80 px-3 py-2.5">
      <p className="dashboard-kpi-label">{label}</p>
      <p className="dashboard-kpi-value">{value}</p>
    </div>
  );
}

function TenantRow(props: {
  tenant: TenantDto;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2 align-top">
        <p className="font-semibold text-slate-900">{props.tenant.name}</p>
        <p className="text-xs text-slate-500">/{props.tenant.slug}</p>
        <p className="text-xs text-slate-500">{props.tenant.adminEmail}</p>
      </td>
      <td className="px-3 py-2 align-top">{statusBadge(props.tenant.status)}</td>
      <td className="px-3 py-2 align-top text-xs text-slate-600">
        {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "not set"}
      </td>
      <td className="px-3 py-2 align-top text-xs text-slate-600">
        {new Date(props.tenant.updatedAt).toLocaleString()}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={props.onEdit}
            disabled={props.disabled}
            aria-label="Edit tenant"
            title="Edit tenant"
            className="size-8"
          >
            <PencilLine className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={props.onResetPassword}
            disabled={props.disabled}
            aria-label="Reset tenant password"
            title="Reset tenant password"
            className="size-8"
          >
            <ShieldCheck className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={props.onDelete}
            disabled={props.disabled}
            aria-label="Delete tenant"
            title="Delete tenant"
            className="size-8"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function TenantCard(props: {
  tenant: TenantDto;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  return (
    <article className="rounded-xl border border-slate-200/85 bg-white p-4 shadow-[var(--shadow-sm)]">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{props.tenant.name}</p>
          <p className="text-xs text-slate-500">/{props.tenant.slug}</p>
        </div>
        {statusBadge(props.tenant.status)}
      </div>

      <p className="text-xs text-slate-500">{props.tenant.adminEmail}</p>
      <p className="mt-1 text-xs text-slate-500">
        Paystack: {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "not set"}
      </p>
      <p className="mt-1 text-xs text-slate-500">{new Date(props.tenant.updatedAt).toLocaleString()}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button type="button" size="sm" variant="outline" onClick={props.onEdit} disabled={props.disabled}>
          <PencilLine className="size-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={props.onResetPassword} disabled={props.disabled}>
          <ShieldCheck className="size-3.5" />
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={props.onDelete} disabled={props.disabled}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
