import crypto from "node:crypto";
import { getCryptoEnv } from "@/lib/env";

function parseKey(value: string) {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    return Buffer.from(trimmed, "base64url");
  } catch {
    // Ignore and try base64 below.
  }

  return Buffer.from(trimmed, "base64");
}

export function getTenantSecretsKey() {
  const { TENANT_SECRETS_KEY } = getCryptoEnv();
  const key = parseKey(TENANT_SECRETS_KEY);
  if (key.length !== 32) {
    throw new Error("TENANT_SECRETS_KEY must be 32 bytes (base64/base64url/hex).");
  }
  return key;
}

export function encryptSecret(plaintext: string) {
  const key = getTenantSecretsKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]).toString("base64url");
  return `v1:${packed}`;
}

export function decryptSecret(payload: string) {
  const key = getTenantSecretsKey();
  if (!payload.startsWith("v1:")) {
    throw new Error("Unknown secret payload version.");
  }
  const packed = payload.slice("v1:".length);
  const data = Buffer.from(packed, "base64url");
  if (data.length < 12 + 16 + 1) {
    throw new Error("Invalid secret payload.");
  }
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
  return plaintext;
}

