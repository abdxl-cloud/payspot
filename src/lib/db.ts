import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types, type PoolClient } from "pg";
import { hashPassword } from "@/lib/password";

const DEFAULT_DB_URL = "postgresql://postgres:postgres@localhost:5433/payspot";

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

let pool: Pool | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;
const txStorage = new AsyncLocalStorage<PoolClient>();
const sqlCache = new Map<string, string>();
let savepointCounter = 0;

// Parse BIGINT results (e.g. COUNT/SUM) as numbers for compatibility with existing code.
types.setTypeParser(20, (value) => Number(value));

function resolveDbUrl() {
  return process.env.DATABASE_URL || DEFAULT_DB_URL;
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDbUrl(),
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
    });
  }
  return pool;
}

function mapSqlPlaceholders(sql: string) {
  const cached = sqlCache.get(sql);
  if (cached) return cached;

  let out = "";
  let paramIndex = 1;
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
      out += `$${paramIndex}`;
      paramIndex += 1;
      continue;
    }

    out += ch;
  }

  sqlCache.set(sql, out);
  return out;
}

async function queryRows(sql: string, args: QueryArg[] = []) {
  const mappedSql = mapSqlPlaceholders(sql);
  const txClient = txStorage.getStore();
  const client = txClient ?? getPool();
  const result = await client.query(mappedSql, args);
  return result.rows as Array<Record<string, unknown>>;
}

async function runSql(sql: string, args: QueryArg[] = []): Promise<RunResult> {
  const mappedSql = mapSqlPlaceholders(sql);
  const txClient = txStorage.getStore();
  const client = txClient ?? getPool();
  const result = await client.query(mappedSql, args);
  return { changes: result.rowCount ?? 0 };
}

async function initSchema() {
  const p = getPool();
  await p.query(`
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
      package_id TEXT NOT NULL REFERENCES voucher_packages(id),
      subscriber_id TEXT,
      delivery_mode TEXT NOT NULL DEFAULT 'voucher',
      authorization_url TEXT,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT
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
      input_octets BIGINT NOT NULL DEFAULT 0,
      output_octets BIGINT NOT NULL DEFAULT 0,
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
  `);

  await p.query(`
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS voucher_source_mode TEXT NOT NULL DEFAULT 'import_csv';
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS portal_auth_mode TEXT NOT NULL DEFAULT 'omada_builtin';
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_api_base_url TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_omadac_id TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_site_id TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_client_id TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_client_secret_enc TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_hotspot_operator_username TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS omada_hotspot_operator_password_enc TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS radius_adapter_secret_enc TEXT;
    ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS radius_adapter_secret_last4 TEXT;
    ALTER TABLE voucher_packages
      ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE voucher_packages
      ADD COLUMN IF NOT EXISTS bandwidth_profile TEXT;
    ALTER TABLE voucher_packages
      ADD COLUMN IF NOT EXISTS data_limit_mb INTEGER;
    ALTER TABLE voucher_packages
      ADD COLUMN IF NOT EXISTS available_from TEXT;
    ALTER TABLE voucher_packages
      ADD COLUMN IF NOT EXISTS available_to TEXT;
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS subscriber_id TEXT;
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'voucher';
    ALTER TABLE voucher_packages
      ALTER COLUMN duration_minutes DROP NOT NULL;
    ALTER TABLE voucher_packages
      ALTER COLUMN max_devices DROP NOT NULL;
    ALTER TABLE subscriber_entitlements
      ALTER COLUMN ends_at DROP NOT NULL;
    ALTER TABLE subscriber_entitlements
      ALTER COLUMN max_devices DROP NOT NULL;
  `);
}

