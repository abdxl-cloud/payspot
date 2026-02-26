import { Pool } from "pg";

const DEFAULT_DB_URL = "postgresql://postgres:postgres@localhost:5433/payspot";

async function main() {
  const dbUrl = process.env.DATABASE_URL || DEFAULT_DB_URL;
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS radius_adapter_secret_enc TEXT;
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS radius_adapter_secret_last4 TEXT;
      ALTER TABLE voucher_packages ADD COLUMN IF NOT EXISTS max_devices INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE voucher_packages ADD COLUMN IF NOT EXISTS bandwidth_profile TEXT;
      ALTER TABLE voucher_packages ADD COLUMN IF NOT EXISTS data_limit_mb INTEGER;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subscriber_id TEXT;
      ALTER TABLE transactions ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'voucher';
    `);

    await client.query(`
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
        ends_at TEXT NOT NULL,
        max_devices INTEGER NOT NULL DEFAULT 1,
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
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_portal_subscribers_tenant_email
        ON portal_subscribers(tenant_id, email);
      CREATE INDEX IF NOT EXISTS idx_portal_subscriber_sessions_subscriber
        ON portal_subscriber_sessions(subscriber_id);
      CREATE INDEX IF NOT EXISTS idx_subscriber_entitlements_tenant_status
        ON subscriber_entitlements(tenant_id, status);
      CREATE INDEX IF NOT EXISTS idx_radius_accounting_tenant_subscriber_status
        ON radius_accounting_sessions(tenant_id, subscriber_id, status);
    `);

    const result = await client.query(`
      UPDATE transactions
      SET delivery_mode = 'account_access'
      WHERE subscriber_id IS NOT NULL
        AND delivery_mode = 'voucher'
    `);

    await client.query("COMMIT");
    console.log(`Migration complete. Backfilled ${result.rowCount ?? 0} transaction(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
