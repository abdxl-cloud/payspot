import Link from "next/link";
import { BookOpen, CircleCheckBig, FileText, Radio, Router, ShieldCheck, Wifi } from "lucide-react";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const guideCards = [
  {
    href: "/help/csv-import",
    title: "CSV Import",
    badge: "Safest Omada fallback",
    icon: FileText,
    useWhen: [
      "Omada OpenAPI is missing or unreliable.",
      "The tenant already creates vouchers inside Omada.",
      "You want the fastest first launch.",
    ],
  },
  {
    href: "/help/omada-access-list",
    title: "Omada Access List",
    badge: "Required for captive checkout",
    icon: ShieldCheck,
    useWhen: [
      "PaySpot must load before the user is authenticated.",
      "Paystack checkout opens inside captive portal.",
      "The portal page has a Buy Voucher button.",
    ],
  },
  {
    href: "/help/custom-portal",
    title: "Custom Portal Page",
    badge: "Captive entry screen",
    icon: Wifi,
    useWhen: [
      "The tenant wants a branded captive page.",
      "Omada should send users to PaySpot.",
      "External Web Portal or a Buy Voucher link is needed.",
    ],
  },
  {
    href: "/help/omada-openapi",
    title: "Omada OpenAPI",
    badge: "Not for current onboarding",
    icon: BookOpen,
    useWhen: [
      "Kept as reference while cloud integration is unavailable.",
      "Use CSV Import for Omada tenants right now.",
      "Do not send this to new Omada tenants during approval.",
    ],
  },
  {
    href: "/help/external-radius",
    title: "External RADIUS Account Access",
    badge: "Account subscriptions",
    icon: Radio,
    useWhen: [
      "Customers need accounts instead of one-time vouchers.",
      "RADIUS enforces device/data/session limits.",
      "A RADIUS adapter can call PaySpot APIs.",
    ],
  },
  {
    href: "/help/radius-voucher",
    title: "RADIUS Voucher",
    badge: "PaySpot-issued vouchers",
    icon: Radio,
    useWhen: [
      "PaySpot should generate voucher credentials.",
      "RADIUS should enforce usage and accounting.",
      "The hotspot accepts RADIUS username/password.",
    ],
  },
  {
    href: "/help/mikrotik-rest",
    title: "MikroTik REST",
    badge: "RouterOS direct",
    icon: Router,
    useWhen: [
      "The tenant uses MikroTik HotSpot.",
      "RouterOS REST is reachable from PaySpot.",
      "PaySpot should create hotspot users after payment.",
    ],
  },
] as const;

const omadaSequence = [
  "Check whether the controller has Global View -> Settings -> Platform Integration -> Open API.",
  "Use CSV Import for Omada tenants. Omada Cloud/OpenAPI integration is not available for current onboarding.",
  "Create vouchers in Omada, export Voucher Codes as CSV, and import them into PaySpot.",
  "If users must buy while captive, configure the Omada Access List.",
  "If the tenant wants a branded captive entry page, configure Custom Portal Page.",
  "If the tenant wants account login, usage accounting, or device limits, choose External RADIUS.",
] as const;

export default function OnboardingHelpPage() {
  return (
    <PrototypeDocsShell title="Tenant onboarding docs">
      <main className="mt-6 grid gap-5">
        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <p className="section-kicker">Onboarding Map</p>
          <h1 className="section-title text-[var(--tx)]">Choose the right PaySpot setup guide</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tx2)]">
            Use this list during tenant onboarding. Start with the tenant&apos;s network platform, then decide whether
            customers need to buy from inside the captive portal before they are authenticated.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          {guideCards.map((guide) => {
            const Icon = guide.icon;
            return (
              <Link
                key={guide.href}
                href={guide.href}
                className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5 text-inherit no-underline transition hover:border-[var(--ac-bd)] hover:bg-[var(--s2)]"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--bd)] bg-[var(--s2)] text-[var(--ac)]">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ac)]">
                      {guide.badge}
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-[var(--tx)]">{guide.title}</h2>
                    <ul className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
                      {guide.useWhen.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <CircleCheckBig className="mt-0.5 size-4 shrink-0 text-[var(--ac)]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Recommended Omada Sequence</h2>
          <ol className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
            {omadaSequence.map((item, index) => (
              <li key={item} className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">
                <span className="font-mono text-xs text-[var(--ac)]">0{index + 1}</span> {item}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </PrototypeDocsShell>
  );
}
