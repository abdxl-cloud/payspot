"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/http";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().includes("@") && !loading;
  }, [email, loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Request failed.");
      setSuccess("If an account exists for that email, we sent a reset link.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <p className="section-kicker">Account recovery</p>
      <h2 className="auth-card-title">Send reset link</h2>
      <p className="auth-card-sub">Enter your admin email and we&apos;ll send a secure link if an account exists.</p>

      {error ? <div className="auth-card-error">{error}</div> : null}
      {success ? <div className="auth-card-success">{success}</div> : null}

      <form className="auth-card-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="fpEmail">Email address</label>
          <input
            id="fpEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            required
          />
        </div>
        <button className="auth-card-submit" type="submit" disabled={!canSubmit}>
          {loading ? "Sending..." : "Send reset link →"}
        </button>
      </form>

      <p className="auth-card-footer">
        <Link href="/login">← Back to sign in</Link>
      </p>
    </>
  );
}
