import { getSessionUserFromRequest } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import {
  approveTenantRequestById,
  denyTenantRequestById,
  listTenantRequests,
} from "@/lib/store";

function mapRequest(row: Awaited<ReturnType<typeof listTenantRequests>>[number]) {
  return {
    id: row.id,
    requestedSlug: row.requested_slug,
    requestedName: row.requested_name,
    requestedEmail: row.requested_email,
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
  } | null;

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

  const result = await approveTenantRequestById(requestId);
  if (result.status === "missing") {
    return Response.json({ error: "Request not found" }, { status: 404 });
  }
  if (result.status === "already_reviewed") {
    return Response.json({ error: "Request already reviewed" }, { status: 409 });
  }
  if (result.status === "slug_taken") {
    return Response.json({ error: "Tenant slug is already taken" }, { status: 409 });
  }
  if (result.status === "user_conflict") {
    return Response.json({ error: "A user with that email or slug already exists" }, { status: 409 });
  }
  if (result.status !== "approved") {
    return Response.json({ error: "Unable to approve request" }, { status: 500 });
  }

  const { APP_URL } = getAppEnv();
  const loginUrl = new URL("/login", APP_URL).toString();
  await sendMail({
    to: result.tenant.admin_email,
    subject: `Your tenant portal is approved: ${result.tenant.name}`,
    text: [
      "Your tenant portal has been approved.",
      "",
      `Tenant: ${result.tenant.name}`,
      `Slug: ${result.tenant.slug}`,
      `Purchase link: ${new URL(`/t/${result.tenant.slug}`, APP_URL).toString()}`,
      "",
      "Login details:",
      `Email: ${result.email}`,
      `Temporary password: ${result.temporaryPassword}`,
      "",
      "Sign in here:",
      loginUrl,
      "",
      "On first login, you must set your password and Paystack key before using the portal.",
    ].join("\n"),
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
    },
    credentials: {
      email: result.email,
      temporaryPassword: result.temporaryPassword,
    },
  });
}
