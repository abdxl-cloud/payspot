import { randomUUID } from "node:crypto";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTenantBySlug } from "@/lib/store";
import {
  MAX_CODE_LENGTH,
  MAX_PREFIX_LENGTH,
  MIN_CODE_LENGTH,
  type CodeCharacterSet,
} from "@/lib/voucher-codes";

type Props = {
  params: Promise<{ slug: string }>;
};

function parseOptionalIsoInstant(value: unknown) {
  if (value === undefined) return { provided: false as const, value: undefined };
  if (value === null) return { provided: true as const, value: null };
  if (typeof value !== "string") return { provided: true as const, invalid: true as const };
  const trimmed = value.trim();
  if (!trimmed) return { provided: true as const, value: null };
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return { provided: true as const, invalid: true as const };
  return { provided: true as const, value: parsed.toISOString() };
}

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

type RadiusVoucherPlanCodeConfig = {
  prefix: string | null;
  codeLength: number | null;
  characterSet: CodeCharacterSet | null;
};

function parseRadiusVoucherPlanCodeConfig(params: {
  body: {
    radiusVoucherCodePrefix?: string | null;
    radiusVoucherCodeLength?: number | null;
    radiusVoucherCharacterSet?: string | null;
  };
  enabled: boolean;
}) {
  if (!params.enabled) {
    return { ok: true as const, value: { prefix: null, codeLength: null, characterSet: null } };
  }

  const rawCharacterSet = params.body.radiusVoucherCharacterSet;
  const characterSet =
    rawCharacterSet === undefined || rawCharacterSet === null || rawCharacterSet === ""
      ? null
      : rawCharacterSet === "alnum" || rawCharacterSet === "letters" || rawCharacterSet === "numbers"
        ? rawCharacterSet
        : null;

  if (rawCharacterSet !== undefined && rawCharacterSet !== null && rawCharacterSet !== "" && characterSet === null) {
    return {
      ok: false as const,
      error: "radiusVoucherCharacterSet must be one of: alnum, letters, numbers, or empty",
    };
  }

  const rawPrefix = params.body.radiusVoucherCodePrefix;
  const prefix = typeof rawPrefix === "string" ? rawPrefix.trim().toUpperCase() || null : null;
  if (prefix && prefix.length > MAX_PREFIX_LENGTH) {
    return {
      ok: false as const,
      error: `radiusVoucherCodePrefix must be at most ${MAX_PREFIX_LENGTH} characters`,
    };
  }
  if (prefix && !/^[A-Z0-9_-]+$/.test(prefix)) {
    return {
      ok: false as const,
      error: "radiusVoucherCodePrefix may only contain A-Z, 0-9, underscore, or dash",
    };
  }

  const rawCodeLength = params.body.radiusVoucherCodeLength;
  const codeLength =
    rawCodeLength === undefined || rawCodeLength === null
      ? null
      : Number.parseInt(String(rawCodeLength), 10);

  if (
    codeLength !== null &&
    (!Number.isFinite(codeLength) || codeLength < MIN_CODE_LENGTH || codeLength > MAX_CODE_LENGTH)
  ) {
    return {
      ok: false as const,
      error: `radiusVoucherCodeLength must be between ${MIN_CODE_LENGTH} and ${MAX_CODE_LENGTH}`,
    };
  }

  if (characterSet === null) {
    return {
      ok: true as const,
      value: { prefix: null, codeLength: null, characterSet: null },
    };
  }

  return {
    ok: true as const,
    value: {
      prefix,
      codeLength: codeLength ?? 8,
      characterSet,
    } satisfies RadiusVoucherPlanCodeConfig,
  };
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
  const plans =
    tenant.voucher_source_mode === "radius_voucher"
      ? await db
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
              p.available_from as "availableFrom",
              p.available_to as "availableTo",
              p.active,
              p.description,
              p.radius_voucher_code_prefix as "radiusVoucherCodePrefix",
              p.radius_voucher_code_length as "radiusVoucherCodeLength",
              p.radius_voucher_character_set as "radiusVoucherCharacterSet",
              p.created_at as "createdAt",
              p.updated_at as "updatedAt",
              COALESCE(vs.unused_count, 0) as "unusedCount",
              COALESCE(vs.assigned_count, 0) as "assignedCount",
              COALESCE(vs.total_count, 0) as "totalCount"
            FROM voucher_packages p
            LEFT JOIN (
              SELECT
                tx.package_id,
                COUNT(tx.id) as total_count,
                SUM(
                  CASE
                    WHEN COALESCE(rv.session_count, 0) > 0
                      OR TRIM(COALESCE(tx.email, '')) <> ''
                      OR TRIM(COALESCE(tx.phone, '')) <> ''
                    THEN 0
                    ELSE 1
                  END
                ) as unused_count,
                SUM(
                  CASE
                    WHEN COALESCE(rv.session_count, 0) > 0
                      OR TRIM(COALESCE(tx.email, '')) <> ''
                      OR TRIM(COALESCE(tx.phone, '')) <> ''
                    THEN 1
                    ELSE 0
                  END
                ) as assigned_count
              FROM transactions tx
              LEFT JOIN (
                SELECT tenant_id, transaction_reference, COUNT(1) as session_count
                FROM radius_voucher_sessions
                GROUP BY tenant_id, transaction_reference
              ) rv ON rv.tenant_id = tx.tenant_id AND rv.transaction_reference = tx.reference
              WHERE tx.tenant_id = ?
                AND tx.payment_status = 'success'
                AND tx.voucher_source_mode = 'radius_voucher'
                AND tx.voucher_code IS NOT NULL
              GROUP BY tx.package_id
            ) vs ON vs.package_id = p.id
            WHERE p.tenant_id = ?
            ORDER BY COALESCE(p.duration_minutes, 2147483647) ASC, p.created_at DESC
          `,
          )
          .all(tenant.id, tenant.id)
      : await db
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
              p.available_from as "availableFrom",
              p.available_to as "availableTo",
              p.active,
              p.description,
              p.radius_voucher_code_prefix as "radiusVoucherCodePrefix",
              p.radius_voucher_code_length as "radiusVoucherCodeLength",
              p.radius_voucher_character_set as "radiusVoucherCharacterSet",
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
  const voucherDurationRequired =
    !accountAccessMode &&
    tenant.voucher_source_mode !== "mikrotik_rest" &&
    tenant.voucher_source_mode !== "radius_voucher";

  const body = (await request.json()) as {
    code?: string;
    name?: string;
    durationMinutes?: number | null;
    priceNgn?: number;
    maxDevices?: number | null;
    bandwidthProfile?: string | null;
    dataLimitMb?: number | null;
    availableFrom?: string | null;
    availableTo?: string | null;
    active?: boolean;
    description?: string;
    radiusVoucherCodePrefix?: string | null;
    radiusVoucherCodeLength?: number | null;
    radiusVoucherCharacterSet?: string | null;
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
  const availableFrom = parseOptionalIsoInstant(body.availableFrom);
  const availableTo = parseOptionalIsoInstant(body.availableTo);
  const description = body.description?.trim() || null;
  const radiusVoucherCodeConfig = parseRadiusVoucherPlanCodeConfig({
    body,
    enabled: tenant.voucher_source_mode === "radius_voucher",
  });
  if (!radiusVoucherCodeConfig.ok) {
    return Response.json({ error: radiusVoucherCodeConfig.error }, { status: 400 });
  }

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
  if (availableFrom.invalid) {
    return Response.json({ error: "Invalid availableFrom" }, { status: 400 });
  }
  if (availableTo.invalid) {
    return Response.json({ error: "Invalid availableTo" }, { status: 400 });
  }
  if (
    availableFrom.value &&
    availableTo.value &&
    new Date(availableFrom.value).getTime() > new Date(availableTo.value).getTime()
  ) {
    return Response.json({ error: "availableFrom must be before availableTo" }, { status: 400 });
  }
  if (voucherDurationRequired && durationMinutes === null) {
    return Response.json(
      { error: "durationMinutes is required unless you are using MikroTik direct mode or RADIUS voucher mode." },
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
          max_devices, bandwidth_profile, data_limit_mb, available_from, available_to,
          active, description, radius_voucher_code_prefix, radius_voucher_code_length,
          radius_voucher_character_set, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        availableFrom.value ?? null,
        availableTo.value ?? null,
        body.active === false ? 0 : 1,
        description,
        radiusVoucherCodeConfig.value.prefix,
        radiusVoucherCodeConfig.value.codeLength,
        radiusVoucherCodeConfig.value.characterSet,
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
  const voucherDurationRequired =
    !accountAccessMode &&
    tenant.voucher_source_mode !== "mikrotik_rest" &&
    tenant.voucher_source_mode !== "radius_voucher";

  const body = (await request.json()) as {
    planId?: string;
    code?: string;
    name?: string;
    durationMinutes?: number | null;
    priceNgn?: number;
    maxDevices?: number | null;
    bandwidthProfile?: string | null;
    dataLimitMb?: number | null;
    availableFrom?: string | null;
    availableTo?: string | null;
    active?: boolean;
    description?: string;
    radiusVoucherCodePrefix?: string | null;
    radiusVoucherCodeLength?: number | null;
    radiusVoucherCharacterSet?: string | null;
  };

  const planId = body.planId?.trim();
  if (!planId) return Response.json({ error: "Missing planId" }, { status: 400 });

  const db = getDb();
  const existing = await db
    .prepare(
      `
      SELECT id, duration_minutes, data_limit_mb, available_from, available_to
           , radius_voucher_code_prefix, radius_voucher_code_length, radius_voucher_character_set
      FROM voucher_packages
      WHERE tenant_id = ? AND id = ?
    `,
    )
    .get(tenant.id, planId) as
    | {
        id: string;
        duration_minutes: number | null;
        data_limit_mb: number | null;
        available_from: string | null;
        available_to: string | null;
        radius_voucher_code_prefix: string | null;
        radius_voucher_code_length: number | null;
        radius_voucher_character_set: CodeCharacterSet | null;
      }
    | undefined;
  if (!existing) return Response.json({ error: "Plan not found" }, { status: 404 });

  const radiusVoucherCodeConfig = parseRadiusVoucherPlanCodeConfig({
    body: {
      radiusVoucherCodePrefix:
        body.radiusVoucherCodePrefix !== undefined
          ? body.radiusVoucherCodePrefix
          : existing.radius_voucher_code_prefix,
      radiusVoucherCodeLength:
        body.radiusVoucherCodeLength !== undefined
          ? body.radiusVoucherCodeLength
          : existing.radius_voucher_code_length,
      radiusVoucherCharacterSet:
        body.radiusVoucherCharacterSet !== undefined
          ? body.radiusVoucherCharacterSet
          : existing.radius_voucher_character_set,
    },
    enabled: tenant.voucher_source_mode === "radius_voucher",
  });
  if (!radiusVoucherCodeConfig.ok) {
    return Response.json({ error: radiusVoucherCodeConfig.error }, { status: 400 });
  }

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
  const availableFrom = parseOptionalIsoInstant(body.availableFrom);
  const availableTo = parseOptionalIsoInstant(body.availableTo);
  if (availableFrom.invalid) {
    return Response.json({ error: "Invalid availableFrom" }, { status: 400 });
  }
  if (availableTo.invalid) {
    return Response.json({ error: "Invalid availableTo" }, { status: 400 });
  }
  if (availableFrom.provided) {
    fields.push("available_from = ?");
    args.push(availableFrom.value ?? null);
  }
  if (availableTo.provided) {
    fields.push("available_to = ?");
    args.push(availableTo.value ?? null);
  }

  const nextDuration =
    body.durationMinutes === undefined ? existing.duration_minutes : body.durationMinutes;
  const nextDataLimit =
    body.dataLimitMb === undefined ? existing.data_limit_mb : body.dataLimitMb;
  const nextAvailableFrom =
    availableFrom.provided ? (availableFrom.value ?? null) : existing.available_from;
  const nextAvailableTo =
    availableTo.provided ? (availableTo.value ?? null) : existing.available_to;
  if (
    nextAvailableFrom &&
    nextAvailableTo &&
    new Date(nextAvailableFrom).getTime() > new Date(nextAvailableTo).getTime()
  ) {
    return Response.json({ error: "availableFrom must be before availableTo" }, { status: 400 });
  }
  if (voucherDurationRequired && nextDuration === null) {
    return Response.json(
      { error: "durationMinutes is required unless you are using MikroTik direct mode or RADIUS voucher mode." },
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
  if (tenant.voucher_source_mode === "radius_voucher") {
    fields.push("radius_voucher_code_prefix = ?");
    args.push(radiusVoucherCodeConfig.value.prefix);
    fields.push("radius_voucher_code_length = ?");
    args.push(radiusVoucherCodeConfig.value.codeLength);
    fields.push("radius_voucher_character_set = ?");
    args.push(radiusVoucherCodeConfig.value.characterSet);
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

  const run = db.transaction(async () => {
    await db.prepare("DELETE FROM subscriber_entitlements WHERE tenant_id = ? AND package_id = ?").run(tenant.id, planId);
    await db.prepare("DELETE FROM transactions WHERE tenant_id = ? AND package_id = ?").run(tenant.id, planId);
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
