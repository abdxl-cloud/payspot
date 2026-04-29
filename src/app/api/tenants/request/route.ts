import { z } from "zod";
import { getAppEnv, getMailEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { createTenantRequest, isTenantSlugAvailable } from "@/lib/store";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
  location: z.string().max(120).optional(),
  hotspotType: z.string().max(80).optional(),
  locationsCount: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 26);
}

function makeProvisionalSlug(name: string) {
  const base = slugify(name) || "tenant";
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`tenant_request:${ip}`, 10, 60 * 60_000);
  if (!limiter.allowed) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, email, location, hotspotType, locationsCount, notes } = parsed.data;
  let provisionalSlug = makeProvisionalSlug(name);
  for (let i = 0; i < 5 && !await isTenantSlugAvailable(provisionalSlug); i += 1) {
    provisionalSlug = makeProvisionalSlug(name);
  }
  if (!await isTenantSlugAvailable(provisionalSlug)) {
    return Response.json({ error: "Unable to allocate tenant id" }, { status: 500 });
  }

  const { reviewToken } = await createTenantRequest({
    requestedSlug: provisionalSlug,
    requestedName: name,
    requestedEmail: email,
  });

  const { APP_URL } = getAppEnv();
  const { OWNER_EMAIL } = getMailEnv();

  const approveUrl = new URL(
    `/admin/tenant-requests/${reviewToken}/review`,
    APP_URL,
  ).toString();
  const denyUrl = new URL(
    `/api/admin/tenant-requests/${reviewToken}/deny`,
    APP_URL,
  ).toString();

  const subject = `Tenant request: ${name}`;
  const rows = [
    ["Business", name],
    ["Provisional slug", `${provisionalSlug} (tenant can update in setup)`],
    ["Admin email", email],
    ["Location", location],
    ["Hotspot type", hotspotType],
    ["Locations", locationsCount],
    ["Notes", notes],
  ].filter(([, value]) => value && String(value).trim() !== "");
  const text = [
    "New tenant request received:",
    `- Name: ${name}`,
    `- Provisional slug: ${provisionalSlug} (tenant can update in setup)`,
    `- Admin email: ${email}`,
    location ? `- Location: ${location}` : null,
    hotspotType ? `- Hotspot type: ${hotspotType}` : null,
    locationsCount ? `- Locations: ${locationsCount}` : null,
    notes ? `- Notes: ${notes}` : null,
    "",
    "Review:",
    `Review and approve: ${approveUrl}`,
    `Deny: ${denyUrl}`,
  ].filter(Boolean).join("\n");
  const html = `
<!doctype html>
<html>
<body style="margin:0;background:#0d0d0d;color:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:28px 14px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#141414;border:1px solid #262626;border-radius:22px;overflow:hidden">
        <tr>
          <td style="padding:28px 30px;border-bottom:1px solid #262626;background:linear-gradient(135deg,#111,#1b281d)">
            <p style="margin:0 0 8px;color:#72f064;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Operator request</p>
            <h1 style="margin:0;color:#ffffff;font-size:30px;line-height:1.05;letter-spacing:-.04em">Review ${name}</h1>
            <p style="margin:10px 0 0;color:#9a9a9a;font-size:14px">A new hotspot operator asked for PaySpot access.</p>
          </td>
        </tr>
        <tr><td style="padding:24px 30px">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            ${rows.map(([label, value]) => `
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #262626;color:#626262;font-size:12px;text-transform:uppercase;letter-spacing:.08em">${label}</td>
                <td style="padding:12px 0;border-bottom:1px solid #262626;color:#efefef;font-size:14px;text-align:right">${escapeHtml(String(value))}</td>
              </tr>
            `).join("")}
          </table>
          <div style="margin-top:24px">
            <a href="${approveUrl}" style="display:inline-block;margin:0 8px 8px 0;background:#72f064;color:#101010;text-decoration:none;border-radius:10px;padding:13px 18px;font-weight:800">Review and approve</a>
            <a href="${denyUrl}" style="display:inline-block;margin:0 0 8px;background:#2a1616;color:#ff6b6b;text-decoration:none;border:1px solid #5a2424;border-radius:10px;padding:12px 17px;font-weight:800">Deny</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendMail({ to: OWNER_EMAIL, subject, text, html });

  return Response.json({ status: "ok" });
}

