import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/lib/password";

const DEFAULT_DB_URL = "file:./data/dev.db";

let dbInstance: Database.Database | null = null;

function resolveDbPath() {
  const url = process.env.DATABASE_URL || DEFAULT_DB_URL;
  if (!url.startsWith("file:")) {
    throw new Error("Only SQLite file URLs are supported in this app.");
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

function tableExists(db: Database.Database, table: string) {
  const row = db
    .prepare(
      `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    )
    .get(table) as { name?: string } | undefined;
  return !!row?.name;
}

function columnExists(db: Database.Database, table: string, column: string) {
  if (!tableExists(db, table)) return false;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  return columns.some((col) => col.name === column);
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      status TEXT NOT NULL,
      paystack_secret_enc TEXT,
      paystack_secret_last4 TEXT,
      admin_api_key_hash TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tenant_requests (
      id TEXT PRIMARY KEY,
      requested_slug TEXT NOT NULL,
      requested_name TEXT NOT NULL,
      requested_email TEXT NOT NULL,
      status TEXT NOT NULL,
      review_token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      reviewed_at TEXT,
      tenant_id TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      tenant_id TEXT,
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant
      ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires
      ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
      ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
      ON password_reset_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS tenant_setup_tokens (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `);

  if (!columnExists(db, "users", "email")) {
    db.exec("ALTER TABLE users ADD COLUMN email TEXT;");
  }

  if (columnExists(db, "users", "email")) {
    // Prefer the tenant's admin email for tenant users.
    db.exec(`
      UPDATE users
      SET email = (
        SELECT lower(admin_email)
        FROM tenants
        WHERE tenants.id = users.tenant_id
      )
      WHERE role = 'tenant'
        AND tenant_id IS NOT NULL
        AND (email IS NULL OR trim(email) = '');
    `);

    // Fallback: derive from username for any remaining rows.
    db.exec(`
      UPDATE users
      SET email = lower(
        CASE
          WHEN instr(username, '@') > 0 THEN username
          ELSE username || '@local.test'
        END
      )
      WHERE email IS NULL OR trim(email) = '';
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
        ON users(email);
    `);
  }

  const hasTenantVoucherSchema = columnExists(db, "voucher_packages", "tenant_id");
  if (!tableExists(db, "voucher_packages") || hasTenantVoucherSchema) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS voucher_packages (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        price_ngn INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (tenant_id, code),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );

      CREATE TABLE IF NOT EXISTS voucher_pool (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        voucher_code TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL,
        package_id TEXT NOT NULL,
        assigned_to_transaction TEXT,
        assigned_to_email TEXT,
        assigned_to_phone TEXT,
        created_at TEXT NOT NULL,
        assigned_at TEXT,
        UNIQUE (tenant_id, voucher_code),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        amount_ngn INTEGER NOT NULL,
        voucher_code TEXT,
        package_id TEXT NOT NULL,
        authorization_url TEXT,
        payment_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        paid_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );

      CREATE INDEX IF NOT EXISTS idx_voucher_packages_tenant_active
        ON voucher_packages(tenant_id, active);
      CREATE INDEX IF NOT EXISTS idx_voucher_pool_tenant_status
        ON voucher_pool(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_voucher_pool_tenant_package_status
        ON voucher_pool(tenant_id, package_id, status);
      CREATE INDEX IF NOT EXISTS idx_transactions_tenant_status
        ON transactions(tenant_id, payment_status);
      CREATE INDEX IF NOT EXISTS idx_transactions_tenant_reference
        ON transactions(tenant_id, reference);
    `);

    return;
  }

  migrateVoucherSchemaToTenants(db);
}

function ensureDefaultTenant(db: Database.Database) {
  const existing = db
    .prepare("SELECT * FROM tenants WHERE slug = ?")
    .get("default") as { id: string } | undefined;
  if (existing?.id) return existing.id;

  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO tenants (
      id, slug, name, admin_email, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, "default", "Default Tenant", "owner@example.com", "active", now, now);

  return id;
}

function migrateVoucherSchemaToTenants(db: Database.Database) {
  const defaultTenantId = ensureDefaultTenant(db);

  const hasVoucherPool = tableExists(db, "voucher_pool");
  const hasTransactions = tableExists(db, "transactions");

  db.exec("PRAGMA foreign_keys = OFF;");

  db.exec(`
    CREATE TABLE voucher_packages_new (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price_ngn INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, code),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `);

  db.prepare(
    `
      INSERT INTO voucher_packages_new (
        id, tenant_id, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
      )
      SELECT id, ?, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
      FROM voucher_packages
    `,
  ).run(defaultTenantId);

  db.exec("DROP TABLE voucher_packages;");
  db.exec("ALTER TABLE voucher_packages_new RENAME TO voucher_packages;");

  if (hasVoucherPool) {
    db.exec(`
      CREATE TABLE voucher_pool_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        voucher_code TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL,
        package_id TEXT NOT NULL,
        assigned_to_transaction TEXT,
        assigned_to_email TEXT,
        assigned_to_phone TEXT,
        created_at TEXT NOT NULL,
        assigned_at TEXT,
        UNIQUE (tenant_id, voucher_code),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );
    `);

    db.prepare(
      `
        INSERT INTO voucher_pool_new (
          id, tenant_id, voucher_code, duration_minutes, status, package_id,
          assigned_to_transaction, assigned_to_email, assigned_to_phone,
          created_at, assigned_at
        )
        SELECT
          id, ?, voucher_code, duration_minutes, status, package_id,
          assigned_to_transaction, assigned_to_email, assigned_to_phone,
          created_at, assigned_at
        FROM voucher_pool
      `,
    ).run(defaultTenantId);

    db.exec("DROP TABLE voucher_pool;");
    db.exec("ALTER TABLE voucher_pool_new RENAME TO voucher_pool;");
  } else {
    db.exec(`
      CREATE TABLE voucher_pool (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        voucher_code TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        status TEXT NOT NULL,
        package_id TEXT NOT NULL,
        assigned_to_transaction TEXT,
        assigned_to_email TEXT,
        assigned_to_phone TEXT,
        created_at TEXT NOT NULL,
        assigned_at TEXT,
        UNIQUE (tenant_id, voucher_code),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );
    `);
  }

  if (hasTransactions) {
    db.exec(`
      CREATE TABLE transactions_new (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        amount_ngn INTEGER NOT NULL,
        voucher_code TEXT,
        package_id TEXT NOT NULL,
        authorization_url TEXT,
        payment_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        paid_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );
    `);

    db.prepare(
      `
        INSERT INTO transactions_new (
          id, tenant_id, reference, email, phone, amount_ngn, voucher_code,
          package_id, authorization_url, payment_status, created_at,
          expires_at, paid_at
        )
        SELECT
          id, ?, reference, email, phone, amount_ngn, voucher_code,
          package_id, authorization_url, payment_status, created_at,
          expires_at, paid_at
        FROM transactions
      `,
    ).run(defaultTenantId);

    db.exec("DROP TABLE transactions;");
    db.exec("ALTER TABLE transactions_new RENAME TO transactions;");
  } else {
    db.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        reference TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        amount_ngn INTEGER NOT NULL,
        voucher_code TEXT,
        package_id TEXT NOT NULL,
        authorization_url TEXT,
        payment_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT,
        paid_at TEXT,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (package_id) REFERENCES voucher_packages(id)
      );
    `);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_voucher_packages_tenant_active
      ON voucher_packages(tenant_id, active);
    CREATE INDEX IF NOT EXISTS idx_voucher_pool_tenant_status
      ON voucher_pool(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_voucher_pool_tenant_package_status
      ON voucher_pool(tenant_id, package_id, status);
    CREATE INDEX IF NOT EXISTS idx_transactions_tenant_status
      ON transactions(tenant_id, payment_status);
    CREATE INDEX IF NOT EXISTS idx_transactions_tenant_reference
      ON transactions(tenant_id, reference);
  `);

  db.exec("PRAGMA foreign_keys = ON;");
}

function seedInitialData(db: Database.Database) {
  const now = new Date().toISOString();

  const ensureUser = (params: {
    email: string;
    username: string;
    role: "admin" | "tenant";
    tenantId?: string | null;
    password: string;
    mustChangePassword?: boolean;
  }) => {
    const normalizedUsername = params.username.trim().toLowerCase();
    const existing = db
      .prepare("SELECT id, email FROM users WHERE username = ?")
      .get(normalizedUsername) as { id: string; email: string | null } | undefined;
    if (existing?.id) {
      const nextEmail = params.email.trim().toLowerCase();
      const needsUpdate =
        !existing.email ||
        existing.email.trim() === "" ||
        existing.email.trim().toLowerCase() === `${normalizedUsername}@local.test`;
      if (needsUpdate && nextEmail && nextEmail !== existing.email) {
        db.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").run(
          nextEmail,
          now,
          existing.id,
        );
      }
      return existing.id;
    }

    const id = randomUUID();
    const passwordHash = hashPassword(params.password);
    db.prepare(
      `
        INSERT INTO users (
          id, email, username, role, tenant_id, password_hash, must_change_password, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      id,
      params.email.trim().toLowerCase(),
      normalizedUsername,
      params.role,
      params.tenantId ?? null,
      passwordHash,
      params.mustChangePassword ? 1 : 0,
      now,
      now,
    );

    return id;
  };

  ensureUser({
    email: "seeduser@example.com",
    username: "seeduser",
    role: "admin",
    password: "Passw0rdA1",
    mustChangePassword: false,
  });

  const seedTenantSlug = "walstreet";
  let tenantId =
    (
      db
        .prepare("SELECT id FROM tenants WHERE slug = ?")
        .get(seedTenantSlug) as { id: string } | undefined
    )?.id ?? null;

  if (!tenantId) {
    tenantId = randomUUID();
    db.prepare(
      `
        INSERT INTO tenants (
          id, slug, name, admin_email, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      tenantId,
      seedTenantSlug,
      "WALSTREET",
      "walstreet@example.com",
      "pending_setup",
      now,
      now,
    );
  }

  const pkgCount = db
    .prepare(
      "SELECT COUNT(1) as count FROM voucher_packages WHERE tenant_id = ?",
    )
    .get(tenantId) as { count: number };

  if ((pkgCount?.count ?? 0) === 0) {
    const insert = db.prepare(`
      INSERT INTO voucher_packages (
        id, tenant_id, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaults = [
      {
        code: "3h",
        name: "3 Hours",
        duration: 180,
        price: 500,
        description: "Quick access for light browsing.",
      },
      {
        code: "1day",
        name: "1 Day",
        duration: 1440,
        price: 1000,
        description: "Full-day access for work or study.",
      },
      {
        code: "1week",
        name: "1 Week",
        duration: 10080,
        price: 5000,
        description: "Best value for long stays.",
      },
    ];

    const insertMany = db.transaction(() => {
      for (const pkg of defaults) {
        insert.run(
          randomUUID(),
          tenantId,
          pkg.code,
          pkg.name,
          pkg.duration,
          pkg.price,
          1,
          pkg.description,
          now,
          now,
        );
      }
    });

    insertMany();
  }

  ensureUser({
    email: "walstreet@example.com",
    username: "WALSTREET",
    role: "tenant",
    tenantId,
    password: "Pathfinder07!",
    mustChangePassword: false,
  });
}

export function getDb() {
  if (!dbInstance) {
    const dbPath = resolveDbPath();
    dbInstance = new Database(dbPath);
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("foreign_keys = ON");
    initSchema(dbInstance);
    seedInitialData(dbInstance);
  }
  return dbInstance;
}