async function seedInitialData() {
  const now = new Date().toISOString();

  const ensureUser = async (params: {
    email: string;
    username: string;
    role: "admin" | "tenant";
    tenantId?: string | null;
    password: string;
    mustChangePassword?: boolean;
  }) => {
    const normalizedUsername = params.username.trim().toLowerCase();
    const existing = (await queryRows(
      "SELECT id, email FROM users WHERE username = ?",
      [normalizedUsername],
    )) as Array<{ id: string; email: string | null }>;

    const row = existing[0];
    if (row?.id) {
      const nextEmail = params.email.trim().toLowerCase();
      const currentEmail = row.email?.trim().toLowerCase() ?? "";
      const needsUpdate =
        !currentEmail || currentEmail === `${normalizedUsername}@local.test`;
      if (needsUpdate && nextEmail && nextEmail !== currentEmail) {
        await runSql("UPDATE users SET email = ?, updated_at = ? WHERE id = ?", [
          nextEmail,
          now,
          row.id,
        ]);
      }
      return row.id;
    }

    const id = randomUUID();
    const passwordHash = hashPassword(params.password);
    await runSql(
      `
        INSERT INTO users (
          id, email, username, role, tenant_id, password_hash, must_change_password, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        params.email.trim().toLowerCase(),
        normalizedUsername,
        params.role,
        params.tenantId ?? null,
        passwordHash,
        params.mustChangePassword ? 1 : 0,
        now,
        now,
      ],
    );

    return id;
  };

  await ensureUser({
    email: "seeduser@example.com",
    username: "seeduser",
    role: "admin",
    password: "Passw0rdA1",
    mustChangePassword: false,
  });

  const seedTenants: Array<{
    slug: string;
    name: string;
    email: string;
    username: string;
    password: string;
  }> = [
    {
      slug: "wallstreet",
      name: "WALLSTREET",
      email: "wallstreet@example.com",
      username: "wallstreet",
      password: "Pathfinder07!",
    },
    {
      slug: "wallstreet-mystic",
      name: "WALLSTREET MYSTIC",
      email: "wallstreet-mystic@example.com",
      username: "wallstreet-mystic",
      password: "Pathfinder07!",
    },
  ];

  for (const t of seedTenants) {
    const tenantRows = (await queryRows(
      "SELECT id FROM tenants WHERE slug = ?",
      [t.slug],
    )) as Array<{ id: string }>;
    let tenantId = tenantRows[0]?.id ?? null;

    if (!tenantId) {
      tenantId = randomUUID();
      await runSql(
        `
          INSERT INTO tenants (
            id, slug, name, admin_email, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [tenantId, t.slug, t.name, t.email, "pending_setup", now, now],
      );
    }

    await ensureUser({
      email: t.email,
      username: t.username,
      role: "tenant",
      tenantId,
      password: t.password,
      mustChangePassword: false,
    });
  }
}

async function ensureInitialized() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initSchema();
      await seedInitialData();
      initialized = true;
    })();
  }
  await initPromise;
}

function createStatement(sql: string): Statement {
  return {
    async get<T = Record<string, unknown>>(...args: QueryArg[]) {
      await ensureInitialized();
      const rows = await queryRows(sql, args);
      return rows[0] as T | undefined;
    },
    async all<T = Record<string, unknown>>(...args: QueryArg[]) {
      await ensureInitialized();
      return (await queryRows(sql, args)) as T[];
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

    const existingClient = txStorage.getStore();
    if (existingClient) {
      savepointCounter += 1;
      const savepointName = `sp_${savepointCounter}`;
      await existingClient.query(`SAVEPOINT ${savepointName}`);
      try {
        const result = await fn();
        await existingClient.query(`RELEASE SAVEPOINT ${savepointName}`);
        return result;
      } catch (error) {
        await existingClient.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        throw error;
      }
    }

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const result = await txStorage.run(client, async () => fn());
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };
}

const db: DbLike = {
  prepare(sql: string) {
    return createStatement(sql);
  },
  transaction,
  async exec(sql: string) {
    await ensureInitialized();
    await getPool().query(sql);
  },
};

export function getDb() {
  return db;
}
