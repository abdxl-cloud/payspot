import { buildClearSessionCookie, getCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { deleteSession } from "@/lib/store";

export async function POST(request: Request) {
  const token = getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (token) {
    deleteSession(token);
  }

  return Response.json(
    { status: "ok" },
    {
      headers: {
        "Set-Cookie": buildClearSessionCookie(),
      },
    },
  );
}

