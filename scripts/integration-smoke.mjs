import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const DEFAULT_DB_URL = "postgresql://postgres:postgres@localhost:5433/payspot";

async function main() {
  const dbUrl = process.env.DATABASE_URL || DEFAULT_DB_URL;
  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tenantId = randomUUID();
    const now = new Date().toISOString();
    await client.query(
      `
      INSERT INTO tenants (id, slug, name, admin_email, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $5)
    `,
      [tenantId, `smoke-${Date.now()}`, "Smoke Tenant", "smoke@example.com", now],
    );

    const voucherPlanId = randomUUID();
    const accessPlanId = randomUUID();
    await client.query(
      `
      INSERT INTO voucher_packages (
        id, tenant_id, code, name, duration_minutes, price_ngn, max_devices, bandwidth_profile, data_limit_mb, active, created_at, updated_at
      ) VALUES
        ($1, $3, 'v1', 'Voucher Plan', 60, 100, 1, NULL, NULL, 1, $4, $4),
        ($2, $3, 'a1', 'Access Plan', 120, 200, 3, '10M/10M', 5120, 1, $4, $4)
    `,
      [voucherPlanId, accessPlanId, tenantId, now],
    );

    const voucherId = randomUUID();
    await client.query(
      `
      INSERT INTO voucher_pool (id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at)
      VALUES ($1, $2, 'SMOKE-CODE', 60, 'UNUSED', $3, $4)
    `,
      [voucherId, tenantId, voucherPlanId, now],
    );

    const subscriberId = randomUUID();
    await client.query(
      `
      INSERT INTO portal_subscribers (
        id, tenant_id, email, password_hash, status, created_at, updated_at
      ) VALUES ($1, $2, 'sub@example.com', 'scrypt$16384$8$1$aaa$bbb', 'active', $3, $3)
    `,
      [subscriberId, tenantId, now],
    );

    const txVoucherId = randomUUID();
    const txAccessId = randomUUID();
    await client.query(
      `
      INSERT INTO transactions (
        id, tenant_id, reference, email, phone, amount_ngn, package_id, payment_status, created_at, delivery_mode
      ) VALUES
        ($1, $3, 'SMOKE-V-REF', 'buyer@example.com', '08000000001', 100, $4, 'pending', $6, 'voucher'),
        ($2, $3, 'SMOKE-A-REF', 'sub@example.com', '08000000002', 200, $5, 'pending', $6, 'account_access')
    `,
      [txVoucherId, txAccessId, tenantId, voucherPlanId, accessPlanId, now],
    );

    const entitlementId = randomUUID();
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    await client.query(
      `
      INSERT INTO subscriber_entitlements (
        id, tenant_id, subscriber_id, package_id, transaction_reference, status,
        starts_at, ends_at, max_devices, bandwidth_profile, data_limit_mb, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, 'SMOKE-A-REF', 'active', $5, $6, 3, '10M/10M', 5120, $5, $5)
    `,
      [entitlementId, tenantId, subscriberId, accessPlanId, now, endsAt],
    );

    const sessionId = randomUUID();
    await client.query(
      `
      INSERT INTO radius_accounting_sessions (
        id, tenant_id, subscriber_id, entitlement_id, session_id, status,
        input_octets, output_octets, started_at, last_update_at
      ) VALUES ($1, $2, $3, $4, $5, 'active', 1024, 2048, $6, $6)
    `,
      [randomUUID(), tenantId, subscriberId, entitlementId, sessionId, now],
    );

    const checks = await client.query(
      `
      SELECT
        (SELECT COUNT(1) FROM voucher_pool WHERE tenant_id = $1 AND status = 'UNUSED') as unused_vouchers,
        (SELECT max_devices FROM voucher_packages WHERE id = $2) as access_max_devices,
        (SELECT bandwidth_profile FROM voucher_packages WHERE id = $2) as access_bw,
        (SELECT delivery_mode FROM transactions WHERE reference = 'SMOKE-A-REF') as access_delivery_mode,
        (SELECT COUNT(1) FROM radius_accounting_sessions WHERE tenant_id = $1 AND status = 'active') as active_sessions
    `,
      [tenantId, accessPlanId],
    );

    const row = checks.rows[0];
    assert.equal(Number(row.unused_vouchers), 1);
    assert.equal(Number(row.access_max_devices), 3);
    assert.equal(row.access_bw, "10M/10M");
    assert.equal(row.access_delivery_mode, "account_access");
    assert.equal(Number(row.active_sessions), 1);

    await client.query("ROLLBACK");
    console.log("Integration smoke test passed (voucher + account-access baseline).");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Integration smoke test failed:", error);
  process.exit(1);
});
