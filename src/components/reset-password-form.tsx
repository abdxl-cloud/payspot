"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      const data = await response.json();
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
    <Card className="border border-border bg-card shadow-lg">
      <CardHeader className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Secure your account
        </p>
        <CardTitle className="text-2xl font-semibold">Create new password</CardTitle>
        <p className="text-sm text-muted-foreground">Choose a strong password to secure your account</p>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Reset failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="newPassword" className="text-sm font-medium">New password</Label>
            <Input
              id="newPassword"
              type="password"
              className="h-11"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Minimum 8 characters with uppercase, lowercase, and a number
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              className="h-11"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {passwordError ? (
            <p className="text-sm text-destructive">{passwordError}</p>
          ) : null}
          {mismatch ? <p className="text-sm text-destructive">{mismatch}</p> : null}

          <Button type="submit" className="h-12 w-full text-base font-semibold" disabled={!canSubmit}>
            {loading ? "Saving..." : "Update password"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            Back to login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

