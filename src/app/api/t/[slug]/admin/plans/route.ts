import { randomUUID } from "node:crypto";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

async function normalizeTenantAccess(request: Request, tenantId: string) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (user.role === "tenant" && user.tenantId !== tenantId) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const db = getDb();
  const plans = await db
    .prepare(
      `
      SELECT
        p.id,
        p.code,
        p.name,
        p.duration_minutes as "durationMinutes",
        p.price_ngn as "priceNgn",
        p.active,
        p.description,
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        COALESCE(SUM(CASE WHEN v.status = 'UNUSED' THEN 1 ELSE 0 END), 0) as "unusedCount",
        COALESCE(SUM(CASE WHEN v.status = 'ASSIGNED' THEN 1 ELSE 0 END), 0) as "assignedCount",
        COALESCE(COUNT(v.id), 0) as "totalCount"
      FROM voucher_packages p
      LEFT JOIN voucher_pool v
        ON v.tenant_id = p.tenant_id AND v.package_id = p.id
      WHERE p.tenant_id = ?
      GROUP BY p.id
      ORDER BY p.duration_minutes ASC, p.created_at DESC
    `,
    )
    .all(tenant.id);

  return Response.json({ plans });
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    durationMinutes?: number;
    priceNgn?: number;
    active?: boolean;
    description?: string;
  };

  const code = body.code?.trim().toLowerCase();
  const name = body.name?.trim();
  const durationMinutes = body.durationMinutes;
  const priceNgn = body.priceNgn;
  const description = body.description?.trim() || null;

  if (!code || code.length < 2) {
    return Response.json({ error: "Plan code is required" }, { status: 400 });
  }
  if (!name || name.length < 2) {
    return Response.json({ error: "Plan name is required" }, { status: 400 });
  }
  if (typeof durationMinutes !== "number" || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return Response.json({ error: "Invalid durationMinutes" }, { status: 400 });
  }
  if (typeof priceNgn !== "number" || !Number.isFinite(priceNgn) || priceNgn < 0) {
    return Response.json({ error: "Invalid priceNgn" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();
  try {
    await db.prepare(
      `
      INSERT INTO voucher_packages (
        id, tenant_id, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      randomUUID(),
      tenant.id,
      code,
      name,
      Math.round(durationMinutes),
      Math.round(priceNgn),
      body.active === false ? 0 : 1,
      description,
      now,
      now,
    );
  } catch {
    return Response.json({ error: "Plan code already exists" }, { status: 409 });
  }

  return Response.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as {
    planId?: string;
    code?: string;
    name?: string;
    durationMinutes?: number;
    priceNgn?: number;
    active?: boolean;
    description?: string;
  };

  const planId = body.planId?.trim();
  if (!planId) return Response.json({ error: "Missing planId" }, { status: 400 });

  const db = getDb();
  const existing = await db
    .prepare("SELECT id FROM voucher_packages WHERE tenant_id = ? AND id = ?")
    .get(tenant.id, planId) as { id: string } | undefined;
  if (!existing) return Response.json({ error: "Plan not found" }, { status: 404 });

  const fields: string[] = [];
  const args: Array<string | number | null> = [];

  if (typeof body.code === "string") {
    const code = body.code.trim().toLowerCase();
    if (!code || code.length < 2) {
      return Response.json({ error: "Invalid code" }, { status: 400 });
    }
    fields.push("code = ?");
    args.push(code);
  }
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name || name.length < 2) {
      return Response.json({ error: "Invalid name" }, { status: 400 });
    }
    fields.push("name = ?");
    args.push(name);
  }
  if (typeof body.durationMinutes === "number") {
    if (!Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0) {
      return Response.json({ error: "Invalid durationMinutes" }, { status: 400 });
    }
    fields.push("duration_minutes = ?");
    args.push(Math.round(body.durationMinutes));
  }
  if (typeof body.priceNgn === "number") {
    if (!Number.isFinite(body.priceNgn) || body.priceNgn < 0) {
      return Response.json({ error: "Invalid priceNgn" }, { status: 400 });
    }
    fields.push("price_ngn = ?");
    args.push(Math.round(body.priceNgn));
  }
  if (typeof body.active === "boolean") {
    fields.push("active = ?");
    args.push(body.active ? 1 : 0);
  }
  if (typeof body.description === "string") {
    fields.push("description = ?");
    args.push(body.description.trim() || null);
  }

  if (fields.length === 0) {
    return Response.json({ error: "No fields provided" }, { status: 400 });
  }

  fields.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(tenant.id, planId);

  try {
    const result = await db
      .prepare(
        `
        UPDATE voucher_packages
        SET ${fields.join(", ")}
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(...args);
    if (result.changes === 0) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }
  } catch {
    return Response.json({ error: "Unable to update plan" }, { status: 409 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as { planId?: string };
  const planId = body.planId?.trim();
  if (!planId) return Response.json({ error: "Missing planId" }, { status: 400 });

  const db = getDb();
  const existing = await db
    .prepare("SELECT id FROM voucher_packages WHERE tenant_id = ? AND id = ?")
    .get(tenant.id, planId) as { id: string } | undefined;
  if (!existing) return Response.json({ error: "Plan not found" }, { status: 404 });

  const linkedTx = await db
    .prepare("SELECT COUNT(1) as count FROM transactions WHERE tenant_id = ? AND package_id = ?")
    .get(tenant.id, planId) as { count: number };
  if ((linkedTx.count ?? 0) > 0) {
    return Response.json(
      { error: "Cannot delete plan with transaction history." },
      { status: 409 },
    );
  }

  const run = db.transaction(async () => {
    await db.prepare("DELETE FROM voucher_pool WHERE tenant_id = ? AND package_id = ?").run(tenant.id, planId);
    const result = await db
      .prepare("DELETE FROM voucher_packages WHERE tenant_id = ? AND id = ?")
      .run(tenant.id, planId);
    return result.changes;
  });

  const changes = await run();
  if (changes === 0) {
    return Response.json({ error: "Plan not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
