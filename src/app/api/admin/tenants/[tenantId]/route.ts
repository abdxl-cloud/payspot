import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { deleteTenant, updateTenant } from "@/lib/store";

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
});

export async function PATCH(request: Request, { params }: Props) {
  const user = getSessionUserFromRequest(request);
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

  const result = updateTenant({
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

  return Response.json({
    status: "ok",
    tenant: {
      id: result.tenant.id,
      slug: result.tenant.slug,
      name: result.tenant.name,
      adminEmail: result.tenant.admin_email,
      status: result.tenant.status,
      paystackLast4: result.tenant.paystack_secret_last4,
    },
  });
}

export async function DELETE(request: Request, { params }: Props) {
  const user = getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const result = deleteTenant(tenantId);
  if (result.status === "missing") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  return Response.json({ status: "ok" });
}
