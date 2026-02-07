import { TenantRequestForm } from "@/components/tenant-request-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, BarChart3, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/30">
      {/* Navigation */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="font-display text-2xl font-bold text-primary">PaySpot</div>
          <nav className="hidden md:flex gap-8">
            <a href="#features" className="text-foreground/70 hover:text-foreground text-sm font-medium transition">Features</a>
            <a href="#pricing" className="text-foreground/70 hover:text-foreground text-sm font-medium transition">Pricing</a>
            <a href="#" className="text-foreground/70 hover:text-foreground text-sm font-medium transition">Docs</a>
          </nav>
          <Button asChild variant="ghost" className="text-primary hover:bg-primary/10">
            <Link href="/login">Sign In</Link>
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">
                Modern payments platform
              </span>
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-5xl lg:text-6xl font-bold leading-tight text-balance">
                Monetize Wi-Fi at your venue
              </h1>
              <p className="text-lg text-foreground/70 leading-relaxed max-w-lg">
                PaySpot makes it simple to sell Wi-Fi access codes. Set up a branded checkout page, accept secure payments, and automatically deliver codes via SMS.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button asChild size="lg" className="h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-lg">
                <Link href="#" className="flex items-center gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 border-border hover:border-primary/40 hover:bg-primary/5 rounded-lg">
                <Link href="/login">Sign In</Link>
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-border/40">
              <div>
                <div className="text-2xl font-bold text-primary">100%</div>
                <p className="text-sm text-foreground/60">Automated delivery</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">15sec</div>
                <p className="text-sm text-foreground/60">Setup time</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">∞</div>
                <p className="text-sm text-foreground/60">Custom branding</p>
              </div>
            </div>
          </div>

          <div className="lg:flex justify-center">
            <div className="w-full max-w-md">
              <TenantRequestForm />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16 space-y-4">
          <h2 className="font-display text-4xl font-bold">Everything you need</h2>
          <p className="text-lg text-foreground/70 max-w-2xl mx-auto">
            Powerful features designed to help you maximize revenue from Wi-Fi access
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: <Zap className="w-6 h-6" />,
              title: "Instant Setup",
              desc: "Launch your first voucher page in minutes with our simple setup wizard"
            },
            {
              icon: <Shield className="w-6 h-6" />,
              title: "Secure Payments",
              desc: "Process payments safely with Paystack integration and PCI compliance"
            },
            {
              icon: <BarChart3 className="w-6 h-6" />,
              title: "Real-time Analytics",
              desc: "Track sales, revenue, and customer data with an intuitive dashboard"
            }
          ].map((feature, i) => (
            <div key={i} className="p-8 rounded-xl border border-border/40 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary">
                {feature.icon}
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{feature.title}</h3>
              <p className="text-foreground/70 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="rounded-2xl bg-gradient-to-br from-primary/95 to-accent/95 p-12 lg:p-16 text-center text-primary-foreground space-y-6">
          <h2 className="font-display text-4xl font-bold">Ready to start?</h2>
          <p className="text-lg opacity-95 max-w-xl mx-auto">
            Join venues worldwide that are earning revenue from Wi-Fi with PaySpot
          </p>
          <Button asChild size="lg" className="h-12 bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold rounded-lg mt-8">
            <Link href="#">Request your page today</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-foreground/60">
            <div className="font-display font-bold text-foreground">PaySpot</div>
            <div className="flex gap-8">
              <a href="#" className="hover:text-foreground transition">Privacy</a>
              <a href="#" className="hover:text-foreground transition">Terms</a>
              <a href="#" className="hover:text-foreground transition">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
