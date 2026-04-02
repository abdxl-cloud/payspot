import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { hashPassword } from "@/lib/password";
import path from "node:path";
import fs from "node:fs";

// SQLite database file path - stored in project root for persistence
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "payspot.db");

type QueryArg = string | number | boolean | null;

type RunResult = {
  changes: number;
};

type Statement = {
  get<T = Record<string, unknown>>(...args: QueryArg[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...args: QueryArg[]): Promise<T[]>;
  run(...args: QueryArg[]): Promise<RunResult>;
};

type DbLike = {
  prepare: (sql: string) => Statement;
  transaction: <T>(fn: () => Promise<T> | T) => () => Promise<T>;
  exec: (sql: string) => Promise<void>;
};

let sqliteDb: Database.Database | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

function getSqliteDb(): Database.Database {
  if (!sqliteDb) {
    // Ensure data directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    sqliteDb = new Database(DB_PATH);
    // Enable WAL mode for better performance
    sqliteDb.pragma("journal_mode = WAL");
    // Enable foreign keys
    sqliteDb.pragma("foreign_keys = ON");
  }
  return sqliteDb;
}

function queryRows(sql: string, args: QueryArg[] = []) {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  const rows = stmt.all(...args);
  return rows as Array<Record<string, unknown>>;
}

function runSql(sql: string, args: QueryArg[] = []): RunResult {
  const db = getSqliteDb();
  const stmt = db.prepare(sql);
  const result = stmt.run(...args);
  return { changes: result.changes };
}

function initSchema() {
  const db = getSqliteDb();
  
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
      voucher_source_mode TEXT NOT NULL DEFAULT 'import_csv',
      portal_auth_mode TEXT NOT NULL DEFAULT 'omada_builtin',
      omada_api_base_url TEXT,
      omada_omadac_id TEXT,
      omada_site_id TEXT,
      omada_client_id TEXT,
      omada_client_secret_enc TEXT,
      omada_hotspot_operator_username TEXT,
      omada_hotspot_operator_password_enc TEXT,
      mikrotik_base_url TEXT,
      mikrotik_username TEXT,
      mikrotik_password_enc TEXT,
      mikrotik_hotspot_server TEXT,
      mikrotik_default_profile TEXT,
      mikrotik_verify_tls INTEGER NOT NULL DEFAULT 1,
      radius_adapter_secret_enc TEXT,
      radius_adapter_secret_last4 TEXT,
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
      tenant_id TEXT REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL,
      tenant_id TEXT REFERENCES tenants(id),
      password_hash TEXT NOT NULL,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_tenant
      ON users(tenant_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires
      ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
      ON password_reset_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires
      ON password_reset_tokens(expires_at);

    CREATE TABLE IF NOT EXISTS tenant_setup_tokens (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voucher_packages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      duration_minutes INTEGER,
      price_ngn INTEGER NOT NULL,
      max_devices INTEGER,
      bandwidth_profile TEXT,
      data_limit_mb INTEGER,
      available_from TEXT,
      available_to TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      radius_voucher_code_prefix TEXT,
      radius_voucher_code_length INTEGER,
      radius_voucher_character_set TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, code)
    );

    CREATE TABLE IF NOT EXISTS voucher_pool (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      voucher_code TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      status TEXT NOT NULL,
      package_id TEXT NOT NULL REFERENCES voucher_packages(id),
      assigned_to_transaction TEXT,
      assigned_to_email TEXT,
      assigned_to_phone TEXT,
      created_at TEXT NOT NULL,
      assigned_at TEXT,
      UNIQUE (tenant_id, voucher_code)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      reference TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      amount_ngn INTEGER NOT NULL,
      voucher_code TEXT,
      voucher_source_mode TEXT,
      package_id TEXT NOT NULL REFERENCES voucher_packages(id),
      subscriber_id TEXT,
      delivery_mode TEXT NOT NULL DEFAULT 'voucher',
      authorization_url TEXT,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT,
      notification_sms_sent INTEGER NOT NULL DEFAULT 0,
      notification_email_sent INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS portal_subscribers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      email TEXT NOT NULL,
      phone TEXT,
      full_name TEXT,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS portal_subscriber_sessions (
      id TEXT PRIMARY KEY,
      subscriber_id TEXT NOT NULL REFERENCES portal_subscribers(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS subscriber_entitlements (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      subscriber_id TEXT NOT NULL REFERENCES portal_subscribers(id),
      package_id TEXT NOT NULL REFERENCES voucher_packages(id),
      transaction_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      max_devices INTEGER,
      bandwidth_profile TEXT,
      data_limit_mb INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS radius_accounting_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      subscriber_id TEXT NOT NULL REFERENCES portal_subscribers(id),
      entitlement_id TEXT NOT NULL REFERENCES subscriber_entitlements(id),
      session_id TEXT NOT NULL,
      calling_station_id TEXT,
      called_station_id TEXT,
      nas_ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      input_octets INTEGER NOT NULL DEFAULT 0,
      output_octets INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      last_update_at TEXT NOT NULL,
      stopped_at TEXT,
      UNIQUE (tenant_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS radius_voucher_sessions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      transaction_reference TEXT NOT NULL REFERENCES transactions(reference),
      session_id TEXT NOT NULL,
      calling_station_id TEXT,
      called_station_id TEXT,
      nas_ip_address TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      input_octets INTEGER NOT NULL DEFAULT 0,
      output_octets INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      last_update_at TEXT NOT NULL,
      stopped_at TEXT,
      UNIQUE (tenant_id, session_id)
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
    CREATE INDEX IF NOT EXISTS idx_transactions_tenant_voucher_source_code
      ON transactions(tenant_id, voucher_source_mode, voucher_code);
    CREATE INDEX IF NOT EXISTS idx_portal_subscribers_tenant_email
      ON portal_subscribers(tenant_id, email);
    CREATE INDEX IF NOT EXISTS idx_portal_subscriber_sessions_subscriber
      ON portal_subscriber_sessions(subscriber_id);
    CREATE INDEX IF NOT EXISTS idx_portal_subscriber_sessions_expires
      ON portal_subscriber_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_subscriber_entitlements_subscriber_status
      ON subscriber_entitlements(subscriber_id, status);
    CREATE INDEX IF NOT EXISTS idx_subscriber_entitlements_tenant_status
      ON subscriber_entitlements(tenant_id, status);
    CREATE INDEX IF NOT EXISTS idx_radius_accounting_tenant_subscriber_status
      ON radius_accounting_sessions(tenant_id, subscriber_id, status);
    CREATE INDEX IF NOT EXISTS idx_radius_accounting_tenant_entitlement
      ON radius_accounting_sessions(tenant_id, entitlement_id);
    CREATE INDEX IF NOT EXISTS idx_radius_voucher_sessions_tenant_reference
      ON radius_voucher_sessions(tenant_id, transaction_reference);
    CREATE INDEX IF NOT EXISTS idx_radius_voucher_sessions_tenant_reference_status
      ON radius_voucher_sessions(tenant_id, transaction_reference, status);
  `);
}

function seedInitialData() {
  const now = new Date().toISOString();
  const db = getSqliteDb();

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
      const currentEmail = existing.email?.trim().toLowerCase() ?? "";
      const needsUpdate =
        !currentEmail || currentEmail === `${normalizedUsername}@local.test`;
      if (needsUpdate && nextEmail && nextEmail !== currentEmail) {
        db.prepare("UPDATE users SET email = ?, updated_at = ? WHERE id = ?").run(
          nextEmail,
          now,
          existing.id
        );
      }
      return existing.id;
    }

    const id = randomUUID();
    const passwordHash = hashPassword(params.password);
    db.prepare(`
      INSERT INTO users (
        id, email, username, role, tenant_id, password_hash, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      params.email.trim().toLowerCase(),
      normalizedUsername,
      params.role,
      params.tenantId ?? null,
      passwordHash,
      params.mustChangePassword ? 1 : 0,
      now,
      now
    );

    return id;
  };

  // Create platform admin - demo account
  ensureUser({
    email: "admin@payspot.demo",
    username: "admin",
    role: "admin",
    password: "Demo123!",
    mustChangePassword: false,
  });

  // Seed demo tenants with different configurations
  const seedTenants: Array<{
    slug: string;
    name: string;
    email: string;
    username: string;
    password: string;
    status: string;
    voucherSourceMode: string;
    portalAuthMode: string;
  }> = [
    {
      slug: "demo-cafe",
      name: "Demo Cafe WiFi",
      email: "cafe@payspot.demo",
      username: "democafe",
      password: "Demo123!",
      status: "active",
      voucherSourceMode: "import_csv",
      portalAuthMode: "omada_builtin",
    },
    {
      slug: "demo-hotel",
      name: "Demo Hotel WiFi",
      email: "hotel@payspot.demo",
      username: "demohotel",
      password: "Demo123!",
      status: "active",
      voucherSourceMode: "mikrotik_rest",
      portalAuthMode: "external_radius_portal",
    },
    {
      slug: "demo-cowork",
      name: "Demo CoWork Space",
      email: "cowork@payspot.demo",
      username: "democowork",
      password: "Demo123!",
      status: "active",
      voucherSourceMode: "omada_openapi",
      portalAuthMode: "external_portal_api",
    },
  ];

  for (const t of seedTenants) {
    const existing = db
      .prepare("SELECT id FROM tenants WHERE slug = ?")
      .get(t.slug) as { id: string } | undefined;
    
    let tenantId = existing?.id ?? null;

    if (!tenantId) {
      tenantId = randomUUID();
      db.prepare(`
        INSERT INTO tenants (
          id, slug, name, admin_email, status, voucher_source_mode, portal_auth_mode, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tenantId,
        t.slug,
        t.name,
        t.email,
        t.status,
        t.voucherSourceMode,
        t.portalAuthMode,
        now,
        now
      );

      // Create demo voucher packages for active tenants
      if (t.status === "active") {
        const packages = [
          { code: "1HR", name: "1 Hour", duration: 60, price: 100, description: "Quick browse - 1 hour access" },
          { code: "3HR", name: "3 Hours", duration: 180, price: 250, description: "Extended session - 3 hours" },
          { code: "DAY", name: "Full Day", duration: 1440, price: 500, description: "All day access - 24 hours" },
          { code: "WEEK", name: "Weekly Pass", duration: 10080, price: 2000, description: "7 days unlimited access" },
        ];

        for (const pkg of packages) {
          const pkgId = randomUUID();
          db.prepare(`
            INSERT INTO voucher_packages (
              id, tenant_id, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
          `).run(pkgId, tenantId, pkg.code, pkg.name, pkg.duration, pkg.price, pkg.description, now, now);

          // Create some demo vouchers for CSV mode tenants
          if (t.voucherSourceMode === "import_csv") {
            for (let i = 1; i <= 5; i++) {
              const voucherId = randomUUID();
              const voucherCode = `${pkg.code}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
              db.prepare(`
                INSERT INTO voucher_pool (
                  id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
                ) VALUES (?, ?, ?, ?, 'available', ?, ?)
              `).run(voucherId, tenantId, voucherCode, pkg.duration, pkgId, now);
            }
          }
        }
      }
    }

    ensureUser({
      email: t.email,
      username: t.username,
      role: "tenant",
      tenantId,
      password: t.password,
      mustChangePassword: false,
    });
  }
}

function ensureInitialized() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      initSchema();
      seedInitialData();
      initialized = true;
    });
  }
  return initPromise;
}

