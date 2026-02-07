"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";

type Props = {
  tenantSlug: string;
  requirePasswordChange: boolean;
  requirePaystackKey: boolean;
};

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export function TenantSetupPanel({
  tenantSlug,
  requirePasswordChange,
  requirePaystackKey,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paystackSecretKey, setPaystackSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (requirePasswordChange) {
      if (!newPassword || !confirmPassword) return false;
      if (newPassword !== confirmPassword) return false;
      if (validatePassword(newPassword)) return false;
    }
    if (requirePaystackKey) {
      if (paystackSecretKey.trim().length < 10) return false;
    }
    return true;
  }, [loading, requirePasswordChange, requirePaystackKey, newPassword, confirmPassword, paystackSecretKey]);

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
    <Card className="border-white/60 bg-white/70 shadow-[0_30px_80px_rgba(15,23,42,0.15)] backdrop-blur">
      <CardHeader className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
          Required setup
        </p>
        <CardTitle className="text-base">Finish setup</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
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
          {requirePasswordChange ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  className="h-11"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
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
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                onChange={(e) => setPaystackSecretKey(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                We keep this secure. Required to receive payouts.
              </p>
            </div>
          ) : null}

          <Button type="submit" className="h-12" disabled={!canSubmit}>
            {loading ? "Saving..." : "Complete setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
