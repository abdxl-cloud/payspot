export const SESSION_COOKIE_NAME = "vs_session";

function parseBooleanEnv(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

function shouldUseSecureCookie() {
  const forced = parseBooleanEnv(process.env.SESSION_COOKIE_SECURE);
  if (forced !== null) return forced;

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      // Fall through to NODE_ENV heuristic.
    }
  }

  return process.env.NODE_ENV === "production";
}

export function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    if (k === name) {
      return rest.join("=") || "";
    }
  }
  return null;
}

export function buildSessionCookie(params: {
  token: string;
  expiresAt: string;
}) {
  const expires = new Date(params.expiresAt);
  const maxAge = Math.max(0, Math.floor((expires.getTime() - Date.now()) / 1000));
  const secure = shouldUseSecureCookie();
  return [
    `${SESSION_COOKIE_NAME}=${params.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    `Expires=${expires.toUTCString()}`,
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearSessionCookie() {
  const secure = shouldUseSecureCookie();
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
