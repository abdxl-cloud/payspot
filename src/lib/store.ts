import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { generateToken, hashToken } from "@/lib/tokens";

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  admin_email: string;
  status: string;
  paystack_secret_enc: string | null;
  paystack_secret_last4: string | null;
  admin_api_key_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantRequestRow = {
  id: string;
  requested_slug: string;
  requested_name: string;
  requested_email: string;
  status: string;
  review_token_hash: string;
  created_at: string;
  reviewed_at: string | null;
  tenant_id: string | null;
};

export type TenantSetupTokenRow = {
  id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type UserRole = "admin" | "tenant";

export type UserRow = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  tenant_id: string | null;
  password_hash: string;
  must_change_password: number;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export type SessionUser = {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantStatus: string | null;
  mustChangePassword: boolean;
};

export type PackageRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  duration_minutes: number;
  price_ngn: number;
  active: number;
  description: string | null;
};

export type TransactionRow = {
  id: string;
  tenant_id: string;
  reference: string;
  email: string;
  phone: string;
  amount_ngn: number;
  voucher_code: string | null;
  package_id: string;
  authorization_url: string | null;
  payment_status: string;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getUserByUsername(username: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(normalizeUsername(username)) as UserRow | undefined;
}

export function getUserByEmail(email: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export function getUserById(userId: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
}

export function createUser(params: {
  email: string;
  username: string;
  role: UserRole;
  tenantId?: string | null;
  password: string;
  mustChangePassword?: boolean;
}) {
  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  const username = normalizeUsername(params.username);
  const email = normalizeEmail(params.email);

  const existing = db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(username, email) as UserRow | undefined;
  if (existing) return { status: "exists" as const, user: existing };

  const passwordHash = hashPassword(params.password);

  db.prepare(
    `
      INSERT INTO users (
        id, email, username, role, tenant_id, password_hash, must_change_password, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    email,
    username,
    params.role,
    params.tenantId ?? null,
    passwordHash,
    params.mustChangePassword ? 1 : 0,
    now,
    now,
  );

  return { status: "created" as const, user: getUserById(id)! };
}

export function updateUserPassword(params: { userId: string; password: string }) {
  const db = getDb();
  const now = nowIso();
  const passwordHash = hashPassword(params.password);
  db.prepare(
    `
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(passwordHash, now, params.userId);
}

export function setUserMustChangePassword(params: {
  userId: string;
  mustChangePassword: boolean;
}) {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `
      UPDATE users
      SET must_change_password = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(params.mustChangePassword ? 1 : 0, now, params.userId);
}

export function createSession(params: { userId: string; ttlDays?: number }) {
  const db = getDb();
  const now = nowIso();
  const ttlDays = params.ttlDays ?? 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const token = `vs_${generateToken(32)}`;
  const tokenHash = hashToken(token);

  db.prepare(
    `
      INSERT INTO sessions (
        id, user_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), params.userId, tokenHash, expiresAt, now);

  return { token, expiresAt };
}

export function revokeSession(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  const now = nowIso();
  db.prepare(
    `
      UPDATE sessions
      SET revoked_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
    `,
  ).run(now, tokenHash);
}

export function revokeAllSessionsForUser(userId: string) {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `,
  ).run(now, userId);
}

export function deleteSession(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function createPasswordResetToken(params: {
  userId: string;
  ttlMinutes?: number;
}) {
  const db = getDb();
  const now = nowIso();
  const ttlMinutes = params.ttlMinutes ?? 60;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const token = `vs_pr_${generateToken(32)}`;
  const tokenHash = hashToken(token);

  const run = db.transaction(() => {
    db.prepare(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
    ).run(params.userId);

    db.prepare(
      `
        INSERT INTO password_reset_tokens (
          id, user_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(randomUUID(), params.userId, tokenHash, expiresAt, now);
  });

  run();
  return { token, expiresAt };
}

export function consumePasswordResetToken(token: string) {
  const db = getDb();
  const tokenHash = hashToken(token);
  const now = nowIso();

  const run = db.transaction(() => {
    const row = db
      .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ?")
      .get(tokenHash) as
      | {
          id: string;
          user_id: string;
          expires_at: string;
          used_at: string | null;
        }
      | undefined;

    if (!row) return { status: "invalid" as const };
    if (row.used_at) return { status: "used" as const };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { status: "expired" as const };
    }

    db.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
    ).run(now, row.id);

    return { status: "ok" as const, userId: row.user_id };
  });

  return run();
}

