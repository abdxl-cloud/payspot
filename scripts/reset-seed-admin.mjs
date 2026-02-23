import crypto from "node:crypto";
import { Pool } from "pg";

const email = (process.env.SEED_ADMIN_EMAIL || "seeduser@example.com").trim().toLowerCase();
const username = (process.env.SEED_ADMIN_USERNAME || "seeduser").trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || process.argv[2] || "Passw0rdA1";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("SEED_ADMIN_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function hashPassword(value) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(value, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    16384,
    8,
    1,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

const now = new Date().toISOString();
const passwordHash = hashPassword(password);

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `
        SELECT id
        FROM users
        WHERE username = $1 OR email = $2
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [username, email],
    );

    if (existing.rows[0]?.id) {
      await client.query(
        `
          UPDATE users
          SET
            email = $1,
            username = $2,
            role = 'admin',
            tenant_id = NULL,
            password_hash = $3,
            must_change_password = 0,
            updated_at = $4
          WHERE id = $5
        `,
        [email, username, passwordHash, now, existing.rows[0].id],
      );
      console.log(`Updated seeded admin user: ${email}`);
    } else {
      const id = crypto.randomUUID();
      await client.query(
        `
          INSERT INTO users (
            id,
            email,
            username,
            role,
            tenant_id,
            password_hash,
            must_change_password,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, 'admin', NULL, $4, 0, $5, $5)
        `,
        [id, email, username, passwordHash, now],
      );
      console.log(`Created seeded admin user: ${email}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}

