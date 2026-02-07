import { z } from "zod";

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().optional(),
  RESUME_TTL_MINUTES: z.coerce.number().optional(),
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().optional(),
  APP_URL: z.string().url().optional(),
  ADMIN_API_KEY: z.string().optional(),
  OWNER_EMAIL: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  TENANT_SECRETS_KEY: z.string().optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

let cached: BaseEnv | null = null;

export function getEnv(): BaseEnv {
  if (cached) return cached;
  const parsed = baseEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }
  cached = parsed.data;
  return cached;
}

function requireString(value: string | undefined, key: string) {
  if (!value || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parseSmtpSecure(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  throw new Error("SMTP_SECURE must be true/false");
}

export function getAppEnv() {
  const env = getEnv();
  return {
    APP_URL: requireString(env.APP_URL, "APP_URL"),
  };
}

export function getSmsEnv() {
  const env = getEnv();
  return {
    TERMII_API_KEY: requireString(env.TERMII_API_KEY, "TERMII_API_KEY"),
    TERMII_SENDER_ID: requireString(env.TERMII_SENDER_ID, "TERMII_SENDER_ID"),
  };
}

export function getMailEnv() {
  const env = getEnv();
  return {
    OWNER_EMAIL: requireString(env.OWNER_EMAIL, "OWNER_EMAIL"),
    SMTP_HOST: requireString(env.SMTP_HOST, "SMTP_HOST"),
    SMTP_PORT: env.SMTP_PORT ?? 587,
    SMTP_SECURE: parseSmtpSecure(env.SMTP_SECURE),
    SMTP_USER: requireString(env.SMTP_USER, "SMTP_USER"),
    SMTP_PASS: requireString(env.SMTP_PASS, "SMTP_PASS"),
    SMTP_FROM: requireString(env.SMTP_FROM, "SMTP_FROM"),
  };
}

export function getCryptoEnv() {
  const env = getEnv();
  return {
    TENANT_SECRETS_KEY: requireString(env.TENANT_SECRETS_KEY, "TENANT_SECRETS_KEY"),
  };
}

export function getAdminEnv() {
  const env = getEnv();
  const key = env.ADMIN_API_KEY?.trim();
  return {
    ADMIN_API_KEY: key && key !== "" ? key : null,
  };
}
