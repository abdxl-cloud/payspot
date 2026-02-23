import { NextRequest, NextResponse } from "next/server";

function parseBooleanEnv(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return null;
}

function shouldForceHttps() {
  const forced = parseBooleanEnv(process.env.FORCE_HTTPS);
  if (forced !== null) return forced;

  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      return new URL(appUrl).protocol === "https:";
    } catch {
      // Ignore invalid APP_URL and fall back.
    }
  }

  return false;
}

export function proxy(request: NextRequest) {
  if (!shouldForceHttps()) return NextResponse.next();

  const { nextUrl } = request;
  if (nextUrl.protocol === "https:") return NextResponse.next();
  if (nextUrl.hostname === "localhost" || nextUrl.hostname === "127.0.0.1") {
    return NextResponse.next();
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedProtocol = request.headers.get("x-forwarded-protocol");
  const forwardedSsl = request.headers.get("x-forwarded-ssl");
  const frontEndHttps = request.headers.get("front-end-https");
  const cfVisitor = request.headers.get("cf-visitor");

  const forwardedValues = [forwardedProto, forwardedProtocol]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const alreadySecure =
    forwardedValues.includes("https") ||
    forwardedSsl?.trim().toLowerCase() === "on" ||
    frontEndHttps?.trim().toLowerCase() === "on" ||
    (cfVisitor?.toLowerCase().includes('"scheme":"https"') ?? false);

  if (alreadySecure) {
    return NextResponse.next();
  }

  const url = nextUrl.clone();
  url.protocol = "https:";
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
