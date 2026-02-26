import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { provisionOmadaVouchers } from "@/lib/omada";
import { isPaystackSecretKey } from "@/lib/paystack-key";
import { hashPassword, verifyPassword } from "@/lib/password";
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
  voucher_source_mode: string | null;
  portal_auth_mode: string | null;
  omada_api_base_url: string | null;
  omada_omadac_id: string | null;
  omada_site_id: string | null;
  omada_client_id: string | null;
  omada_client_secret_enc: string | null;
  omada_hotspot_operator_username: string | null;
  omada_hotspot_operator_password_enc: string | null;
  radius_adapter_secret_enc: string | null;
  radius_adapter_secret_last4: string | null;
  created_at: string;
  updated_at: string;
};

export type VoucherSourceMode = "import_csv" | "omada_openapi";
export type PortalAuthMode =
  | "omada_builtin"
  | "external_portal_api"
  | "external_radius_portal";

export type TenantArchitecture = {
  voucherSourceMode: VoucherSourceMode;
  portalAuthMode: PortalAuthMode;
  omada: {
    apiBaseUrl: string;
    omadacId: string;
    siteId: string;
    clientId: string;
    hasClientSecret: boolean;
    hotspotOperatorUsername: string;
    hasHotspotOperatorPassword: boolean;
  };
  radius: {
    hasAdapterSecret: boolean;
    adapterSecretLast4: string;
  };
};

export type TenantOmadaOpenApiConfig = {
  apiBaseUrl: string;
  omadacId: string;
  siteId: string;
  clientId: string;
  clientSecret: string;
};

export type TenantOmadaOpenApiCredentials = {
  apiBaseUrl: string;
  omadacId: string;
  clientId: string;
  clientSecret: string;
};

type TenantOmadaOpenApiConfigOverrides = Partial<{
  apiBaseUrl: string;
  omadacId: string;
  siteId: string;
  clientId: string;
  clientSecret: string;
}>;

type TenantOmadaOpenApiCredentialsOverrides = Partial<{
  apiBaseUrl: string;
  omadacId: string;
  clientId: string;
  clientSecret: string;
}>;

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
  max_devices: number;
  bandwidth_profile: string | null;
  data_limit_mb: number | null;
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
  subscriber_id: string | null;
  delivery_mode: "voucher" | "account_access";
  authorization_url: string | null;
  payment_status: string;
  created_at: string;
  expires_at: string | null;
  paid_at: string | null;
};

