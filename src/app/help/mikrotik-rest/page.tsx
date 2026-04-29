import { Lora, Public_Sans } from "next/font/google";
import {
  BadgeCheck,
  Cable,
  CircleCheckBig,
  CircleHelp,
  ListChecks,
  LockKeyhole,
  Router,
  TerminalSquare,
  Wifi,
} from "lucide-react";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const display = Lora({
  subsets: ["latin"],
  variable: "--font-mikrotik-display",
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-mikrotik-body",
});

const requiredFields = [
  { key: "baseUrl", label: "Base URL", example: "https://router.example.com", note: "Router or controller URL. PaySpot adds /rest automatically." },
  { key: "username", label: "REST username", example: "payspot-api", note: "RouterOS local user with REST/API access." },
  { key: "password", label: "REST password", example: "********", note: "Stored encrypted in PaySpot." },
] as const;

const optionalFields = [
  "Hotspot server: set only if this router has multiple hotspot servers and you want one fixed target.",
  "Default profile: set only if every plan should inherit the same RouterOS hotspot profile.",
  "Verify TLS certificate: keep enabled in production; disable only for temporary self-signed testing.",
] as const;

const collectionSteps = [
  {
    title: "Find the router URL",
    webfig: "Open the router in WinBox or WebFig. Use the same IP or DNS name you use to manage the router.",
    whatToPaste: "Paste it into PaySpot as Base URL, for example `https://192.168.88.1` or `https://router.example.com`.",
    notes: [
      "If you only have HTTP enabled today, PaySpot can still work during testing, but HTTPS is strongly preferred.",
      "Do not add `/rest` yourself. PaySpot appends it automatically.",
    ],
    cli: "/ip service print",
  },
  {
    title: "Enable REST access on RouterOS",
    webfig: "Go to IP > Services and make sure `www-ssl` is enabled. REST uses the RouterOS web service.",
    whatToPaste: "No PaySpot field here. This is a router prerequisite.",
    notes: [
      "If only `www` is enabled, REST may still work over HTTP, but production should use `www-ssl`.",
      "Restrict the allowed source addresses to the PaySpot server IP if possible.",
    ],
    cli: "/ip service enable www-ssl",
  },
  {
    title: "Create a dedicated PaySpot user",
    webfig: "Go to System > Users and add a separate user for PaySpot instead of using the main admin account.",
    whatToPaste: "Paste the username into PaySpot as REST username and the password as REST password.",
    notes: [
      "Use a strong password.",
      "Give the user enough rights to read system info and create HotSpot users.",
    ],
    cli: "/user add name=payspot-api password=ChangeMe123 group=full",
  },
  {
    title: "Identify the HotSpot server name",
    webfig: "Go to IP > HotSpot > Servers. Copy the server `Name` if you want PaySpot to always target one specific HotSpot server.",
    whatToPaste: "Paste that name into PaySpot as Hotspot server. If there is only one HotSpot server, you can usually leave this blank.",
    notes: [
      "Examples: `hotspot1`, `main-hotspot`.",
    ],
    cli: "/ip hotspot print",
  },
  {
    title: "Identify the default user profile",
    webfig: "Go to IP > HotSpot > User Profiles. Copy the profile `Name` if you want every PaySpot voucher to inherit the same base RouterOS profile.",
    whatToPaste: "Paste that name into PaySpot as Default profile. If you do not need a fixed profile, leave it blank.",
    notes: [
      "Examples: `default`, `voucher-base`, `1mbps-profile`.",
      "PaySpot already sets duration and data limits from the plan, so use the profile mainly for shared HotSpot defaults.",
    ],
    cli: "/ip hotspot user profile print",
  },
] as const;

const payspotFieldGuide = [
  {
    payspot: "Base URL",
    source: "The router IP or DNS name you use for WebFig/HTTPS management.",
    example: "https://192.168.88.1",
  },
  {
    payspot: "REST username",
    source: "System > Users > Name",
    example: "payspot-api",
  },
  {
    payspot: "REST password",
    source: "The password assigned to that dedicated RouterOS user.",
    example: "StrongPasswordHere",
  },
  {
    payspot: "Hotspot server",
    source: "IP > HotSpot > Servers > Name",
    example: "hotspot1",
  },
  {
    payspot: "Default profile",
    source: "IP > HotSpot > User Profiles > Name",
    example: "default",
  },
  {
    payspot: "Verify TLS certificate",
    source: "Turn on if your router has a valid certificate; turn off only for temporary self-signed testing.",
    example: "Enabled",
  },
] as const;

const planMapping = [
  "Plan duration -> MikroTik `limit-uptime`",
  "Plan data limit -> MikroTik `limit-bytes-total`",
  "Voucher code -> generated after payment",
  "Voucher password -> same as voucher code",
] as const;

const operatorChecks = [
  "RouterOS REST is enabled on `www-ssl` and reachable from the PaySpot server.",
  "The API user can create entries in `/ip/hotspot/user`.",
  "HotSpot is already working on the router before you connect PaySpot.",
  "At least one PaySpot plan has duration, data limit, or both.",
  "You can pass the PaySpot `Test MikroTik connection` button before go-live.",
];

const flow = [
  "Tenant admin opens `/t/<slug>/admin` and selects `Voucher source = MikroTik direct (REST)`.",
  "Tenant enters router URL, REST username, and password once.",
  "Tenant creates PaySpot plans with duration and/or data limit.",
  "Customer pays for a plan.",
  "PaySpot verifies payment, creates the hotspot user on MikroTik, then shows the voucher on-screen and sends it by SMS/email.",
];

