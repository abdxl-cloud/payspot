import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

type PackageLite = { id: string; code: string; duration_minutes: number | null };

type NormalizedRow = {
  code: string | null;
  durationMinutes: number | null;
  dataLimitMb: number | null;
  trafficLimitLabel: string | null;
  trafficLimitCode: string | null;
  usedDataMb: number | null;
  remainingDataMb: number | null;
  statusLabel: string | null;
  expirationTime: string | null;
  priceNgn: number | null;
};

type PlanInfo = {
  code: string;
  name: string;
  durationMinutes: number;
  dataLimitMb: number | null;
  description: string;
  priceNgn: number | null;
};

function normalizeRow(row: Record<string, unknown>): NormalizedRow {
  const entries = Object.entries(row).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      acc[normalizedKey] = typeof value === "string" ? value.trim() : value;
      return acc;
    },
    {},
  );

  const durationRaw = (entries.duration as string | undefined) ?? null;
  const trafficLimitRaw = (entries.trafficlimit as string | undefined) ?? null;
  const usedDataRaw = (entries.useddata as string | undefined) ?? null;
  const remainingDataRaw = (entries.remainingdata as string | undefined) ?? null;
  const statusRaw =
    (entries.type as string | undefined) ||
    (entries.status as string | undefined) ||
    null;
  const expirationRaw = (entries.expirationtime as string | undefined) ?? null;
  const priceRaw = (entries.price as string | undefined) ?? null;

  return {
    code:
      (entries.code as string | undefined) ||
      (entries.vouchercode as string | undefined) ||
      (entries.csvcode as string | undefined) ||
      null,
    durationMinutes: parseDurationMinutes(durationRaw),
    dataLimitMb: parseDataLimitMb(trafficLimitRaw),
    trafficLimitLabel: formatLimitLabel(trafficLimitRaw),
    trafficLimitCode: formatLimitCode(trafficLimitRaw),
    usedDataMb: parseDataLimitMb(usedDataRaw),
    remainingDataMb: parseDataLimitMb(remainingDataRaw),
    statusLabel: statusRaw ? String(statusRaw).toLowerCase() : null,
    expirationTime: expirationRaw,
    priceNgn: parseMoney(priceRaw),
  };
}

function parseNumberUnit(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "");
  const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]+)$/);
  if (!match) return null;
  return { amount: Number.parseFloat(match[1]), unit: match[2].toLowerCase() };
}

function parseDurationMinutes(value: string | null) {
  const parsed = parseNumberUnit(value);
  if (!parsed) return null;
  const amount = parsed.amount;
  if (!Number.isFinite(amount)) return null;
  if (parsed.unit.startsWith("min")) return Math.round(amount);
  if (parsed.unit.startsWith("hour")) return Math.round(amount * 60);
  if (parsed.unit.startsWith("day")) return Math.round(amount * 60 * 24);
  if (parsed.unit.startsWith("week")) return Math.round(amount * 60 * 24 * 7);
  if (parsed.unit === "h") return Math.round(amount * 60);
  if (parsed.unit === "d") return Math.round(amount * 60 * 24);
  if (parsed.unit === "w") return Math.round(amount * 60 * 24 * 7);
  return null;
}

function parseDataLimitMb(value: string | null) {
  const parsed = parseNumberUnit(value);
  if (!parsed) return null;
  const amount = parsed.amount;
  if (!Number.isFinite(amount)) return null;
  if (parsed.unit.startsWith("mb")) return amount;
  if (parsed.unit.startsWith("gb")) return amount * 1024;
  if (parsed.unit.startsWith("tb")) return amount * 1024 * 1024;
  return null;
}

function parseMoney(value: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const amount = Number.parseFloat(cleaned);
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount);
}

function formatLimitLabel(value: string | null) {
  const parsed = parseNumberUnit(value);
  if (!parsed) return null;
  const amount =
    parsed.amount % 1 === 0 ? parsed.amount.toFixed(0) : parsed.amount.toString();
  if (parsed.unit.startsWith("gb")) return `${amount} GB`;
  if (parsed.unit.startsWith("mb")) return `${amount} MB`;
  if (parsed.unit.startsWith("tb")) return `${amount} TB`;
  return `${amount} ${parsed.unit.toUpperCase()}`;
}

function formatLimitCode(value: string | null) {
  const parsed = parseNumberUnit(value);
  if (!parsed) return null;
  const raw =
    parsed.amount % 1 === 0 ? parsed.amount.toFixed(0) : parsed.amount.toString();
  const amount = raw.replace(".", "p");
  if (parsed.unit.startsWith("gb")) return `${amount}gb`;
  if (parsed.unit.startsWith("mb")) return `${amount}mb`;
  if (parsed.unit.startsWith("tb")) return `${amount}tb`;
  return `${amount}${parsed.unit}`;
}

