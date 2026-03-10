export type CaptivePortalContext = {
  target?: string;
  targetPort?: string;
  originUrl?: string;
  clientMac?: string;
  clientIp?: string;
  apMac?: string;
  gatewayMac?: string;
  raidusServerIp?: string;
  scheme?: string;
  ssidName?: string;
  radioId?: string;
  vid?: string;
  previewSite?: string;
};

type SearchParamsInput =
  | URLSearchParams
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>;

function hasGetter(
  input: SearchParamsInput,
): input is URLSearchParams | { get(name: string): string | null } {
  return "get" in input && typeof input.get === "function";
}

const STRING_FIELD_LIMIT = 200;
const QUERY_FIELDS = [
  "target",
  "targetPort",
  "clientMac",
  "clientIp",
  "apMac",
  "gatewayMac",
  "raidusServerIp",
  "scheme",
  "ssidName",
  "radioId",
  "vid",
  "previewSite",
] as const;

function getValue(
  input: SearchParamsInput,
  key: string,
): string | undefined {
  if (input instanceof URLSearchParams) {
    return input.get(key) ?? undefined;
  }
  if (hasGetter(input)) {
    const value = input.get(key);
    return value ?? undefined;
  }
  const raw = input[key];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function sanitizeString(value: string | undefined) {
  const next = value?.trim();
  if (!next) return undefined;
  return next.slice(0, STRING_FIELD_LIMIT);
}

function sanitizeOriginUrl(value: string | undefined) {
  const next = value?.trim();
  if (!next) return undefined;
  try {
    const parsed = new URL(next);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export function normalizeCaptivePortalContext(
  context: CaptivePortalContext | null | undefined,
): CaptivePortalContext | undefined {
  if (!context) return undefined;

  const normalized: CaptivePortalContext = {
    originUrl: sanitizeOriginUrl(context.originUrl),
  };

  for (const key of QUERY_FIELDS) {
    const value = sanitizeString(context[key]);
    if (value) {
      normalized[key] = value;
    }
  }

  if (!Object.values(normalized).some(Boolean)) {
    return undefined;
  }

  return normalized;
}

export function getCaptivePortalContextFromSearchParams(
  input: SearchParamsInput,
): CaptivePortalContext | undefined {
  return normalizeCaptivePortalContext({
    target: getValue(input, "target"),
    targetPort: getValue(input, "targetPort"),
    originUrl:
      getValue(input, "originUrl") ??
      getValue(input, "originalUrl") ??
      getValue(input, "redirectUrl") ??
      getValue(input, "url"),
    clientMac: getValue(input, "clientMac"),
    clientIp: getValue(input, "clientIp") ?? getValue(input, "clientIP"),
    apMac: getValue(input, "apMac") ?? getValue(input, "ap"),
    gatewayMac: getValue(input, "gatewayMac") ?? getValue(input, "GatewayMac"),
    raidusServerIp: getValue(input, "raidusServerIp"),
    scheme: getValue(input, "scheme"),
    ssidName: getValue(input, "ssidName") ?? getValue(input, "ssid"),
    radioId: getValue(input, "radioId"),
    vid: getValue(input, "vid"),
    previewSite: getValue(input, "previewSite"),
  });
}

export function createCaptivePortalSearchParams(
  context: CaptivePortalContext | null | undefined,
) {
  const normalized = normalizeCaptivePortalContext(context);
  const params = new URLSearchParams();
  if (!normalized) return params;

  if (normalized.originUrl) {
    params.set("originUrl", normalized.originUrl);
  }

  for (const key of QUERY_FIELDS) {
    const value = normalized[key];
    if (value) {
      params.set(key, value);
    }
  }

  return params;
}
