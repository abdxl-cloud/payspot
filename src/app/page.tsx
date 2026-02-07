import { TenantRequestForm } from "@/components/tenant-request-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:py-32">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div className="space-y-10 z-10">
            <div className="space-y-6">
              <h1 className="font-display text-6xl sm:text-7xl font-bold leading-tight tracking-tight text-foreground">
                WiFi that <span className="text-primary">converts</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                Accept payments for WiFi access instantly. Secure Paystack integration, automatic SMS codes, and a powerful dashboard for your business.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="h-12 px-8 text-base font-semibold">
                <Link href="/login">Get started</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base font-semibold">
                <Link href="#features">Learn more</Link>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-8">
              <div className="space-y-2">
                <p className="text-3xl font-bold text-foreground">30s</p>
                <p className="text-sm text-muted-foreground">Setup time for venues</p>
              </div>
              <div className="space-y-2">
                <p className="text-3xl font-bold text-foreground">2.9%</p>
                <p className="text-sm text-muted-foreground">Processing fees via Paystack</p>
              </div>
            </div>
          </div>

          <div className="lg:pl-12 z-10">
            <TenantRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
