import { z } from "zod";
import { buildSessionCookie } from "@/lib/auth-cookies";
import { verifyPassword } from "@/lib/password";
import { createSession, getTenantById, getUserByEmail } from "@/lib/store";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  console.log("[v0] Login attempt started");
  const body = await request.json();
  console.log("[v0] Login body:", { email: body.email });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    console.log("[v0] Login validation failed:", parsed.error);
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { email, password } = parsed.data;
  console.log("[v0] Looking up user by email:", email);
  const user = await getUserByEmail(email);
  console.log("[v0] User found:", user ? { id: user.id, email: user.email, role: user.role } : null);
  if (!user) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = verifyPassword(password, user.password_hash);
  if (!ok) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await createSession({ userId: user.id });

  let redirectTo = "/admin";
  let tenantSlug: string | null = null;

  if (user.role === "tenant") {
    const tenantId = user.tenant_id;
    if (!tenantId) {
      return Response.json({ error: "Tenant user misconfigured" }, { status: 500 });
    }

    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    tenantSlug = tenant.slug;
    const needsSetup = user.must_change_password === 1 || !tenant.paystack_secret_enc;
    redirectTo = needsSetup ? `/t/${tenant.slug}/setup` : `/t/${tenant.slug}/admin`;
  }

  return Response.json(
    {
      status: "ok",
      redirectTo,
      user: {
        role: user.role,
        email: user.email,
        tenantSlug,
      },
    },
    {
      headers: {
        "Set-Cookie": buildSessionCookie({
          token: session.token,
          expiresAt: session.expiresAt,
        }),
      },
    },
  );
}