const references = [
  {
    label: "MikroTik REST API docs",
    href: "https://help.mikrotik.com/docs/spaces/ROS/pages/47579162/REST%2BAPI?src=contextnavpagetreemode",
  },
  {
    label: "MikroTik HotSpot docs",
    href: "https://help.mikrotik.com/docs/spaces/ROS/pages/56459266/HotSpot%2B-%2BCaptive%2Bportal",
  },
  {
    label: "MikroTik Services docs",
    href: "https://help.mikrotik.com/docs/spaces/ROS/pages/103841820/Services",
  },
  {
    label: "MikroTik User docs",
    href: "https://help.mikrotik.com/docs/spaces/ROS/pages/8978504/User?src=contextnavpagetreemode",
  },
] as const;

const troubleshooting = [
  {
    error: "MikroTik connection test failed",
    fix: "Confirm Base URL, username, password, and that the PaySpot server can reach the router over the network.",
  },
  {
    error: "HTTP 401 or 403 from RouterOS",
    fix: "The REST username/password is wrong or the user does not have enough rights.",
  },
  {
    error: "TLS / certificate error",
    fix: "Install a trusted certificate on the router or temporarily disable `Verify TLS certificate` during testing.",
  },
  {
    error: "Payment succeeds but voucher not created",
    fix: "Run the PaySpot MikroTik connection test again and confirm the router user can create `/ip/hotspot/user` entries.",
  },
] as const;

export default function MikrotikRestHelpPage() {
  return (
    <PrototypeDocsShell title="Client setup playbook" className={`${display.variable} ${body.variable}`}>
        <main className="mt-6 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section
            className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[var(--shadow-md)] sm:p-8"
            style={{ fontFamily: "var(--font-mikrotik-body), sans-serif" }}
          >
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900 p-5 text-white sm:p-7">
              <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-emerald-300/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-14 left-24 size-44 rounded-full bg-lime-400/20 blur-2xl" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                MikroTik Direct Setup
              </p>
              <h1
                className="mt-2 text-balance text-[clamp(1.9rem,4.8vw,3.1rem)] leading-[1.03] text-white"
                style={{ fontFamily: "var(--font-mikrotik-display), serif" }}
              >
                RouterOS REST onboarding
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
                Minimal path: connect one router once, keep plan limits inside PaySpot, and let payment success create the hotspot voucher automatically.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <Router className="size-3.5" />
                  3 required fields
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <ListChecks className="size-3.5" />
                  WinBox/WebFig steps included
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <BadgeCheck className="size-3.5" />
                  Test before go-live
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1">
                  <Wifi className="size-3.5" />
                  Plan limits map automatically
                </span>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-950">
              In PaySpot: <strong>/t/&lt;slug&gt;/admin</strong> -&gt; <strong>Configure architecture</strong> -&gt;{" "}
              <strong>Voucher source = MikroTik direct (REST)</strong>.
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Before You Start
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {operatorChecks.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Required Fields
              </p>
              <div className="mt-3 grid gap-3">
                {requiredFields.map((field) => (
                  <div key={field.key} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{field.label}</p>
                      <code className="rounded bg-white px-2 py-1 text-xs text-slate-700">{field.example}</code>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{field.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Step-By-Step Value Collection
              </p>
              <div className="mt-3 space-y-3">
                {collectionSteps.map((step, index) => (
                  <article key={step.title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                        <p className="mt-1 text-sm text-slate-700">{step.webfig}</p>
                        <p className="mt-2 text-sm text-slate-700">
                          <strong>Paste into PaySpot:</strong> {step.whatToPaste}
                        </p>
                        <ul className="mt-2 space-y-1 text-sm text-slate-600">
                          {step.notes.map((note) => (
                            <li key={note}>- {note}</li>
                          ))}
                        </ul>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            <TerminalSquare className="size-3.5" />
                            RouterOS CLI
                          </div>
                          <code className="block overflow-x-auto text-xs text-slate-700">{step.cli}</code>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Optional Fields
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {optionalFields.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                PaySpot Field Mapping
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
                      <th className="px-2 py-2 font-semibold">PaySpot Field</th>
                      <th className="px-2 py-2 font-semibold">Where To Get It</th>
                      <th className="px-2 py-2 font-semibold">Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payspotFieldGuide.map((row) => (
                      <tr key={row.payspot} className="border-b border-slate-100 align-top">
                        <td className="px-2 py-2 font-medium text-slate-900">{row.payspot}</td>
                        <td className="px-2 py-2">{row.source}</td>
                        <td className="px-2 py-2">
                          <code className="rounded bg-slate-50 px-2 py-1 text-xs text-slate-700">{row.example}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Plan Mapping
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {planMapping.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Cable className="mt-0.5 size-4 shrink-0 text-slate-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <aside className="grid gap-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-sm)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                Flow
              </p>
              <ol className="mt-3 space-y-3 text-sm text-slate-700">
                {flow.map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 text-amber-950">
                <LockKeyhole className="size-4" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                  Security Notes
                </p>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-amber-950/85">
                <li>- Prefer `https://router/rest` with a trusted certificate.</li>
                <li>- Keep TLS verification enabled in production.</li>
                <li>- Restrict router REST access to the PaySpot server IP or VPN.</li>
                <li>- Use a dedicated router user instead of the main admin account.</li>
              </ul>
            </section>

            <section className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 text-rose-950">
                <CircleHelp className="size-4" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]">
                  Troubleshooting
                </p>
              </div>
              <div className="mt-3 space-y-3 text-sm text-rose-950/85">
                {troubleshooting.map((item) => (
                  <div key={item.error} className="rounded-2xl border border-rose-200/70 bg-white/60 p-3">
                    <p className="font-semibold">{item.error}</p>
                    <p className="mt-1">{item.fix}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 text-slate-900">
                <CircleHelp className="size-4" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Official References
                </p>
              </div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {references.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-900">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </main>
    </PrototypeDocsShell>
  );
}
