import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { isPaystackSecretKey } from "@/lib/paystack-key";
import {
  deleteTenant,
  getTenantById,
  setTenantPaystackSecret,
  updateTenant,
} from "@/lib/store";

type Props = {
  params: Promise<{ tenantId: string }>;
};

const patchSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
    .optional(),
  name: z.string().min(2).max(80).optional(),
  adminEmail: z.string().email().max(120).optional(),
  status: z.string().min(2).max(50).optional(),
  paystackSecretKey: z.string().min(10).max(200).optional(),
});

export async function PATCH(request: Request, { params }: Props) {
  const user = await getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await updateTenant({
    tenantId,
    slug: parsed.data.slug,
    name: parsed.data.name,
    adminEmail: parsed.data.adminEmail,
    status: parsed.data.status,
  });

  if (result.status === "missing") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (result.status === "email_taken") {
    return Response.json({ error: "That email is already in use" }, { status: 409 });
  }

  if (result.status === "slug_taken") {
    return Response.json({ error: "That slug is already in use" }, { status: 409 });
  }

  if (parsed.data.paystackSecretKey && !isPaystackSecretKey(parsed.data.paystackSecretKey)) {
    return Response.json(
      { error: "Use a valid Paystack secret key (sk_test_... or sk_live_...)." },
      { status: 400 },
    );
  }

  if (parsed.data.paystackSecretKey) {
    try {
      const secretResult = await setTenantPaystackSecret({
        tenantId,
        paystackSecretKey: parsed.data.paystackSecretKey,
      });
      if (secretResult.status !== "ok") {
        return Response.json({ error: "Tenant not found" }, { status: 404 });
      }
    } catch (error) {
      console.error("Paystack key encryption failed", error);
      return Response.json(
        { error: "Unable to save Paystack key" },
        { status: 500 },
      );
    }
  }

  const latestTenant = await getTenantById(tenantId);
  if (!latestTenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  return Response.json({
    status: "ok",
    tenant: {
      id: latestTenant.id,
      slug: latestTenant.slug,
      name: latestTenant.name,
      adminEmail: latestTenant.admin_email,
      status: latestTenant.status,
      paystackLast4: latestTenant.paystack_secret_last4,
    },
  });
}

export async function DELETE(request: Request, { params }: Props) {
  const user = await getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const result = await deleteTenant(tenantId);
  if (result.status === "missing") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  return Response.json({ status: "ok" });
}
