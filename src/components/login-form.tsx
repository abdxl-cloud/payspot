"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/http";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return email.trim().includes("@") && password.length >= 1 && !loading;
  }, [email, password, loading]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await readJsonResponse<{ error?: string; redirectTo?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Login failed.");
      window.location.href = data?.redirectTo || "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <div className="lf-wrap">
      <div className="lf-title">Welcome back</div>
      <div className="lf-sub">Sign in to your operator dashboard</div>
      <form className="lf-card" onSubmit={handleSubmit}>
        {error ? <div className="lf-error">{error}</div> : null}
        <div className="field">
          <label htmlFor="loginEmail">Email address</label>
          <input id="loginEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="walstreet@example.com" required />
        </div>
        <div className="field login-password-field">
          <div className="lf-row">
            <label htmlFor="loginPassword">Password</label>
            <Link className="lf-forgot" href="/forgot-password">Forgot?</Link>
          </div>
          <input id="loginPassword" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="************" required />
        </div>
        <button className="lf-submit" type="submit" disabled={!canSubmit}>
          {loading ? "Signing in..." : "Sign In ->"}
        </button>
      </form>
      <div className="lf-footer">
        Need access? <Link href="/#request-access">Request an account</Link>
      </div>
    </div>
  );
}