export function getSessionUser(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  const row = db
    .prepare(
      `
      SELECT
        u.id as id,
        u.email as email,
        u.username as username,
        u.role as role,
        u.tenant_id as tenant_id,
        u.must_change_password as must_change_password,
        s.expires_at as expires_at,
        s.revoked_at as revoked_at,
        t.slug as tenant_slug,
        t.status as tenant_status
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN tenants t ON t.id = u.tenant_id
      WHERE s.token_hash = ?
    `,
    )
    .get(tokenHash) as
    | {
        id: string;
        email: string;
        username: string;
        role: UserRole;
        tenant_id: string | null;
        must_change_password: number;
        expires_at: string;
        revoked_at: string | null;
        tenant_slug: string | null;
        tenant_status: string | null;
      }
    | undefined;

  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(sessionToken);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    tenantId: row.tenant_id,
    tenantSlug: row.tenant_slug,
    tenantStatus: row.tenant_status,
    mustChangePassword: row.must_change_password === 1,
  } satisfies SessionUser;
}

export function getTenantBySlug(slug: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants WHERE slug = ?")
    .get(slug) as TenantRow | undefined;
}

export function getTenantById(tenantId: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(tenantId) as TenantRow | undefined;
}

export function getTenantPrimaryUser(tenantId: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM users WHERE tenant_id = ? AND role = 'tenant' ORDER BY created_at ASC LIMIT 1",
    )
    .get(tenantId) as UserRow | undefined;
}

export function listTenants() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM tenants ORDER BY created_at DESC")
    .all() as TenantRow[];
}

