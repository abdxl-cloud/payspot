import { TenantRequestForm } from "@/components/tenant-request-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-32">
        <div className="grid gap-20 lg:grid-cols-2 lg:items-start">
          <div className="space-y-12 pt-4">
            <h1 className="font-display text-7xl sm:text-8xl font-bold leading-tight tracking-tight text-foreground">
              Sell WiFi
            </h1>
            
            <p className="text-2xl text-muted-foreground leading-relaxed max-w-lg font-light">
              Turn guest WiFi into revenue. Accept instant payments. Deliver access codes by SMS.
            </p>
            
            <Button asChild size="lg" className="h-14 px-10 text-lg font-semibold rounded-lg">
              <Link href="/login">Start now</Link>
            </Button>
          </div>

          <div>
            <TenantRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
