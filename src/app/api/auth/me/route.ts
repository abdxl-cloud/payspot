import { getCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

export async function GET(request: Request) {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (!token) {
    return Response.json({ user: null });
  }

  const user = await getSessionUser(token);
  if (!user) {
    return Response.json({ user: null });
  }

  return Response.json({ user });
}

