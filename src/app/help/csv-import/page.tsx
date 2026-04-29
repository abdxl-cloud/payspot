import Image from "next/image";
import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const omadaSteps = [
  "Open Omada Controller and select the correct site for the hotspot.",
  "Go to Hotspot Manager or Authentication, open Voucher Manager, and create vouchers for one PaySpot plan.",
  "Match the Omada duration, user limit, rate limit, and traffic limit to the plan you created in PaySpot.",
  "For Omada Controller v5.9 and newer, go to Site Settings > Services > Export Data, choose Voucher Codes, choose CSV, then export.",
  "In PaySpot tenant admin, open Vouchers, choose the matching plan, upload the CSV, and confirm the unused stock count.",
] as const;

const csvRequirements = [
  "The CSV must include a voucher code column. Accepted names include Code, Voucher Code, Voucher, or csvCode.",
  "Only unused vouchers should be imported. Do not import already-used Omada vouchers.",
  "Create and export a separate CSV for each PaySpot plan when plans have different durations or limits.",
  "Import the file into the matching PaySpot plan so customers receive a voucher with the correct Omada duration.",
] as const;

const troubleshooting = [
  "Imported count is zero: confirm the exported file is CSV, not XLSX, and that the code column is present.",
  "Duplicates are skipped: this is safe. PaySpot will not import the same voucher twice.",
  "Customers get invalid voucher: confirm the voucher still exists in Omada and was not deleted after export.",
  "Wrong duration: export a fresh Omada voucher batch whose duration matches the PaySpot plan.",
] as const;

const officialReferences = [
  {
    label: "TP-Link Omada voucher authentication guide",
    href: "https://support.omadanetworks.com/us/document/12914/",
  },
  {
    label: "TP-Link Omada Export Data guide",
    href: "https://support.omadanetworks.com/uy/document/13317/",
  },
] as const;

export default function CsvImportHelpPage() {
  return (
    <PrototypeDocsShell title="CSV voucher setup">
      <main className="mt-6 grid gap-5">
        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <p className="section-kicker">Architecture Guide</p>
          <h1 className="section-title text-[var(--tx)]">CSV Import with Omada vouchers</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--tx2)]">
            Use CSV import when Omada generates the real voucher codes and PaySpot sells those codes online.
            The important rule is simple: create vouchers in Omada first, export them, then import the same
            vouchers into the matching PaySpot plan.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <VisualStep
            image="/docs/omada/voucher-create.png"
            label="Step 1"
            title="Create vouchers in Omada"
            copy="Create one voucher batch per plan. If your PaySpot plan is 1 day, the Omada voucher batch should also be 1 day."
          />
          <VisualStep
            image="/docs/omada/voucher-print-selected.png"
            label="Step 2"
            title="Confirm generated codes"
            copy="Omada shows the generated vouchers in Voucher Manager. This is where you can review or print selected vouchers."
          />
          <VisualStep
            image="/docs/omada/voucher-export-data.png"
            label="Step 3"
            title="Export Voucher Codes as CSV"
            copy="On newer Omada Controller versions, use Site Settings > Services > Export Data, select Voucher Codes, choose CSV, and export."
          />
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Detailed Omada workflow</h2>
          <ol className="mt-3 grid gap-2 text-sm text-[var(--tx2)]">
            {omadaSteps.map((item, index) => (
              <li key={item} className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3">
                <span className="font-mono text-xs text-[var(--ac)]">0{index + 1}</span> {item}
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <InfoPanel title="CSV requirements" items={csvRequirements} />
          <InfoPanel title="Troubleshooting" items={troubleshooting} />
        </section>

        <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
          <h2 className="text-sm font-semibold text-[var(--tx)]">Official Omada references</h2>
          <p className="mt-2 text-sm text-[var(--tx2)]">
            The screenshots above are from TP-Link/Omada support material. Use these links when your controller UI
            labels differ slightly by version.
          </p>
          <div className="mt-3 grid gap-2">
            {officialReferences.map((item) => (
              <a
                key={item.href}
                className="rounded-xl border border-[var(--bd)] bg-[var(--s2)] p-3 text-sm font-semibold text-[var(--ac)]"
                href={item.href}
                target="_blank"
                rel="noreferrer"
              >
                {item.label}
              </a>
            ))}
          </div>
        </section>
      </main>
    </PrototypeDocsShell>
  );
}

function VisualStep({
  image,
  label,
  title,
  copy,
}: {
  image: string;
  label: string;
  title: string;
  copy: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--bd)] bg-[var(--s1)]">
      <Image
        src={image}
        alt={title}
        width={960}
        height={560}
        className="aspect-video w-full border-b border-[var(--bd)] object-cover"
      />
      <div className="p-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ac)]">{label}</p>
        <h2 className="mt-1 text-base font-semibold text-[var(--tx)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--tx2)]">{copy}</p>
      </div>
    </article>
  );
}

function InfoPanel({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <section className="rounded-2xl border border-[var(--bd)] bg-[var(--s1)] p-5">
      <h2 className="text-sm font-semibold text-[var(--tx)]">{title}</h2>
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
