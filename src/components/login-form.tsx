"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { KeyRound, Mail, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const data = await readJsonResponse<{ error?: string; redirectTo?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Login failed.");
      }
      window.location.href = data?.redirectTo || "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        {/* Logo */}
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Wifi className="size-7 text-primary" />
        </div>
        <p className="section-kicker">Admin Access</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Sign in to PaySpot
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your credentials to access the dashboard
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Login failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                className="pl-12"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                className="pl-12"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            href="/forgot-password"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
