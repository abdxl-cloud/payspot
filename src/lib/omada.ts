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

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 750;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
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

type ProvisionParams = {
  config: TenantOmadaOpenApiConfig;
  amount: number;
  durationMinutes: number;
  groupName: string;
  codeLength: number;
};

export async function provisionOmadaVouchers(params: ProvisionParams) {
  const baseUrl = normalizeBaseUrl(params.config.apiBaseUrl);
  const token = await getOmadaAccessToken(params.config);

  const createUrl = `${baseUrl}/openapi/v1/${encodeURIComponent(params.config.omadacId)}/sites/${encodeURIComponent(
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
      Authorization: `AccessToken=${token}`,
    },
    body: JSON.stringify(createBody),
  });

  const groupId = created.result?.id;
  if (!groupId) throw new Error("Omada voucher group ID missing in response");

  const detailUrl = `${baseUrl}/openapi/v1/${encodeURIComponent(params.config.omadacId)}/sites/${encodeURIComponent(
    params.config.siteId,
  )}/hotspot/voucher-groups/${encodeURIComponent(groupId)}`;

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i += 1) {
    const detail = await omadaRequest<OmadaVoucherGroupDetail>(
      `${detailUrl}?page=1&pageSize=${Math.max(1, Math.min(1000, params.amount))}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `AccessToken=${token}`,
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

export async function testOmadaOpenApiConnection(config: TenantOmadaOpenApiConfig) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const token = await getOmadaAccessToken(config);
  const probeUrl = `${baseUrl}/openapi/v1/${encodeURIComponent(config.omadacId)}/sites/${encodeURIComponent(
    config.siteId,
  )}/hotspot/voucher-groups?page=1&pageSize=1`;

  await omadaRequest<Record<string, unknown>>(probeUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `AccessToken=${token}`,
    },
  });

  return { ok: true as const };
}
