import { getCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, type SessionUser } from "@/lib/store";

export function getSessionUserFromRequest(request: Request): SessionUser | null {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return null;
  return getSessionUser(token);
}

