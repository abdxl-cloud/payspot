"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Login failed.");
      }
      window.location.href = data.redirectTo || "/admin";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <Card className="border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
      <CardContent className="pt-8">
        {error ? (
          <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
            <AlertTitle className="font-semibold">Login failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="email" className="font-semibold text-sm">
              Email address
            </Label>
            <Input
              id="email"
              type="email"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="font-semibold text-sm">
                Password
              </Label>
              <Link 
                href="/forgot-password" 
                className="text-xs text-primary hover:text-primary/80 font-semibold transition"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button 
            type="submit" 
            className="h-12 rounded-lg font-semibold mt-2 bg-primary hover:bg-primary/90 text-primary-foreground w-full"
            disabled={!canSubmit}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
