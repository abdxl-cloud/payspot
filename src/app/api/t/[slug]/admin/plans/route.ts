import { randomUUID } from "node:crypto";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

function normalizePlanCodeCandidate(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function buildGeneratedPlanCode(name: string, durationMinutes?: number | null) {
  const normalizedName = normalizePlanCodeCandidate(name) || "plan";
  const durationTag = typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0
    ? `${Math.round(durationMinutes)}m`
    : "pkg";
  const base = normalizePlanCodeCandidate(`${normalizedName}-${durationTag}`);
  return base || "plan";
}

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
        p.max_devices as "maxDevices",
        p.bandwidth_profile as "bandwidthProfile",
        p.data_limit_mb as "dataLimitMb",
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
      ORDER BY COALESCE(p.duration_minutes, 2147483647) ASC, p.created_at DESC
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
  const accountAccessMode = tenant.portal_auth_mode === "external_radius_portal";

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    durationMinutes?: number | null;
    priceNgn?: number;
    maxDevices?: number | null;
    bandwidthProfile?: string | null;
    dataLimitMb?: number | null;
    active?: boolean;
    description?: string;
  };

  const inputCode = body.code?.trim();
  const name = body.name?.trim();
  const durationMinutes = body.durationMinutes ?? null;
  const priceNgn = body.priceNgn;
  const maxDevices =
    body.maxDevices === null
      ? null
      : typeof body.maxDevices === "number"
        ? body.maxDevices
        : null;
  const bandwidthProfile = body.bandwidthProfile?.trim() || null;
  const dataLimitMb = body.dataLimitMb ?? null;
  const description = body.description?.trim() || null;

  if (!name || name.length < 2) {
    return Response.json({ error: "Plan name is required" }, { status: 400 });
  }
  if (durationMinutes !== null && (!Number.isFinite(durationMinutes) || durationMinutes <= 0)) {
    return Response.json({ error: "Invalid durationMinutes" }, { status: 400 });
  }
  if (typeof priceNgn !== "number" || !Number.isFinite(priceNgn) || priceNgn < 0) {
    return Response.json({ error: "Invalid priceNgn" }, { status: 400 });
  }
  if (maxDevices !== null && (!Number.isFinite(maxDevices) || maxDevices < 1 || maxDevices > 32)) {
    return Response.json({ error: "Invalid maxDevices" }, { status: 400 });
  }
  if (dataLimitMb !== null && (!Number.isFinite(dataLimitMb) || dataLimitMb <= 0)) {
    return Response.json({ error: "Invalid dataLimitMb" }, { status: 400 });
  }
  if (!accountAccessMode && durationMinutes === null) {
    return Response.json(
      { error: "durationMinutes is required for voucher access plans." },
      { status: 400 },
    );
  }
  if (durationMinutes === null && dataLimitMb === null) {
    return Response.json(
      { error: "Set at least one limit: durationMinutes or dataLimitMb." },
      { status: 400 },
    );
  }
  if (inputCode !== undefined && inputCode.length > 0) {
    const normalizedCode = normalizePlanCodeCandidate(inputCode);
    if (!normalizedCode || normalizedCode.length < 2) {
      return Response.json({ error: "Invalid plan code" }, { status: 400 });
    }
  }

  const db = getDb();
  const now = new Date().toISOString();
  const baseCode = inputCode
    ? normalizePlanCodeCandidate(inputCode)
    : buildGeneratedPlanCode(name, durationMinutes);

  let createdCode: string | null = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidateCode = attempt === 0 ? baseCode : `${baseCode}-${attempt + 1}`;
    try {
      await db.prepare(
        `
        INSERT INTO voucher_packages (
          id, tenant_id, code, name, duration_minutes, price_ngn,
          max_devices, bandwidth_profile, data_limit_mb,
          active, description, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        tenant.id,
        candidateCode,
        name,
        durationMinutes === null ? null : Math.round(durationMinutes),
        Math.round(priceNgn),
        maxDevices === null ? null : Math.round(maxDevices),
        bandwidthProfile,
        dataLimitMb === null ? null : Math.round(dataLimitMb),
        body.active === false ? 0 : 1,
        description,
        now,
        now,
      );
      createdCode = candidateCode;
      break;
    } catch {
      if (inputCode) {
        return Response.json({ error: "Plan code already exists" }, { status: 409 });
      }
    }
  }

  if (!createdCode) {
    return Response.json({ error: "Unable to generate a unique plan code" }, { status: 409 });
  }

  return Response.json({ ok: true, code: createdCode });
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const accountAccessMode = tenant.portal_auth_mode === "external_radius_portal";

  const body = (await request.json()) as {
    planId?: string;
    code?: string;
    name?: string;
    durationMinutes?: number | null;
    priceNgn?: number;
    maxDevices?: number | null;
    bandwidthProfile?: string | null;
    dataLimitMb?: number | null;
    active?: boolean;
    description?: string;
  };

  const planId = body.planId?.trim();
  if (!planId) return Response.json({ error: "Missing planId" }, { status: 400 });

  const db = getDb();
  const existing = await db
    .prepare("SELECT id, duration_minutes, data_limit_mb FROM voucher_packages WHERE tenant_id = ? AND id = ?")
    .get(tenant.id, planId) as
    | { id: string; duration_minutes: number | null; data_limit_mb: number | null }
    | undefined;
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
  if (body.durationMinutes !== undefined) {
    if (body.durationMinutes !== null && (!Number.isFinite(body.durationMinutes) || body.durationMinutes <= 0)) {
      return Response.json({ error: "Invalid durationMinutes" }, { status: 400 });
    }
    fields.push("duration_minutes = ?");
    args.push(body.durationMinutes === null ? null : Math.round(body.durationMinutes));
  }
  if (typeof body.priceNgn === "number") {
    if (!Number.isFinite(body.priceNgn) || body.priceNgn < 0) {
      return Response.json({ error: "Invalid priceNgn" }, { status: 400 });
    }
    fields.push("price_ngn = ?");
    args.push(Math.round(body.priceNgn));
  }
  if (body.maxDevices !== undefined) {
    if (body.maxDevices !== null && (!Number.isFinite(body.maxDevices) || body.maxDevices < 1 || body.maxDevices > 32)) {
      return Response.json({ error: "Invalid maxDevices" }, { status: 400 });
    }
    fields.push("max_devices = ?");
    args.push(body.maxDevices === null ? null : Math.round(body.maxDevices));
  }
  if (body.bandwidthProfile !== undefined) {
    if (body.bandwidthProfile !== null && typeof body.bandwidthProfile !== "string") {
      return Response.json({ error: "Invalid bandwidthProfile" }, { status: 400 });
    }
    fields.push("bandwidth_profile = ?");
    args.push(body.bandwidthProfile?.trim() || null);
  }
  if (body.dataLimitMb !== undefined) {
    if (body.dataLimitMb !== null && (!Number.isFinite(body.dataLimitMb) || body.dataLimitMb <= 0)) {
      return Response.json({ error: "Invalid dataLimitMb" }, { status: 400 });
    }
    fields.push("data_limit_mb = ?");
    args.push(body.dataLimitMb === null ? null : Math.round(body.dataLimitMb));
  }

  const nextDuration =
    body.durationMinutes === undefined ? existing.duration_minutes : body.durationMinutes;
  const nextDataLimit =
    body.dataLimitMb === undefined ? existing.data_limit_mb : body.dataLimitMb;
  if (!accountAccessMode && nextDuration === null) {
    return Response.json(
      { error: "durationMinutes is required for voucher access plans." },
      { status: 400 },
    );
  }
  if (nextDuration === null && nextDataLimit === null) {
    return Response.json(
      { error: "Set at least one limit: durationMinutes or dataLimitMb." },
      { status: 400 },
    );
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