function formatDurationCode(minutes: number) {
  if (minutes % (60 * 24 * 7) === 0) {
    return `${minutes / (60 * 24 * 7)}w`;
  }
  if (minutes % (60 * 24) === 0) {
    return `${minutes / (60 * 24)}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

function formatDurationLabel(minutes: number) {
  if (minutes % (60 * 24 * 7) === 0) {
    const weeks = minutes / (60 * 24 * 7);
    return `${weeks} week${weeks === 1 ? "" : "s"}`;
  }
  if (minutes % (60 * 24) === 0) {
    const days = minutes / (60 * 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

function buildPlan(normalized: NormalizedRow): PlanInfo | null {
  if (!normalized.durationMinutes) return null;
  const durationCode = formatDurationCode(normalized.durationMinutes);
  const durationLabel = formatDurationLabel(normalized.durationMinutes);
  const isUnlimited = !normalized.trafficLimitCode;
  const code = isUnlimited ? `unlimited-${durationCode}` : `${normalized.trafficLimitCode}-${durationCode}`;
  const limitLabel = isUnlimited ? "Unlimited" : (normalized.trafficLimitLabel ?? normalized.trafficLimitCode!);
  return {
    code,
    name: `${limitLabel} / ${durationLabel}`,
    durationMinutes: normalized.durationMinutes,
    dataLimitMb: normalized.dataLimitMb,
    description: isUnlimited
      ? `Unlimited data for ${durationLabel} of access.`
      : `Data cap ${limitLabel} for ${durationLabel} of access.`,
    priceNgn: normalized.priceNgn,
  };
}

function isExpiredRow(normalized: NormalizedRow) {
  if (normalized.statusLabel?.includes("expired")) return true;
  if (!normalized.expirationTime) return false;
  const parsed = new Date(normalized.expirationTime);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

function isInUseRow(normalized: NormalizedRow) {
  if (normalized.usedDataMb && normalized.usedDataMb > 0) return true;
  if (normalized.remainingDataMb === 0) return true;
  return false;
}

async function ensurePackage(params: {
  db: ReturnType<typeof getDb>;
  tenantId: string;
  packagesByCode: Map<string, PackageLite>;
  plan: PlanInfo;
}) {
  const { db, tenantId, packagesByCode, plan } = params;
  const existing = packagesByCode.get(plan.code);
  if (existing) return { pkg: existing, created: false };
  const now = new Date().toISOString();
  const id = randomUUID();
  await db.prepare(
    `
    INSERT INTO voucher_packages (
      id, tenant_id, code, name, duration_minutes, data_limit_mb, price_ngn, active, description, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    tenantId,
    plan.code,
    plan.name,
    plan.durationMinutes,
    plan.dataLimitMb ?? null,
    plan.priceNgn ?? 0,
    1,
    plan.description,
    now,
    now,
  );
  const pkg = {
    id,
    code: plan.code,
    duration_minutes: plan.durationMinutes,
  };
  packagesByCode.set(plan.code, pkg);
  return { pkg, created: true };
}

export async function POST(request: Request, { params }: Props) {
  try {
    const { slug } = await params;
    const tenant = await getTenantBySlug(slug);
    if (!tenant) {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }

    if (tenant.voucher_source_mode === "omada_openapi" || tenant.voucher_source_mode === "mikrotik_rest") {
      return Response.json(
        {
          error:
            tenant.voucher_source_mode === "omada_openapi"
              ? "CSV import is disabled in Omada API automation mode. Vouchers are provisioned automatically after customer payment."
              : "CSV import is disabled in MikroTik direct mode. Vouchers are created automatically after customer payment.",
        },
        { status: 409 },
      );
    }

    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role === "tenant") {
      if (user.tenantId !== tenant.id) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const form = await request.formData();
    const file = form.get("file");
    const forcedPackageCode = (form.get("packageCode") as string | null) ?? null;

    if (!file || typeof file === "string") {
      return Response.json({ error: "Missing CSV file" }, { status: 400 });
    }

    const csvText = await file.text();
    const rows = parse(csvText, {
      columns: (header) => header.map((value) => value.trim()).filter(Boolean),
      skip_empty_lines: true,
      relax_column_count: true,
      relax_column_count_less: true,
      relax_column_count_more: true,
      relax_quotes: true,
      trim: true,
    }) as Array<Record<string, unknown>>;

    const db = getDb();
    const packages = await db
      .prepare(
        "SELECT id, code, duration_minutes FROM voucher_packages WHERE tenant_id = ?",
      )
      .all(tenant.id) as PackageLite[];
    const packagesByCode = new Map(packages.map((pkg) => [pkg.code, pkg]));

    const insert = db.prepare(`
      INSERT INTO voucher_pool (
        id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let expired = 0;
    let inUse = 0;
    let missingPlan = 0;
    let packagesCreated = 0;

    const run = db.transaction(async () => {
      for (const row of rows) {
        const normalized = normalizeRow(row);
        if (!normalized.code) {
          skipped += 1;
          continue;
        }

        if (isExpiredRow(normalized)) {
          expired += 1;
          continue;
        }
        if (isInUseRow(normalized)) {
          inUse += 1;
          continue;
        }

        let pkg: PackageLite | null = null;
        if (forcedPackageCode) {
          pkg = packagesByCode.get(forcedPackageCode) ?? null;
          if (!pkg) {
            const plan = buildPlan(normalized);
            if (!plan) {
              missingPlan += 1;
              continue;
            }
            const created = await ensurePackage({
              db,
              tenantId: tenant.id,
              packagesByCode,
              plan: { ...plan, code: forcedPackageCode },
            });
            pkg = created.pkg;
            if (created.created) packagesCreated += 1;
          }
        } else {
          const plan = buildPlan(normalized);
          if (!plan) {
            missingPlan += 1;
            continue;
          }
          const created = await ensurePackage({
            db,
            tenantId: tenant.id,
            packagesByCode,
            plan,
          });
          pkg = created.pkg;
          if (created.created) packagesCreated += 1;
        }

        if (pkg.duration_minutes == null) {
          missingPlan += 1;
          continue;
        }

        const exists = await db
          .prepare(
            "SELECT 1 FROM voucher_pool WHERE tenant_id = ? AND voucher_code = ?",
          )
          .get(tenant.id, normalized.code);
        if (exists) {
          duplicates += 1;
          continue;
        }

        await insert.run(
          randomUUID(),
          tenant.id,
          normalized.code,
          pkg.duration_minutes,
          "UNUSED",
          pkg.id,
          now,
        );
        imported += 1;
      }
    });

    await run();

    return Response.json({
      imported,
      duplicates,
      skipped,
      expired,
      inUse,
      missingPlan,
      packagesCreated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
