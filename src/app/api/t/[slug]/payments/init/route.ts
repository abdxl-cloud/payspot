import { z } from "zod";
import { randomUUID } from "node:crypto";
import { initializeTransaction } from "@/lib/paystack";
import {
  createTransaction,
  getAvailableCount,
  getPackageByCode,
  getTenantBySlug,
  markTransactionFailed,
  requireTenantPaystackSecretKey,
  updateTransactionAuthUrl,
} from "@/lib/store";
import { getCallbackUrl, getResumeTtlMs } from "@/lib/payments";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  email: z.string().email(),
  phone: z.string().min(7),
  packageCode: z.string().min(1),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = requireTenantPaystackSecretKey(tenant.id);
  } catch {
    return Response.json(
      { error: "Tenant payments are not configured" },
      { status: 409 },
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { email, phone, packageCode } = parsed.data;
  const pkg = getPackageByCode(tenant.id, packageCode);
  if (!pkg) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  const available = getAvailableCount(tenant.id, pkg.id);
  if (available <= 0) {
    return Response.json(
      { error: "No vouchers available for this package" },
      { status: 409 },
    );
  }

  const reference = `WIFI-${randomUUID().split("-")[0].toUpperCase()}`;
  const expiresAt = new Date(Date.now() + getResumeTtlMs()).toISOString();
  createTransaction({
    tenantId: tenant.id,
    reference,
    email,
    phone,
    amountNgn: pkg.price_ngn,
    packageId: pkg.id,
    authorizationUrl: null,
    expiresAt,
  });

  try {
    const callbackUrl = getCallbackUrl({ tenantSlug: tenant.slug, reference });
    const init = await initializeTransaction({
      secretKey: paystackSecretKey,
      email,
      amountKobo: pkg.price_ngn * 100,
      reference,
      callbackUrl,
      metadata: {
        tenant: tenant.slug,
        packageCode: pkg.code,
        phone,
      },
    });
    updateTransactionAuthUrl({
      tenantId: tenant.id,
      reference,
      authorizationUrl: init.authorization_url,
      expiresAt,
    });

    return Response.json({
      reference,
      authorizationUrl: init.authorization_url,
      verifyUrl: callbackUrl,
    });
  } catch (error) {
    console.error("Paystack init failed", error);
    markTransactionFailed({
      tenantId: tenant.id,
      reference,
      status: "init_failed",
    });
    return Response.json(
      { error: "Unable to initialize payment" },
      { status: 502 },
    );
  }
}
