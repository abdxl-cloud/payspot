import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { isPaystackPublicKey, isPaystackSecretKey } from "@/lib/paystack-key";
import {
  getTenantArchitecture,
  getTenantBySlug,
  setTenantPaystackPublicKey,
  setTenantPaystackSecret,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  paystackPublicKey: z.string().max(200).optional(),
  paystackSecretKey: z.string().max(200).optional(),
});

async function normalizeTenantAccess(request: Request, tenantId: string) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (user.role === "tenant" && user.tenantId !== tenantId) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const publicKey = parsed.data.paystackPublicKey?.trim();
  const secretKey = parsed.data.paystackSecretKey?.trim();

  if (publicKey && !isPaystackPublicKey(publicKey)) {
    return Response.json({ error: "Use a valid Paystack public key (pk_test_... or pk_live_...)." }, { status: 400 });
  }
  if (secretKey && !isPaystackSecretKey(secretKey)) {
    return Response.json({ error: "Use a valid Paystack secret key (sk_test_... or sk_live_...)." }, { status: 400 });
  }

  if (publicKey !== undefined) {
    const result = await setTenantPaystackPublicKey({
      tenantId: tenant.id,
      paystackPublicKey: publicKey || null,
    });
    if (result.status === "missing") return Response.json({ error: "Tenant not found" }, { status: 404 });
    if (result.status === "invalid_public_key") {
      return Response.json({ error: "Use a valid Paystack public key (pk_test_... or pk_live_...)." }, { status: 400 });
    }
  }

  if (secretKey) {
    const result = await setTenantPaystackSecret({
      tenantId: tenant.id,
      paystackSecretKey: secretKey,
    });
    if (result.status === "missing") return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const architecture = await getTenantArchitecture(tenant.id);
  return Response.json({ ok: true, architecture });
}
