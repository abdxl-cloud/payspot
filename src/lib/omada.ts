import type { TenantOmadaOpenApiConfig } from "@/lib/store";

type OmadaResponse<T> = {
  errorCode: number;
  msg?: string;
  result?: T;
};

type OmadaAccessTokenResult = {
  accessToken: string;
  tokenType?: string;
  expiresIn?: number;
  refreshToken?: string;
};

type OmadaCreatedResource = {
  id: string;
};

type OmadaVoucherRow = {
  code?: string | null;
};

type OmadaVoucherGroupDetail = {
  data?: OmadaVoucherRow[];
};

type OmadaSiteGrid = {
  data?: Array<{
    siteId?: string | null;
    name?: string | null;
  }>;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 750;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildBaseUrlCandidates(value: string) {
  const normalized = normalizeBaseUrl(value);
  const candidates = [normalized];

  try {
    const parsed = new URL(normalized);
    if (parsed.hostname.includes("-omada-controller.tplinkcloud.com")) {
      const northbound = new URL(parsed.toString());
      northbound.hostname = northbound.hostname.replace(
        "-omada-controller.tplinkcloud.com",
        "-omada-northbound.tplinkcloud.com",
      );
      candidates.push(normalizeBaseUrl(northbound.toString()));
    }
  } catch {
    // Keep the original value only when URL parsing fails.
  }

  return [...new Set(candidates)];
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

async function omadaRequest<T>(
  input: string,
  init: RequestInit = {},
): Promise<OmadaResponse<T>> {
  const timeout = timeoutSignal(DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: timeout.signal });
    const data = await response.json().catch(() => null) as OmadaResponse<T> | null;
    if (!response.ok) {
      throw new Error(data?.msg || `Omada API error (${response.status})`);
    }
    if (!data || typeof data.errorCode !== "number") {
      throw new Error("Unexpected Omada API response");
    }
    if (data.errorCode !== 0) {
      throw new Error(data.msg || `Omada API error (${data.errorCode})`);
    }
    return data;
  } finally {
    timeout.cleanup();
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getOmadaAccessToken(config: TenantOmadaOpenApiConfig) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const tokenUrl = `${baseUrl}/openapi/authorize/token?grant_type=client_credentials`;
  const payload = {
    omadacId: config.omadacId,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  };

  const data = await omadaRequest<OmadaAccessTokenResult>(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const token = data.result?.accessToken;
  if (!token) throw new Error("Omada access token missing in response");
  return token;
}

async function resolveOmadaAccess(config: TenantOmadaOpenApiConfig) {
  const candidates = buildBaseUrlCandidates(config.apiBaseUrl);
  let lastError: Error | null = null;

  for (const baseUrl of candidates) {
    try {
      const token = await getOmadaAccessToken({ ...config, apiBaseUrl: baseUrl });
      return { baseUrl, token };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Omada token request failed");
    }
  }

  throw lastError ?? new Error("Unable to obtain Omada access token");
}

export async function listOmadaSites(params: {
  apiBaseUrl: string;
  omadacId: string;
  clientId: string;
  clientSecret: string;
}) {
  const access = await resolveOmadaAccess({
    apiBaseUrl: params.apiBaseUrl,
    omadacId: params.omadacId,
    siteId: "__unused__",
    clientId: params.clientId,
    clientSecret: params.clientSecret,
  });
  const sitePath = `/openapi/v1/${encodeURIComponent(params.omadacId)}/sites`;
  const listUrls = [
    `${access.baseUrl}${sitePath}?page=1&pageSize=1000`,
    // Compatibility fallback for controllers/proxies that normalize pagination names.
    `${access.baseUrl}${sitePath}?currentPage=1&currentSize=1000`,
  ];

  let data: OmadaResponse<OmadaSiteGrid> | null = null;
  let lastError: Error | null = null;
  for (const listUrl of listUrls) {
    try {
      data = await omadaRequest<OmadaSiteGrid>(listUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `AccessToken=${access.token}`,
        },
      });
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unable to fetch Omada sites");
    }
  }

  if (!data) {
    throw lastError ?? new Error("Unable to fetch Omada sites");
  }

  const rows = Array.isArray(data.result?.data)
    ? data.result?.data
    : [];

  return rows
    .map((site) => ({
      siteId: site.siteId?.trim() || "",
      name: site.name?.trim() || "",
    }))
    .filter((site) => !!site.siteId);
}

type ProvisionParams = {
  config: TenantOmadaOpenApiConfig;
  amount: number;
  durationMinutes: number;
  groupName: string;
  codeLength: number;
};

