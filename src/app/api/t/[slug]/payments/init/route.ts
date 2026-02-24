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
  phone: z.string().min(7),
  packageCode: z.string().min(1),
});

function buildCheckoutEmailFromPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const localPart = (digits || `guest${randomUUID().slice(0, 8)}`).slice(0, 40);
  return `${localPart}@guest.payspot.co`;
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  let paystackSecretKey: string;
  try {
    paystackSecretKey = await requireTenantPaystackSecretKey(tenant.id);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Tenant Paystack key is invalid"
        ? "Tenant payment key is invalid. Use a Paystack secret key (sk_test_... or sk_live_...)."
        : "Tenant payments are not configured";
    return Response.json(
      { error: message },
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

  const { phone, packageCode } = parsed.data;
  const email = buildCheckoutEmailFromPhone(phone);
  const pkg = await getPackageByCode(tenant.id, packageCode);
  if (!pkg) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  const available = await getAvailableCount(tenant.id, pkg.id);
  if (available <= 0) {
    return Response.json(
      { error: "No vouchers available for this package" },
      { status: 409 },
    );
  }

  let reference: string | null = null;
  try {
    reference = `WIFI-${randomUUID().split("-")[0].toUpperCase()}`;
    const expiresAt = new Date(Date.now() + getResumeTtlMs()).toISOString();
    await createTransaction({
      tenantId: tenant.id,
      reference,
      email,
      phone,
      amountNgn: pkg.price_ngn,
      packageId: pkg.id,
      authorizationUrl: null,
      expiresAt,
    });

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
    await updateTransactionAuthUrl({
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
    const reason =
      error instanceof Error ? error.message : "Unknown initialization error";
    if (reference) {
      try {
        await markTransactionFailed({
          tenantId: tenant.id,
          reference,
          status: "init_failed",
        });
      } catch (markError) {
        console.error("Unable to mark transaction as failed", markError);
      }
    }
    return Response.json(
      { error: reason || "Unable to initialize payment" },
      { status: 502 },
    );
  }
}
