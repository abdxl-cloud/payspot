"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readJsonResponse } from "@/lib/http";

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function TenantRequestForm() {
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (slugTouched) return;
    const next = slugify(businessName);
    setSlug(next);
  }, [businessName, slugTouched]);

  const canSubmit = useMemo(() => {
    return businessName.trim().length >= 2 && slug.trim().length >= 2 && email.includes("@");
  }, [businessName, slug, email]);

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
          slug: slug.trim(),
          email: email.trim(),
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit request.");
      }
      setSuccess("Thanks! We'll email you with next steps.");
      setBusinessName("");
      setSlug("");
      setSlugTouched(false);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200/80 bg-white/85">
      <CardHeader className="space-y-1">
        <p className="section-kicker">New tenant onboarding</p>
        <CardTitle className="section-title">Request your Wi-Fi sales portal</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
          <p>1. Submit business and admin details.</p>
          <p>2. Receive setup credentials by email.</p>
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
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              className="h-11"
              placeholder="Acme Cafe"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="slug">Link name</Label>
            <Input
              id="slug"
              className="h-11"
              placeholder="acme-cafe"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your purchase link will look like <span className="font-mono">/t/{slug || "your-link"}</span>
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Admin email</Label>
            <Input
              id="email"
              type="email"
              className="h-11"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
