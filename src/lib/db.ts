import { randomUUID } from "node:crypto";
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

// We use a simple Map for in-memory storage since sql.js requires WASM
// This is simpler and works better in serverless environments
type InMemoryRecord = Record<string, unknown>;

interface InMemoryDb {
  tenants: Map<string, InMemoryRecord>;
  tenant_requests: Map<string, InMemoryRecord>;
  users: Map<string, InMemoryRecord>;
  sessions: Map<string, InMemoryRecord>;
  password_reset_tokens: Map<string, InMemoryRecord>;
  tenant_setup_tokens: Map<string, InMemoryRecord>;
  voucher_packages: Map<string, InMemoryRecord>;
  voucher_pool: Map<string, InMemoryRecord>;
  transactions: Map<string, InMemoryRecord>;
  portal_subscribers: Map<string, InMemoryRecord>;
  portal_subscriber_sessions: Map<string, InMemoryRecord>;
  subscriber_entitlements: Map<string, InMemoryRecord>;
  radius_accounting_sessions: Map<string, InMemoryRecord>;
  radius_voucher_sessions: Map<string, InMemoryRecord>;
}

let memDb: InMemoryDb | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

function getMemDb(): InMemoryDb {
  if (!memDb) {
    // Try to load from file
    let loadedData: InMemoryDb | null = null;
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        loadedData = {
          tenants: new Map(Object.entries(parsed.tenants || {})),
          tenant_requests: new Map(Object.entries(parsed.tenant_requests || {})),
          users: new Map(Object.entries(parsed.users || {})),
          sessions: new Map(Object.entries(parsed.sessions || {})),
          password_reset_tokens: new Map(Object.entries(parsed.password_reset_tokens || {})),
          tenant_setup_tokens: new Map(Object.entries(parsed.tenant_setup_tokens || {})),
          voucher_packages: new Map(Object.entries(parsed.voucher_packages || {})),
          voucher_pool: new Map(Object.entries(parsed.voucher_pool || {})),
          transactions: new Map(Object.entries(parsed.transactions || {})),
          portal_subscribers: new Map(Object.entries(parsed.portal_subscribers || {})),
          portal_subscriber_sessions: new Map(Object.entries(parsed.portal_subscriber_sessions || {})),
          subscriber_entitlements: new Map(Object.entries(parsed.subscriber_entitlements || {})),
          radius_accounting_sessions: new Map(Object.entries(parsed.radius_accounting_sessions || {})),
          radius_voucher_sessions: new Map(Object.entries(parsed.radius_voucher_sessions || {})),
        };
      }
    } catch {
      // Ignore errors, will create fresh db
    }

    if (loadedData) {
      memDb = loadedData;
    } else {
      memDb = {
        tenants: new Map(),
        tenant_requests: new Map(),
        users: new Map(),
        sessions: new Map(),
        password_reset_tokens: new Map(),
        tenant_setup_tokens: new Map(),
        voucher_packages: new Map(),
        voucher_pool: new Map(),
        transactions: new Map(),
        portal_subscribers: new Map(),
        portal_subscriber_sessions: new Map(),
        subscriber_entitlements: new Map(),
        radius_accounting_sessions: new Map(),
        radius_voucher_sessions: new Map(),
      };
    }
  }
  return memDb;
}

