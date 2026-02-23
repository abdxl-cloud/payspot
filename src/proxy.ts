import { NextRequest, NextResponse } from "next/server";

function parseBooleanEnv(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

function shouldForceHttps() {
  return parseBooleanEnv(process.env.FORCE_HTTPS) === true;
}

export function proxy(request: NextRequest) {
  if (!shouldForceHttps()) return NextResponse.next();

  const { nextUrl } = request;
  if (nextUrl.protocol === "https:") return NextResponse.next();
  if (nextUrl.hostname === "localhost" || nextUrl.hostname === "127.0.0.1") {
    return NextResponse.next();
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0]?.trim().toLowerCase() === "https") {
    return NextResponse.next();
  }

  const url = nextUrl.clone();
  url.protocol = "https:";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
