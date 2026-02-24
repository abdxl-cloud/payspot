import Image from "next/image";
import Link from "next/link";
import { Lora, Public_Sans } from "next/font/google";
import { AppTopbar } from "@/components/app-topbar";

const display = Lora({
  subsets: ["latin"],
  variable: "--font-omada-display",
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-omada-body",
});

const fieldGuide = [
  {
    key: "apiBaseUrl",
    label: "API Base URL",
    value: "https://use1-omada-northbound.tplinkcloud.com",
    where: "Use your Omada northbound domain (same region as your controller).",
  },
  {
    key: "omadacId",
    label: "Omada ID",
    value: "xxxxxxxxxxxxxxxx",
    where: "Controller identifier shown in Omada Global View / OpenAPI examples.",
  },
  {
    key: "siteId",
    label: "Site ID",
    value: "xxxxxxxxxxxxxxxx",
    where: "Target site identifier under your controller.",
  },
  {
    key: "clientId",
    label: "Client ID",
    value: "xxxxxxxxxxxxxxxx",
    where: "Generated after creating an OpenAPI app in client mode.",
  },
  {
    key: "clientSecret",
    label: "Client Secret",
    value: "****************************************",
    where: "Generated with the client ID; keep private.",
  },
] as const;

const quickChecks = [
  "Controller supports OpenAPI and OpenAPI is enabled",
  "OpenAPI app is created in Client mode",
  "App role has voucher/hotspot permissions",
  "Site privilege includes the site used in PaySpot",
  "You can pass the PaySpot ‘Test Omada connection’ button",
] as const;

const referenceShots = [
  {
    src: "/help/omada/omada-openapi-1.png",
    alt: "Omada Open API menu showing where to create an app",
    caption: "Open API menu and app creation entry point.",
    source: "https://static-community.tp-link.com/other/21/11/2025/ab482cfe0951404cbfd59c5496977e1c.png",
  },
  {
    src: "/help/omada/omada-openapi-2.png",
    alt: "Omada create app screen with Client mode and permissions",
    caption: "Create app form where Client mode and permissions are set.",
    source: "https://static-community.tp-link.com/other/21/11/2025/efea719bdd604ff1b62c55332ecfcdb6.png",
  },
  {
    src: "/help/omada/omada-openapi-4.png",
    alt: "Omada app detail showing generated credentials and identifiers",
    caption: "App details page where Client ID and other fields are copied.",
    source: "https://static-community.tp-link.com/other/21/11/2025/3fed6b16e9dd4b24b704a3fdae28511f.png",
  },
] as const;

export default function OmadaOpenApiHelpPage() {
  return (
    <div className={`${display.variable} ${body.variable} app-shell`}>
      <div className="app-container">
        <AppTopbar
          breadcrumb="Client setup playbook"
          environment="Docs"
          accountLabel="Self-serve"
          action={
            <Link href="/" className="hero-chip">
              Back to PaySpot
            </Link>
          }
        />

        <main className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <section
            className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[var(--shadow-md)] sm:p-8"
            style={{ fontFamily: "var(--font-omada-body), sans-serif" }}
          >
            <p className="section-kicker">Omada OpenAPI Setup</p>
            <h1
              className="mt-2 text-balance text-[clamp(2rem,5vw,3.4rem)] leading-[1.02] text-slate-950"
              style={{ fontFamily: "var(--font-omada-display), serif" }}
            >
              Send this page to any client and let them self-onboard.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-base">
              As of February 24, 2026, menu labels may vary slightly by controller version,
              but the OpenAPI flow is the same: create an app in Omada, copy the five fields,
              paste into PaySpot Architecture settings, then run connection test.
            </p>

            <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
              In Omada: <strong>Global View</strong> → <strong>Settings</strong> →{" "}
              <strong>Platform Integration</strong> → <strong>Open API</strong> →{" "}
              <strong>Add New App</strong> (choose <strong>Client mode</strong>).
            </div>

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Visual Walkthrough
              </p>
              <div className="mt-3 grid gap-3">
                {referenceShots.map((shot) => (
                  <article
                    key={shot.src}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
                  >
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      width={831}
                      height={573}
                      className="h-auto w-full"
                    />
                    <div className="border-t border-slate-200 p-3">
                      <p className="text-sm text-slate-700">{shot.caption}</p>
                      <a
                        className="mt-1 inline-block text-xs text-slate-500 underline underline-offset-2 hover:text-slate-900"
                        href={shot.source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Source image
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {fieldGuide.map((field) => (
                <article key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {field.label}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-900">{field.value}</p>
                  <p className="mt-1 text-sm text-slate-700">{field.where}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="space-y-6 rounded-3xl border border-slate-900/15 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-slate-100 shadow-[var(--shadow-md)] sm:p-8"
            style={{ fontFamily: "var(--font-omada-body), sans-serif" }}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                What Clients Should Do
              </p>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-200 sm:text-base">
                <li>1. Create OpenAPI app in Client mode and save Client ID + Client Secret.</li>
                <li>2. Confirm site privileges are granted to the target hotspot site.</li>
                <li>3. Share API Base URL, Omada ID, Site ID, Client ID, Client Secret securely.</li>
                <li>4. In PaySpot tenant admin, set Voucher source to <code>omada_openapi</code>.</li>
                <li>5. Click <strong>Test Omada connection</strong>. Only go live after it passes.</li>
              </ol>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/8 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                Quick Validation Checklist
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-100">
                {quickChecks.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-amber-300/35 bg-amber-300/10 p-4 text-sm text-amber-100">
              If test fails with client/secret error, regenerate the OpenAPI app secret and paste it
              again. If site errors persist, re-check site privileges in Omada app settings.
            </div>

            <div className="text-xs leading-relaxed text-slate-300">
              References: TP-Link Omada community guide for OpenAPI setup and access flow.
              <div className="mt-2">
                <a
                  className="underline decoration-sky-300/70 underline-offset-4 hover:text-white"
                  href="https://community.tp-link.com/en/business/kb/detail/412930"
                  target="_blank"
                  rel="noreferrer"
                >
                  How to Configure OpenAPI via Omada Controller
                </a>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
