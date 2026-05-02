import { getSessionUserFromRequest } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { requirePlatformPaystackKeys } from "@/lib/paystack-routing";
import { sendTenantApprovalEmail } from "@/lib/tenant-approval-email";
import {
  approveTenantRequestById,
  denyTenantRequestById,
  listTenantRequests,
} from "@/lib/store";
import { z } from "zod";

const approvalSettingsSchema = z.object({
  billingModel: z.enum(["percent", "fixed_subscription"]).optional(),
  feePercent: z.coerce.number().min(0).max(100).optional(),
  subscriptionAmountNgn: z.coerce.number().int().min(0).optional(),
  subscriptionInterval: z.enum(["monthly", "yearly"]).optional(),
  paystackSubaccountCode: z.string().trim().max(80).optional(),
  approvalMessage: z.string().max(1200).optional(),
  maxLocations: z.coerce.number().int().min(1).max(50).default(1),
  storeSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
});

function mapRequest(row: Awaited<ReturnType<typeof listTenantRequests>>[number]) {
  return {
    id: row.id,
    requestedSlug: row.requested_slug,
    requestedName: row.requested_name,
    requestedEmail: row.requested_email,
    hotspotType: row.hotspot_type,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    tenantId: row.tenant_id,
  };
}

async function requireAdmin(request: Request) {
  const user = await getSessionUserFromRequest(request);
  return user?.role === "admin";
}

export async function GET(request: Request) {
  if (!await requireAdmin(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status")?.trim().toLowerCase() || "all";
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const rows = await listTenantRequests({
    status,
    limit: Number.isFinite(limit) ? limit : 100,
  });

  return Response.json({ requests: rows.map(mapRequest) });
}

export async function POST(request: Request) {
  if (!await requireAdmin(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as {
    requestId?: string;
    action?: string;
  } & Record<string, unknown> | null;

  const requestId = body?.requestId?.trim();
  const action = body?.action?.trim().toLowerCase();
  if (!requestId || (action !== "approve" && action !== "deny")) {
    return Response.json({ error: "Invalid request action" }, { status: 400 });
  }

  if (action === "deny") {
    const result = await denyTenantRequestById(requestId);
    if (result.status !== "denied") {
      return Response.json({ error: "Request is missing or already reviewed" }, { status: 409 });
    }

    if (result.request?.requested_email) {
      await sendMail({
        to: result.request.requested_email,
        subject: "Tenant portal request update",
        text: [
          "Your tenant portal request was not approved at this time.",
          "",
          "If you believe this was a mistake, reply to this email.",
        ].join("\n"),
      }).catch((error) => {
        console.error("Tenant request denial email failed", error);
      });
    }

    return Response.json({ status: "ok", request: result.request ? mapRequest(result.request) : null });
  }

  const approvalSettings = approvalSettingsSchema.safeParse(body ?? {});
  if (!approvalSettings.success) {
    return Response.json({ error: "Invalid approval settings", details: approvalSettings.error.flatten() }, { status: 400 });
  }
  const percentBilling =
    approvalSettings.data.billingModel === "percent" &&
    Number(approvalSettings.data.feePercent ?? 0) > 0;
  if (percentBilling) {
    if (
      !approvalSettings.data.paystackSubaccountCode ||
      !/^ACCT_[A-Z0-9]+$/i.test(approvalSettings.data.paystackSubaccountCode)
    ) {
      return Response.json({ error: "A valid tenant Paystack subaccount code (ACCT_...) is required for percentage billing." }, { status: 400 });
    }
    try {
      await requirePlatformPaystackKeys();
    } catch (error) {
      return Response.json({
        error:
          error instanceof Error && error.message === "Platform Paystack key is invalid"
            ? "Admin Paystack key is invalid. Set PAYSTACK_SECRET_KEY to a valid sk_live_... key."
            : error instanceof Error && error.message === "Platform Paystack public key is invalid"
              ? "Admin Paystack public key is invalid. Set PAYSTACK_PUBLIC_KEY to a valid pk_live_... key."
              : error instanceof Error && error.message === "Platform Paystack public key is not configured"
                ? "Admin Paystack public key is required before approving percentage-billed tenants. Set PAYSTACK_PUBLIC_KEY."
            : "Admin Paystack key is required before approving percentage-billed tenants. Set PAYSTACK_SECRET_KEY.",
      }, { status: 409 });
    }
  }

  const result = await approveTenantRequestById(requestId, approvalSettings.data);
  if (result.status === "missing") {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }
  if (result.status === "already_reviewed") {
    return Response.json({ error: "Request already reviewed" }, { status: 409 });
  }
  if (result.status === "slug_taken") {
    return Response.json({ error: "Tenant slug is already taken" }, { status: 409 });
  }
  if (result.status === "invalid_slug") {
    return Response.json({ error: "Store slug is invalid" }, { status: 400 });
  }
  if (result.status === "user_conflict") {
    return Response.json({ error: "A user with that email or slug already exists" }, { status: 409 });
  }
  if (result.status !== "approved") {
    return Response.json({ error: "Unable to approve request" }, { status: 500 });
  }

  await sendTenantApprovalEmail({
    tenant: result.tenant,
    email: result.email,
    temporaryPassword: result.temporaryPassword,
    approvalMessage: approvalSettings.data.approvalMessage,
    billingModel: approvalSettings.data.billingModel,
    feePercent: approvalSettings.data.feePercent,
    subscriptionAmountNgn: approvalSettings.data.subscriptionAmountNgn,
    subscriptionInterval: approvalSettings.data.subscriptionInterval,
    hotspotType: result.request?.hotspot_type,
  }).catch((error) => {
    console.error("Tenant request approval email failed", error);
  });

  return Response.json({
    status: "ok",
    tenant: {
      id: result.tenant.id,
      slug: result.tenant.slug,
      name: result.tenant.name,
      adminEmail: result.tenant.admin_email,
      status: result.tenant.status,
      maxLocations: result.tenant.max_locations,
    },
    credentials: {
      email: result.email,
      temporaryPassword: result.temporaryPassword,
    },
  });
}
