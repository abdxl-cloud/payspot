import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

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

const dbPath = resolveDbPath();
const db = new Database(dbPath);

const tenant = db
  .prepare("SELECT id, slug FROM tenants WHERE slug = ?")
  .get(tenantArg);

if (!tenant?.id) {
  console.error(`Tenant not found: ${tenantArg}`);
  process.exit(1);
}

const packages = db
  .prepare("SELECT id, code, duration_minutes FROM voucher_packages WHERE tenant_id = ?")
  .all(tenant.id);

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

const insert = db.prepare(`
  INSERT INTO voucher_pool (
    id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();

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

    const pkg = resolvePackage(packages, normalized.duration, packageArg);
    if (!pkg) {
      skipped += 1;
      continue;
    }

    const exists = db
      .prepare("SELECT 1 FROM voucher_pool WHERE tenant_id = ? AND voucher_code = ?")
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

console.log(`Tenant: ${tenant.slug}`);
console.log(`Imported: ${imported}`);
console.log(`Duplicates: ${duplicates}`);
console.log(`Skipped: ${skipped}`);

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

function resolveDbPath() {
  const url = process.env.DATABASE_URL || "file:./data/dev.db";
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file URLs are supported.");
  }
  const filePath = url.replace("file:", "");
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}