export type PortalSubscriberRow = {
  id: string;
  tenant_id: string;
  email: string;
  phone: string | null;
  full_name: string | null;
  password_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type PortalSubscriberSessionRow = {
  id: string;
  subscriber_id: string;
  token_hash: string;
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
};

export type SubscriberEntitlementRow = {
  id: string;
  tenant_id: string;
  subscriber_id: string;
  package_id: string;
  transaction_reference: string;
  status: string;
  starts_at: string;
  ends_at: string;
  max_devices: number;
  bandwidth_profile: string | null;
  data_limit_mb: number | null;
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function generateRadiusAdapterSecret() {
  return randomBytes(32).toString("hex");
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeVoucherSourceMode(
  value: string | null | undefined,
): VoucherSourceMode {
  if (value === "omada_openapi") return "omada_openapi";
  return "import_csv";
}

function normalizePortalAuthMode(value: string | null | undefined): PortalAuthMode {
  if (value === "external_portal_api") return "external_portal_api";
  if (value === "external_radius_portal") return "external_radius_portal";
  return "omada_builtin";
}

function normalizePhoneForLookup(phone: string) {
  return phone.replace(/\D/g, "");
}

function parseIsoTime(value: string) {
  return new Date(value).getTime();
}

export async function getUserByUsername(username: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(normalizeUsername(username)) as UserRow | undefined;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export async function getUserById(userId: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId) as UserRow | undefined;
}

export async function createUser(params: {
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

  const existing = await db
    .prepare("SELECT * FROM users WHERE username = ? OR email = ?")
    .get(username, email) as UserRow | undefined;
  if (existing) return { status: "exists" as const, user: existing };

  const passwordHash = hashPassword(params.password);

  await db.prepare(
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

  return { status: "created" as const, user: (await getUserById(id))! };
}

export async function updateUserPassword(params: { userId: string; password: string }) {
  const db = getDb();
  const now = nowIso();
  const passwordHash = hashPassword(params.password);
  await db.prepare(
    `
      UPDATE users
      SET password_hash = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(passwordHash, now, params.userId);
}

export async function setUserMustChangePassword(params: {
  userId: string;
  mustChangePassword: boolean;
}) {
  const db = getDb();
  const now = nowIso();
  await db.prepare(
    `
      UPDATE users
      SET must_change_password = ?, updated_at = ?
      WHERE id = ?
    `,
  ).run(params.mustChangePassword ? 1 : 0, now, params.userId);
}

export async function createSession(params: { userId: string; ttlDays?: number }) {
  const db = getDb();
  const now = nowIso();
  const ttlDays = params.ttlDays ?? 30;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const token = `vs_${generateToken(32)}`;
  const tokenHash = hashToken(token);

  await db.prepare(
    `
      INSERT INTO sessions (
        id, user_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), params.userId, tokenHash, expiresAt, now);

  return { token, expiresAt };
}

export async function revokeSession(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  const now = nowIso();
  await db.prepare(
    `
      UPDATE sessions
      SET revoked_at = ?
      WHERE token_hash = ? AND revoked_at IS NULL
    `,
  ).run(now, tokenHash);
}

export async function revokeAllSessionsForUser(userId: string) {
  const db = getDb();
  const now = nowIso();
  await db.prepare(
    `
      UPDATE sessions
      SET revoked_at = ?
      WHERE user_id = ? AND revoked_at IS NULL
    `,
  ).run(now, userId);
}

export async function deleteSession(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export async function createPasswordResetToken(params: {
  userId: string;
  ttlMinutes?: number;
}) {
  const db = getDb();
  const now = nowIso();
  const ttlMinutes = params.ttlMinutes ?? 60;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  const token = `vs_pr_${generateToken(32)}`;
  const tokenHash = hashToken(token);

  const run = db.transaction(async () => {
    await db.prepare(
      "DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL",
    ).run(params.userId);

    await db.prepare(
      `
        INSERT INTO password_reset_tokens (
          id, user_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
    ).run(randomUUID(), params.userId, tokenHash, expiresAt, now);
  });

  await run();
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token: string) {
  const db = getDb();
  const tokenHash = hashToken(token);
  const now = nowIso();

  const run = db.transaction(async () => {
    const row = await db
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

    await db.prepare(
      "UPDATE password_reset_tokens SET used_at = ? WHERE id = ?",
    ).run(now, row.id);

    return { status: "ok" as const, userId: row.user_id };
  });

  return run();
}

export async function getSessionUser(sessionToken: string) {
  const db = getDb();
  const tokenHash = hashToken(sessionToken);
  const row = await db
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
    await deleteSession(sessionToken);
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

export async function getPortalSubscriberById(subscriberId: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM portal_subscribers WHERE id = ?")
    .get(subscriberId) as PortalSubscriberRow | undefined;
}

export async function getPortalSubscriberByEmail(tenantId: string, email: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM portal_subscribers WHERE tenant_id = ? AND email = ?")
    .get(tenantId, normalizeEmail(email)) as PortalSubscriberRow | undefined;
}

export async function createPortalSubscriber(params: {
  tenantId: string;
  email: string;
  password: string;
  phone?: string | null;
  fullName?: string | null;
}) {
  const db = getDb();
  const now = nowIso();
  const email = normalizeEmail(params.email);
  const existing = await getPortalSubscriberByEmail(params.tenantId, email);
  if (existing) return { status: "exists" as const, subscriber: existing };

  const id = randomUUID();
  await db.prepare(
    `
      INSERT INTO portal_subscribers (
        id, tenant_id, email, phone, full_name, password_hash, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `,
  ).run(
    id,
    params.tenantId,
    email,
    params.phone?.trim() || null,
    params.fullName?.trim() || null,
    hashPassword(params.password),
    now,
    now,
  );

  return { status: "created" as const, subscriber: (await getPortalSubscriberById(id))! };
}

export async function authenticatePortalSubscriber(params: {
  tenantId: string;
  email: string;
  password: string;
}) {
  const subscriber = await getPortalSubscriberByEmail(params.tenantId, params.email);
  if (!subscriber) return null;
  if (subscriber.status !== "active") return null;
  if (!verifyPassword(params.password, subscriber.password_hash)) return null;
  return subscriber;
}

export async function createPortalSubscriberSession(params: {
  subscriberId: string;
  ttlDays?: number;
}) {
  const db = getDb();
  const now = new Date();
  const ttlDays = params.ttlDays ?? 30;
  const expires = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);
  const token = `ps_${generateToken(32)}`;
  await db.prepare(
    `
      INSERT INTO portal_subscriber_sessions (
        id, subscriber_id, token_hash, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), params.subscriberId, hashToken(token), expires.toISOString(), now.toISOString());
  return token;
}

export async function getPortalSubscriberSession(token: string) {
  const db = getDb();
  const row = await db
    .prepare(
      `
      SELECT
        s.id as id,
        s.subscriber_id as subscriber_id,
        s.expires_at as expires_at,
        s.revoked_at as revoked_at,
        p.tenant_id as tenant_id,
        p.email as email,
        p.phone as phone,
        p.full_name as full_name,
        p.status as status
      FROM portal_subscriber_sessions s
      JOIN portal_subscribers p ON p.id = s.subscriber_id
      WHERE s.token_hash = ?
    `,
    )
    .get(hashToken(token)) as
    | (PortalSubscriberSessionRow & {
        tenant_id: string;
        email: string;
        phone: string | null;
        full_name: string | null;
        status: string;
      })
    | undefined;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.status !== "active") return null;
  if (parseIsoTime(row.expires_at) < Date.now()) {
    await db
      .prepare("UPDATE portal_subscriber_sessions SET revoked_at = ? WHERE id = ?")
      .run(nowIso(), row.id);
    return null;
  }
  return row;
}

export async function listActiveEntitlementsForSubscriber(params: {
  tenantId: string;
  subscriberId: string;
}) {
  const db = getDb();
  return await db
    .prepare(
      `
      SELECT
        e.*,
        p.code as package_code,
        p.name as package_name,
        p.duration_minutes as package_duration_minutes,
        p.price_ngn as package_price_ngn
      FROM subscriber_entitlements e
      JOIN voucher_packages p ON p.id = e.package_id
      WHERE e.tenant_id = ?
        AND e.subscriber_id = ?
        AND e.status = 'active'
        AND e.ends_at > ?
      ORDER BY e.ends_at DESC
    `,
    )
    .all(params.tenantId, params.subscriberId, nowIso()) as Array<
    SubscriberEntitlementRow & {
      package_code: string;
      package_name: string;
      package_duration_minutes: number;
      package_price_ngn: number;
    }
  >;
}

export async function resolveTenantRadiusAdapterSecret(tenantId: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant?.radius_adapter_secret_enc) return null;
  return decryptSecret(tenant.radius_adapter_secret_enc);
}

export async function verifyTenantRadiusAdapterSecret(params: {
  tenantId: string;
  adapterSecret: string;
}) {
  const secret = await resolveTenantRadiusAdapterSecret(params.tenantId);
  if (!secret) return false;
  return secret === params.adapterSecret;
}

export async function authorizeSubscriberRadiusAccess(params: {
  tenantId: string;
  username: string;
  password: string;
}) {
  const subscriber = await authenticatePortalSubscriber({
    tenantId: params.tenantId,
    email: params.username,
    password: params.password,
  });
  if (!subscriber) return { status: "invalid_credentials" as const };

  const db = getDb();
  const now = nowIso();
  const entitlement = await db
    .prepare(
      `
      SELECT *
      FROM subscriber_entitlements
      WHERE tenant_id = ?
        AND subscriber_id = ?
        AND status = 'active'
        AND starts_at <= ?
        AND ends_at > ?
      ORDER BY ends_at DESC
      LIMIT 1
    `,
    )
    .get(params.tenantId, subscriber.id, now, now) as SubscriberEntitlementRow | undefined;

  if (!entitlement) return { status: "no_active_plan" as const };

  const activeSessionCountRow = await db
    .prepare(
      `
      SELECT COUNT(1) as count
      FROM radius_accounting_sessions
      WHERE tenant_id = ? AND subscriber_id = ? AND status = 'active'
    `,
    )
    .get(params.tenantId, subscriber.id) as { count: number } | undefined;
  const activeSessionCount = Number(activeSessionCountRow?.count ?? 0);

  if (activeSessionCount >= Math.max(1, entitlement.max_devices)) {
    return { status: "session_limit_reached" as const };
  }

  if (entitlement.data_limit_mb && entitlement.data_limit_mb > 0) {
    const usageRow = await db
      .prepare(
        `
        SELECT COALESCE(SUM(input_octets + output_octets), 0) as total_bytes
        FROM radius_accounting_sessions
        WHERE tenant_id = ? AND entitlement_id = ?
      `,
      )
      .get(params.tenantId, entitlement.id) as { total_bytes: number } | undefined;
    const usedBytes = Number(usageRow?.total_bytes ?? 0);
    const allowedBytes = entitlement.data_limit_mb * 1024 * 1024;
    if (usedBytes >= allowedBytes) {
      return { status: "data_limit_reached" as const };
    }
  }

  return {
    status: "ok" as const,
    subscriber,
    entitlement,
    activeSessionCount,
  };
}

export async function recordRadiusAccountingEvent(params: {
  tenantId: string;
  subscriberId: string;
  entitlementId: string;
  sessionId: string;
  event: "start" | "interim" | "stop";
  inputOctets?: number;
  outputOctets?: number;
  callingStationId?: string | null;
  calledStationId?: string | null;
  nasIpAddress?: string | null;
}) {
  const db = getDb();
  const now = nowIso();
  const run = db.transaction(async () => {
    const existing = await db
      .prepare(
        `
        SELECT *
        FROM radius_accounting_sessions
        WHERE tenant_id = ? AND session_id = ?
      `,
      )
      .get(params.tenantId, params.sessionId) as
      | {
          id: string;
          input_octets: number;
          output_octets: number;
        }
      | undefined;

    if (!existing) {
      const initialStatus = params.event === "stop" ? "stopped" : "active";
      await db.prepare(
        `
        INSERT INTO radius_accounting_sessions (
          id, tenant_id, subscriber_id, entitlement_id, session_id,
          calling_station_id, called_station_id, nas_ip_address, status,
          input_octets, output_octets, started_at, last_update_at, stopped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        randomUUID(),
        params.tenantId,
        params.subscriberId,
        params.entitlementId,
        params.sessionId,
        params.callingStationId ?? null,
        params.calledStationId ?? null,
        params.nasIpAddress ?? null,
        initialStatus,
        Math.max(0, Math.floor(params.inputOctets ?? 0)),
        Math.max(0, Math.floor(params.outputOctets ?? 0)),
        now,
        now,
        params.event === "stop" ? now : null,
      );
      return;
    }

    await db.prepare(
      `
      UPDATE radius_accounting_sessions
      SET input_octets = ?,
          output_octets = ?,
          status = ?,
          last_update_at = ?,
          stopped_at = ?
      WHERE id = ?
    `,
    ).run(
      Math.max(0, Math.floor(params.inputOctets ?? existing.input_octets ?? 0)),
      Math.max(0, Math.floor(params.outputOctets ?? existing.output_octets ?? 0)),
      params.event === "stop" ? "stopped" : "active",
      now,
      params.event === "stop" ? now : null,
      existing.id,
    );
  });

  await run();
}

export async function getTenantBySlug(slug: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM tenants WHERE slug = ?")
    .get(slug) as TenantRow | undefined;
}

export async function getTenantById(tenantId: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM tenants WHERE id = ?")
    .get(tenantId) as TenantRow | undefined;
}

export async function getTenantPrimaryUser(tenantId: string) {
  const db = getDb();
  return await db
    .prepare(
      "SELECT * FROM users WHERE tenant_id = ? AND role = 'tenant' ORDER BY created_at ASC LIMIT 1",
    )
    .get(tenantId) as UserRow | undefined;
}

export async function listTenants() {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM tenants ORDER BY created_at DESC")
    .all() as TenantRow[];
}

export async function createTenant(params: {
  slug: string;
  name: string;
  adminEmail: string;
  status?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const slug = params.slug.trim().toLowerCase();

  const existing = await db
    .prepare("SELECT * FROM tenants WHERE slug = ?")
    .get(slug) as TenantRow | undefined;
  if (existing) return { status: "exists" as const, tenant: existing };

  const id = randomUUID();
  await db.prepare(
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

  return { status: "created" as const, tenant: (await getTenantById(id))! };
}

export async function updateTenant(params: {
  tenantId: string;
  slug?: string;
  name?: string;
  adminEmail?: string;
  status?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const existing = await getTenantById(params.tenantId);
  if (!existing) return { status: "missing" as const };

  const slug = params.slug ? params.slug.trim().toLowerCase() : existing.slug;
  const name = params.name ? params.name.trim() : existing.name;
  const adminEmail = params.adminEmail ? params.adminEmail.trim() : existing.admin_email;
  const status = params.status ?? existing.status;

  const nextUserEmail = params.adminEmail ? normalizeEmail(params.adminEmail) : null;
  const slugChanged = slug !== existing.slug;

  const run = db.transaction(async () => {
    if (slugChanged) {
      const slugConflict = await db
        .prepare(
          `
            SELECT 1
            FROM tenants
            WHERE slug = ? AND id != ?
          `,
        )
        .get(slug, params.tenantId);
      if (slugConflict) {
        return { status: "slug_taken" as const };
      }
    }

    if (nextUserEmail) {
      const conflict = await db
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

    await db.prepare(
      `
        UPDATE tenants
        SET slug = ?, name = ?, admin_email = ?, status = ?, updated_at = ?
        WHERE id = ?
      `,
    ).run(slug, name, adminEmail, status, now, params.tenantId);

    if (nextUserEmail) {
      await db.prepare(
        `
          UPDATE users
          SET email = ?, updated_at = ?
          WHERE role = 'tenant' AND tenant_id = ?
        `,
      ).run(nextUserEmail, now, params.tenantId);
    }

    return { status: "ok" as const, tenant: (await getTenantById(params.tenantId))! };
  });

  return run();
}

export async function deleteTenant(tenantId: string) {
  const db = getDb();

  const existing = await getTenantById(tenantId);
  if (!existing) return { status: "missing" as const };

  const run = db.transaction(async () => {
    // Delete sessions for tenant users.
    const userIds = await db
      .prepare("SELECT id FROM users WHERE tenant_id = ?")
      .all(tenantId) as Array<{ id: string }>;

    for (const user of userIds) {
      await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
    }

    await db.prepare("DELETE FROM users WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM radius_accounting_sessions WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM subscriber_entitlements WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM portal_subscriber_sessions WHERE subscriber_id IN (SELECT id FROM portal_subscribers WHERE tenant_id = ?)").run(tenantId);
    await db.prepare("DELETE FROM portal_subscribers WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM voucher_pool WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM transactions WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM voucher_packages WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM tenant_requests WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM tenant_setup_tokens WHERE tenant_id = ?").run(tenantId);
    await db.prepare("DELETE FROM tenants WHERE id = ?").run(tenantId);
  });

  await run();
  return { status: "deleted" as const };
}

export async function getTenantForReference(reference: string) {
  const db = getDb();
  return await db
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

export async function isTenantSlugAvailable(slug: string) {
  const db = getDb();
  const existingTenant = await db
    .prepare("SELECT 1 FROM tenants WHERE slug = ?")
    .get(slug);
  if (existingTenant) return false;

  const pendingRequest = await db
    .prepare(
      "SELECT 1 FROM tenant_requests WHERE requested_slug = ? AND status = 'pending'",
    )
    .get(slug);
  return !pendingRequest;
}

export async function createTenantRequest(params: {
  requestedSlug: string;
  requestedName: string;
  requestedEmail: string;
}) {
  const db = getDb();
  const token = generateToken(32);
  const tokenHash = hashToken(token);
  const id = randomUUID();
  const now = nowIso();

  await db.prepare(
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

export async function denyTenantRequest(reviewToken: string) {
  const db = getDb();
  const tokenHash = hashToken(reviewToken);
  const now = nowIso();

  const result = await db
    .prepare(
      `
      UPDATE tenant_requests
      SET status = 'denied', reviewed_at = ?
      WHERE review_token_hash = ? AND status = 'pending'
    `,
    )
    .run(now, tokenHash);
  const changes = result.changes;

  if (changes === 0) {
    const existing = await db
      .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
      .get(tokenHash) as TenantRequestRow | undefined;
    return { status: "missing_or_reviewed" as const, request: existing };
  }

  const request = await db
    .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
    .get(tokenHash) as TenantRequestRow | undefined;

  return { status: "denied" as const, request };
}

export async function approveTenantRequest(reviewToken: string) {
  const db = getDb();
  const tokenHash = hashToken(reviewToken);

  const run = db.transaction(async () => {
    const request = await db
      .prepare("SELECT * FROM tenant_requests WHERE review_token_hash = ?")
      .get(tokenHash) as TenantRequestRow | undefined;

    if (!request) {
      return { status: "missing" as const };
    }
    if (request.status !== "pending") {
      return { status: "already_reviewed" as const, request };
    }

    const tenantExists = await db
      .prepare("SELECT 1 FROM tenants WHERE slug = ?")
      .get(request.requested_slug);
    if (tenantExists) {
      await db.prepare(
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

    const userConflict = await db
      .prepare("SELECT 1 FROM users WHERE username = ? OR email = ?")
      .get(normalizedUsername, normalizedEmail);
    if (userConflict) {
      await db.prepare(
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
    await db.prepare(
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

    const temporaryPassword = `Temp-${generateToken(9)}`;
    const created = await createUser({
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

    await db.prepare(
      `
        UPDATE tenant_requests
        SET status = 'approved', reviewed_at = ?, tenant_id = ?
        WHERE id = ?
      `,
    ).run(now, tenantId, request.id);

    const tenant = await db
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

export async function requireTenantPaystackSecretKey(tenantId: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) throw new Error("Tenant not found");
  if (!tenant.paystack_secret_enc) {
    throw new Error("Tenant Paystack key not configured");
  }
  const key = decryptSecret(tenant.paystack_secret_enc);
  if (!isPaystackSecretKey(key)) {
    throw new Error("Tenant Paystack key is invalid");
  }
  return key;
}

export async function setTenantPaystackSecret(params: {
  tenantId: string;
  paystackSecretKey: string;
}) {
  const db = getDb();
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) return { status: "missing" as const };

  const enc = encryptSecret(params.paystackSecretKey.trim());
  const last4 = params.paystackSecretKey.trim().slice(-4);
  const now = nowIso();

  await db.prepare(
    `
      UPDATE tenants
      SET paystack_secret_enc = ?, paystack_secret_last4 = ?, status = 'active', updated_at = ?
      WHERE id = ?
    `,
  ).run(enc, last4, now, params.tenantId);

  return { status: "ok" as const, tenant: (await getTenantById(params.tenantId))! };
}

export async function getTenantArchitecture(tenantId: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return null;

  return {
    voucherSourceMode: normalizeVoucherSourceMode(tenant.voucher_source_mode),
    portalAuthMode: normalizePortalAuthMode(tenant.portal_auth_mode),
    omada: {
      apiBaseUrl: tenant.omada_api_base_url ?? "",
      omadacId: tenant.omada_omadac_id ?? "",
      siteId: tenant.omada_site_id ?? "",
      clientId: tenant.omada_client_id ?? "",
      hasClientSecret: !!tenant.omada_client_secret_enc,
      hotspotOperatorUsername: tenant.omada_hotspot_operator_username ?? "",
      hasHotspotOperatorPassword: !!tenant.omada_hotspot_operator_password_enc,
    },
    radius: {
      hasAdapterSecret: !!tenant.radius_adapter_secret_enc,
      adapterSecretLast4: tenant.radius_adapter_secret_last4 ?? "",
    },
  } satisfies TenantArchitecture;
}

export async function setTenantArchitecture(params: {
  tenantId: string;
  voucherSourceMode?: VoucherSourceMode;
  portalAuthMode?: PortalAuthMode;
  omada?: {
    apiBaseUrl?: string;
    omadacId?: string;
    siteId?: string;
    clientId?: string;
    clientSecret?: string | null;
    hotspotOperatorUsername?: string;
    hotspotOperatorPassword?: string | null;
  };
  radius?: {
    adapterSecret?: string | null;
  };
}) {
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) return { status: "missing" as const };

  const now = nowIso();
  const db = getDb();

  const voucherSourceMode = params.voucherSourceMode
    ? normalizeVoucherSourceMode(params.voucherSourceMode)
    : normalizeVoucherSourceMode(tenant.voucher_source_mode);
  const portalAuthMode = params.portalAuthMode
    ? normalizePortalAuthMode(params.portalAuthMode)
    : normalizePortalAuthMode(tenant.portal_auth_mode);

  const apiBaseUrl = params.omada?.apiBaseUrl !== undefined
    ? params.omada.apiBaseUrl.trim()
    : (tenant.omada_api_base_url ?? "");
  const omadacId = params.omada?.omadacId !== undefined
    ? params.omada.omadacId.trim()
    : (tenant.omada_omadac_id ?? "");
  const siteId = params.omada?.siteId !== undefined
    ? params.omada.siteId.trim()
    : (tenant.omada_site_id ?? "");
  const clientId = params.omada?.clientId !== undefined
    ? params.omada.clientId.trim()
    : (tenant.omada_client_id ?? "");
  const hotspotOperatorUsername = params.omada?.hotspotOperatorUsername !== undefined
    ? params.omada.hotspotOperatorUsername.trim()
    : (tenant.omada_hotspot_operator_username ?? "");

  let omadaClientSecretEnc = tenant.omada_client_secret_enc;
  if (params.omada && "clientSecret" in params.omada) {
    const next = params.omada.clientSecret;
    if (next == null || next.trim() === "") {
      omadaClientSecretEnc = null;
    } else {
      omadaClientSecretEnc = encryptSecret(next.trim());
    }
  }

  let omadaHotspotOperatorPasswordEnc = tenant.omada_hotspot_operator_password_enc;
  if (params.omada && "hotspotOperatorPassword" in params.omada) {
    const next = params.omada.hotspotOperatorPassword;
    if (next == null || next.trim() === "") {
      omadaHotspotOperatorPasswordEnc = null;
    } else {
      omadaHotspotOperatorPasswordEnc = encryptSecret(next.trim());
    }
  }

  let radiusAdapterSecretEnc = tenant.radius_adapter_secret_enc;
  let radiusAdapterSecretLast4 = tenant.radius_adapter_secret_last4;
  if (params.radius && "adapterSecret" in params.radius) {
    const next = params.radius.adapterSecret;
    if (typeof next === "string" && next.trim() !== "") {
      radiusAdapterSecretEnc = encryptSecret(next.trim());
      radiusAdapterSecretLast4 = next.trim().slice(-4);
    }
  }

  if (portalAuthMode === "external_radius_portal" && !radiusAdapterSecretEnc) {
    const generated = generateRadiusAdapterSecret();
    radiusAdapterSecretEnc = encryptSecret(generated);
    radiusAdapterSecretLast4 = generated.slice(-4);
  }

  if (voucherSourceMode === "omada_openapi") {
    const missing: Array<"apiBaseUrl" | "omadacId" | "siteId" | "clientId" | "clientSecret"> = [];
    if (!apiBaseUrl) missing.push("apiBaseUrl");
    if (!omadacId) missing.push("omadacId");
    if (!siteId) missing.push("siteId");
    if (!clientId) missing.push("clientId");
    if (!omadaClientSecretEnc) missing.push("clientSecret");

    if (missing.length > 0) {
      return {
        status: "incomplete_omada_openapi" as const,
        missing,
      };
    }
  }

  await db
    .prepare(
      `
      UPDATE tenants
      SET voucher_source_mode = ?,
          portal_auth_mode = ?,
          omada_api_base_url = ?,
          omada_omadac_id = ?,
          omada_site_id = ?,
          omada_client_id = ?,
          omada_client_secret_enc = ?,
          omada_hotspot_operator_username = ?,
          omada_hotspot_operator_password_enc = ?,
          radius_adapter_secret_enc = ?,
          radius_adapter_secret_last4 = ?,
          updated_at = ?
      WHERE id = ?
    `,
    )
    .run(
      voucherSourceMode,
      portalAuthMode,
      apiBaseUrl || null,
      omadacId || null,
      siteId || null,
      clientId || null,
      omadaClientSecretEnc,
      hotspotOperatorUsername || null,
      omadaHotspotOperatorPasswordEnc,
      radiusAdapterSecretEnc,
      radiusAdapterSecretLast4,
      now,
      params.tenantId,
    );

  return { status: "ok" as const, tenant: (await getTenantById(params.tenantId))! };
}

export async function resolveTenantOmadaOpenApiConfig(tenantId: string) {
  const tenant = await getTenantById(tenantId);
  if (!tenant) return null;
  if (normalizeVoucherSourceMode(tenant.voucher_source_mode) !== "omada_openapi") {
    return null;
  }

  if (
    !tenant.omada_api_base_url ||
    !tenant.omada_omadac_id ||
    !tenant.omada_site_id ||
    !tenant.omada_client_id ||
    !tenant.omada_client_secret_enc
  ) {
    return null;
  }

  return {
    apiBaseUrl: tenant.omada_api_base_url,
    omadacId: tenant.omada_omadac_id,
    siteId: tenant.omada_site_id,
    clientId: tenant.omada_client_id,
    clientSecret: decryptSecret(tenant.omada_client_secret_enc),
  } satisfies TenantOmadaOpenApiConfig;
}

export async function resolveTenantOmadaOpenApiConfigForTesting(params: {
  tenantId: string;
  overrides?: TenantOmadaOpenApiConfigOverrides;
}) {
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) return { status: "missing" as const };

  const apiBaseUrl = params.overrides?.apiBaseUrl?.trim() || tenant.omada_api_base_url || "";
  const omadacId = params.overrides?.omadacId?.trim() || tenant.omada_omadac_id || "";
  const siteId = params.overrides?.siteId?.trim() || tenant.omada_site_id || "";
  const clientId = params.overrides?.clientId?.trim() || tenant.omada_client_id || "";
  const overrideSecret = params.overrides?.clientSecret?.trim() || "";
  const clientSecret = overrideSecret || (
    tenant.omada_client_secret_enc
      ? decryptSecret(tenant.omada_client_secret_enc)
      : ""
  );

  const missing: Array<"apiBaseUrl" | "omadacId" | "siteId" | "clientId" | "clientSecret"> = [];
  if (!apiBaseUrl) missing.push("apiBaseUrl");
  if (!omadacId) missing.push("omadacId");
  if (!siteId) missing.push("siteId");
  if (!clientId) missing.push("clientId");
  if (!clientSecret) missing.push("clientSecret");

  if (missing.length > 0) {
    return {
      status: "incomplete" as const,
      missing,
    };
  }

  return {
    status: "ok" as const,
    config: {
      apiBaseUrl,
      omadacId,
      siteId,
      clientId,
      clientSecret,
    } satisfies TenantOmadaOpenApiConfig,
  };
}

export async function resolveTenantOmadaOpenApiCredentialsForTesting(params: {
  tenantId: string;
  overrides?: TenantOmadaOpenApiCredentialsOverrides;
}) {
  const tenant = await getTenantById(params.tenantId);
  if (!tenant) return { status: "missing" as const };

  const apiBaseUrl = params.overrides?.apiBaseUrl?.trim() || tenant.omada_api_base_url || "";
  const omadacId = params.overrides?.omadacId?.trim() || tenant.omada_omadac_id || "";
  const clientId = params.overrides?.clientId?.trim() || tenant.omada_client_id || "";
  const overrideSecret = params.overrides?.clientSecret?.trim() || "";
  const clientSecret = overrideSecret || (
    tenant.omada_client_secret_enc
      ? decryptSecret(tenant.omada_client_secret_enc)
      : ""
  );

  const missing: Array<"apiBaseUrl" | "omadacId" | "clientId" | "clientSecret"> = [];
  if (!apiBaseUrl) missing.push("apiBaseUrl");
  if (!omadacId) missing.push("omadacId");
  if (!clientId) missing.push("clientId");
  if (!clientSecret) missing.push("clientSecret");

  if (missing.length > 0) {
    return {
      status: "incomplete" as const,
      missing,
    };
  }

  return {
    status: "ok" as const,
    credentials: {
      apiBaseUrl,
      omadacId,
      clientId,
      clientSecret,
    } satisfies TenantOmadaOpenApiCredentials,
  };
}

async function seedDefaultPackagesForTenant(db: ReturnType<typeof getDb>, tenantId: string) {
  void db;
  void tenantId;
  // Default package seeding has been removed. Tenants create plans explicitly.
}

export async function seedDefaultPackagesForTenantId(tenantId: string) {
  const db = getDb();
  await seedDefaultPackagesForTenant(db, tenantId);
}

export async function getPackagesWithAvailability(tenantId: string) {
  const db = getDb();
  const rows = await db
    .prepare(
      `
      SELECT p.*, (
        SELECT COUNT(1) FROM voucher_pool v
        WHERE v.tenant_id = p.tenant_id
          AND v.package_id = p.id
      ) as total_count, (
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
  return rows as Array<PackageRow & { available_count: number; total_count: number }>;
}

export async function getPackageByCode(tenantId: string, code: string) {
  const db = getDb();
  return await db
    .prepare(
      "SELECT * FROM voucher_packages WHERE tenant_id = ? AND code = ? AND active = 1",
    )
    .get(tenantId, code) as PackageRow | undefined;
}

export async function getPackageById(tenantId: string, id: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM voucher_packages WHERE tenant_id = ? AND id = ?")
    .get(tenantId, id) as PackageRow | undefined;
}

export async function getTenantPackages(tenantId: string) {
  const db = getDb();
  const rows = await db
    .prepare(
      `
      SELECT *
      FROM voucher_packages
      WHERE tenant_id = ?
      ORDER BY duration_minutes ASC
    `,
    )
    .all(tenantId);
  return rows as PackageRow[];
}

export async function updatePackagePrice(params: {
  tenantId: string;
  packageId: string;
  priceNgn: number;
}) {
  const db = getDb();
  const now = nowIso();
  const result = await db
    .prepare(
      `
      UPDATE voucher_packages
      SET price_ngn = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `,
    )
    .run(params.priceNgn, now, params.tenantId, params.packageId);
  return result.changes > 0;
}

export async function getAvailableCount(tenantId: string, packageId: string) {
  const db = getDb();
  const row = await db
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

export async function createTransaction(params: {
  tenantId: string;
  reference: string;
  email: string;
  phone: string;
  amountNgn: number;
  packageId: string;
  subscriberId?: string | null;
  deliveryMode?: "voucher" | "account_access";
  authorizationUrl: string | null;
  expiresAt: string | null;
}) {
  const db = getDb();
  const now = nowIso();
  const id = randomUUID();
  const email = normalizeEmail(params.email);
  await db.prepare(
    `
      INSERT INTO transactions (
        id, tenant_id, reference, email, phone, amount_ngn, package_id, authorization_url,
        subscriber_id, delivery_mode, payment_status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    params.tenantId,
    params.reference,
    email,
    params.phone,
    params.amountNgn,
    params.packageId,
    params.authorizationUrl,
    params.subscriberId ?? null,
    params.deliveryMode ?? "voucher",
    "pending",
    now,
    params.expiresAt,
  );
  return id;
}

export async function getTransaction(tenantId: string, reference: string) {
  const db = getDb();
  return await db
    .prepare("SELECT * FROM transactions WHERE tenant_id = ? AND reference = ?")
    .get(tenantId, reference) as TransactionRow | undefined;
}

export async function getTransactionByReferenceEmail(
  tenantId: string,
  reference: string,
  email: string,
) {
  const db = getDb();
  const normalizedEmail = normalizeEmail(email);
  return await db
    .prepare(
      "SELECT * FROM transactions WHERE tenant_id = ? AND reference = ? AND lower(email) = ?",
    )
    .get(tenantId, reference, normalizedEmail) as TransactionRow | undefined;
}

export async function getTransactionByReferencePhone(
  tenantId: string,
  reference: string,
  phone: string,
) {
  const db = getDb();
  const transaction = await db
    .prepare(
      "SELECT * FROM transactions WHERE tenant_id = ? AND reference = ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(tenantId, reference) as TransactionRow | undefined;

  if (!transaction) return undefined;
  const normalizedInput = normalizePhoneForLookup(phone);
  const normalizedStored = normalizePhoneForLookup(transaction.phone);
  if (!normalizedInput || !normalizedStored) return undefined;
  return normalizedInput === normalizedStored ? transaction : undefined;
}

export async function updateTransactionAuthUrl(params: {
  tenantId: string;
  reference: string;
  authorizationUrl: string;
  expiresAt: string | null;
}) {
  const db = getDb();
  const result = await db
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
    );
  return result.changes;
}

export async function markTransactionProcessing(params: {
  tenantId: string;
  reference: string;
}) {
  const db = getDb();
  const result = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'processing'
      WHERE tenant_id = ? AND reference = ? AND payment_status = 'pending'
    `,
    )
    .run(params.tenantId, params.reference);
  return result.changes;
}

export async function markTransactionFailed(params: {
  tenantId: string;
  reference: string;
  status: string;
}) {
  const db = getDb();
  const result = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(params.status, params.tenantId, params.reference);
  return result.changes;
}

export async function completeTransaction(params: {
  tenantId: string;
  reference: string;
  voucherCode: string;
  paidAt: string;
}) {
  const db = getDb();
  const result = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'success', voucher_code = ?, paid_at = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(params.voucherCode, params.paidAt, params.tenantId, params.reference);
  return result.changes;
}

export async function completeTransactionAsAccess(params: {
  tenantId: string;
  reference: string;
  paidAt: string;
}) {
  const db = getDb();
  const result = await db
    .prepare(
      `
      UPDATE transactions
      SET payment_status = 'success', voucher_code = NULL, paid_at = ?
      WHERE tenant_id = ? AND reference = ?
    `,
    )
    .run(params.paidAt, params.tenantId, params.reference);
  return result.changes;
}

export async function activateSubscriberAccessForTransaction(params: {
  tenantId: string;
  reference: string;
}) {
  const db = getDb();
  const run = db.transaction(async () => {
    const transaction = await getTransaction(params.tenantId, params.reference);
    if (!transaction) return { status: "missing" as const };
    if (!transaction.subscriber_id) return { status: "missing_subscriber" as const };

    const existing = await db
      .prepare(
        `
        SELECT * FROM subscriber_entitlements
        WHERE tenant_id = ? AND transaction_reference = ?
      `,
      )
      .get(params.tenantId, params.reference) as SubscriberEntitlementRow | undefined;

    if (existing) {
      await completeTransactionAsAccess({
        tenantId: params.tenantId,
        reference: params.reference,
        paidAt: existing.updated_at,
      });
      return { status: "already" as const, entitlement: existing };
    }

    const pkg = await getPackageById(params.tenantId, transaction.package_id);
    if (!pkg) return { status: "missing_package" as const };

    const active = await db
      .prepare(
        `
        SELECT *
        FROM subscriber_entitlements
        WHERE tenant_id = ?
          AND subscriber_id = ?
          AND status = 'active'
        ORDER BY ends_at DESC
        LIMIT 1
      `,
      )
      .get(params.tenantId, transaction.subscriber_id) as SubscriberEntitlementRow | undefined;

    const now = new Date();
    const baseStart = active && parseIsoTime(active.ends_at) > now.getTime()
      ? new Date(active.ends_at)
      : now;
    const endsAt = new Date(baseStart.getTime() + pkg.duration_minutes * 60 * 1000);
    const nowValue = now.toISOString();

    await db.prepare(
      `
      INSERT INTO subscriber_entitlements (
        id, tenant_id, subscriber_id, package_id, transaction_reference, status,
        starts_at, ends_at, max_devices, bandwidth_profile, data_limit_mb, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      randomUUID(),
      params.tenantId,
      transaction.subscriber_id,
      transaction.package_id,
      transaction.reference,
      baseStart.toISOString(),
      endsAt.toISOString(),
      Math.max(1, pkg.max_devices ?? 1),
      pkg.bandwidth_profile ?? null,
      pkg.data_limit_mb ?? null,
      nowValue,
      nowValue,
    );

    await completeTransactionAsAccess({
      tenantId: params.tenantId,
      reference: params.reference,
      paidAt: nowValue,
    });

    const created = await db
      .prepare(
        `
        SELECT * FROM subscriber_entitlements
        WHERE tenant_id = ? AND transaction_reference = ?
      `,
      )
      .get(params.tenantId, params.reference) as SubscriberEntitlementRow | undefined;
    return { status: "activated" as const, entitlement: created ?? null };
  });

  return run();
}

export async function assignVoucher(params: {
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
    const voucher = await db
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

    const updated = await db
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

export async function transactionAssignVoucher(params: {
  tenantId: string;
  reference: string;
  email: string;
  phone: string;
  packageId: string;
}) {
  const db = getDb();
  const run = db.transaction(async () => {
    const processing = await markTransactionProcessing({
      tenantId: params.tenantId,
      reference: params.reference,
    });
    if (processing === 0) {
      const existing = await getTransaction(params.tenantId, params.reference);
      if (existing?.payment_status === "success" && existing.voucher_code) {
        return {
          status: "already",
          voucherCode: existing.voucher_code,
        };
      }
      return { status: "skipped" };
    }

    const voucher = await assignVoucher(params);
    if (!voucher) {
      const tenant = await getTenantById(params.tenantId);
      const voucherSourceMode = normalizeVoucherSourceMode(tenant?.voucher_source_mode ?? null);

      if (tenant && voucherSourceMode === "omada_openapi") {
        const pkg = await getPackageById(params.tenantId, params.packageId);
        const config = await resolveTenantOmadaOpenApiConfig(params.tenantId);

        if (pkg && config) {
          try {
            const provisioned = await provisionOmadaVouchers({
              config,
              amount: 1,
              durationMinutes: pkg.duration_minutes,
              groupName: `PS-OD-${pkg.id.slice(0, 8)}-${Date.now()}`,
              codeLength: 10,
            });
            const code = provisioned.codes[0];
            if (code) {
              await db
                .prepare(
                  `
                  INSERT INTO voucher_pool (
                    id, tenant_id, voucher_code, duration_minutes, status, package_id, created_at
                  ) VALUES (?, ?, ?, ?, 'UNUSED', ?, ?)
                  ON CONFLICT (tenant_id, voucher_code) DO NOTHING
                `,
                )
                .run(
                  randomUUID(),
                  params.tenantId,
                  code,
                  pkg.duration_minutes,
                  pkg.id,
                  nowIso(),
                );
            }
          } catch (error) {
            console.error("On-demand Omada voucher provisioning failed", error);
          }
        }

        const voucherAfterProvision = await assignVoucher(params);
        if (voucherAfterProvision) {
          await completeTransaction({
            tenantId: params.tenantId,
            reference: params.reference,
            voucherCode: voucherAfterProvision.voucherCode,
            paidAt: voucherAfterProvision.assignedAt,
          });
          return { status: "assigned", voucherCode: voucherAfterProvision.voucherCode };
        }
      }

      await markTransactionFailed({
        tenantId: params.tenantId,
        reference: params.reference,
        status: "voucher_unavailable",
      });
      return { status: "no_voucher" };
    }

    await completeTransaction({
      tenantId: params.tenantId,
      reference: params.reference,
      voucherCode: voucher.voucherCode,
      paidAt: voucher.assignedAt,
    });

    return { status: "assigned", voucherCode: voucher.voucherCode };
  });

  return run();
}

export async function getStats(tenantId: string) {
  const db = getDb();
  const packages = await db
    .prepare(
      "SELECT * FROM voucher_packages WHERE tenant_id = ? ORDER BY duration_minutes ASC",
    )
    .all(tenantId) as PackageRow[];

  return Promise.all(
    packages.map(async (pkg) => {
      const totals = await db
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
    }),
  );
}

export async function getTenantAdminStats(tenantId: string) {
  const db = getDb();
  const voucherPool = await getStats(tenantId);
  const voucherCodes = new Set(voucherPool.map((pkg) => pkg.code));
  const packages = (await getTenantPackages(tenantId))
    .filter((pkg) => voucherCodes.has(pkg.code))
    .map((pkg) => ({
      id: pkg.id,
      code: pkg.code,
      name: pkg.name,
      durationMinutes: pkg.duration_minutes,
      priceNgn: pkg.price_ngn,
      active: pkg.active,
    }));
  const tx = await db
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
    packages,
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

export async function getTenantSubscriberOverview(tenantId: string) {
  const db = getDb();
  const rows = await db
    .prepare(
      `
      SELECT
        s.id as subscriber_id,
        s.email,
        s.phone,
        s.full_name,
        s.status as subscriber_status,
        e.id as entitlement_id,
        e.status as entitlement_status,
        e.starts_at,
        e.ends_at,
        e.max_devices,
        e.bandwidth_profile,
        e.data_limit_mb,
        p.name as plan_name,
        p.code as plan_code,
        (
          SELECT COUNT(1)
          FROM radius_accounting_sessions ras
          WHERE ras.tenant_id = s.tenant_id
            AND ras.subscriber_id = s.id
            AND ras.status = 'active'
        ) as active_sessions
      FROM portal_subscribers s
      LEFT JOIN subscriber_entitlements e
        ON e.subscriber_id = s.id
       AND e.tenant_id = s.tenant_id
       AND e.status = 'active'
       AND e.ends_at > ?
      LEFT JOIN voucher_packages p ON p.id = e.package_id
      WHERE s.tenant_id = ?
      ORDER BY s.created_at DESC
    `,
    )
    .all(nowIso(), tenantId) as Array<{
    subscriber_id: string;
    email: string;
    phone: string | null;
    full_name: string | null;
    subscriber_status: string;
    entitlement_id: string | null;
    entitlement_status: string | null;
    starts_at: string | null;
    ends_at: string | null;
    max_devices: number | null;
    bandwidth_profile: string | null;
    data_limit_mb: number | null;
    plan_name: string | null;
    plan_code: string | null;
    active_sessions: number;
  }>;

  return rows.map((row) => ({
    subscriberId: row.subscriber_id,
    email: row.email,
    phone: row.phone,
    fullName: row.full_name,
    status: row.subscriber_status,
    activeSessions: Number(row.active_sessions ?? 0),
    entitlement: row.entitlement_id
      ? {
          id: row.entitlement_id,
          status: row.entitlement_status ?? "active",
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          maxDevices: row.max_devices ?? 1,
          bandwidthProfile: row.bandwidth_profile,
          dataLimitMb: row.data_limit_mb,
          planName: row.plan_name,
          planCode: row.plan_code,
        }
      : null,
  }));
}
