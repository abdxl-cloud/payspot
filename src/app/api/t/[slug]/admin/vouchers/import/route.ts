import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

type PackageLite = { id: string; code: string; duration_minutes: number };

function normalizeRow(row: Record<string, unknown>) {
  const entries = Object.entries(row).reduce<Record<string, unknown>>(
    (acc, [key, value]) => {
      const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
      acc[normalizedKey] = typeof value === "string" ? value.trim() : value;
      return acc;
    },
    {},
  );

  return {
    code:
      (entries.code as string | undefined) ||
      (entries.vouchercode as string | undefined) ||
      (entries.csvcode as string | undefined) ||
      null,
    duration: parseInt((entries.duration as string | undefined) ?? "", 10) || null,
    status: entries.status ? String(entries.status).toLowerCase() : null,
  };
}

function resolvePackage(
  packages: PackageLite[],
  duration: number | null,
  forcedCode: string | null,
) {
  if (forcedCode) {
    return packages.find((pkg) => pkg.code === forcedCode) ?? null;
  }
  if (!duration) return null;
  return packages.find((pkg) => pkg.duration_minutes === duration) ?? null;
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const user = getSessionUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role === "tenant") {
    if (user.tenantId !== tenant.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const needsSetup =
      user.mustChangePassword ||
      !tenant.paystack_secret_enc ||
      tenant.status !== "active";
    if (needsSetup) {
      return Response.json(
        { error: "Complete setup before importing vouchers" },
        { status: 409 },
      );
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
    columns: true,
    skip_empty_lines: true,
  }) as Array<Record<string, unknown>>;

  const db = getDb();
  const packages = db
    .prepare(
      "SELECT id, code, duration_minutes FROM voucher_packages WHERE tenant_id = ?",
    )
    .all(tenant.id) as PackageLite[];

  if (packages.length === 0) {
    return Response.json(
      { error: "No voucher packages found for this tenant" },
      { status: 409 },
    );
  }

  const insert = db.prepare(`
    INSERT INTO voucher_pool (
      id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;

  const run = db.transaction(() => {
    for (const row of rows) {
      const normalized = normalizeRow(row);
      if (!normalized.code) {
        skipped += 1;
        continue;
      }

      if (normalized.status && normalized.status !== "unused") {
        skipped += 1;
        continue;
      }

      const pkg = resolvePackage(packages, normalized.duration, forcedPackageCode);
      if (!pkg) {
        skipped += 1;
        continue;
      }

      const exists = db
        .prepare(
          "SELECT 1 FROM voucher_pool WHERE tenant_id = ? AND voucher_code = ?",
        )
        .get(tenant.id, normalized.code);
      if (exists) {
        duplicates += 1;
        continue;
      }

      insert.run(
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

  run();

  return Response.json({ imported, duplicates, skipped });
}
