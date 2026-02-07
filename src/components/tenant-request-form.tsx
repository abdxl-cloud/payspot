"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit request.");
      }
      setSuccess("Thanks! We’ll email you with next steps.");
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
    <Card className="border border-border bg-white shadow-lg">
      <CardHeader className="space-y-4 pb-6">
        <CardTitle className="font-display text-3xl font-bold">Get started</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
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

        <form className="grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-3">
            <Label htmlFor="businessName" className="text-sm font-semibold">Business name</Label>
            <Input
              id="businessName"
              className="h-12 border-border text-base"
              placeholder="Acme Cafe"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-3">
            <Label htmlFor="slug" className="text-sm font-semibold">Link URL</Label>
            <div className="flex items-center h-12 px-4 bg-muted border border-border rounded-md">
              <span className="text-sm text-muted-foreground">/t/</span>
              <input
                id="slug"
                type="text"
                className="flex-1 ml-2 bg-transparent text-foreground placeholder-muted-foreground outline-none text-base"
                placeholder="acme-cafe"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                required
              />
            </div>
          </div>

          <div className="grid gap-3">
            <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
            <Input
              id="email"
              type="email"
              className="h-12 border-border text-base"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button type="submit" className="h-12 w-full text-base font-semibold mt-6 rounded-lg" disabled={!canSubmit || loading}>
            {loading ? "Creating..." : "Create page"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
