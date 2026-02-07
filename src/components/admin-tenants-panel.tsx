"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

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

export function AdminTenantsPanel() {
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newSlug, setNewSlug] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createResult, setCreateResult] = useState<string | null>(null);

  const canCreate = useMemo(() => {
    return (
      newSlug.trim().length >= 2 &&
      newName.trim().length >= 2 &&
      newEmail.includes("@") &&
      !loading
    );
  }, [newSlug, newName, newEmail, loading]);

  async function loadTenants() {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/admin/tenants");
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to load tenants.");
      setTenants(data.tenants as TenantDto[]);
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
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to create tenant.");

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
      const data = await response.json();
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
      const data = await response.json();
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
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to reset password.");
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
    <div className="grid gap-6">
      <Card className="border-slate-200/70 bg-white/60 shadow-sm">
        <CardHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Create tenant
          </p>
          <CardTitle className="text-base">New tenant</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
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
                onChange={(e) => setNewSlug(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                className="h-11"
                placeholder="WALSTREET"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
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
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="password">Temp password (optional)</Label>
              <Input
                id="password"
                type="text"
                className="h-11"
                placeholder="leave blank to auto-generate"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 sm:col-span-2" disabled={!canCreate}>
              {loading ? "Working..." : "Create tenant"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-slate-200/70 bg-white/60 shadow-sm">
        <CardHeader className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Tenants
          </p>
          <CardTitle className="text-base">
            Manage tenants ({tenants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {tenants.length === 0 ? (
            <p className="text-sm text-slate-600">
              {loading ? "Loading..." : "No tenants found."}
            </p>
          ) : (
            <div className="grid gap-4">
              {tenants.map((t) => (
                <TenantRow
                  key={t.id}
                  tenant={t}
                  disabled={loading}
                  onUpdate={(patch) => handleUpdate(t.id, patch)}
                  onDelete={() => handleDelete(t.id)}
                  onResetPassword={() => handleResetPassword(t.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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

  const dirty =
    slug !== props.tenant.slug ||
    name !== props.tenant.name ||
    adminEmail !== props.tenant.adminEmail ||
    status !== props.tenant.status;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <div className="grid gap-2">
            <Label>Slug</Label>
            <Input
              className="h-10"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              className="h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Admin email</Label>
            <Input
              className="h-10"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              disabled={props.disabled}
            />
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>Status</Label>
            <Input
              className="h-10"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={props.disabled}
            />
            <p className="text-xs text-muted-foreground">
              Paystack: {props.tenant.paystackLast4 ? `****${props.tenant.paystackLast4}` : "not set"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
          <Button
            className="h-10"
            onClick={() => props.onUpdate({ slug, name, adminEmail, status })}
            disabled={props.disabled || !dirty}
          >
            Update
          </Button>
          <Button
            variant="outline"
            className="h-10"
            onClick={props.onResetPassword}
            disabled={props.disabled}
          >
            Reset password
          </Button>
          <Button
            variant="destructive"
            className="h-10"
            onClick={props.onDelete}
            disabled={props.disabled}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
