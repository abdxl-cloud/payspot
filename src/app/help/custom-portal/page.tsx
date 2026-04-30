import Image from "next/image";
import Link from "next/link";
import { CircleCheckBig, ExternalLink, FileCode2, ShieldCheck, Wifi } from "lucide-react";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const voucherMode = [
  "Use Omada voucher authentication.",
  "Add a Buy Voucher link that opens https://payspot.abdxl.cloud/t/<tenant-slug>.",
  "Use CSV Import or Omada OpenAPI to keep PaySpot voucher stock available.",
  "Configure the Omada pre-authentication access list for PaySpot and Paystack.",
] as const;

const accountMode = [
  "Use Omada Authentication Type = RADIUS Server.",
  "Set Portal Customization = External Web Portal.",
  "Set External Web Portal URL = https://payspot.abdxl.cloud/t/<tenant-slug>.",
  "Set Landing Page = The Original URL when users should return to the site they first opened.",
  "Connect an external RADIUS service or adapter to PaySpot RADIUS endpoints.",
] as const;

const customPageChecklist = [
  "Show tenant name/logo.",
  "Keep the Buy Voucher button large and visible.",
  "Keep the Omada voucher login form visible if using voucher mode.",
  "Add support phone or WhatsApp.",
  "Test on Android and iPhone captive portal browsers.",
] as const;

const testing = [
  "Forget the WiFi network and reconnect fresh.",
  "Confirm the captive portal opens the custom page.",
  "Click Buy Voucher and confirm PaySpot loads.",
  "Start checkout and confirm Paystack loads.",
  "Complete payment and confirm the voucher/account result appears.",
  "Authenticate and confirm the phone can browse.",
] as const;

const htmlSnippet = `<a href="https://payspot.abdxl.cloud/t/wallstreet">
  Buy WiFi Voucher
</a>`;

const officialScreenshots = [
  {
    src: "/help/custom-portal/import-customized-page.png",
    alt: "Omada Portal Customization screen showing Import Customized Page option",
    caption: "Omada can import a customized captive portal page.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-10_20241024094057j.png",
  },
  {
    src: "/help/custom-portal/edit-current-page.png",
    alt: "Omada Portal Customization screen showing Edit Current Page option",
    caption: "Omada can also edit the current built-in portal page, including logo/background.",
    source: "https://static.tp-link.com/upload/faq/image-20241024174056-11_20241024094057p.png",
  },
  {
    src: "/help/custom-portal/external-web-portal-flow.png",
    alt: "Omada External Web Portal flow diagram with client, AP gateway, controller, web portal, and RADIUS server",
    caption: "Official Omada External Web Portal flow for RADIUS-based captive authentication.",
    source: "https://static.tp-link.com/upload/faq/image-20240329073747-2_20240329143747k.png",
  },
] as const;

export default function CustomPortalHelpPage() {
  return (
    <PrototypeDocsShell title="Custom captive portal">
      <main className="mt-6 grid gap-5">
        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <p className="section-kicker">Captive Portal Page</p>
          <h1 className="section-title text-[var(--tx)]">Custom Omada portal page for PaySpot</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tx2)]">
            Use a custom portal when the first screen on the hotspot should guide customers to buy a voucher,
            log in, or return to Omada after PaySpot account authentication.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <InfoPanel title="Option A: Omada voucher page + PaySpot purchase link" icon={Wifi} items={voucherMode} />
          <InfoPanel title="Option B: External Web Portal + RADIUS account access" icon={ExternalLink} items={accountMode} />
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada Screenshots</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
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

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tx)]">
            <FileCode2 className="size-4" />
            Simple Buy Voucher link
          </h2>
          <p className="mt-2 text-sm text-[var(--tx2)]">
            Replace <code className="rounded bg-[var(--s2)] px-1 py-0.5">wallstreet</code> with the tenant slug.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-4 text-sm text-[var(--tx2)]">
            <code>{htmlSnippet}</code>
          </pre>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <InfoPanel title="What to include on the custom page" icon={CircleCheckBig} items={customPageChecklist} />
          <InfoPanel title="Testing checklist" icon={ShieldCheck} items={testing} />
        </section>

        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <h2 className="text-sm font-semibold">Do the access list first</h2>
          <p className="mt-2 text-sm leading-relaxed">
            The custom page can look perfect and still fail if the captive network blocks PaySpot or Paystack.
            Configure the Omada access list before testing payment from a captive phone.
          </p>
          <Link href="/help/omada-access-list" className="mt-3 inline-flex text-sm font-semibold text-amber-950 underline underline-offset-2">
            Open the Omada access list guide
          </Link>
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada references</h2>
          <ul className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
            <li>
              <a className="text-[var(--ac)] underline underline-offset-2" href="https://support.omadanetworks.com/cac/document/13285/" target="_blank" rel="noreferrer">
                Omada portal customization and access control
              </a>
            </li>
            <li>
              <a className="text-[var(--ac)] underline underline-offset-2" href="https://support.omadanetworks.com/cac/document/13025/" target="_blank" rel="noreferrer">
                Omada External Web Portal API flow
              </a>
            </li>
          </ul>
        </section>
      </main>
    </PrototypeDocsShell>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof Wifi;
  items: readonly string[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tx)]">
        <Icon className="size-4" />
        {title}
      </h2>
      <ul className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
        {items.map((item) => (
          <li key={item} className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
