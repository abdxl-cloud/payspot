import { randomUUID } from "node:crypto";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getTenantBySlug } from "@/lib/store";
import {
  CODE_ALPHABET,
  MAX_CODE_LENGTH,
  MAX_PREFIX_LENGTH,
  MIN_CODE_LENGTH,
  randomCode,
  resolveCodeAlphabet,
  type CodeCharacterSet,
} from "@/lib/voucher-codes";

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

const MAX_GENERATE_COUNT = 500;
const MAX_VOUCHER_CODE_LENGTH = 64;

function normalizeVoucherCode(value: string) {
  return value.trim().toUpperCase();
}

function isValidVoucherCode(value: string) {
  return (
    value.length >= MIN_CODE_LENGTH &&
    value.length <= MAX_VOUCHER_CODE_LENGTH &&
    /^[A-Z0-9_-]+$/.test(value)
  );
}

function buildManualRadiusReference(slug: string) {
  return `MANUAL-${slug.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${randomCode(6)}`;
}

async function voucherCodeExists(tenantId: string, voucherCode: string) {
  const db = getDb();
  const inTransactions = await db
    .prepare(
      `
      SELECT 1
      FROM transactions
      WHERE tenant_id = ? AND UPPER(voucher_code) = UPPER(?)
      LIMIT 1
    `,
    )
    .get(tenantId, voucherCode) as { "?column?": number } | undefined;
  if (inTransactions) return true;

  const inPool = await db
    .prepare(
      `
      SELECT 1
      FROM voucher_pool
      WHERE tenant_id = ? AND UPPER(voucher_code) = UPPER(?)
      LIMIT 1
    `,
    )
    .get(tenantId, voucherCode) as { "?column?": number } | undefined;
  return !!inPool;
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

  const db = getDb();
  const voucherSourceMode =
    tenant.voucher_source_mode === "radius_voucher" ? "radius_voucher" : "import_csv";

  if (voucherSourceMode === "radius_voucher") {
    const radiusAssignedExpr = "(COALESCE(rv.session_count, 0) > 0)";
    const radiusWhere: string[] = [
      "tx.tenant_id = ?",
      "tx.payment_status = 'success'",
      "tx.voucher_source_mode = 'radius_voucher'",
      "tx.voucher_code IS NOT NULL",
    ];
    const radiusArgs: Array<string | number> = [tenant.id];

    if (status === "UNUSED") {
      radiusWhere.push(`NOT ${radiusAssignedExpr}`);
    } else if (status === "ASSIGNED") {
      radiusWhere.push(radiusAssignedExpr);
    }
    if (packageId) {
      radiusWhere.push("tx.package_id = ?");
      radiusArgs.push(packageId);
    }
    if (q) {
      radiusWhere.push(
        `(tx.voucher_code LIKE ? OR p.code LIKE ? OR p.name LIKE ? OR COALESCE(tx.email, '') LIKE ? OR COALESCE(tx.phone, '') LIKE ?)`,
      );
      const token = `%${q}%`;
      radiusArgs.push(token, token, token, token, token);
    }

    const radiusWhereSql = radiusWhere.join(" AND ");
    const radiusFromSql = `
      FROM transactions tx
      JOIN voucher_packages p ON p.id = tx.package_id
      LEFT JOIN (
        SELECT
          tenant_id,
          transaction_reference,
          MIN(started_at) as first_used_at,
          COUNT(1) as session_count
        FROM radius_voucher_sessions
        GROUP BY tenant_id, transaction_reference
      ) rv ON rv.tenant_id = tx.tenant_id AND rv.transaction_reference = tx.reference
      WHERE ${radiusWhereSql}
    `;

    const totals = await db
      .prepare(
        `
        SELECT COUNT(1) as total
        ${radiusFromSql}
      `,
      )
      .get(...radiusArgs) as { total: number };

    const vouchers = await db
      .prepare(
        `
        SELECT
          tx.id,
          tx.voucher_code as "voucherCode",
          CASE WHEN ${radiusAssignedExpr} THEN 'ASSIGNED' ELSE 'UNUSED' END as status,
          tx.package_id as "packageId",
          p.code as "packageCode",
          p.name as "packageName",
          tx.created_at as "createdAt",
          CASE
            WHEN ${radiusAssignedExpr} THEN rv.first_used_at
            ELSE NULL
          END as "assignedAt",
          CASE WHEN TRIM(COALESCE(tx.email, '')) = '' THEN NULL ELSE tx.email END as "assignedToEmail",
          CASE WHEN TRIM(COALESCE(tx.phone, '')) = '' THEN NULL ELSE tx.phone END as "assignedToPhone"
          ${radiusFromSql}
        ORDER BY COALESCE(rv.first_used_at, tx.created_at) DESC, tx.created_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...radiusArgs, pageSize, offset);

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

  const whereSql = where.join(" AND ");

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
        v.voucher_code as "voucherCode",
        v.status,
        v.duration_minutes as "durationMinutes",
        v.package_id as "packageId",
        v.created_at as "createdAt",
        v.assigned_at as "assignedAt",
        v.assigned_to_email as "assignedToEmail",
        v.assigned_to_phone as "assignedToPhone",
        v.assigned_to_transaction as "assignedToTransaction",
        p.code as "packageCode",
        p.name as "packageName"
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
    characterSet?: string;
  };

  const voucherSourceMode =
    tenant.voucher_source_mode === "omada_openapi"
      ? "omada_openapi"
      : tenant.voucher_source_mode === "mikrotik_rest"
        ? "mikrotik_rest"
        : tenant.voucher_source_mode === "radius_voucher"
          ? "radius_voucher"
      : "import_csv";
  if (
    voucherSourceMode === "omada_openapi" ||
    voucherSourceMode === "mikrotik_rest"
  ) {
    return Response.json(
      {
        error:
          voucherSourceMode === "omada_openapi"
            ? "Manual voucher creation is disabled in Omada API automation mode. Vouchers are provisioned automatically on customer payment."
            : "Manual voucher creation is disabled in MikroTik direct mode. Vouchers are created automatically on customer payment.",
      },
      { status: 409 },
    );
  }

  const voucherCode = normalizeVoucherCode(body.voucherCode ?? "");
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

  let prefix = "";
  let parsedCodeLength = MIN_CODE_LENGTH;
  let characterSet: CodeCharacterSet = "alnum";
  let codeAlphabet = CODE_ALPHABET;
  if (useAutoGenerate) {
    if (generateCount < 1 || generateCount > MAX_GENERATE_COUNT) {
      return Response.json(
        { error: `generateCount must be between 1 and ${MAX_GENERATE_COUNT}` },
        { status: 400 },
      );
    }

    prefix = (body.prefix ?? "").trim().toUpperCase();
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

    parsedCodeLength = Number.parseInt(String(body.codeLength ?? "10"), 10);
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

    if (
      body.characterSet !== undefined &&
      body.characterSet !== "alnum" &&
      body.characterSet !== "letters" &&
      body.characterSet !== "numbers"
    ) {
      return Response.json(
        { error: "characterSet must be one of: alnum, letters, numbers" },
        { status: 400 },
      );
    }
    characterSet = (body.characterSet as CodeCharacterSet | undefined) ?? "alnum";
    codeAlphabet = resolveCodeAlphabet(characterSet);
  }

  const db = getDb();
  const pkg = await db
    .prepare(
      "SELECT id, duration_minutes FROM voucher_packages WHERE tenant_id = ? AND id = ?",
    )
    .get(tenant.id, packageId) as { id: string; duration_minutes: number | null } | undefined;
  if (!pkg) return Response.json({ error: "Invalid packageId" }, { status: 400 });
  if (voucherSourceMode === "import_csv" && pkg.duration_minutes == null) {
    return Response.json(
      { error: "This plan has no duration. Add a duration before using CSV/manual voucher inventory." },
      { status: 409 },
    );
  }

  if (useManualCode) {
    if (!isValidVoucherCode(voucherCode)) {
      return Response.json(
        {
          error: `voucherCode must be ${MIN_CODE_LENGTH}-${MAX_VOUCHER_CODE_LENGTH} characters and use only A-Z, 0-9, underscore, or dash`,
        },
        { status: 400 },
      );
    }
    if (await voucherCodeExists(tenant.id, voucherCode)) {
      return Response.json({ error: "Voucher code already exists" }, { status: 409 });
    }
  }

  if (voucherSourceMode === "radius_voucher") {
    const now = new Date().toISOString();
    const createdCodes: string[] = [];
    const seen = new Set<string>();
    let attempts = 0;
    const maxAttempts = (useManualCode ? 1 : generateCount) * 30;

    const run = db.transaction(async () => {
      while (createdCodes.length < (useManualCode ? 1 : generateCount) && attempts < maxAttempts) {
        attempts += 1;
        const code = useManualCode
          ? voucherCode
          : (() => {
              const suffix = randomCode(parsedCodeLength, codeAlphabet);
              return prefix ? `${prefix}-${suffix}` : suffix;
            })();
        if (seen.has(code)) continue;
        seen.add(code);
        if (await voucherCodeExists(tenant.id, code)) {
          if (useManualCode) throw new Error("duplicate_voucher_code");
          continue;
        }

        let inserted = false;
        for (let referenceAttempt = 0; referenceAttempt < 5 && !inserted; referenceAttempt += 1) {
          try {
            await db
              .prepare(
                `
                INSERT INTO transactions (
                  id, tenant_id, reference, email, phone, amount_ngn, voucher_code,
                  voucher_source_mode, package_id, subscriber_id, delivery_mode,
                  authorization_url, payment_status, created_at, expires_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `,
              )
              .run(
                randomUUID(),
                tenant.id,
                buildManualRadiusReference(slug),
                "",
                "",
                0,
                code,
                "radius_voucher",
                packageId,
                null,
                "voucher",
                null,
                "success",
                now,
                null,
                now,
              );
            inserted = true;
            createdCodes.push(code);
          } catch {
            if (referenceAttempt === 4) throw new Error("reference_insert_failed");
          }
        }
      }

      if (createdCodes.length < (useManualCode ? 1 : generateCount)) {
        throw new Error(useManualCode ? "duplicate_voucher_code" : "not_enough_unique_codes");
      }
    });

    try {
      await run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "duplicate_voucher_code") {
        return Response.json({ error: "Voucher code already exists" }, { status: 409 });
      }
      return Response.json(
        {
          error: useManualCode
            ? "Unable to create voucher right now."
            : `Unable to generate ${generateCount} unique voucher codes. Try a different prefix or smaller batch size.`,
        },
        { status: 409 },
      );
    }

    return Response.json({
      ok: true,
      created: createdCodes.length,
      source: "radius_voucher",
    });
  }

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

  const createdCodes: string[] = [];
  const now = new Date().toISOString();

  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = generateCount * 30;
  const run = db.transaction(async () => {
    while (createdCodes.length < generateCount && attempts < maxAttempts) {
      attempts += 1;
      const suffix = randomCode(parsedCodeLength, codeAlphabet);
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
  if (tenant.voucher_source_mode === "radius_voucher") {
    return Response.json(
      { error: "Unarchive is only supported for CSV voucher inventory." },
      { status: 409 },
    );
  }

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

  if (tenant.voucher_source_mode === "radius_voucher") {
    const run = db.transaction(async () => {
      for (let i = 0; i < voucherIds.length; i += chunkSize) {
        const chunk = voucherIds.slice(i, i + chunkSize);
        const placeholders = buildInClause(chunk.length);
        const result = await db
          .prepare(
            `
            DELETE FROM transactions
            WHERE tenant_id = ?
              AND id IN (${placeholders})
              AND payment_status = 'success'
              AND voucher_source_mode = 'radius_voucher'
              AND voucher_code IS NOT NULL
              AND TRIM(COALESCE(email, '')) = ''
              AND TRIM(COALESCE(phone, '')) = ''
              AND NOT EXISTS (
                SELECT 1
                FROM radius_voucher_sessions rvs
                WHERE rvs.tenant_id = transactions.tenant_id
                  AND rvs.transaction_reference = transactions.reference
              )
          `,
          )
          .run(tenant.id, ...chunk);
        deleted += result.changes;
      }
    });
    await run();
    return Response.json({ deleted });
  }

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
