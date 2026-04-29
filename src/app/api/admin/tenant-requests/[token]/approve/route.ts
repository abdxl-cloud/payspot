import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformPaystackKeys } from "@/lib/paystack-routing";
import { generateToken } from "@/lib/tokens";
import { sendTenantApprovalEmail } from "@/lib/tenant-approval-email";
import {
  approveTenantRequest,
  getTenantById,
  getTenantPrimaryUser,
  setUserMustChangePassword,
  updateUserPassword,
} from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

const approvalSchema = z.object({
  billingModel: z.enum(["percent", "fixed_subscription"]).default("percent"),
  feePercent: z.coerce.number().min(0).max(100).default(0),
  subscriptionAmountNgn: z.coerce.number().int().min(0).default(0),
  subscriptionInterval: z.enum(["monthly", "yearly"]).default("monthly"),
  paystackSubaccountCode: z.string().trim().max(80).optional(),
  approvalMessage: z.string().max(1200).optional(),
});

async function parseApprovalBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return approvalSchema.safeParse(await request.json().catch(() => ({})));
  }

  const form = await request.formData();
  return approvalSchema.safeParse({
    billingModel: form.get("billingModel"),
    feePercent: form.get("feePercent"),
    subscriptionAmountNgn: form.get("subscriptionAmountNgn"),
    subscriptionInterval: form.get("subscriptionInterval"),
    paystackSubaccountCode: form.get("paystackSubaccountCode"),
    approvalMessage: form.get("approvalMessage"),
  });
}

function htmlResponse(message: string, status = 200) {
  return new Response(
    `<!doctype html><html><body style="margin:0;background:#0d0d0d;color:#efefef;font-family:Arial,sans-serif;display:grid;min-height:100vh;place-items:center"><main style="max-width:560px;border:1px solid #262626;border-radius:22px;background:#141414;padding:28px"><p style="margin:0 0 8px;color:#72f064;font-size:12px;letter-spacing:.12em;text-transform:uppercase">PaySpot</p><h1 style="margin:0 0 12px;font-size:28px;letter-spacing:-.04em">${message}</h1><a href="/admin" style="color:#72f064">Back to admin</a></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  redirect(`/admin/tenant-requests/${token}/review`);
}

export async function POST(request: Request, { params }: Props) {
  const { token } = await params;
  const parsed = await parseApprovalBody(request);
  if (!parsed.success) {
    return Response.json({ error: "Invalid approval settings", details: parsed.error.flatten() }, { status: 400 });
  }
  const percentBilling = parsed.data.billingModel === "percent" && parsed.data.feePercent > 0;
  if (percentBilling) {
    if (!parsed.data.paystackSubaccountCode || !/^ACCT_[A-Z0-9]+$/i.test(parsed.data.paystackSubaccountCode)) {
      return htmlResponse("A valid tenant Paystack subaccount code (ACCT_...) is required for percentage billing.", 400);
    }
    try {
      requirePlatformPaystackKeys();
    } catch (error) {
      const message =
        error instanceof Error && error.message === "Platform Paystack key is invalid"
          ? "Admin Paystack key is invalid. Set PAYSTACK_SECRET_KEY to a valid sk_live_... key."
          : error instanceof Error && error.message === "Platform Paystack public key is invalid"
            ? "Admin Paystack public key is invalid. Set PAYSTACK_PUBLIC_KEY to a valid pk_live_... key."
            : error instanceof Error && error.message === "Platform Paystack public key is not configured"
              ? "Admin Paystack public key is required before approving percentage-billed tenants. Set PAYSTACK_PUBLIC_KEY."
          : "Admin Paystack key is required before approving percentage-billed tenants. Set PAYSTACK_SECRET_KEY.";
      return htmlResponse(message, 409);
    }
  }

  const result = await approveTenantRequest(token, parsed.data);

  if (result.status === "missing") {
    return htmlResponse("Invalid request token.", 404);
  }

  if (result.status === "slug_taken") {
    return htmlResponse("Cannot approve: slug is already taken. Request was denied.", 409);
  }

  if (result.status === "user_conflict") {
    return htmlResponse("Cannot approve: a user with that email or slug already exists. Request was denied.", 409);
  }

  if (result.status === "already_reviewed") {
    const tenantId = result.request?.tenant_id;
    if (!tenantId) return htmlResponse("Request already reviewed.", 409);

    const tenant = await getTenantById(tenantId);
    if (!tenant) return htmlResponse("Request already reviewed.", 409);

    const tenantUser = await getTenantPrimaryUser(tenant.id);
    if (!tenantUser) return htmlResponse("Tenant user missing.", 500);

    const temporaryPassword = `Temp-${generateToken(9)}`;
    await updateUserPassword({ userId: tenantUser.id, password: temporaryPassword });
    await setUserMustChangePassword({
      userId: tenantUser.id,
      mustChangePassword: true,
    });

    await sendTenantApprovalEmail({
      tenant,
      email: tenantUser.email,
      temporaryPassword,
      approvalMessage: parsed.data.approvalMessage,
      billingModel: tenant.platform_billing_model,
      feePercent: tenant.platform_fee_percent,
      subscriptionAmountNgn: tenant.platform_subscription_amount_ngn,
      subscriptionInterval: tenant.platform_subscription_interval,
    });

    return htmlResponse("Already approved. Login details re-sent.");
  }

  if (result.status !== "approved") {
    return htmlResponse("Unable to approve request.", 500);
  }

  await sendTenantApprovalEmail({
    tenant: result.tenant,
    email: result.email,
    temporaryPassword: result.temporaryPassword,
    approvalMessage: parsed.data.approvalMessage,
    billingModel: parsed.data.billingModel,
    feePercent: parsed.data.feePercent,
    subscriptionAmountNgn: parsed.data.subscriptionAmountNgn,
    subscriptionInterval: parsed.data.subscriptionInterval,
  });

  return htmlResponse("Approved. Login details sent.");
}
