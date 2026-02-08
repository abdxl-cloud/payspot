import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import {
  getTenantBySlug,
  getUserById,
  isTenantSlugAvailable,
  setTenantPaystackSecret,
  setUserMustChangePassword,
  updateTenant,
  updateUserPassword,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  newPassword: z.string().min(8).max(200).optional(),
  paystackSecretKey: z.string().min(10).max(200).optional(),
  newSlug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
    .optional(),
});

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export async function POST(request: Request, { params }: Props) {
  const sessionUser = getSessionUserFromRequest(request);
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (sessionUser.role !== "tenant" || sessionUser.tenantId !== tenant.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const userRow = getUserById(sessionUser.id);
  if (!userRow) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const mustChangePassword = userRow.must_change_password === 1;
  const requirePaystackKey = !tenant.paystack_secret_enc;
  const requestedSlug = parsed.data.newSlug?.toLowerCase() ?? tenant.slug;

  if (mustChangePassword) {
    if (!parsed.data.newPassword) {
      return Response.json({ error: "New password is required" }, { status: 400 });
    }
    const message = validatePassword(parsed.data.newPassword);
    if (message) {
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (requirePaystackKey && !parsed.data.paystackSecretKey) {
    return Response.json({ error: "Paystack secret key is required" }, { status: 400 });
  }

  if (requestedSlug !== tenant.slug && !isTenantSlugAvailable(requestedSlug)) {
    return Response.json({ error: "That link name is not available" }, { status: 409 });
  }

  if (parsed.data.newPassword) {
    const message = validatePassword(parsed.data.newPassword);
    if (message) {
      return Response.json({ error: message }, { status: 400 });
    }
    updateUserPassword({ userId: userRow.id, password: parsed.data.newPassword });
    setUserMustChangePassword({ userId: userRow.id, mustChangePassword: false });
  }

  if (parsed.data.paystackSecretKey) {
    try {
      const res = setTenantPaystackSecret({
        tenantId: tenant.id,
        paystackSecretKey: parsed.data.paystackSecretKey,
      });
      if (res.status !== "ok") {
        return Response.json(
          { error: "Unable to save Paystack key" },
          { status: 500 },
        );
      }
    } catch (error) {
      console.error("Paystack key encryption failed", error);
      return Response.json(
        { error: "Server crypto not configured" },
        { status: 500 },
      );
    }
  }

  if (requestedSlug !== tenant.slug) {
    const updated = updateTenant({
      tenantId: tenant.id,
      slug: requestedSlug,
    });
    if (updated.status === "slug_taken") {
      return Response.json({ error: "That link name is not available" }, { status: 409 });
    }
    if (updated.status === "missing") {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }
  }

  const latest = getTenantBySlug(requestedSlug) ?? tenant;

  return Response.json({
    status: "ok",
    redirectTo: `/t/${latest.slug}/admin`,
  });
}