function createStatement(sql: string): Statement {
  return {
    async get<T = Record<string, unknown>>(...args: QueryArg[]) {
      await ensureInitialized();
      const rows = queryRows(sql, args);
      return rows[0] as T | undefined;
    },
    async all<T = Record<string, unknown>>(...args: QueryArg[]) {
      await ensureInitialized();
      return queryRows(sql, args) as T[];
    },
    async run(...args: QueryArg[]) {
      await ensureInitialized();
      return runSql(sql, args);
    },
  };
}

function transaction<T>(fn: () => Promise<T> | T) {
  return async () => {
    await ensureInitialized();
    const db = getSqliteDb();
    
    return db.transaction(() => {
      // Since better-sqlite3 transactions are sync, we need to handle async fn
      const result = fn();
      if (result instanceof Promise) {
        throw new Error("SQLite transactions must be synchronous. Use sync operations inside transaction.");
      }
      return result;
    })();
  };
}

// Synchronous transaction for SQLite (preferred)
function transactionSync<T>(fn: () => T): T {
  const db = getSqliteDb();
  // Ensure initialized synchronously
  if (!initialized) {
    initSchema();
    seedInitialData();
    initialized = true;
  }
  return db.transaction(fn)();
}

const db: DbLike = {
  prepare(sql: string) {
    return createStatement(sql);
  },
  transaction,
  async exec(sql: string) {
    await ensureInitialized();
    getSqliteDb().exec(sql);
  },
};

export function getDb() {
  return db;
}

// Export sync transaction for SQLite-specific usage
export { transactionSync };

// Export raw SQLite db for advanced usage
export function getRawDb() {
  return getSqliteDb();
}
