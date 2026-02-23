import { z } from "zod";
import { getAppEnv, getMailEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { createTenantRequest, isTenantSlugAvailable } from "@/lib/store";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email().max(120),
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

  const { name, email } = parsed.data;
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
    `/api/admin/tenant-requests/${reviewToken}/approve`,
    APP_URL,
  ).toString();
  const denyUrl = new URL(
    `/api/admin/tenant-requests/${reviewToken}/deny`,
    APP_URL,
  ).toString();

  const subject = `Tenant request: ${name}`;
  const text = [
    "New tenant request received:",
    `- Name: ${name}`,
    `- Provisional slug: ${provisionalSlug} (tenant can update in setup)`,
    `- Admin email: ${email}`,
    "",
    "Review:",
    `Approve: ${approveUrl}`,
    `Deny: ${denyUrl}`,
  ].join("\n");

  await sendMail({ to: OWNER_EMAIL, subject, text });

  return Response.json({ status: "ok" });
}