function persistDb() {
  const db = getMemDb();
  const data = {
    tenants: Object.fromEntries(db.tenants),
    tenant_requests: Object.fromEntries(db.tenant_requests),
    users: Object.fromEntries(db.users),
    sessions: Object.fromEntries(db.sessions),
    password_reset_tokens: Object.fromEntries(db.password_reset_tokens),
    tenant_setup_tokens: Object.fromEntries(db.tenant_setup_tokens),
    voucher_packages: Object.fromEntries(db.voucher_packages),
    voucher_pool: Object.fromEntries(db.voucher_pool),
    transactions: Object.fromEntries(db.transactions),
    portal_subscribers: Object.fromEntries(db.portal_subscribers),
    portal_subscriber_sessions: Object.fromEntries(db.portal_subscriber_sessions),
    subscriber_entitlements: Object.fromEntries(db.subscriber_entitlements),
    radius_accounting_sessions: Object.fromEntries(db.radius_accounting_sessions),
    radius_voucher_sessions: Object.fromEntries(db.radius_voucher_sessions),
  };

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Simple SQL parser for basic queries - handles SELECT, INSERT, UPDATE, DELETE
function parseAndExecute(sql: string, args: QueryArg[] = []): { rows: InMemoryRecord[]; changes: number } {
  const db = getMemDb();
  const trimmedSql = sql.trim();
  
  // Replace ? with actual values for parsing
  let processedSql = trimmedSql;
  let argIndex = 0;
  processedSql = processedSql.replace(/\?/g, () => {
    const val = args[argIndex++];
    if (val === null) return "NULL";
    if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
    if (typeof val === "boolean") return val ? "1" : "0";
    return String(val);
  });

  // SELECT query
  if (/^SELECT/i.test(trimmedSql)) {
    return handleSelect(processedSql, db);
  }

  // INSERT query
  if (/^INSERT/i.test(trimmedSql)) {
    return handleInsert(processedSql, db, args);
  }

  // UPDATE query
  if (/^UPDATE/i.test(trimmedSql)) {
    return handleUpdate(processedSql, db, args);
  }

  // DELETE query
  if (/^DELETE/i.test(trimmedSql)) {
    return handleDelete(processedSql, db);
  }

  return { rows: [], changes: 0 };
}

function handleSelect(sql: string, db: InMemoryDb): { rows: InMemoryRecord[]; changes: number } {
  // Extract table name
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  if (!fromMatch) return { rows: [], changes: 0 };
  
  const tableName = fromMatch[1] as keyof InMemoryDb;
  const table = db[tableName];
  if (!table) return { rows: [], changes: 0 };

  let results = Array.from(table.values());

  // Handle WHERE clause
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
  if (whereMatch) {
    const whereClause = whereMatch[1];
    results = results.filter(row => evaluateWhere(whereClause, row));
  }

  // Handle ORDER BY
  const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    const orderCol = orderMatch[1];
    const orderDir = orderMatch[2]?.toUpperCase() === "DESC" ? -1 : 1;
    results.sort((a, b) => {
      const aVal = a[orderCol];
      const bVal = b[orderCol];
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      return (aVal < bVal ? -1 : 1) * orderDir;
    });
  }

  // Handle LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    results = results.slice(0, parseInt(limitMatch[1], 10));
  }

  // Handle specific columns (vs SELECT *)
  const selectMatch = sql.match(/SELECT\s+(.+?)\s+FROM/i);
  if (selectMatch && selectMatch[1].trim() !== "*") {
    const columns = selectMatch[1].split(",").map(c => {
      const asMatch = c.trim().match(/(.+?)\s+AS\s+(\w+)/i);
      if (asMatch) return { source: asMatch[1].trim(), alias: asMatch[2].trim() };
      return { source: c.trim(), alias: c.trim() };
    });

    results = results.map(row => {
      const newRow: InMemoryRecord = {};
      for (const col of columns) {
        // Handle COUNT(*)
        if (/COUNT\s*\(\s*\*\s*\)/i.test(col.source)) {
          newRow[col.alias] = results.length;
        } else {
          newRow[col.alias] = row[col.source];
        }
      }
      return newRow;
    });

    // For COUNT(*), return single row
    if (columns.some(c => /COUNT\s*\(\s*\*\s*\)/i.test(c.source))) {
      return { rows: [{ [columns[0].alias]: Array.from(table.values()).filter(row => {
        if (whereMatch) {
          return evaluateWhere(whereMatch[1], row);
        }
        return true;
      }).length }], changes: 0 };
    }
  }

  return { rows: results, changes: 0 };
}

function handleInsert(sql: string, db: InMemoryDb, args: QueryArg[]): { rows: InMemoryRecord[]; changes: number } {
  const match = sql.match(/INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (!match) return { rows: [], changes: 0 };

  const tableName = match[1] as keyof InMemoryDb;
  const table = db[tableName];
  if (!table) return { rows: [], changes: 0 };

  const columns = match[2].split(",").map(c => c.trim());
  const valuesRaw = match[3];
  
  // Parse values, handling quoted strings
  const values: unknown[] = [];
  let currentVal = "";
  let inQuote = false;
  let quoteChar = "";
  
  for (let i = 0; i < valuesRaw.length; i++) {
    const char = valuesRaw[i];
    if (!inQuote && (char === "'" || char === '"')) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      // Check for escaped quote
      if (valuesRaw[i + 1] === quoteChar) {
        currentVal += char;
        i++;
      } else {
        inQuote = false;
        quoteChar = "";
      }
    } else if (!inQuote && char === ",") {
      values.push(parseValue(currentVal.trim()));
      currentVal = "";
    } else {
      currentVal += char;
    }
  }
  if (currentVal.trim()) {
    values.push(parseValue(currentVal.trim()));
  }

  const record: InMemoryRecord = {};
  for (let i = 0; i < columns.length; i++) {
    record[columns[i]] = values[i];
  }

  // Use id as key
  const id = record.id as string || randomUUID();
  record.id = id;
  table.set(id, record);
  persistDb();

  return { rows: [], changes: 1 };
}

