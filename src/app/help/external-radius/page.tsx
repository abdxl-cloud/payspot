import Image from "next/image";
import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";

const tenantSteps = [
  "In Tenant Admin, open Configure architecture and select External RADIUS + portal.",
  "Create your plans with the right duration and price.",
  "Optionally set plan policy fields: maxDevices, bandwidthProfile, dataLimitMb.",
  "Confirm your public tenant page (/t/<slug>) loads and checkout works.",
  "Run one real payment test and verify account access activates after payment.",
] as const;

const omadaChecklist = [
  "Portal auth type is set to External RADIUS Server when using External Web Portal.",
  "Omada side points users to your PaySpot tenant portal URL.",
  "RADIUS profile on Omada/controller is mapped by your network team.",
  "A test client can connect, purchase, and regain access with active plan.",
] as const;

const planTips = [
  "maxDevices: number of concurrent devices allowed for a subscriber plan.",
  "bandwidthProfile: label used by your network team to map speed policy.",
  "dataLimitMb: optional data cap in MB for the plan.",
] as const;

const tenantVisuals = [
  {
    src: "/help/external-tenant/omada-portal-create.png",
    alt: "Omada portal configuration menu and create portal page",
    caption:
      "Omada portal settings page. Start by enabling Portal and creating a portal profile for your hotspot SSID.",
    source: "https://www.tp-link.com/us/support/faq/4435/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-1_20241024094058c.png",
  },
  {
    src: "/help/external-tenant/omada-external-portal-server.png",
    alt: "Omada external portal server mode selection",
    caption:
      "Select External Portal Server and point Omada to your external portal URL and redirect URL.",
    source: "https://www.tp-link.com/us/support/faq/2912/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-8_20241024094057y.png",
  },
  {
    src: "/help/external-tenant/omada-landing-page.png",
    alt: "Omada landing page and redirection settings",
    caption:
      "Configure landing page behavior so clients are redirected correctly to your external portal flow.",
    source: "https://www.tp-link.com/us/support/faq/2912/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-9_20241024094057o.png",
  },
] as const;

export default function ExternalRadiusHelpPage() {
  return (
    <div className="app-shell">
      <div className="app-container">
        <AppTopbar
          breadcrumb="External RADIUS setup"
          environment="Docs"
          accountLabel="Self-serve"
          action={
            <Link href="/" className="hero-chip">
              Back to PaySpot
            </Link>
          }
        />

        <main className="mt-6 grid gap-4">
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="section-kicker">Architecture Guide</p>
            <h1 className="section-title">External RADIUS + External Portal</h1>
            <p className="mt-2 text-sm text-amber-900">
              Tenant-facing setup for account access mode: subscribers sign in, buy a plan, and get live access.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">What You Set Up as Tenant</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {tenantSteps.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Plan Policy Fields</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {planTips.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              If you are unsure of policy values, use default plans first and refine with your network team.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Omada External Portal Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {omadaChecklist.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              TP-Link reference: External Web Portal in Omada requires External RADIUS Server mode.
            </p>
            <p className="mt-3 text-xs text-slate-600">
              Technical adapter credentials and RADIUS wiring should be handled by your network/server administrator.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Tenant Action Screenshots</h2>
            <div className="mt-3 grid gap-3">
              {tenantVisuals.map((item) => (
                <article
                  key={item.src}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-sm)]"
                >
                  <Image src={item.src} alt={item.alt} width={1280} height={720} className="h-auto w-full" />
                  <div className="border-t border-slate-200 p-3">
                    <p className="text-sm text-slate-700">{item.caption}</p>
                    <a
                      href={item.source}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900"
                    >
                      Source (TP-Link FAQ)
                    </a>
                    <a
                      href={item.sourceImage}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-3 mt-1 inline-block text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900"
                    >
                      Source image asset
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
