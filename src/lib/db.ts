import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, types, type PoolClient } from "pg";
import { hashPassword } from "@/lib/password";

const DEFAULT_DB_URL = "postgresql://postgres:postgres@localhost:5432/payspot";

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
      duration_minutes INTEGER NOT NULL,
      price_ngn INTEGER NOT NULL,
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
      authorization_url TEXT,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      paid_at TEXT
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

  const seedTenantSlug = "walstreet";
  const tenantRows = (await queryRows("SELECT id FROM tenants WHERE slug = ?", [
    seedTenantSlug,
  ])) as Array<{ id: string }>;
  let tenantId = tenantRows[0]?.id ?? null;

  if (!tenantId) {
    tenantId = randomUUID();
    await runSql(
      `
        INSERT INTO tenants (
          id, slug, name, admin_email, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tenantId,
        seedTenantSlug,
        "WALSTREET",
        "walstreet@example.com",
        "pending_setup",
        now,
        now,
      ],
    );
  }

  const pkgRows = (await queryRows(
    "SELECT COUNT(1) as count FROM voucher_packages WHERE tenant_id = ?",
    [tenantId],
  )) as Array<{ count: string | number }>;

  const pkgCount = Number(pkgRows[0]?.count ?? 0);
  if (pkgCount === 0) {
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

    for (const pkg of defaults) {
      await runSql(
        `
          INSERT INTO voucher_packages (
            id, tenant_id, code, name, duration_minutes, price_ngn, active, description, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
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
        ],
      );
    }
  }

  await ensureUser({
    email: "walstreet@example.com",
    username: "WALSTREET",
    role: "tenant",
    tenantId,
    password: "Pathfinder07!",
    mustChangePassword: false,
  });
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
