import Image from "next/image";
import { AlertTriangle, CircleCheckBig, ListChecks, ShieldCheck } from "lucide-react";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const neededWhen = [
  "Users must open PaySpot before they are authenticated on the hotspot.",
  "The captive page has a Buy Voucher button.",
  "Paystack checkout must load inside the captive portal browser.",
  "Omada is using External Web Portal for RADIUS/account access.",
] as const;

const omadaPaths = [
  "Omada v5.9 to v6: Site Settings -> Authentication -> Portal -> Access Control.",
  "Omada v6.2+: Site View -> Network Config -> Authentication -> Portal -> Access Control.",
  "Enable Pre-Authentication Access, click Add, choose URL or IP Range, then Save and Apply.",
] as const;

const minimumEntries = [
  "payspot.abdxl.cloud",
  "Tenant custom domain, if used, for example wifi.example.com",
  "Custom portal host, if different from PaySpot",
] as const;

const paymentEntries = [
  "checkout.paystack.com",
  "paystack.com",
  "*.paystack.com, only if the controller supports wildcard or domain-suffix entries",
] as const;

const avoidEntries = [
  "Do not add 0.0.0.0/0 or a broad internet range.",
  "Do not add Google/Apple captive-check domains unless you are debugging a specific device issue.",
  "Do not whitelist every payment or bank website. Add only hosts that fail during real checkout testing.",
] as const;

const validation = [
  "Join the hotspot as a fresh unauthenticated client.",
  "Open the captive page and click Buy Voucher.",
  "Confirm the PaySpot store loads.",
  "Start checkout and confirm Paystack loads.",
  "Complete payment and confirm the voucher/account result appears.",
  "Authenticate and confirm browsing works.",
] as const;

const officialScreenshots = [
  {
    src: "/help/omada-access-list/access-control-tab.png",
    alt: "Omada Access Control tab showing Pre-Authentication Access and Authentication-Free Client options",
    caption: "Open the Portal Access Control tab.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-15_20241024094058j.png",
  },
  {
    src: "/help/omada-access-list/preauth-enable.png",
    alt: "Omada Access Control page with Pre-Authentication Access enabled and Add action highlighted",
    caption: "Enable Pre-Authentication Access and click Add.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-16_20241024094057w.png",
  },
  {
    src: "/help/omada-access-list/add-entry-type.png",
    alt: "Omada Add Pre-Authentication Access Entry modal showing IP Range and URL options",
    caption: "Choose URL or IP Range for each pre-authentication entry.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-17_20241024094057p.png",
  },
  {
    src: "/help/omada-access-list/save-entry.png",
    alt: "Omada Add Pre-Authentication Access Entry modal with example URL and Save button",
    caption: "Add only required hosts, then save and apply.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-18_20241024094057g.png",
  },
  {
    src: "/help/omada-access-list/v6-preauth-entry.png",
    alt: "Omada v6.2 Pre-Authentication Access entry modal",
    caption: "Newer Omada Network versions show the same URL/IP Range choice in the updated UI.",
    source: "https://static.tp-link.com/upload/faq/image_20251204012713o.png",
  },
] as const;

export default function OmadaAccessListHelpPage() {
  return (
    <PrototypeDocsShell title="Omada access list">
      <main className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.9fr]">
        <section className="grid gap-5">
          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <p className="section-kicker">Captive Portal Allowlist</p>
            <h1 className="section-title text-[var(--tx)]">Omada pre-authentication access for PaySpot</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tx2)]">
              Add only the domains customers need before authentication. This lets PaySpot and checkout load inside
              the captive browser without accidentally bypassing the portal.
            </p>
          </section>

          <InfoSection title="When this is needed" icon={ShieldCheck} items={neededWhen} />
          <InfoSection title="Where to configure it" icon={ListChecks} items={omadaPaths} />

          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada Screenshots</h2>
            <div className="mt-3 grid gap-3">
              {officialScreenshots.map((shot) => (
                <figure key={shot.src} className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--s2)]">
                  <Image src={shot.src} alt={shot.alt} width={1000} height={650} className="h-auto w-full" />
                  <figcaption className="border-t border-[var(--bd)] p-3 text-sm text-[var(--tx2)]">
                    {shot.caption}{" "}
                    <a className="text-[var(--ac)] underline underline-offset-2" href={shot.source} target="_blank" rel="noreferrer">
                      Source image
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <InfoSection title="Minimum entries" icon={CircleCheckBig} items={minimumEntries} />
          <InfoSection title="Payment checkout entries" icon={CircleCheckBig} items={paymentEntries} />

          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <h2 className="text-sm font-semibold text-[var(--tx)]">External RADIUS browserauth note</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tx2)]">
              In External Web Portal mode, PaySpot sends the browser back to Omada&apos;s
              <code className="mx-1 rounded bg-[var(--s2)] px-1 py-0.5">/portal/radius/browserauth</code>
              endpoint. If the client browser cannot submit to the controller, add the controller IP or hostname
              shown in Omada&apos;s <code className="rounded bg-[var(--s2)] px-1 py-0.5">target</code> parameter.
            </p>
          </section>
        </section>

        <aside className="grid gap-5 content-start">
          <InfoSection title="Avoid these entries" icon={AlertTriangle} items={avoidEntries} tone="warn" />
          <InfoSection title="Validation checklist" icon={CircleCheckBig} items={validation} />
          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada references</h2>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
              <li>
                <a className="text-[var(--ac)] underline underline-offset-2" href="https://support.omadanetworks.com/cac/document/13285/" target="_blank" rel="noreferrer">
                  Omada v5.9 to v6 portal guide
                </a>
              </li>
              <li>
                <a className="text-[var(--ac)] underline underline-offset-2" href="https://support.omadanetworks.com/en/document/111643/" target="_blank" rel="noreferrer">
                  Omada v6.2+ portal guide
                </a>
              </li>
            </ul>
          </section>
        </aside>
      </main>
    </PrototypeDocsShell>
  );
}

function InfoSection({
  title,
  icon: Icon,
  items,
  tone = "normal",
}: {
  title: string;
  icon: typeof ShieldCheck;
  items: readonly string[];
  tone?: "normal" | "warn";
}) {
  return (
    <section className={`rounded-2xl border p-5 ${tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-[var(--bd)] bg-[var(--s1)]"}`}>
      <h2 className={`flex items-center gap-2 text-sm font-semibold ${tone === "warn" ? "text-amber-950" : "text-[var(--tx)]"}`}>
        <Icon className="size-4" />
        {title}
      </h2>
      <ul className={`mt-3 grid gap-2 text-sm ${tone === "warn" ? "text-amber-950/85" : "text-[var(--tx2)]"}`}>
        {items.map((item) => (
          <li key={item} className={`rounded-xl border p-3 ${tone === "warn" ? "border-amber-200 bg-white/60" : "border-[var(--bd)] bg-[var(--s2)]"}`}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