export function createTenant(params: {
  slug: string;
  name: string;
  adminEmail: string;
  status?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const slug = params.slug.trim().toLowerCase();

  const existing = db
    .prepare("SELECT * FROM tenants WHERE slug = ?")
    .get(slug) as TenantRow | undefined;
  if (existing) return { status: "exists" as const, tenant: existing };

  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO tenants (
        id, slug, name, admin_email, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    slug,
    params.name.trim(),
    params.adminEmail.trim(),
    params.status ?? "pending_setup",
    now,
    now,
  );

  return { status: "created" as const, tenant: getTenantById(id)! };
}

export function updateTenant(params: {
  tenantId: string;
  slug?: string;
  name?: string;
  adminEmail?: string;
  status?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const existing = getTenantById(params.tenantId);
  if (!existing) return { status: "missing" as const };

  const slug = params.slug ? params.slug.trim().toLowerCase() : existing.slug;
  const name = params.name ? params.name.trim() : existing.name;
  const adminEmail = params.adminEmail ? params.adminEmail.trim() : existing.admin_email;
  const status = params.status ?? existing.status;

  const nextUserEmail = params.adminEmail ? normalizeEmail(params.adminEmail) : null;

  const run = db.transaction(() => {
    if (nextUserEmail) {
      const conflict = db
        .prepare(
          `
            SELECT 1
            FROM users
            WHERE email = ?
              AND NOT (role = 'tenant' AND tenant_id = ?)
          `,
        )
        .get(nextUserEmail, params.tenantId);
      if (conflict) {
        return { status: "email_taken" as const };
      }
    }

    db.prepare(
      `
        UPDATE tenants
        SET slug = ?, name = ?, admin_email = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).run(slug, name, adminEmail, status, now, params.tenantId);

    if (nextUserEmail) {
      db.prepare(
        `
          UPDATE users
          SET email = ?, updated_at = ?
          WHERE role = 'tenant' AND tenant_id = ?
        `,
      ).run(nextUserEmail, now, params.tenantId);
    }

    return { status: "ok" as const, tenant: getTenantById(params.tenantId)! };
  });

  return run();
}

export function deleteTenant(tenantId: string) {
  const db = getDb();

  const existing = getTenantById(tenantId);
  if (!existing) return { status: "missing" as const };

  const run = db.transaction(() => {
    // Delete sessions for tenant users.
    const userIds = db
      .prepare("SELECT id FROM users WHERE tenant_id = ?")
      .all(tenantId) as Array<{ id: string }>;

    for (const user of userIds) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    }

    db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM voucher_pool WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM transactions WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM voucher_packages WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM tenant_requests WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM tenant_setup_tokens WHERE tenant_id = ?").run(tenantId);
    db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);
  });

  run();
  return { status: "deleted" as const };
}

export function getTenantForReference(reference: string) {
  const db = getDb();
  return db
    .prepare(
      `
      SELECT t.*, tx.reference as reference
      FROM transactions tx
      JOIN tenants t ON t.id = tx.tenant_id
      WHERE tx.reference = ?
    `,
    )
    .get(reference) as (TenantRow & { reference: string }) | undefined;
}

export function isTenantSlugAvailable(slug: string) {
  const db = getDb();
  const existingTenant = db
    .prepare("SELECT 1 FROM tenants WHERE slug = ?")
    .get(slug);
  if (existingTenant) return false;

  const pendingRequest = db
    .prepare(
      "SELECT 1 FROM tenant_requests WHERE requested_slug = ? AND status = 'pending'",
    )
    .get(slug);
  return !pendingRequest;
}

export function createTenantRequest(params: {
  requestedSlug: string;
  requestedName: string;
  requestedEmail: string;
}) {
  const db = getDb();
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const id = randomUUID();
  const now = nowIso();

  db.prepare(
    `
      INSERT INTO tenant_requests (
        id, requested_slug, requested_name, requested_email,
        status, review_token_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    params.requestedSlug,
    params.requestedName,
    params.requestedEmail,
    "pending",
    tokenHash,
    now,
  );

  return { id, reviewToken: token };
}

export function denyTenantRequest(reviewToken: string) {
  const db = getDb();
  const tokenHash = hashToken(reviewToken);
  const now = nowIso();

  const changes = db
    .prepare(
      `
      UPDATE tenant_requests
      SET status = 'denied', reviewed_at = ?
      WHERE review_token_hash = ? AND status = 'pending'
    `,
    )
    .run(now, tokenHash).changes;

  if (changes === 0) {
    const existing = db
      .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
      .get(tokenHash) as TenantRequestRow | undefined;
    return { status: "missing_or_reviewed" as const, request: existing };
  }

  const request = db
    .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
    .get(tokenHash) as TenantRequestRow | undefined;

  return { status: "denied" as const, request };
}

export function approveTenantRequest(reviewToken: string) {
  const db = getDb();
  const tokenHash = hashToken(reviewToken);

  const run = db.transaction(() => {
    const request = db
      .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
      .get(tokenHash) as TenantRequestRow | undefined;

    if (!request) {
      return { status: "missing" as const };
    }
    if (request.status !== "pending") {
      return { status: "already_reviewed" as const, request };
    }

    const tenantExists = db
      .prepare("SELECT 1 FROM tenants WHERE slug = ?")
      .get(request.requested_slug);
    if (tenantExists) {
      db.prepare(
        `
          UPDATE tenant_requests
          SET status = 'denied', reviewed_at = ?
          WHERE id = ?
        `,
      ).run(nowIso(), request.id);
      return { status: "slug_taken" as const };
    }

    const normalizedUsername = normalizeUsername(request.requested_slug);
    const normalizedEmail = normalizeEmail(request.requested_email);

    const userConflict = db
      .prepare("SELECT 1 FROM users WHERE username = ? OR email = ?")
      .get(normalizedUsername, normalizedEmail);
    if (userConflict) {
      db.prepare(
        `
          UPDATE tenant_requests
          SET status = 'denied', reviewed_at = ?
          WHERE id = ?
        `,
      ).run(nowIso(), request.id);
      return { status: "user_conflict" as const };
    }

    const tenantId = randomUUID();
    const now = nowIso();
    db.prepare(
      `
        INSERT INTO tenants (
          id, slug, name, admin_email, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      tenantId,
      request.requested_slug,
      request.requested_name,
      request.requested_email,
      "pending_setup",
      now,
      now,
    );

    seedDefaultPackagesForTenant(db, tenantId);

    const temporaryPassword = `Temp-${generateToken(9)}`;
    const created = createUser({
      email: normalizedEmail,
      username: normalizedUsername,
      role: "tenant",
      tenantId,
      password: temporaryPassword,
      mustChangePassword: true,
    });

    if (created.status !== "created") {
      return { status: "user_conflict" as const };
    }

    db.prepare(
      `
        UPDATE tenant_requests
        SET status = 'approved', reviewed_at = ?, tenant_id = ?
        WHERE id = ?
      `,
    ).run(now, tenantId, request.id);

    const tenant = db
      .prepare("SELECT * FROM tenants WHERE id = ?")
      .get(tenantId) as TenantRow;

    return {
      status: "approved" as const,
      tenant,
      email: created.user.email,
      temporaryPassword,
      request,
    };
  });

  return run();
}

export function requireTenantPaystackSecretKey(tenantId: string) {
  const tenant = getTenantById(tenantId);
  if (!tenant) throw new Error("Tenant not found");
  if (!tenant.paystack_secret_enc) {
    throw new Error("Tenant Paystack key not configured");
  }
  return decryptSecret(tenant.paystack_secret_enc);
}

export function setTenantPaystackSecret(params: {
  tenantId: string;
  paystackSecretKey: string;
}) {
  const db = getDb();
  const tenant = getTenantById(params.tenantId);
  if (!tenant) return { status: "missing" as const };

  const enc = encryptSecret(params.paystackSecretKey.trim());
  const last4 = params.paystackSecretKey.trim().slice(-4);
  const now = nowIso();

  db.prepare(
    `
      UPDATE tenants
      SET paystack_secret_enc = ?, paystack_secret_last4 = ?, status = 'active', updated_at = ?
      WHERE id = ?
    `,
  ).run(enc, last4, now, params.tenantId);

  return { status: "ok" as const, tenant: getTenantById(params.tenantId)! };
}

function seedDefaultPackagesForTenant(db: ReturnType<typeof getDb>, tenantId: string) {
  const count = db
    .prepare("SELECT COUNT(1) as count FROM voucher_packages WHERE tenant_id = ?")
    .get(tenantId) as { count: number };
  if (count.count > 0) return;

  const now = nowIso();
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

export function seedDefaultPackagesForTenantId(tenantId: string) {
  const db = getDb();
  seedDefaultPackagesForTenant(db, tenantId);
}

export function getPackagesWithAvailability(tenantId: string) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT p.*, (
        SELECT COUNT(1) FROM voucher_pool v
        WHERE v.tenant_id = p.tenant_id
          AND v.package_id = p.id
          AND v.status = 'UNUSED'
      ) as available_count
      FROM voucher_packages p
      WHERE p.tenant_id = ? AND p.active = 1
      ORDER BY p.duration_minutes ASC
    `,
    )
    .all(tenantId);
  return rows as Array<PackageRow & { available_count: number }>;
}

export function getPackageByCode(tenantId: string, code: string) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM voucher_packages WHERE tenant_id = ? AND code = ? AND active = 1",
    )
    .get(tenantId, code) as PackageRow | undefined;
}

export function getPackageById(tenantId: string, id: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM voucher_packages WHERE tenant_id = ? AND id = ?")
    .get(tenantId, id) as PackageRow | undefined;
}

export function getAvailableCount(tenantId: string, packageId: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT COUNT(1) as count
      FROM voucher_pool
      WHERE tenant_id = ? AND package_id = ? AND status = 'UNUSED'
    `,
    )
    .get(tenantId, packageId) as { count: number };
  return row?.count ?? 0;
}

export function createTransaction(params: {
  tenantId: string;
  reference: string;
  email: string;
  phone: string;
  amountNgn: number;
  packageId: string;
  authorizationUrl: string | null;
  expiresAt: string | null;
}) {
  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  db.prepare(
    `
      INSERT INTO transactions (
        id, tenant_id, reference, email, phone, amount_ngn, package_id, authorization_url,
        payment_status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    params.tenantId,
    params.reference,
    params.email,
    params.phone,
    params.amountNgn,
    params.packageId,
    params.authorizationUrl,
    "pending",
    now,
    params.expiresAt,
  );
  return id;
}

export function getTransaction(tenantId: string, reference: string) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM transactions WHERE tenant_id = ? AND reference = ?")
    .get(tenantId, reference) as TransactionRow | undefined;
}

export function getTransactionByReferenceEmail(
  tenantId: string,
  reference: string,
  email: string,
) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM transactions WHERE tenant_id = ? AND reference = ? AND email = ?",
    )
    .get(tenantId, reference, email) as TransactionRow | undefined;
}

export function updateTransactionAuthUrl(params: {
  tenantId: string;
  reference: string;
  authorizationUrl: string;
  expiresAt: string | null;
}) {
  const db = getDb();
  return db
    .prepare(
      `
      UPDATE transactions
      SET authorization_url = ?, expires_at = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(
      params.authorizationUrl,
      params.expiresAt,
      params.tenantId,
      params.reference,
    ).changes;
}

export function markTransactionProcessing(params: {
  tenantId: string;
  reference: string;
}) {
  const db = getDb();
  return db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'processing'
      WHERE tenant_id = ? AND reference = ? AND payment_status = 'pending'
    `,
    )
    .run(params.tenantId, params.reference).changes;
}

export function markTransactionFailed(params: {
  tenantId: string;
  reference: string;
  status: string;
}) {
  const db = getDb();
  return db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(params.status, params.tenantId, params.reference).changes;
}

export function completeTransaction(params: {
  tenantId: string;
  reference: string;
  voucherCode: string;
  paidAt: string;
}) {
  const db = getDb();
  return db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'success', voucher_code = ?, paid_at = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(params.voucherCode, params.paidAt, params.tenantId, params.reference)
    .changes;
}

export function assignVoucher(params: {
  tenantId: string;
  reference: string;
  email: string;
  phone: string;
  packageId: string;
}) {
  const db = getDb();
  // In multi-instance deployments, two workers can race to assign the same
  // voucher. We retry a few times to reduce false "no voucher" outcomes.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = nowIso();
    const voucher = db
      .prepare(
        `
        SELECT * FROM voucher_pool
        WHERE tenant_id = ? AND package_id = ? AND status = 'UNUSED'
        ORDER BY created_at ASC
        LIMIT 1
      `,
      )
      .get(params.tenantId, params.packageId) as
      | { id: string; voucher_code: string }
      | undefined;

    if (!voucher) return null;

    const updated = db
      .prepare(
        `
        UPDATE voucher_pool
        SET status = 'ASSIGNED',
            assigned_to_transaction = ?,
            assigned_to_email = ?,
            assigned_to_phone = ?,
            assigned_at = ?
        WHERE tenant_id = ? AND id = ? AND status = 'UNUSED'
      `,
      )
      .run(
        params.reference,
        params.email,
        params.phone,
        now,
        params.tenantId,
        voucher.id,
      );

    if (updated.changes === 1) {
      return { voucherCode: voucher.voucher_code, assignedAt: now };
    }
  }

  return null;
}

export function transactionAssignVoucher(params: {
  tenantId: string;
  reference: string;
  email: string;
  phone: string;
  packageId: string;
}) {
  const db = getDb();
  const run = db.transaction(() => {
    const processing = markTransactionProcessing({
      tenantId: params.tenantId,
      reference: params.reference,
    });
    if (processing === 0) {
      const existing = getTransaction(params.tenantId, params.reference);
      if (existing?.payment_status === "success" && existing.voucher_code) {
        return {
          status: "already",
          voucherCode: existing.voucher_code,
        };
      }
      return { status: "skipped" };
    }

    const voucher = assignVoucher(params);
    if (!voucher) {
      markTransactionFailed({
        tenantId: params.tenantId,
        reference: params.reference,
        status: "voucher_unavailable",
      });
      return { status: "no_voucher" };
    }

    completeTransaction({
      tenantId: params.tenantId,
      reference: params.reference,
      voucherCode: voucher.voucherCode,
      paidAt: voucher.assignedAt,
    });

    return { status: "assigned", voucherCode: voucher.voucherCode };
  });

  return run();
}

export function getStats(tenantId: string) {
  const db = getDb();
  const packages = db
    .prepare(
      "SELECT * FROM voucher_packages WHERE tenant_id = ? ORDER BY duration_minutes ASC",
    )
    .all(tenantId) as PackageRow[];

  return packages.map((pkg) => {
    const totals = db
      .prepare(
        `
        SELECT
          COUNT(1) as total,
          SUM(CASE WHEN status = 'UNUSED' THEN 1 ELSE 0 END) as unused,
          SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) as assigned
        FROM voucher_pool
        WHERE tenant_id = ? AND package_id = ?
      `,
      )
      .get(tenantId, pkg.id) as {
      total: number;
      unused: number;
      assigned: number;
    };

    return {
      code: pkg.code,
      name: pkg.name,
      total: totals.total ?? 0,
      unused: totals.unused ?? 0,
      assigned: totals.assigned ?? 0,
      percentageRemaining:
        totals.total > 0
          ? Math.round(((totals.unused ?? 0) / totals.total) * 10000) / 100
          : 0,
    };
  });
}

export function getTenantAdminStats(tenantId: string) {
  const db = getDb();
  const voucherPool = getStats(tenantId);
  const tx = db
    .prepare(
      `
      SELECT
        COUNT(1) as total,
        SUM(CASE WHEN payment_status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN payment_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN payment_status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN payment_status NOT IN ('pending', 'processing', 'success') THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN payment_status = 'success' THEN amount_ngn ELSE 0 END) as revenue_ngn
      FROM transactions
      WHERE tenant_id = ?
    `,
    )
    .get(tenantId) as {
    total: number;
    success: number;
    pending: number;
    processing: number;
    failed: number;
    revenue_ngn: number;
  };

  return {
    voucherPool,
    transactions: {
      total: tx.total ?? 0,
      success: tx.success ?? 0,
      pending: tx.pending ?? 0,
      processing: tx.processing ?? 0,
      failed: tx.failed ?? 0,
      revenueNgn: tx.revenue_ngn ?? 0,
    },
  };
}
