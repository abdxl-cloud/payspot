import { TenantRequestForm } from "@/components/tenant-request-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%),_linear-gradient(135deg,_#f0fdf4,_#ecfeff_45%,_#ffffff)] text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:py-24">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="space-y-6 text-center lg:text-left">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/70 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800 lg:mx-0">
              Vince Stack
            </div>
            <h1 className="font-display mx-auto max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl lg:mx-0">
              Sell Wi-Fi vouchers at your venue, effortlessly.
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-600 lg:mx-0">
              Give guests a simple purchase link, take secure Paystack payments, and
              automatically send Wi-Fi access codes by SMS.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-sm text-slate-500 lg:justify-start">
              <div className="rounded-full border border-emerald-200/60 bg-white/70 px-4 py-2">
                Dedicated purchase link
              </div>
              <div className="rounded-full border border-emerald-200/60 bg-white/70 px-4 py-2">
                Secure Paystack checkout
              </div>
              <div className="rounded-full border border-emerald-200/60 bg-white/70 px-4 py-2">
                Simple sales dashboard
              </div>
            </div>
            <div className="flex justify-center lg:justify-start">
              <Button
                asChild
                variant="outline"
                className="h-11 border-emerald-200/70 bg-white/60 hover:bg-emerald-50"
              >
                <Link href="/login">Login</Link>
              </Button>
            </div>
          </div>

          <div className="w-full rounded-[32px] p-5 sm:p-6">
            <TenantRequestForm />
          </div>
        </div>
      </div>
    </div>
  );
}