export async function provisionOmadaVouchers(params: ProvisionParams) {
  const access = await resolveOmadaAccess(params.config);

  const createUrl = `${access.baseUrl}/openapi/v1/${encodeURIComponent(params.config.omadacId)}/sites/${encodeURIComponent(
    params.config.siteId,
  )}/hotspot/voucher-groups`;

  const createBody = {
    name: params.groupName.slice(0, 32),
    amount: params.amount,
    codeLength: Math.max(6, Math.min(10, params.codeLength)),
    codeForm: [0, 1],
    limitType: 2,
    durationType: 0,
    duration: Math.max(1, params.durationMinutes),
    timingType: 0,
    rateLimit: {
      mode: 0,
      customRateLimit: {
        downLimitEnable: false,
        upLimitEnable: false,
      },
    },
    trafficLimitEnable: false,
    applyToAllPortals: true,
  };

  const created = await omadaRequest<OmadaCreatedResource>(createUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `AccessToken=${access.token}`,
    },
    body: JSON.stringify(createBody),
  });

  const groupId = created.result?.id;
  if (!groupId) throw new Error("Omada voucher group ID missing in response");

  const detailUrl = `${access.baseUrl}/openapi/v1/${encodeURIComponent(params.config.omadacId)}/sites/${encodeURIComponent(
    params.config.siteId,
  )}/hotspot/voucher-groups/${encodeURIComponent(groupId)}`;

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
    const detail = await omadaRequest<OmadaVoucherGroupDetail>(
      `${detailUrl}?page=1&pageSize=${Math.max(1, Math.min(1000, params.amount))}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `AccessToken=${access.token}`,
        },
      },
    );

    const codes = (detail.result?.data ?? [])
      .map((row) => row.code?.trim() ?? "")
      .filter(Boolean);

    if (codes.length >= params.amount) {
      return { groupId, codes: codes.slice(0, params.amount) };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Omada voucher codes were not ready in time after group creation");
}

// --- Voucher status lookup ---

type OmadaVoucherDetailRow = {
  id?: string | null;
  code?: string | null;
  // Official schema (SimpleVoucherOpenApiVO): 0 = unused, 1 = in use, 2 = expired.
  status?: number | null;
  startTime?: number | null;
  timeUsedSec?: number | null;
  timeLeftSec?: number | null;
  usedAt?: number | null;    // epoch ms
  expireAt?: number | null;  // epoch ms
  duration?: number | null;  // minutes
  clientMac?: string | null;
};

type OmadaVoucherGroupListRow = {
  id?: string | null;
};

type OmadaVoucherGroupListResult = {
  totalRows?: number;
  data?: OmadaVoucherGroupListRow[];
};

type OmadaVoucherGroupDetailResult = {
  totalRows?: number;
  duration?: number | null;
  data?: OmadaVoucherDetailRow[];
};

export type OmadaVoucherLookupResult =
  | { found: false; unavailable?: true }
  | {
      found: true;
      status: "UNUSED" | "USED" | "EXPIRED" | "UNKNOWN";
      usedAt: string | null;
      expireAt: string | null;
      durationMinutes: number | null;
    };

const MAX_LOOKUP_GROUPS = 20;

/**
 * Searches the most recent voucher groups on the Omada controller for a
 * specific code and returns its live usage status.
 *
 * Works with controller deployments that expose the Open API v1 hotspot
 * voucher endpoints.
 *
 * Returns { found: false, unavailable: true } when the controller is
 * unreachable or does not support the endpoint.
 */
export async function lookupOmadaVoucherStatus(
  config: TenantOmadaOpenApiConfig,
  targetCode: string,
): Promise<OmadaVoucherLookupResult> {
  let access: { baseUrl: string; token: string };
  try {
    access = await resolveOmadaAccess(config);
  } catch {
    return { found: false, unavailable: true };
  }

  const siteBase = `${access.baseUrl}/openapi/v1/${encodeURIComponent(config.omadacId)}/sites/${encodeURIComponent(config.siteId)}/hotspot`;
  const headers = { Accept: "application/json", Authorization: `AccessToken=${access.token}` };

  let groupsData: OmadaResponse<OmadaVoucherGroupListResult>;
  try {
    groupsData = await omadaRequest<OmadaVoucherGroupListResult>(
      `${siteBase}/voucher-groups?page=1&pageSize=${MAX_LOOKUP_GROUPS}`,
      { headers },
    );
  } catch {
    return { found: false, unavailable: true };
  }

  const normalized = targetCode.trim().toUpperCase();

  for (const group of groupsData.result?.data ?? []) {
    if (!group.id) continue;

    let detail: OmadaResponse<OmadaVoucherGroupDetailResult>;
    try {
      detail = await omadaRequest<OmadaVoucherGroupDetailResult>(
        `${siteBase}/voucher-groups/${encodeURIComponent(group.id)}?page=1&pageSize=100`,
        { headers },
      );
    } catch {
      continue;
    }

    const match = (detail.result?.data ?? []).find(
      (v) => (v.code?.trim().toUpperCase() ?? "") === normalized,
    );

    if (match) {
      let status: "UNUSED" | "USED" | "EXPIRED" | "UNKNOWN" = "UNKNOWN";
      if (match.status === 0) status = "UNUSED";
      // Official docs call status=1 "in use"; we map it to "USED" for the existing UI badge.
      else if (match.status === 1) status = "USED";
      else if (match.status === 2) status = "EXPIRED";

      const expireAtMs =
        typeof match.expireAt === "number"
          ? match.expireAt
          : typeof match.startTime === "number"
          ? match.startTime
          : null;
      let durationMinutes =
        typeof match.duration === "number"
          ? match.duration
          : typeof detail.result?.duration === "number"
          ? detail.result.duration
          : null;
      if (
        durationMinutes == null &&
        typeof match.timeUsedSec === "number" &&
        typeof match.timeLeftSec === "number"
      ) {
        const totalSeconds = match.timeUsedSec + match.timeLeftSec;
        if (totalSeconds > 0) {
          durationMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
        }
      }

      return {
        found: true,
        status,
        usedAt: match.usedAt ? new Date(match.usedAt).toISOString() : null,
        expireAt: expireAtMs ? new Date(expireAtMs).toISOString() : null,
        durationMinutes,
      };
    }
  }

  return { found: false };
}

export async function testOmadaOpenApiConnection(config: TenantOmadaOpenApiConfig) {
  const access = await resolveOmadaAccess(config);
  const probeUrl = `${access.baseUrl}/openapi/v1/${encodeURIComponent(config.omadacId)}/sites/${encodeURIComponent(
    config.siteId,
  )}/hotspot/voucher-groups?page=1&pageSize=1`;

  await omadaRequest<Record<string, unknown>>(probeUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `AccessToken=${access.token}`,
    },
  });

  return { ok: true as const };
}
