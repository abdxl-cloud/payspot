"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, KeyRound, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readJsonResponse } from "@/lib/http";

type Props = {
  token: string;
};

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export function ResetPasswordForm({ token }: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!newPassword || !confirmPassword) return false;
    if (newPassword !== confirmPassword) return false;
    if (validatePassword(newPassword)) return false;
    return true;
  }, [loading, newPassword, confirmPassword]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/reset-password/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Reset failed.");
      }
      setSuccess("Password updated. Redirecting to login...");
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  const passwordError = newPassword ? validatePassword(newPassword) : null;
  const mismatch =
    newPassword && confirmPassword && newPassword !== confirmPassword
      ? "Passwords do not match."
      : null;

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        {/* Icon */}
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Lock className="size-7 text-primary" />
        </div>
        <p className="section-kicker">Security</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Set a new password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a strong password for your account
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Reset failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <AlertTitle>Password updated</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="newPassword"
                type="password"
                className="pl-12"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              At least 8 characters with upper/lowercase and a number.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                className="pl-12"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
          </div>

          {passwordError && (
            <p className="text-sm text-[var(--status-danger)]">{passwordError}</p>
          )}
          {mismatch && (
            <p className="text-sm text-[var(--status-danger)]">{mismatch}</p>
          )}

          <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
            {loading ? "Saving..." : "Set new password"}
          </Button>
        </form>

        <p className="text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ArrowLeft className="size-4" />
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
