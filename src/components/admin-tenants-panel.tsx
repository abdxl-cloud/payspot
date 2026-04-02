"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CreditCard,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (normalized === "active") {
    return <Badge variant="success">Active</Badge>;
  }
  if (normalized === "pending") {
    return <Badge variant="warning">Pending</Badge>;
  }
  if (normalized === "suspended") {
    return <Badge variant="danger">Suspended</Badge>;
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
      <div className="space-y-4 sm:space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total Tenants"
            value={tenantStats.total}
          />
          <StatCard
            icon={Building2}
            label="Active"
            value={tenantStats.active}
            variant="success"
          />
          <StatCard
            icon={Building2}
            label="Pending"
            value={tenantStats.pending}
            variant="warning"
          />
          <StatCard
            icon={CreditCard}
            label="Payments Configured"
            value={tenantStats.configuredPayments}
          />
        </div>

        {/* Last sync */}
        <p className="text-xs text-muted-foreground">
          {lastRefreshedAt ? `Last synced ${lastRefreshedAt.toLocaleTimeString()}` : "No sync yet"}
        </p>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert variant="success">
            <AlertTitle>Update</AlertTitle>
            <AlertDescription className="break-words font-mono text-xs">{notice}</AlertDescription>
          </Alert>
        )}

        {/* Tenant Directory */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="size-5 text-primary" />
                <CardTitle>Tenant Directory</CardTitle>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadTenants}
                  disabled={loading}
                >
                  <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
                <Button size="sm" onClick={() => setShowCreateModal(true)}>
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Add Tenant</span>
                </Button>
              </div>
            </div>

            {/* Search & Filter */}
            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by slug, name, email..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="pl-11"
                />
              </div>
              <select
                className="w-full"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All statuses</option>
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Showing {filteredTenants.length} of {tenants.length} tenants
            </p>
          </CardHeader>

          <CardContent>
            {/* Mobile Cards */}
            <div className="space-y-3 lg:hidden">
              {filteredTenants.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Building2 className="size-6" />
                  </div>
                  <p className="empty-state-title">
                    {loading ? "Loading tenants..." : "No tenants found"}
                  </p>
                  <p className="empty-state-description">
                    {loading ? "Please wait..." : "Try adjusting your search or filters."}
                  </p>
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

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto rounded-xl border border-border/50 lg:block">
              <table className="w-full min-w-[800px] text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Tenant</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Paystack</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
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
          </CardContent>
        </Card>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <ModalShell title="Create Tenant" onClose={() => setShowCreateModal(false)}>
          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="new-slug">Slug</Label>
              <Input
                id="new-slug"
                placeholder="e.g. coffee-shop"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                placeholder="e.g. Coffee Shop WiFi"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-email">Admin Email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="admin@example.com"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Temporary Password (optional)</Label>
              <Input
                id="new-password"
                type="text"
                placeholder="Leave blank to auto-generate"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canCreate}>
                {loading ? "Creating..." : "Create Tenant"}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* Edit Modal */}
      {editingTenant && (
        <ModalShell title={`Edit ${editingTenant.name}`} onClose={() => setEditingTenant(null)}>
          <form className="space-y-4" onSubmit={saveEdit}>
            <div className="space-y-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={editSlug}
                onChange={(event) => setEditSlug(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Admin Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editEmail}
                onChange={(event) => setEditEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select
                id="edit-status"
                className="w-full"
                value={editStatus}
                onChange={(event) => setEditStatus(event.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-paystack">Paystack Secret Key</Label>
              <div className="rounded-xl border border-border/50 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  Current: {editingTenant.paystackLast4 ? `****${editingTenant.paystackLast4}` : "Not set"}
                </p>
                <Input
                  id="edit-paystack"
                  type="password"
                  className="mt-2"
                  placeholder="sk_test_... or sk_live_..."
                  value={editPaystackSecretKey}
                  onChange={(event) => setEditPaystackSecretKey(event.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditingTenant(null)} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSaveEdit}>
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </ModalShell>
      )}
    </>
  );
}

/* ===== Stat Card ===== */
function StatCard({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  variant?: "success" | "warning";
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-3">
        <div
          className={`stat-card-icon ${
            variant === "success"
              ? "bg-[var(--status-success-soft)] text-[var(--status-success)]"
              : variant === "warning"
                ? "bg-[var(--status-warning-soft)] text-[var(--status-warning)]"
                : ""
          }`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="stat-card-label">{label}</p>
          <p className="stat-card-value">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ===== Tenant Row (Desktop) ===== */
function TenantRow(props: {
  tenant: TenantDto;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{props.tenant.name}</p>
        <p className="text-xs text-muted-foreground">/{props.tenant.slug}</p>
        <p className="text-xs text-muted-foreground">{props.tenant.adminEmail}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={props.tenant.status} />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "Not set"}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {new Date(props.tenant.updatedAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={props.onEdit}
            disabled={props.disabled}
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="outline"
            onClick={props.onResetPassword}
            disabled={props.disabled}
            title="Reset Password"
          >
            <KeyRound className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="destructive"
            onClick={props.onDelete}
            disabled={props.disabled}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* ===== Tenant Card (Mobile) ===== */
function TenantCard(props: {
  tenant: TenantDto;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  return (
    <div className="mobile-table-card">
      <div className="mobile-table-card-header">
        <div>
          <p className="mobile-table-card-title">{props.tenant.name}</p>
          <p className="text-xs text-muted-foreground">/{props.tenant.slug}</p>
        </div>
        <StatusBadge status={props.tenant.status} />
      </div>

      <div className="mobile-table-card-meta">
        <span>{props.tenant.adminEmail}</span>
        <span>
          Paystack: {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "Not set"}
        </span>
        <span>{new Date(props.tenant.updatedAt).toLocaleDateString()}</span>
      </div>

      <div className="mobile-table-card-actions">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={props.onEdit}
          disabled={props.disabled}
          className="flex-1"
        >
          <Pencil className="size-4" />
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={props.onResetPassword}
          disabled={props.disabled}
        >
          <KeyRound className="size-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          onClick={props.onDelete}
          disabled={props.disabled}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/* ===== Modal Shell ===== */
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border border-border/50 bg-card p-5 shadow-[var(--shadow-xl)] sm:rounded-3xl lg:max-w-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Handle for mobile */}
        <div className="mb-3 flex justify-center sm:hidden">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted tap-target"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
