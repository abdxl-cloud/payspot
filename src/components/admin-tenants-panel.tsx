"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { readJsonResponse } from "@/lib/http";

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

const COMMON_STATUSES = ["active", "pending", "inactive", "suspended"];

export function AdminTenantsPanel() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createResult, setCreateResult] = useState<string | null>(null);

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

    setCreateResult(null);
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
      if (!data?.tenant || !data.credentials) {
        throw new Error("Unable to create tenant.");
      }

      const creds = data.credentials;
      setCreateResult(
        `Created tenant "${data.tenant.slug}". Email: ${creds.email} | Temp password: ${creds.temporaryPassword} | mailSent: ${creds.mailSent}`,
      );

      setNewSlug("");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(tenantId: string, patch: Partial<TenantDto>) {
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
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to update tenant.");
      await loadTenants();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
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
      if (!data?.temporaryPassword) {
        throw new Error("Unable to reset password.");
      }
      setCreateResult(
        `Password reset. Temp password: ${data.temporaryPassword} | mailSent: ${data.mailSent}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total tenants" value={String(tenantStats.total)} />
        <StatTile label="Active" value={String(tenantStats.active)} />
        <StatTile label="Pending" value={String(tenantStats.pending)} />
        <StatTile label="Paystack configured" value={String(tenantStats.configuredPayments)} />
      </div>

      <section id="tenant-provisioning" className="panel-surface">
        <p className="section-kicker">Tenant provisioning</p>
        <h2 className="section-title mt-1">Create tenant workspace</h2>

        <div className="mt-4 grid gap-4">
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Action failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {createResult ? (
            <Alert>
              <AlertTitle>Result</AlertTitle>
              <AlertDescription className="break-words">{createResult}</AlertDescription>
            </Alert>
          ) : null}

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleCreate}>
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                className="h-11"
                placeholder="walstreet"
                value={newSlug}
                onChange={(event) => setNewSlug(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                className="h-11"
                placeholder="Walstreet Lounge"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="email">Tenant email</Label>
              <Input
                id="email"
                type="email"
                className="h-11"
                placeholder="tenant@company.com"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="password">Temporary password (optional)</Label>
              <Input
                id="password"
                type="text"
                className="h-11"
                placeholder="leave blank to auto-generate"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <Button type="submit" className="h-11 sm:col-span-2" disabled={!canCreate}>
              {loading ? "Working..." : "Create tenant"}
            </Button>
          </form>
        </div>
      </section>

      <Separator />

      <section id="tenant-directory" className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="section-kicker">Tenant directory</p>
            <h2 className="section-title mt-1">Manage tenants ({filteredTenants.length})</h2>
          </div>
          <Button variant="outline" onClick={loadTenants} disabled={loading} className="h-10" type="button">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px]">
          <Input
            placeholder="Search by slug, name, or email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <select className="w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Array.from(new Set(tenants.map((tenant) => tenant.status.toLowerCase()))).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {lastRefreshedAt ? `Last synced ${lastRefreshedAt.toLocaleTimeString()}` : "No sync yet"}
        </p>

        <div className="mt-4 grid gap-4">
          {filteredTenants.length === 0 ? (
            <p className="text-sm text-slate-600">
              {loading ? "Loading..." : "No tenants match your filters."}
            </p>
          ) : (
            filteredTenants.map((tenant) => (
              <TenantRow
                key={tenant.id}
                tenant={tenant}
                disabled={loading}
                onUpdate={(patch) => handleUpdate(tenant.id, patch)}
                onDelete={() => handleDelete(tenant.id)}
                onResetPassword={() => handleResetPassword(tenant.id)}
              />
            ))
          )}
        </div>
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

function TenantRow(props: {
  tenant: TenantDto;
  disabled: boolean;
  onUpdate: (patch: Partial<TenantDto>) => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  const [slug, setSlug] = useState(props.tenant.slug);
  const [name, setName] = useState(props.tenant.name);
  const [adminEmail, setAdminEmail] = useState(props.tenant.adminEmail);
  const [status, setStatus] = useState(props.tenant.status);

  const statusOptions = useMemo(() => {
    const normalized = props.tenant.status.toLowerCase();
    if (COMMON_STATUSES.includes(normalized)) return COMMON_STATUSES;
    return [...COMMON_STATUSES, normalized];
  }, [props.tenant.status]);

  const dirty =
    slug !== props.tenant.slug ||
    name !== props.tenant.name ||
    adminEmail !== props.tenant.adminEmail ||
    status !== props.tenant.status;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Slug</Label>
            <Input className="h-10" value={slug} onChange={(event) => setSlug(event.target.value)} disabled={props.disabled} />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input className="h-10" value={name} onChange={(event) => setName(event.target.value)} disabled={props.disabled} />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Admin email</Label>
            <Input className="h-10" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} disabled={props.disabled} />
          </div>
          <div className="grid gap-2 sm:col-span-2 md:grid-cols-[180px_1fr] md:items-end">
            <div className="grid gap-2">
              <Label>Status</Label>
              <select className="h-10 w-full" value={status.toLowerCase()} onChange={(event) => setStatus(event.target.value)} disabled={props.disabled}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Portal: <span className="font-mono">/t/{slug || props.tenant.slug}</span> | Paystack: {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "not set"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
          <Button className="h-10" onClick={() => props.onUpdate({ slug, name, adminEmail, status })} disabled={props.disabled || !dirty}>
            Save changes
          </Button>
          <Button variant="outline" className="h-10" onClick={props.onResetPassword} disabled={props.disabled}>
            Reset password
          </Button>
          <Button variant="destructive" className="h-10" onClick={props.onDelete} disabled={props.disabled}>
            Delete tenant
          </Button>
        </div>
      </div>
    </div>
  );
}