function handleUpdate(sql: string, db: InMemoryDb, args: QueryArg[]): { rows: InMemoryRecord[]; changes: number } {
  const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i);
  if (!match) return { rows: [], changes: 0 };

  const tableName = match[1] as keyof InMemoryDb;
  const table = db[tableName];
  if (!table) return { rows: [], changes: 0 };

  // Parse SET clause
  const setClause = match[2];
  const whereClause = match[3];

  let changes = 0;
  for (const [id, row] of table.entries()) {
    if (evaluateWhere(whereClause, row)) {
      // Parse and apply SET values
      const setParts = setClause.split(/,(?=(?:[^']*'[^']*')*[^']*$)/);
      for (const part of setParts) {
        const eqMatch = part.match(/(\w+)\s*=\s*(.+)/);
        if (eqMatch) {
          const col = eqMatch[1].trim();
          const val = parseValue(eqMatch[2].trim());
          row[col] = val;
        }
      }
      table.set(id, row);
      changes++;
    }
  }

  if (changes > 0) persistDb();
  return { rows: [], changes };
}

function handleDelete(sql: string, db: InMemoryDb): { rows: InMemoryRecord[]; changes: number } {
  const match = sql.match(/DELETE\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
  if (!match) return { rows: [], changes: 0 };

  const tableName = match[1] as keyof InMemoryDb;
  const table = db[tableName];
  if (!table) return { rows: [], changes: 0 };

  const whereClause = match[2];
  let changes = 0;

  if (!whereClause) {
    // Delete all
    changes = table.size;
    table.clear();
  } else {
    const toDelete: string[] = [];
    for (const [id, row] of table.entries()) {
      if (evaluateWhere(whereClause, row)) {
        toDelete.push(id);
      }
    }
    for (const id of toDelete) {
      table.delete(id);
      changes++;
    }
  }

  if (changes > 0) persistDb();
  return { rows: [], changes };
}

function parseValue(val: string): unknown {
  if (val === "NULL" || val === "null") return null;
  if (val === "TRUE" || val === "true" || val === "1") return 1;
  if (val === "FALSE" || val === "false" || val === "0") return 0;
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Remove quotes
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1).replace(/''/g, "'");
  }
  return val;
}

function evaluateWhere(whereClause: string, row: InMemoryRecord): boolean {
  // Handle AND conditions
  if (/\s+AND\s+/i.test(whereClause)) {
    const parts = whereClause.split(/\s+AND\s+/i);
    return parts.every(part => evaluateWhere(part.trim(), row));
  }

  // Handle OR conditions
  if (/\s+OR\s+/i.test(whereClause)) {
    const parts = whereClause.split(/\s+OR\s+/i);
    return parts.some(part => evaluateWhere(part.trim(), row));
  }

  // Handle IS NULL
  const isNullMatch = whereClause.match(/(\w+)\s+IS\s+NULL/i);
  if (isNullMatch) {
    return row[isNullMatch[1]] === null || row[isNullMatch[1]] === undefined;
  }

  // Handle IS NOT NULL
  const isNotNullMatch = whereClause.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
  if (isNotNullMatch) {
    return row[isNotNullMatch[1]] !== null && row[isNotNullMatch[1]] !== undefined;
  }

  // Handle comparisons
  const compMatch = whereClause.match(/(\w+)\s*(=|!=|<>|<=|>=|<|>)\s*(.+)/);
  if (compMatch) {
    const col = compMatch[1];
    const op = compMatch[2];
    const val = parseValue(compMatch[3].trim());
    const rowVal = row[col];

    switch (op) {
      case "=": return rowVal === val;
      case "!=":
      case "<>": return rowVal !== val;
      case "<": return (rowVal as number) < (val as number);
      case ">": return (rowVal as number) > (val as number);
      case "<=": return (rowVal as number) <= (val as number);
      case ">=": return (rowVal as number) >= (val as number);
    }
  }

  return true;
}

function seedInitialData() {
  const now = new Date().toISOString();
  const db = getMemDb();

  const ensureUser = (params: {
    email: string;
    username: string;
    role: "admin" | "tenant";
    tenantId?: string | null;
    password: string;
    mustChangePassword?: boolean;
  }) => {
    const normalizedUsername = params.username.trim().toLowerCase();
    const normalizedEmail = params.email.trim().toLowerCase();
    
    // Check if user exists by username or email
    for (const [id, user] of db.users.entries()) {
      if (user.username === normalizedUsername || user.email === normalizedEmail) {
        return id;
      }
    }

    const id = randomUUID();
    const passwordHash = hashPassword(params.password);
    
    db.users.set(id, {
      id,
      email: normalizedEmail,
      username: normalizedUsername,
      role: params.role,
      tenant_id: params.tenantId ?? null,
      password_hash: passwordHash,
      must_change_password: params.mustChangePassword ? 1 : 0,
      created_at: now,
      updated_at: now,
    });

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
    // Check if tenant exists
    let tenantId: string | null = null;
    for (const [id, tenant] of db.tenants.entries()) {
      if (tenant.slug === t.slug) {
        tenantId = id;
        break;
      }
    }

    if (!tenantId) {
      tenantId = randomUUID();
      db.tenants.set(tenantId, {
        id: tenantId,
        slug: t.slug,
        name: t.name,
        admin_email: t.email,
        status: t.status,
        voucher_source_mode: t.voucherSourceMode,
        portal_auth_mode: t.portalAuthMode,
        paystack_secret_enc: null,
        paystack_secret_last4: null,
        admin_api_key_hash: null,
        omada_api_base_url: null,
        omada_omadac_id: null,
        omada_site_id: null,
        omada_client_id: null,
        omada_client_secret_enc: null,
        omada_hotspot_operator_username: null,
        omada_hotspot_operator_password_enc: null,
        mikrotik_base_url: null,
        mikrotik_username: null,
        mikrotik_password_enc: null,
        mikrotik_hotspot_server: null,
        mikrotik_default_profile: null,
        mikrotik_verify_tls: 1,
        radius_adapter_secret_enc: null,
        radius_adapter_secret_last4: null,
        created_at: now,
        updated_at: now,
      });

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
          db.voucher_packages.set(pkgId, {
            id: pkgId,
            tenant_id: tenantId,
            code: pkg.code,
            name: pkg.name,
            duration_minutes: pkg.duration,
            price_ngn: pkg.price,
            max_devices: null,
            bandwidth_profile: null,
            data_limit_mb: null,
            available_from: null,
            available_to: null,
            active: 1,
            description: pkg.description,
            radius_voucher_code_prefix: null,
            radius_voucher_code_length: null,
            radius_voucher_character_set: null,
            created_at: now,
            updated_at: now,
          });

          // Create some demo vouchers for CSV mode tenants
          if (t.voucherSourceMode === "import_csv") {
            for (let i = 1; i <= 5; i++) {
              const voucherId = randomUUID();
              const voucherCode = `${pkg.code}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
              db.voucher_pool.set(voucherId, {
                id: voucherId,
                tenant_id: tenantId,
                voucher_code: voucherCode,
                duration_minutes: pkg.duration,
                status: "available",
                package_id: pkgId,
                assigned_to_transaction: null,
                assigned_to_email: null,
                assigned_to_phone: null,
                created_at: now,
                assigned_at: null,
              });
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

  persistDb();
}

function ensureInitialized() {
  if (initialized) return Promise.resolve();
  if (!initPromise) {
    initPromise = Promise.resolve().then(() => {
      getMemDb(); // Initialize db from file or fresh
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
      const { rows } = parseAndExecute(sql, args);
      return rows[0] as T | undefined;
    },
    async all<T = Record<string, unknown>>(...args: QueryArg[]) {
      await ensureInitialized();
      const { rows } = parseAndExecute(sql, args);
      return rows as T[];
    },
    async run(...args: QueryArg[]) {
      await ensureInitialized();
      const { changes } = parseAndExecute(sql, args);
      return { changes };
    },
  };
}

function transaction<T>(fn: () => Promise<T> | T) {
  return async () => {
    await ensureInitialized();
    // For in-memory db, transactions just run the function
    const result = fn();
    if (result instanceof Promise) {
      return await result;
    }
    return result;
  };
}

const db: DbLike = {
  prepare(sql: string) {
    return createStatement(sql);
  },
  transaction,
  async exec(sql: string) {
    await ensureInitialized();
    // For schema creation, we don't need to do anything with in-memory db
  },
};

export function getDb() {
  return db;
}

// Export for direct table access (useful for complex queries)
export function getMemoryDb() {
  return getMemDb();
}
