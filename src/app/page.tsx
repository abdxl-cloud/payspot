import { TenantRequestForm } from "@/components/tenant-request-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="space-y-8">
            <div>
              <span className="inline-flex items-center rounded-lg bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                Vince Stack
              </span>
              <h1 className="font-display mt-6 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl text-balance">
                Sell Wi-Fi vouchers effortlessly
              </h1>
            </div>
            <p className="text-lg leading-relaxed text-muted-foreground max-w-lg">
              Give your guests a simple purchase link, secure Paystack payments, and automatic SMS delivery of Wi-Fi access codes. Grow your venue revenue today.
            </p>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Dedicated purchase links per venue</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Secure Paystack payment processing</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-5 w-5 rounded-full bg-accent flex-shrink-0" />
                <span className="text-foreground">Real-time sales dashboard</span>
              </div>
            </div>

            <div>
              <Button asChild className="h-12 px-8 text-base font-semibold">
                <Link href="/login">Sign in to your account</Link>
              </Button>
            </div>
          </div>

          <div className="lg:pl-8">
            <TenantRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
