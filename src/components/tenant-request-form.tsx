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
    <Card className="border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl">
      <CardHeader className="space-y-3 pb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Get started in 60 seconds
        </p>
        <CardTitle className="font-display text-2xl font-bold">
          Request your PaySpot page
        </CardTitle>
        <p className="text-sm text-foreground/70">
          Set up your Wi-Fi voucher checkout page and start earning today
        </p>
      </CardHeader>
      <CardContent className="grid gap-6">
        {error ? (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertTitle className="font-semibold">Request failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {success ? (
          <Alert className="border-primary/40 bg-primary/5">
            <AlertTitle className="font-semibold text-primary">Submitted successfully</AlertTitle>
            <AlertDescription className="text-primary/80">{success}</AlertDescription>
          </Alert>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="businessName" className="font-semibold text-sm">
              Business name
            </Label>
            <Input
              id="businessName"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="Your Cafe or Venue"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="slug" className="font-semibold text-sm">
              Your unique link
            </Label>
            <div className="flex items-center h-11 rounded-lg border border-border bg-background px-4 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/10">
              <span className="text-foreground/60 text-sm font-medium">payspot.com/t/</span>
              <input
                id="slug"
                className="flex-1 bg-transparent border-0 outline-none ml-2 font-mono text-sm placeholder:text-foreground/40"
                placeholder="your-link"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                required
              />
            </div>
            <p className="text-xs text-foreground/60">
              This is your unique checkout URL that guests will visit
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email" className="font-semibold text-sm">
              Your email
            </Label>
            <Input
              id="email"
              type="email"
              className="h-11 rounded-lg border-border bg-background placeholder:text-foreground/40 focus:border-primary focus:ring-primary/10"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Button 
            type="submit" 
            className="h-12 rounded-lg font-semibold mt-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={!canSubmit || loading}
          >
            {loading ? "Creating your page..." : "Create my page"}
          </Button>
        </form>

        <div className="text-center text-xs text-foreground/50">
          Free forever. No credit card required.
        </div>
      </CardContent>
    </Card>
  );
}
