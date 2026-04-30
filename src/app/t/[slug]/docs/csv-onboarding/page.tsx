import Image from "next/image";
import { notFound } from "next/navigation";
import { CircleCheckBig, ClipboardList, ExternalLink, ShieldCheck, Wifi } from "lucide-react";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";
import { absoluteAppUrl } from "@/lib/tenant-onboarding-docs";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const paystackHosts = [
  "checkout.paystack.com",
  "paystack.com",
  "*.paystack.com, only if your Omada controller supports wildcard/domain-suffix entries",
] as const;

const csvSteps = [
  "Open Omada Controller and select the live hotspot site.",
  "Create voucher batches in Omada. Make one batch per PaySpot plan.",
  "Match each Omada voucher duration, user limit, rate limit, and traffic limit to the PaySpot plan.",
  "Export Voucher Codes as CSV from Omada.",
  "Sign in to PaySpot, open Vouchers, select the matching plan, and import the CSV.",
  "Confirm the unused stock count before taking the portal live.",
] as const;

const validation = [
  "Join the hotspot as a new unauthenticated customer.",
  "Confirm the captive page opens and the Buy Voucher button loads PaySpot.",
  "Start checkout and confirm Paystack loads before authentication.",
  "Complete a small payment and confirm a voucher appears.",
  "Use that voucher in the Omada captive portal and confirm browsing starts.",
] as const;

export default async function TenantCsvOnboardingPage({ params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const portalUrl = absoluteAppUrl(`/t/${tenant.slug}`);
  const voucherCheckUrl = absoluteAppUrl(`/t/${tenant.slug}/voucher`);
  const adminUrl = absoluteAppUrl(`/t/${tenant.slug}/admin`);
  const portalHost = new URL(portalUrl).hostname;
  const customPortalSnippet = `<a href="${portalUrl}">
  Buy WiFi Voucher
</a>`;

  return (
    <PrototypeDocsShell title={`${tenant.name} CSV onboarding`}>
      <main className="mt-6 grid gap-5">
        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <p className="section-kicker">Personalized Omada CSV Setup</p>
          <h1 className="section-title text-[var(--tx)]">{tenant.name} PaySpot onboarding</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--tx2)]">
            Omada Cloud/OpenAPI integration is not available for this onboarding path yet. Use Omada-generated
            vouchers exported as CSV, then import those vouchers into PaySpot.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <LinkCard title="Customer portal" value={portalUrl} />
          <LinkCard title="Voucher check page" value={voucherCheckUrl} />
          <LinkCard title="Tenant admin" value={adminUrl} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
          <InfoPanel title="Create and export Omada vouchers" icon={ClipboardList} items={csvSteps} />
          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tx)]">
              <Wifi className="size-4" />
              Custom captive portal button
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tx2)]">
              Add this button to the tenant&apos;s Omada captive portal page so unauthenticated customers can buy.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-4 text-sm text-[var(--tx2)]">
              <code>{customPortalSnippet}</code>
            </pre>
          </section>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tx)]">
              <ShieldCheck className="size-4" />
              Omada pre-authentication access entries
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--tx2)]">
              Add these so the PaySpot store and Paystack checkout can load before customers authenticate.
            </p>
            <ul className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
              <li className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">{portalHost}</li>
              {paystackHosts.map((host) => (
                <li key={host} className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">{host}</li>
              ))}
            </ul>
          </section>
          <InfoPanel title="Final validation" icon={CircleCheckBig} items={validation} />
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada screenshots</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <figure className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--s2)]">
              <Image src="/docs/omada/voucher-create.png" alt="Omada voucher creation screen" width={960} height={560} className="h-auto w-full" />
              <figcaption className="border-t border-[var(--bd)] p-3 text-sm text-[var(--tx2)]">Create vouchers in Omada.</figcaption>
            </figure>
            <figure className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--s2)]">
              <Image src="/docs/omada/voucher-export-data.png" alt="Omada export voucher codes screen" width={960} height={560} className="h-auto w-full" />
              <figcaption className="border-t border-[var(--bd)] p-3 text-sm text-[var(--tx2)]">Export Voucher Codes as CSV.</figcaption>
            </figure>
            <figure className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--s2)]">
              <Image src="/help/omada-access-list/preauth-enable.png" alt="Omada pre-authentication access enabled" width={1000} height={650} className="h-auto w-full" />
              <figcaption className="border-t border-[var(--bd)] p-3 text-sm text-[var(--tx2)]">Enable Pre-Authentication Access for PaySpot and checkout.</figcaption>
            </figure>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Related guides</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <GuideLink href="/help/csv-import" label="CSV import guide" />
            <GuideLink href="/help/omada-access-list" label="Omada access list guide" />
            <GuideLink href="/help/custom-portal" label="Custom captive portal guide" />
          </div>
        </section>
      </main>
    </PrototypeDocsShell>
  );
}

function LinkCard({ title, value }: { title: string; value: string }) {
  return (
    <a href={value} className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5 text-inherit no-underline">
      <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ac)]">{title}</p>
      <p className="mt-2 break-all text-sm font-semibold text-[var(--tx)]">{value}</p>
    </a>
  );
}

function GuideLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-2 rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3 font-semibold text-[var(--ac)]">
      {label}
      <ExternalLink className="size-4" />
    </a>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: typeof CircleCheckBig;
  items: readonly string[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--tx)]">
        <Icon className="size-4" />
        {title}
      </h2>
      <ol className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
        {items.map((item, index) => (
          <li key={item} className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">
            <span className="font-mono text-xs text-[var(--ac)]">0{index + 1}</span> {item}
          </li>
        ))}
      </ol>
    </section>
  );
}

