import { randomBytes, randomUUID } from "node:crypto";
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

function parsePositiveInt(value: string | null, fallback: number) {
  const num = Number.parseInt(value ?? "", 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function buildInClause(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 24;
const MAX_GENERATE_COUNT = 500;
const MAX_PREFIX_LENGTH = 16;

function randomCode(length: number) {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = (url.searchParams.get("status") ?? "all").toUpperCase();
  const packageId = url.searchParams.get("packageId")?.trim() ?? "";
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 20), 100);
  const offset = (page - 1) * pageSize;

  const where: string[] = ["v.tenant_id = ?"];
  const args: Array<string | number> = [tenant.id];

  if (status === "UNUSED" || status === "ASSIGNED") {
    where.push("v.status = ?");
    args.push(status);
  }
  if (packageId) {
    where.push("v.package_id = ?");
    args.push(packageId);
  }
  if (q) {
    where.push("(v.voucher_code LIKE ? OR p.code LIKE ? OR p.name LIKE ? OR COALESCE(v.assigned_to_email, '') LIKE ?)");
    const token = `%${q}%`;
    args.push(token, token, token, token);
  }

  const whereSql = where.join(" AND ");
  const db = getDb();

  const totals = await db
    .prepare(
      `
      SELECT COUNT(1) as total
      FROM voucher_pool v
      JOIN voucher_packages p ON p.id = v.package_id
      WHERE ${whereSql}
    `,
    )
    .get(...args) as { total: number };

  const vouchers = await db
    .prepare(
      `
      SELECT
        v.id,
        v.voucher_code as voucherCode,
        v.status,
        v.duration_minutes as durationMinutes,
        v.package_id as packageId,
        v.created_at as createdAt,
        v.assigned_at as assignedAt,
        v.assigned_to_email as assignedToEmail,
        v.assigned_to_phone as assignedToPhone,
        v.assigned_to_transaction as assignedToTransaction,
        p.code as packageCode,
        p.name as packageName
      FROM voucher_pool v
      JOIN voucher_packages p ON p.id = v.package_id
      WHERE ${whereSql}
      ORDER BY v.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...args, pageSize, offset);

  return Response.json({
    vouchers,
    pagination: {
      page,
      pageSize,
      total: totals.total ?? 0,
      totalPages: Math.max(1, Math.ceil((totals.total ?? 0) / pageSize)),
    },
  });
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as {
    voucherCode?: string;
    packageId?: string;
    generateCount?: number;
    prefix?: string;
    codeLength?: number;
  };

  const voucherSourceMode =
    tenant.voucher_source_mode === "omada_openapi"
      ? "omada_openapi"
      : "import_csv";
  if (voucherSourceMode === "omada_openapi") {
    return Response.json(
      {
        error:
          "Manual voucher creation is disabled in Omada API automation mode. Vouchers are provisioned automatically on customer payment.",
      },
      { status: 409 },
    );
  }

  const voucherCode = body.voucherCode?.trim() ?? "";
  const packageId = body.packageId?.trim();
  if (!packageId) return Response.json({ error: "packageId is required" }, { status: 400 });

  const parsedGenerateCount = Number.parseInt(String(body.generateCount ?? "0"), 10);
  const generateCount = Number.isFinite(parsedGenerateCount) ? parsedGenerateCount : 0;
  const useManualCode = voucherCode.length > 0;
  const useAutoGenerate = generateCount > 0;

  if (!useManualCode && !useAutoGenerate) {
    return Response.json(
      { error: "Provide voucherCode or a positive generateCount" },
      { status: 400 },
    );
  }
  if (useManualCode && useAutoGenerate) {
    return Response.json(
      { error: "Provide voucherCode or generateCount, not both" },
      { status: 400 },
    );
  }

  const db = getDb();
  const pkg = await db
    .prepare(
      "SELECT id, duration_minutes FROM voucher_packages WHERE tenant_id = ? AND id = ?",
    )
    .get(tenant.id, packageId) as { id: string; duration_minutes: number } | undefined;
  if (!pkg) return Response.json({ error: "Invalid packageId" }, { status: 400 });

  if (useManualCode) {
    const result = await db
      .prepare(
        `
      INSERT INTO voucher_pool (
        id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
      ) VALUES (?, ?, ?, ?, 'UNUSED', ?, ?)
      ON CONFLICT (tenant_id, voucher_code) DO NOTHING
    `,
      )
      .run(
        randomUUID(),
        tenant.id,
        voucherCode,
        pkg.duration_minutes,
        packageId,
        new Date().toISOString(),
      );

    if (result.changes === 0) {
      return Response.json({ error: "Voucher code already exists" }, { status: 409 });
    }

    return Response.json({ ok: true, created: 1 });
  }

  if (generateCount < 1 || generateCount > MAX_GENERATE_COUNT) {
    return Response.json(
      { error: `generateCount must be between 1 and ${MAX_GENERATE_COUNT}` },
      { status: 400 },
    );
  }

  const prefix = (body.prefix ?? "").trim().toUpperCase();
  if (prefix.length > MAX_PREFIX_LENGTH) {
    return Response.json(
      { error: `prefix must be at most ${MAX_PREFIX_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (prefix && !/^[A-Z0-9_-]+$/.test(prefix)) {
    return Response.json(
      { error: "prefix may only contain A-Z, 0-9, underscore, or dash" },
      { status: 400 },
    );
  }

  const parsedCodeLength = Number.parseInt(String(body.codeLength ?? "10"), 10);
  if (
    !Number.isFinite(parsedCodeLength) ||
    parsedCodeLength < MIN_CODE_LENGTH ||
    parsedCodeLength > MAX_CODE_LENGTH
  ) {
    return Response.json(
      { error: `codeLength must be between ${MIN_CODE_LENGTH} and ${MAX_CODE_LENGTH}` },
      { status: 400 },
    );
  }

  const createdCodes: string[] = [];
  const now = new Date().toISOString();

  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = generateCount * 30;
  const run = db.transaction(async () => {
    while (createdCodes.length < generateCount && attempts < maxAttempts) {
      attempts += 1;
      const suffix = randomCode(parsedCodeLength);
      const code = prefix ? `${prefix}-${suffix}` : suffix;
      if (seen.has(code)) continue;
      seen.add(code);

      const result = await db
        .prepare(
          `
      INSERT INTO voucher_pool (
        id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
      ) VALUES (?, ?, ?, ?, 'UNUSED', ?, ?)
      ON CONFLICT (tenant_id, voucher_code) DO NOTHING
    `,
        )
        .run(
          randomUUID(),
          tenant.id,
          code,
          pkg.duration_minutes,
          packageId,
          now,
        );

      if (result.changes === 1) createdCodes.push(code);
    }

    if (createdCodes.length < generateCount) {
      throw new Error("not_enough_unique_codes");
    }
  });

  try {
    await run();
  } catch {
    return Response.json(
      {
        error: `Unable to generate ${generateCount} unique voucher codes. Try a different prefix or smaller batch size.`,
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    created: createdCodes.length,
    source: "import_csv",
  });
}

export async function PATCH(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as {
    voucherIds?: string[];
    status?: string;
  };

  const voucherIds = (body.voucherIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (voucherIds.length === 0) {
    return Response.json({ error: "voucherIds is required" }, { status: 400 });
  }
  if ((body.status ?? "").toUpperCase() !== "UNUSED") {
    return Response.json({ error: "Only status UNUSED is supported" }, { status: 400 });
  }

  const db = getDb();
  const chunkSize = 200;
  let updated = 0;

  const run = db.transaction(async () => {
    for (let i = 0; i < voucherIds.length; i += chunkSize) {
      const chunk = voucherIds.slice(i, i + chunkSize);
      const placeholders = buildInClause(chunk.length);
      const result = await db
        .prepare(
          `
          UPDATE voucher_pool
          SET status = 'UNUSED',
              assigned_to_transaction = NULL,
              assigned_to_email = NULL,
              assigned_to_phone = NULL,
              assigned_at = NULL
          WHERE tenant_id = ?
            AND id IN (${placeholders})
        `,
        )
        .run(tenant.id, ...chunk);
      updated += result.changes;
    }
  });
  await run();

  return Response.json({ updated });
}

export async function DELETE(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const body = (await request.json()) as { voucherIds?: string[] };
  const voucherIds = (body.voucherIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (voucherIds.length === 0) {
    return Response.json({ error: "voucherIds is required" }, { status: 400 });
  }

  const db = getDb();
  const chunkSize = 200;
  let deleted = 0;

  const run = db.transaction(async () => {
    for (let i = 0; i < voucherIds.length; i += chunkSize) {
      const chunk = voucherIds.slice(i, i + chunkSize);
      const placeholders = buildInClause(chunk.length);
      const result = await db
        .prepare(
          `
          DELETE FROM voucher_pool
          WHERE tenant_id = ?
            AND id IN (${placeholders})
        `,
        )
        .run(tenant.id, ...chunk);
      deleted += result.changes;
    }
  });
  await run();

  return Response.json({ deleted });
}
