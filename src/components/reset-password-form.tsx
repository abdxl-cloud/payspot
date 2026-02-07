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
    <Card className="border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
      <CardContent className="pt-8">
        {error ? (
          <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
            <AlertTitle className="font-semibold">Reset failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert className="mb-6 border-primary/40 bg-primary/5">
            <AlertTitle className="font-semibold text-primary">Password updated</AlertTitle>
            <AlertDescription className="text-primary/80">{success}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="newPassword" className="font-semibold text-sm">
              New password
            </Label>
            <Input
              id="newPassword"
              type="password"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-foreground/60">
              At least 8 characters, with upper/lowercase and a number
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword" className="font-semibold text-sm">
              Confirm password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {passwordError ? (
            <p className="text-sm font-medium text-destructive">{passwordError}</p>
          ) : null}
          {mismatch ? <p className="text-sm font-medium text-destructive">{mismatch}</p> : null}

          <Button 
            type="submit" 
            className="h-12 rounded-lg font-semibold mt-2 bg-primary hover:bg-primary/90 text-primary-foreground w-full"
            disabled={!canSubmit}
          >
            {loading ? "Saving..." : "Set new password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

