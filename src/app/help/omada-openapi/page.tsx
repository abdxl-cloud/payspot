import Image from "next/image";
import Link from "next/link";
import { Lora, Public_Sans } from "next/font/google";
import {
  ArrowUpRight,
  CircleCheckBig,
  KeyRound,
  ListChecks,
  Route,
  ShieldCheck,
  Wifi,
} from "lucide-react";
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

const prerequisites = [
  "You can log in to Omada Controller with admin privileges.",
  "You know which Omada site is your live hotspot site.",
  "You can open PaySpot tenant admin at /t/<slug>/admin.",
] as const;

const stepByStep = [
  {
    title: "Open OpenAPI settings in Omada",
    body: "In Omada Global View, go to Settings > Platform Integration > Open API.",
  },
  {
    title: "Create a new OpenAPI app",
    body: "Click Add New App, select Client mode, assign permissions for hotspot/voucher actions, and include the correct site privilege.",
  },
  {
    title: "Copy credentials immediately",
    body: "Save the generated Client ID and Client Secret. Treat Client Secret like a password and share it securely only.",
  },
  {
    title: "Paste values into PaySpot architecture",
    body: "In PaySpot tenant admin, open Configure architecture and set Voucher source = omada_openapi.",
  },
  {
    title: "Run connection test before going live",
    body: "Click Test Omada connection. If it passes, save settings and perform one real test purchase.",
  },
] as const;

const fieldMapping = [
  { omada: "Northbound URL", payspot: "API Base URL" },
  { omada: "Omada controller identifier", payspot: "Omada ID" },
  { omada: "Target hotspot site identifier", payspot: "Site ID" },
  { omada: "OpenAPI App Client ID", payspot: "Client ID" },
  { omada: "OpenAPI App Client Secret", payspot: "Client Secret" },
] as const;

const commonErrors = [
  {
    error: "Missing required Omada fields",
    fix: "Fill all five required fields in Configure architecture and save again.",
  },
  {
    error: "Omada connection test failed: client credentials",
    fix: "Regenerate Client Secret in Omada and paste the new value in PaySpot.",
  },
  {
    error: "Omada connection test failed: site",
    fix: "Confirm Site ID is correct and that your OpenAPI app has access to that site.",
  },
  {
    error: "Payment succeeds but voucher unavailable",
    fix: "Run Test Omada connection again and verify hotspot/voucher permissions are still active.",
  },
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

        <main className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section
            className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[var(--shadow-md)] sm:p-8"
            style={{ fontFamily: "var(--font-omada-body), sans-serif" }}
          >
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 p-5 text-white sm:p-7">
              <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-cyan-300/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-14 left-24 size-44 rounded-full bg-sky-400/20 blur-2xl" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                Omada OpenAPI Setup
              </p>
              <h1
                className="mt-2 text-balance text-[clamp(1.9rem,4.8vw,3.1rem)] leading-[1.03] text-white"
                style={{ fontFamily: "var(--font-omada-display), serif" }}
              >
                Client self-setup playbook
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
                Fast path: create OpenAPI app, collect 5 fields, paste in PaySpot, run the health test.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <ListChecks className="size-3.5" />
                  5 required fields
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <ShieldCheck className="size-3.5" />
                  Save blocked if incomplete
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <Wifi className="size-3.5" />
                  Test before go-live
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
              In Omada: <strong>Global View</strong> → <strong>Settings</strong> →{" "}
              <strong>Platform Integration</strong> → <strong>Open API</strong> →{" "}
              <strong>Add New App</strong> (choose <strong>Client mode</strong>).
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Before You Start
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {prerequisites.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Visual Walkthrough
              </p>
              <div className="mt-3 grid gap-3">
                {referenceShots.map((shot) => (
                  <article
                    key={shot.src}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-sm)]"
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
                        Source image <ArrowUpRight className="mb-0.5 ml-1 inline size-3.5" />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {fieldGuide.map((field) => (
                <article key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50/55 p-4 shadow-[var(--shadow-sm)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 inline-flex items-center gap-1.5">
                    <KeyRound className="size-3.5" />
                    {field.label}
                  </p>
                  <p className="mt-1 break-all text-sm font-semibold text-slate-900">{field.value}</p>
                  <p className="mt-1 text-sm text-slate-700">{field.where}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            className="space-y-6 rounded-3xl border border-slate-900/15 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 p-6 text-slate-100 shadow-[var(--shadow-md)] sm:p-8 lg:sticky lg:top-6 lg:self-start"
            style={{ fontFamily: "var(--font-omada-body), sans-serif" }}
          >
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-200">
                <Route className="size-3.5" />
                Step-by-Step
              </p>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-slate-200 sm:text-base">
                {stepByStep.map((step, index) => (
                  <li key={step.title} className="rounded-xl border border-white/15 bg-white/5 p-3">
                    <strong className="text-white">{index + 1}. {step.title}:</strong> {step.body}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-white/20 bg-white/8 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                Omada To PaySpot Field Mapping
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-100">
                {fieldMapping.map((item) => (
                  <li key={item.omada}>
                    <strong>{item.omada}</strong> → {item.payspot}
                  </li>
                ))}
              </ul>
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
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-50">
                Common Errors And Fixes
              </p>
              <ul className="mt-2 space-y-2">
                {commonErrors.map((item) => (
                  <li key={item.error}>
                    <strong>{item.error}:</strong> {item.fix}
                  </li>
                ))}
              </ul>
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
