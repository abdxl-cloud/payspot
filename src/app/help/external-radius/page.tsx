import Image from "next/image";
import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";

const prerequisites = [
  "Omada Controller v6+ with captive portal enabled on your target SSID.",
  "A PaySpot tenant configured with Access mode = account_access.",
  "A RADIUS service (or adapter) that can receive Omada RADIUS requests and call HTTP APIs.",
] as const;

const navigationPaths = [
  "PaySpot: /t/<slug>/admin -> Quick actions -> Configure architecture -> Access mode = account_access.",
  "PaySpot plans: /t/<slug>/admin -> Plans section -> create/edit plans.",
  "Omada portal screen: Settings (or Network Config) -> Portal -> edit portal profile.",
  "Omada access control: Portal page -> Access Control tab -> External RADIUS Server.",
] as const;

const payspotSteps = [
  "Go to Tenant Admin -> Configure architecture.",
  "Set Access mode to Account access (External RADIUS).",
  "Create plans with duration and price.",
  "Set optional policy fields: maxDevices, bandwidthProfile, dataLimitMb.",
  "Run one test purchase from /t/<slug> to confirm entitlement creation.",
] as const;

const omadaPortalSteps = [
  "Portal = Enable",
  "SSID & Network = your hotspot SSID",
  "Authentication Type = Hotspot",
  "Type = RADIUS (disable Voucher)",
  "HTTPS Redirection = Enable",
  "Landing Page = The Original URL or your required flow",
] as const;

const omadaRadiusSteps = [
  "Access Control tab -> set Auth Type = External RADIUS Server.",
  "Set Authentication server and port (usually 1812).",
  "Enable Accounting server and port (usually 1813).",
  "Set shared secret to match your RADIUS service.",
  "Apply and bind this profile to the portal policy.",
] as const;

const adapterContract = [
  "Authorize endpoint: POST /api/t/<slug>/radius/authorize with x-radius-adapter-secret header.",
  "Authorize body: { username, password }.",
  "On accept=true, use reply.maxDevices/reply.bandwidthProfile/reply.dataLimitMb/reply.sessionTimeout in policy mapping.",
  "Accounting endpoint: POST /api/t/<slug>/radius/accounting with same header.",
  "Accounting body: event(start|interim-update|stop), sessionId, subscriberId/entitlementId, octets.",
] as const;

const validation = [
  "Client joins SSID and is redirected to portal/login flow.",
  "Subscriber can sign up/login and purchase a plan.",
  "RADIUS auth returns allow for active entitlement.",
  "Internet access starts immediately after successful auth.",
  "Simultaneous device limit follows maxDevices.",
  "Usage accounting events update correctly until stop event.",
] as const;

const tenantVisuals = [
  {
    src: "/help/external-tenant/omada-portal-create.png",
    alt: "Omada portal configuration page",
    caption: "Portal configuration entry point in Omada controller.",
    source: "https://www.tp-link.com/us/support/faq/4435/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-1_20241024094058c.png",
  },
  {
    src: "/help/external-tenant/omada-external-portal-server.png",
    alt: "Omada external portal server configuration",
    caption: "External portal server settings in Omada flow.",
    source: "https://www.tp-link.com/us/support/faq/2912/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-8_20241024094057y.png",
  },
  {
    src: "/help/external-tenant/omada-landing-page.png",
    alt: "Omada landing page and redirect settings",
    caption: "Landing page and redirection behavior settings.",
    source: "https://www.tp-link.com/us/support/faq/2912/",
    sourceImage:
      "https://static.tp-link.com/upload/faq/image-20241024174056-9_20241024094057o.png",
  },
] as const;

const officialRefs = [
  "https://support.omadanetworks.com/us/document/13716/",
  "https://www.tp-link.com/us/support/faq/2912/",
  "https://www.rfc-editor.org/rfc/rfc2865",
  "https://www.rfc-editor.org/rfc/rfc2866",
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
            <p className="section-kicker">New Portal Setup</p>
            <h1 className="section-title">External RADIUS + External Portal (End-to-End)</h1>
            <p className="mt-2 text-sm text-amber-900">
              This is the correct setup for a fresh deployment. Omada captive portal + external RADIUS + PaySpot account entitlements.
            </p>
          </section>

          <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-sm font-semibold text-red-900">Important Architecture Note</h2>
            <p className="mt-2 text-sm text-red-900">
              Omada External Web Portal flow requires an External RADIUS server path. PaySpot provides portal purchase/account APIs and RADIUS adapter HTTP endpoints, but your RADIUS service still needs to translate RADIUS requests/events to PaySpot API calls.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">1) Prerequisites</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {prerequisites.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Where to Click</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {navigationPaths.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">2) PaySpot Tenant Setup</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {payspotSteps.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">3) Omada Portal Tab Settings</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {omadaPortalSteps.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">4) Omada Access Control (RADIUS) Settings</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {omadaRadiusSteps.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">5) Connect RADIUS Service to PaySpot</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {adapterContract.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">PaySpot endpoints</p>
              <p><code>POST /api/t/&lt;slug&gt;/radius/authorize</code></p>
              <p><code>POST /api/t/&lt;slug&gt;/radius/accounting</code></p>
              <p className="mt-2">Required header: <code>x-radius-adapter-secret</code></p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">6) Validation Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {validation.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Omada Screenshots (Official)</h2>
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
                      Source (TP-Link)
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

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Official References</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {officialRefs.map((item) => (
                <li key={item}>
                  - <a href={item} target="_blank" rel="noreferrer" className="underline underline-offset-2">{item}</a>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
