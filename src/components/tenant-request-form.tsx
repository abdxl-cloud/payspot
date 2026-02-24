"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Building2, Mail, ShieldCheck, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";

export function TenantRequestForm() {
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return businessName.trim().length >= 2 && email.includes("@");
  }, [businessName, email]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await fetch("/api/tenants/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName.trim(),
          email: email.trim(),
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit request.");
      }
      setSuccess("Request submitted. We will email onboarding approval details shortly.");
      setBusinessName("");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200/85 bg-white/92">
      <CardHeader className="space-y-2">
        <p className="section-kicker">Operator onboarding</p>
        <CardTitle className="section-title">Request your PaySpot tenant</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 rounded-xl border border-slate-200/85 bg-slate-50/80 p-3 text-xs text-slate-700">
          <p className="inline-flex items-center gap-2"><Building2 className="size-3.5" /> Submit business and admin email.</p>
          <p className="inline-flex items-center gap-2"><Wifi className="size-3.5" /> Configure slug and voucher source after approval.</p>
          <p className="inline-flex items-center gap-2"><ShieldCheck className="size-3.5" /> Activate payments and start selling vouchers.</p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert>
            <AlertTitle>Submitted</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="businessName">Business or venue name</Label>
            <Input
              id="businessName"
              className="h-11"
              placeholder="Walstreet Lounge"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Admin email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="email"
                type="email"
                className="h-11 pl-9"
                placeholder="ops@venue.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <Button type="submit" className="h-12" disabled={!canSubmit || loading}>
            {loading ? "Submitting..." : "Start onboarding"}
          </Button>
        </form>

        <p className="text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold underline underline-offset-4">
            Login instead
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
