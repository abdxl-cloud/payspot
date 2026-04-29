import { sendMail } from "@/lib/mailer";
import { denyTenantRequest } from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

function confirmationPage(token: string) {
  const reviewUrl = `/admin/tenant-requests/${encodeURIComponent(token)}/review`;
  return new Response(
    `<!doctype html><html><head><meta name="robots" content="noindex"></head><body style="margin:0;background:#0d0d0d;color:#efefef;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center">
<main style="max-width:480px;border:1px solid #262626;border-radius:22px;background:#141414;padding:28px">
  <p style="margin:0 0 8px;color:#ff6b6b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">PaySpot</p>
  <h1 style="margin:0 0 12px;font-size:28px;letter-spacing:-.04em">Deny this request?</h1>
  <p style="margin:0 0 24px;color:#9a9a9a;font-size:14px">This will send a rejection email to the applicant and cannot be undone.</p>
  <form method="POST" style="display:flex;gap:12px;flex-wrap:wrap">
    <button type="submit" style="background:#3a1a1a;color:#ff6b6b;border:1px solid #5a2424;border-radius:10px;padding:12px 20px;font-weight:800;cursor:pointer;font-size:14px">Confirm denial</button>
    <a href="${reviewUrl}" style="display:inline-flex;align-items:center;color:#9a9a9a;font-size:14px;text-decoration:none;padding:12px 0">Cancel</a>
  </form>
</main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  return confirmationPage(token);
}

export async function POST(_request: Request, { params }: Props) {
  const { token } = await params;
  const result = await denyTenantRequest(token);

  if (result.status === "missing_or_reviewed") {
    return new Response("Invalid token or already reviewed.", { status: 404 });
  }

  const request = result.request;
  if (request?.requested_email) {
    const subject = "Tenant portal request update";
    const text = [
      "Your tenant portal request was not approved at this time.",
      "",
      "If you believe this was a mistake, reply to this email.",
    ].join("\n");

    await sendMail({ to: request.requested_email, subject, text });
  }

  return new Response(
    `<!doctype html><html><body style="margin:0;background:#0d0d0d;color:#efefef;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:480px;border:1px solid #262626;border-radius:22px;background:#141414;padding:28px"><p style="margin:0 0 8px;color:#ff6b6b;font-size:12px;letter-spacing:.12em;text-transform:uppercase">PaySpot</p><h1 style="margin:0 0 12px;font-size:28px;letter-spacing:-.04em">Request denied.</h1><p style="margin:0 0 24px;color:#9a9a9a;font-size:14px">A rejection email has been sent to the applicant.</p><a href="/admin" style="color:#72f064">Back to admin</a></main></body></html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
