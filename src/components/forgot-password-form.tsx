"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Request failed.");
      }
      setSuccess("If an account exists for that email, we sent a reset link.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
      <CardContent className="pt-8">
        {error ? (
          <Alert variant="destructive" className="mb-6 border-destructive/40 bg-destructive/5">
            <AlertTitle className="font-semibold">Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert className="mb-6 border-primary/40 bg-primary/5">
            <AlertTitle className="font-semibold text-primary">Check your inbox</AlertTitle>
            <AlertDescription className="text-primary/80">{success}</AlertDescription>
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

          <Button 
            type="submit" 
            className="h-12 rounded-lg font-semibold mt-2 bg-primary hover:bg-primary/90 text-primary-foreground w-full"
            disabled={!canSubmit}
          >
            {loading ? "Sending..." : "Send reset link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

