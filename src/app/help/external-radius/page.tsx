import Image from "next/image";
import Link from "next/link";
import { AppTopbar } from "@/components/app-topbar";

const setupSteps = [
  "In PaySpot Tenant Admin, set architecture to External RADIUS + portal.",
  "Create plans and set optional policy fields (maxDevices, bandwidthProfile, dataLimitMb).",
  "In Omada Portal tab, enable portal for your hotspot SSID and set Type to RADIUS.",
  "In Omada Access Control tab, configure External RADIUS Server profile.",
  "Set portal redirect/landing behavior to your external portal flow.",
  "Run full end-to-end test before opening to live users.",
] as const;

const portalScreenValues = [
  "Portal: Enable",
  "SSID & Network: select your live hotspot SSID",
  "Authentication Type: Hotspot",
  "Type: check RADIUS, uncheck Voucher",
  "HTTPS Redirection: Enable",
  "Landing Page: The Original URL (recommended for hosted flow)",
] as const;

const accessControlValues = [
  "Auth type: External RADIUS Server",
  "Authentication server: your external RADIUS endpoint",
  "Authentication port: 1812",
  "Accounting server/port: enable and use 1813",
  "Shared secret: use the one provided by your admin/ops side",
  "Apply and verify profile is attached to this portal policy",
] as const;

const cutoverValidation = [
  "Client joins SSID and gets redirected to your external portal.",
  "Subscriber can sign up or login.",
  "Payment succeeds and account plan activates.",
  "Device gets internet immediately after successful auth.",
  "Second device obeys maxDevices rule for the plan.",
  "Disconnect/reconnect still honors active entitlement.",
] as const;

const rollbackPlan = [
  "If migrating from Voucher and cutover fails, switch Type back to Voucher temporarily.",
  "Apply and confirm captive portal auth works again.",
  "Fix RADIUS profile issues, then retry in a low-traffic window.",
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
            <p className="section-kicker">Setup Playbook</p>
            <h1 className="section-title">External RADIUS + External Portal</h1>
            <p className="mt-2 text-sm text-amber-900">
              Universal guide for tenant setup: works for fresh deployments and voucher-to-RADIUS migrations.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Setup Steps (In Order)</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {setupSteps.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Omada Portal Tab Values</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {portalScreenValues.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              These values map to the Omada Portal edit form shown in the screenshots below.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Omada Access Control Tab Values</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {accessControlValues.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-600">
              Your network/admin side should provide server host, shared secret, and failover values.
            </p>
            <p className="mt-3 text-xs text-slate-600">
              Tenant-side responsibility stays on plans, pricing, portal URL, and test flow.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Go-Live Validation</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {cutoverValidation.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Rollback (Migration Only)</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {rollbackPlan.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">PaySpot Tenant Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li>- Configure architecture as External RADIUS + portal.</li>
              <li>- Create plans that reflect what you will sell publicly.</li>
              <li>- Set plan policy fields only if your network team maps them.</li>
              <li>- Keep one low-cost test plan for onboarding and troubleshooting.</li>
              <li>- Test `/t/&lt;slug&gt;` as a real customer before opening traffic.</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">Policy Fields In Plain English</h2>
            <p className="mt-2 text-sm text-slate-700">
              <strong>maxDevices</strong> limits concurrent devices. <strong>bandwidthProfile</strong> is a policy label your
              network team maps to rate limits. <strong>dataLimitMb</strong> is total allowed data for the plan.
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
