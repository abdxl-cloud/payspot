import { z } from "zod";
import { getAppEnv, getMailEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { createTenantRequest, isTenantSlugAvailable } from "@/lib/store";

const schema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
  email: z.string().email().max(120),
});

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

  const { name, slug, email } = parsed.data;
  if (!isTenantSlugAvailable(slug)) {
    return Response.json(
      { error: "That tenant slug is not available" },
      { status: 409 },
    );
  }

  const { reviewToken } = createTenantRequest({
    requestedSlug: slug,
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

  const subject = `Tenant request: ${name} (${slug})`;
  const text = [
    "New tenant request received:",
    `- Name: ${name}`,
    `- Slug: ${slug}`,
    `- Admin email: ${email}`,
    "",
    "Review:",
    `Approve: ${approveUrl}`,
    `Deny: ${denyUrl}`,
  ].join("\n");

  await sendMail({ to: OWNER_EMAIL, subject, text });

  return Response.json({ status: "ok" });
}

