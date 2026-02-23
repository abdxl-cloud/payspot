import { getCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser, type SessionUser } from "@/lib/store";

export async function getSessionUserFromRequest(request: Request): Promise<SessionUser | null> {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) return null;
  return await getSessionUser(token);
}
