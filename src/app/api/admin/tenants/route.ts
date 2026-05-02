import { z } from "zod";
import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  createTenant,
  createUser,
  isTenantSlugAvailable,
  listTenantLocations,
  listTenants,
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
  maxLocations: z.coerce.number().int().min(1).max(50).default(1),
});

export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tenantRows = await listTenants();
  const tenants = await Promise.all(
    tenantRows.map(async (t) => {
      const locations = await listTenantLocations(t.id);
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        adminEmail: t.admin_email,
        status: t.status,
        locationCount: locations.length,
        maxLocations: t.max_locations ?? 1,
        paystackLast4: t.paystack_secret_last4,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    }),
  );

  return Response.json({ tenants });
}

export async function POST(request: Request) {
  const user = await getSessionUserFromRequest(request);
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

  const { slug, name, adminEmail, username, password, maxLocations } = parsed.data;
  if (!await isTenantSlugAvailable(slug)) {
    return Response.json(
      { error: "That tenant slug is not available" },
      { status: 409 },
    );
  }

  const tenantResult = await createTenant({
    slug,
    name,
    adminEmail,
    status: "pending_setup",
    maxLocations,
  });

  if (tenantResult.status !== "created") {
    return Response.json({ error: "Tenant already exists" }, { status: 409 });
  }

  const tempPassword = password ?? `Temp-${generateToken(9)}`;
  const userResult = await createUser({
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
      locationCount: 1,
      maxLocations: tenantResult.tenant.max_locations,
    },
    credentials: {
      email: userResult.user.email,
      temporaryPassword: tempPassword,
      mailSent,
    },
  });
}
