import { PrototypeDocsShell } from "@/components/prototype-docs-shell";

const prerequisites = [
  "A PaySpot tenant configured with Access mode = voucher_access and Voucher source = radius_voucher.",
  "An external RADIUS service or adapter that can call PaySpot over HTTPS.",
  "A NAS/controller such as MikroTik, Omada, or another hotspot gateway pointed at that RADIUS service.",
] as const;

const payspotSteps = [
  "Open /t/<slug>/admin and go to Configure architecture.",
  "Set Access mode to Voucher access.",
  "Set Voucher source to External RADIUS voucher mode.",
  "Create plans with price plus at least one limit: duration or data cap.",
  "Save the generated adapter secret fingerprint and connect your RADIUS adapter with the full secret.",
] as const;

const voucherRules = [
  "PaySpot issues the voucher immediately after successful payment.",
  "Voucher username = transaction reference.",
  "Voucher password = same as the voucher code.",
  "RADIUS policy comes from the paid PaySpot plan: session timeout, data cap, max devices, and bandwidth profile.",
] as const;

const adapterContract = [
  "Authorize endpoint: POST /api/t/<slug>/radius/authorize",
  "Accounting endpoint: POST /api/t/<slug>/radius/accounting",
  "Required header: x-radius-adapter-secret",
  "Authorize body: { username, password, callingStationId? }",
  "Accounting body: { event, sessionId, transactionReference?, username?, octets, callingStationId?, calledStationId?, nasIpAddress? }",
  "PaySpot can recover transactionReference from the active session or username when the adapter does not send it on every accounting event.",
] as const;

const validation = [
  "Run one payment from /t/<slug> and confirm a voucher code is shown immediately after payment.",
  "Use that voucher code as both username and password on the hotspot login page.",
  "Check that authorize returns accept=true and reply fields for the selected plan.",
  "Send interim updates so PaySpot can track used data and active sessions.",
  "Open /t/<slug>/voucher?code=<voucher> to confirm customer-visible usage lookup works.",
] as const;

export default function RadiusVoucherHelpPage() {
  return (
    <PrototypeDocsShell title="RADIUS voucher setup">
        <main className="mt-6 grid gap-4">
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <p className="section-kicker">Voucher + RADIUS</p>
            <h1 className="section-title">External RADIUS Voucher Setup</h1>
            <p className="mt-2 text-sm text-amber-900">
              Use this mode when you want voucher sales in PaySpot but data usage, device limits, and accounting enforced by an external RADIUS stack.
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
            <h2 className="text-sm font-semibold text-slate-900">2) Configure PaySpot</h2>
            <ol className="mt-3 space-y-2 text-sm text-slate-700">
              {payspotSteps.map((item, index) => (
                <li key={item}>
                  {index + 1}. {item}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">3) Voucher Behavior</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {voucherRules.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-semibold text-slate-900">4) Adapter Contract</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {adapterContract.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">Key response fields</p>
              <p><code>accept</code> decides whether the voucher is allowed.</p>
              <p><code>transactionReference</code> identifies the paid voucher session.</p>
              <p><code>reply.sessionTimeout</code>, <code>reply.dataLimitMb</code>, <code>reply.maxDevices</code>, and <code>reply.bandwidthProfile</code> come from the plan.</p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-900">5) Validation Checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {validation.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </section>
        </main>
    </PrototypeDocsShell>
  );
}
