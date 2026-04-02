"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <Card className="w-full">
      <CardHeader className="text-center">
        {/* Icon */}
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Mail className="size-7 text-primary" />
        </div>
        <p className="section-kicker">Account Recovery</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter your email and we will send you a reset link
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert variant="success">
            <AlertTitle>Check your inbox</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
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

          <Button type="submit" className="w-full" size="lg" disabled={!canSubmit}>
            {loading ? (
              "Sending..."
            ) : (
              <>
                <Send className="size-4" />
                Send reset link
              </>
            )}
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
