import { z } from "zod";
import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  createTenant,
  createUser,
  isTenantSlugAvailable,
  listTenants,
  seedDefaultPackagesForTenantId,
} from "@/lib/store";
import { generateToken } from "@/lib/tokens";

const createSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format"),
  name: z.string().min(2).max(80),
  adminEmail: z.string().email().max(120),
  username: z.string().min(2).max(80).optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function GET(request: Request) {
  const user = getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenants = listTenants().map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    adminEmail: t.admin_email,
    status: t.status,
    paystackLast4: t.paystack_secret_last4,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  return Response.json({ tenants });
}

export async function POST(request: Request) {
  const user = getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { slug, name, adminEmail, username, password } = parsed.data;
  if (!isTenantSlugAvailable(slug)) {
    return Response.json(
      { error: "That tenant slug is not available" },
      { status: 409 },
    );
  }

  const tenantResult = createTenant({
    slug,
    name,
    adminEmail,
    status: "pending_setup",
  });

  if (tenantResult.status !== "created") {
    return Response.json({ error: "Tenant already exists" }, { status: 409 });
  }

  seedDefaultPackagesForTenantId(tenantResult.tenant.id);

  const tempPassword = password ?? `Temp-${generateToken(9)}`;
  const userResult = createUser({
    email: adminEmail,
    username: username ?? slug,
    role: "tenant",
    tenantId: tenantResult.tenant.id,
    password: tempPassword,
    mustChangePassword: true,
  });

  if (userResult.status !== "created") {
    return Response.json({ error: "Email or username already exists" }, { status: 409 });
  }

  const { APP_URL } = getAppEnv();
  const loginUrl = new URL("/login", APP_URL).toString();
  const subject = `Your tenant portal is ready: ${tenantResult.tenant.name}`;
  const text = [
    "Your tenant portal has been created.",
    "",
    `Purchase link: ${new URL(`/t/${tenantResult.tenant.slug}`, APP_URL).toString()}`,
    "",
    "Login details:",
    `Email: ${userResult.user.email}`,
    `Temporary password: ${tempPassword}`,
    "",
    "Sign in here:",
    loginUrl,
    "",
    "On first login, you must set your password and Paystack key before using the portal.",
  ].join("\n");

  let mailSent = true;
  try {
    await sendMail({ to: adminEmail, subject, text });
  } catch (error) {
    mailSent = false;
    console.error("Tenant credentials email failed", error);
  }

  return Response.json({
    status: "ok",
    tenant: {
      id: tenantResult.tenant.id,
      slug: tenantResult.tenant.slug,
      name: tenantResult.tenant.name,
      adminEmail: tenantResult.tenant.admin_email,
      status: tenantResult.tenant.status,
    },
    credentials: {
      email: userResult.user.email,
      temporaryPassword: tempPassword,
      mailSent,
    },
  });
}
