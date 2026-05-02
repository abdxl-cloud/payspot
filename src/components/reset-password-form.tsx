"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
      if (!response.ok) throw new Error(data?.error || "Reset failed.");
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
    <>
      <p className="section-kicker">Password update</p>
      <h2 className="auth-card-title">Set a new password</h2>
      <p className="auth-card-sub">Use a strong password — at least 8 characters with upper/lowercase and a number.</p>

      {error ? <div className="auth-card-error">{error}</div> : null}
      {success ? <div className="auth-card-success">{success}</div> : null}

      <form className="auth-card-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {passwordError ? <p className="auth-field-hint" style={{ color: "var(--red)" }}>{passwordError}</p> : null}
        </div>

        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {mismatch ? <p className="auth-field-hint" style={{ color: "var(--red)" }}>{mismatch}</p> : null}
        </div>

        <button className="auth-card-submit" type="submit" disabled={!canSubmit}>
          {loading ? "Saving..." : "Set new password →"}
        </button>
      </form>

      <p className="auth-card-footer">
        <Link href="/login">← Back to sign in</Link>
      </p>
    </>
  );
}
