"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type TenantUpdatePayload = Partial<TenantDto> & {
  paystackSecretKey?: string;
};

const COMMON_STATUSES = ["active", "pending", "inactive", "suspended"];

export function AdminTenantsPanel() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");

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
      const matchStatus = statusFilter === "all" || tenant.status.toLowerCase() === statusFilter.toLowerCase();
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
        `Created "${data.tenant.slug}" | Email: ${creds.email} | Temp password: ${creds.temporaryPassword} | mailSent: ${creds.mailSent}`,
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

  return (
    <div className="grid gap-5">
      <section className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="section-title">Overview</h2>
            <p className="mt-1 text-sm text-slate-600">Tenant footprint and platform readiness.</p>
          </div>
          <Button variant="outline" onClick={loadTenants} disabled={loading} type="button">
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Total tenants" value={String(tenantStats.total)} />
          <StatTile label="Active" value={String(tenantStats.active)} />
          <StatTile label="Pending" value={String(tenantStats.pending)} />
          <StatTile label="Paystack configured" value={String(tenantStats.configuredPayments)} />
        </div>

        <p className="mt-3 text-xs text-slate-500">
          {lastRefreshedAt ? `Last synced ${lastRefreshedAt.toLocaleTimeString()}` : "No sync yet"}
        </p>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {notice ? (
          <Alert className="mt-4">
            <AlertTitle>Update</AlertTitle>
            <AlertDescription className="break-words">{notice}</AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section id="tenant-provisioning" className="panel-surface">
        <h2 className="section-title">Create Tenant</h2>
        <form className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" onSubmit={handleCreate}>
          <Input placeholder="Slug" value={newSlug} onChange={(event) => setNewSlug(event.target.value)} required />
          <Input placeholder="Name" value={newName} onChange={(event) => setNewName(event.target.value)} required />
          <Input type="email" placeholder="Admin email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
          <Input type="text" placeholder="Temp password (optional)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          <Button type="submit" disabled={!canCreate}>{loading ? "Working..." : "Create"}</Button>
        </form>
      </section>

      <section id="tenant-directory" className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <Input placeholder="Search by slug, name, email" value={query} onChange={(event) => setQuery(event.target.value)} />
          <select className="w-full" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Array.from(new Set(tenants.map((tenant) => tenant.status.toLowerCase()))).map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200/80 bg-white">
          <table className="w-full min-w-[1300px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.06em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Admin email</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Paystack</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-600" colSpan={7}>
                    {loading ? "Loading..." : "No tenants match your filters."}
                  </td>
                </tr>
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
            </tbody>
          </table>
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
  onUpdate: (patch: TenantUpdatePayload) => void;
  onDelete: () => void;
  onResetPassword: () => void;
}) {
  const [slug, setSlug] = useState(props.tenant.slug);
  const [name, setName] = useState(props.tenant.name);
  const [adminEmail, setAdminEmail] = useState(props.tenant.adminEmail);
  const [status, setStatus] = useState(props.tenant.status);
  const [paystackSecretKey, setPaystackSecretKey] = useState("");

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
  const paystackDirty = paystackSecretKey.trim().length >= 10;

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2 align-top">
        <Input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={props.disabled} />
      </td>
      <td className="px-3 py-2 align-top">
        <Input value={name} onChange={(event) => setName(event.target.value)} disabled={props.disabled} />
      </td>
      <td className="px-3 py-2 align-top">
        <Input value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} disabled={props.disabled} />
      </td>
      <td className="px-3 py-2 align-top">
        <select className="h-10 w-full" value={status.toLowerCase()} onChange={(event) => setStatus(event.target.value)} disabled={props.disabled}>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="grid gap-2">
          <div className="text-xs text-slate-600">{props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "not set"}</div>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="sk_live_..."
              value={paystackSecretKey}
              onChange={(event) => setPaystackSecretKey(event.target.value)}
              disabled={props.disabled}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                props.onUpdate({ paystackSecretKey: paystackSecretKey.trim() });
                setPaystackSecretKey("");
              }}
              disabled={props.disabled || !paystackDirty}
            >
              Update
            </Button>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top text-xs text-slate-600">{new Date(props.tenant.updatedAt).toLocaleString()}</td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => props.onUpdate({ slug, name, adminEmail, status })} disabled={props.disabled || !dirty}>
            Save
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={props.onResetPassword} disabled={props.disabled}>
            Reset password
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={props.onDelete} disabled={props.disabled}>
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
