import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const args = process.argv.slice(2);
const fileArg = args.find((arg) => !arg.startsWith("--"));
const tenantArg = getFlag("--tenant") || process.env.TENANT_SLUG || null;
const packageArg = getFlag("--package");

if (!fileArg || !tenantArg) {
  console.error(
    "Usage: node scripts/import-vouchers.mjs <file.csv> --tenant <slug> [--package 3h]",
  );
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`CSV file not found: ${filePath}`);
  process.exit(1);
}

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/payspot",
});

const sqlCache = new Map();

function mapSqlPlaceholders(sql) {
  const cached = sqlCache.get(sql);
  if (cached) return cached;

  let out = "";
  let index = 1;
  let inSingleQuote = false;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];

    if (ch === "'") {
      out += ch;
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "'";
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && ch === "?") {
      out += `$${index}`;
      index += 1;
      continue;
    }

    out += ch;
  }

  sqlCache.set(sql, out);
  return out;
}

async function query(client, sql, args = []) {
  const result = await client.query(mapSqlPlaceholders(sql), args);
  return result.rows;
}

async function getOne(client, sql, args = []) {
  const rows = await query(client, sql, args);
  return rows[0];
}

try {
  const client = await pool.connect();

  try {
    const tenant = await getOne(
      client,
      "SELECT id, slug FROM tenants WHERE slug = ?",
      [tenantArg],
    );

    if (!tenant?.id) {
      console.error(`Tenant not found: ${tenantArg}`);
      process.exit(1);
    }

    const packages = await query(
      client,
      "SELECT id, code, duration_minutes FROM voucher_packages WHERE tenant_id = ?",
      [tenant.id],
    );

    if (packages.length === 0) {
      console.error(
        "No voucher packages found for this tenant. Approve the tenant request (which seeds defaults) or insert packages manually.",
      );
      process.exit(1);
    }

    const rows = parse(fs.readFileSync(filePath), {
      columns: true,
      skip_empty_lines: true,
    });

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;

    const now = new Date().toISOString();

    await client.query("BEGIN");
    try {
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

        const pkg = resolvePackage(packages, normalized.duration, packageArg);
        if (!pkg) {
          skipped += 1;
          continue;
        }

        const exists = await getOne(
          client,
          "SELECT 1 FROM voucher_pool WHERE tenant_id = ? AND voucher_code = ?",
          [tenant.id, normalized.code],
        );

        if (exists) {
          duplicates += 1;
          continue;
        }

        await query(
          client,
          `
            INSERT INTO voucher_pool (
              id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [
            randomUUID(),
            tenant.id,
            normalized.code,
            pkg.duration_minutes,
            "UNUSED",
            pkg.id,
            now,
          ],
        );

        imported += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log(`Tenant: ${tenant.slug}`);
    console.log(`Imported: ${imported}`);
    console.log(`Duplicates: ${duplicates}`);
    console.log(`Skipped: ${skipped}`);
  } finally {
    client.release();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Import failed.");
  process.exit(1);
} finally {
  await pool.end();
}

function getFlag(name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1];
}

function normalizeRow(row) {
  const entries = Object.entries(row).reduce((acc, [key, value]) => {
    const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
    acc[normalizedKey] = typeof value === "string" ? value.trim() : value;
    return acc;
  }, {});

  return {
    code: entries.code || entries.vouchercode || entries.csvcode || null,
    duration: parseInt(entries.duration, 10) || null,
    status: entries.status ? entries.status.toLowerCase() : null,
  };
}

function resolvePackage(packages, duration, forcedCode) {
  if (forcedCode) {
    return packages.find((pkg) => pkg.code === forcedCode);
  }
  if (!duration) return null;
  return packages.find((pkg) => pkg.duration_minutes === duration);
}
