import { randomUUID } from "node:crypto";
import http from "node:http";
import https from "node:https";

export type TenantMikrotikConfig = {
  baseUrl: string;
  username: string;
  password: string;
  hotspotServer: string;
  defaultProfile: string;
  verifyTls: boolean;
};

type MikrotikRequestParams = {
  method: "GET" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, string>;
};

type HotspotUserRow = {
  ".id"?: string;
  name?: string;
  password?: string;
  profile?: string;
  server?: string;
  comment?: string;
  "limit-uptime"?: string;
  "limit-bytes-total"?: string;
  disabled?: string;
};

type SystemResourceRow = {
  version?: string;
  uptime?: string;
  "board-name"?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function buildRestRoot(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith("/rest")) return normalized;
  return `${normalized}/rest`;
}

function buildRestUrl(baseUrl: string, path: string, query?: Record<string, string>) {
  const root = buildRestRoot(baseUrl);
  const url = new URL(`${root}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function readResponseBody(response: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let raw = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      raw += chunk;
    });
    response.on("end", () => resolve(raw));
    response.on("error", reject);
  });
}

async function mikrotikRequest<T>(
  config: TenantMikrotikConfig,
  params: MikrotikRequestParams,
): Promise<T> {
  const url = buildRestUrl(config.baseUrl, params.path, params.query);
  const payload = params.body ? JSON.stringify(params.body) : null;
  const transport = url.protocol === "https:" ? https : http;

  return await new Promise<T>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: params.method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload).toString(),
              }
            : {}),
        },
        rejectUnauthorized: url.protocol === "https:" ? config.verifyTls : undefined,
      },
      async (response) => {
        try {
          const raw = await readResponseBody(response);
          const contentType = response.headers["content-type"] ?? "";
          const parsed = raw && contentType.includes("application/json")
            ? JSON.parse(raw)
            : raw;

          if ((response.statusCode ?? 500) >= 400) {
            const message =
              typeof parsed === "object" && parsed && "message" in parsed
                ? String(parsed.message)
                : raw || `HTTP ${response.statusCode ?? 500}`;
            const detail =
              typeof parsed === "object" && parsed && "detail" in parsed
                ? `: ${String(parsed.detail)}`
                : "";
            reject(new Error(`MikroTik REST error ${response.statusCode ?? 500} ${message}${detail}`));
            return;
          }

          resolve(parsed as T);
        } catch (error) {
          reject(error);
        }
      },
    );

    req.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error("MikroTik REST request timed out"));
    });
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function minutesToRouterOsDuration(minutes: number | null | undefined) {
  if (!minutes || !Number.isFinite(minutes) || minutes <= 0) return null;

  let remaining = Math.round(minutes);
  const weeks = Math.floor(remaining / (7 * 24 * 60));
  remaining -= weeks * 7 * 24 * 60;
  const days = Math.floor(remaining / (24 * 60));
  remaining -= days * 24 * 60;
  const hours = Math.floor(remaining / 60);
  remaining -= hours * 60;

  const parts: string[] = [];
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (remaining > 0) parts.push(`${remaining}m`);
  return parts.length > 0 ? parts.join("") : "1m";
}

function dataLimitMbToBytes(dataLimitMb: number | null | undefined) {
  if (!dataLimitMb || !Number.isFinite(dataLimitMb) || dataLimitMb <= 0) return null;
  return String(Math.round(dataLimitMb * 1024 * 1024));
}

export async function findHotspotUserByName(
  config: TenantMikrotikConfig,
  username: string,
) {
  const rows = await mikrotikRequest<HotspotUserRow[] | HotspotUserRow>(config, {
    method: "GET",
    path: "/ip/hotspot/user",
    query: {
      name: username,
      ".proplist": ".id,name,password,profile,server,comment,limit-uptime,limit-bytes-total,disabled",
    },
  });

  if (Array.isArray(rows)) return rows[0] ?? null;
  return rows ?? null;
}

export async function ensureHotspotVoucher(params: {
  config: TenantMikrotikConfig;
  username: string;
  password: string;
  comment: string;
  durationMinutes: number | null;
  dataLimitMb: number | null;
}) {
  const existing = await findHotspotUserByName(params.config, params.username);
  if (existing) {
    return { status: "already" as const, user: existing };
  }

  const body: Record<string, string> = {
    name: params.username,
    password: params.password,
    comment: params.comment,
  };
  const limitUptime = minutesToRouterOsDuration(params.durationMinutes);
  const limitBytesTotal = dataLimitMbToBytes(params.dataLimitMb);

  if (params.config.hotspotServer) body.server = params.config.hotspotServer;
  if (params.config.defaultProfile) body.profile = params.config.defaultProfile;
  if (limitUptime) body["limit-uptime"] = limitUptime;
  if (limitBytesTotal) body["limit-bytes-total"] = limitBytesTotal;

  try {
    const created = await mikrotikRequest<HotspotUserRow>(params.config, {
      method: "PUT",
      path: "/ip/hotspot/user",
      body,
    });
    return { status: "created" as const, user: created };
  } catch (error) {
    const afterFailure = await findHotspotUserByName(params.config, params.username).catch(() => null);
    if (afterFailure) {
      return { status: "already" as const, user: afterFailure };
    }
    throw error;
  }
}

export async function testMikrotikConnection(config: TenantMikrotikConfig) {
  const rows = await mikrotikRequest<SystemResourceRow[] | SystemResourceRow>(config, {
    method: "GET",
    path: "/system/resource",
    query: {
      ".proplist": "version,board-name,uptime",
    },
  });

  const resource = Array.isArray(rows) ? rows[0] ?? {} : rows ?? {};
  const probeUsername = `payspot-test-${randomUUID().slice(0, 8)}`;
  const created = await mikrotikRequest<HotspotUserRow>(config, {
    method: "PUT",
    path: "/ip/hotspot/user",
    body: {
      name: probeUsername,
      password: probeUsername,
      comment: "PaySpot MikroTik connection test",
      ...(config.hotspotServer ? { server: config.hotspotServer } : {}),
      ...(config.defaultProfile ? { profile: config.defaultProfile } : {}),
    },
  });

  const createdId = created[".id"] ?? (await findHotspotUserByName(config, probeUsername))?.[".id"];
  if (!createdId) {
    throw new Error("HotSpot test user was created but RouterOS did not return its identifier");
  }
  await mikrotikRequest<unknown>(config, {
    method: "DELETE",
    path: `/ip/hotspot/user/${encodeURIComponent(createdId)}`,
  });

  return {
    version: resource.version?.trim() || null,
    boardName: resource["board-name"]?.trim() || null,
    uptime: resource.uptime?.trim() || null,
  };
}
