import crypto from "node:crypto";

type ScryptParams = {
  N: number;
  r: number;
  p: number;
};

const DEFAULT_PARAMS: ScryptParams = {
  N: 16384,
  r: 8,
  p: 1,
};

function timingSafeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 64 * 1024 * 1024,
  });

  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    salt.toString("base64url"),
    (key as Buffer).toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [algo, nRaw, rRaw, pRaw, saltB64, keyB64] = parts;
  if (algo !== "scrypt") return false;

  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64url");
    expected = Buffer.from(keyB64, "base64url");
  } catch {
    return false;
  }

  const actual = crypto.scryptSync(password, salt, expected.length, {
    N,
    r,
    p,
    maxmem: 64 * 1024 * 1024,
  }) as Buffer;

  return timingSafeEqual(actual, expected);
}

