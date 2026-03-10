"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CaptivePortalContext } from "@/lib/captive-portal";

type Props = {
  tenantSlug: string;
  portalContext?: CaptivePortalContext;
  defaultUsername?: string;
  defaultPassword?: string;
  autoSubmitWhenReady?: boolean;
};

type StoredAuth = {
  username?: string;
  password?: string;
  savedAt?: number;
};

const STORAGE_KEY_PREFIX = "payspot:captive-auth:";
const AUTH_TYPE_EXTERNAL_RADIUS = "2";

function getStorageKey(tenantSlug: string) {
  return `${STORAGE_KEY_PREFIX}${tenantSlug}`;
}

function getStoredAuth(tenantSlug: string): StoredAuth | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(getStorageKey(tenantSlug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    return parsed;
  } catch {
    return null;
  }
}

function buildBrowserAuthUrl(context: CaptivePortalContext) {
  if (!context.target) return null;

  const hasProtocol = /^https?:\/\//i.test(context.target);
  if (hasProtocol) {
    try {
      const parsed = new URL(context.target);
      if (context.targetPort) {
        parsed.port = context.targetPort;
      }
      parsed.pathname = "/portal/radius/browserauth";
      parsed.search = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  const host = context.target.trim();
  if (!host) return null;
  const port = context.targetPort?.trim();
  return `http://${host}${port ? `:${port}` : ""}/portal/radius/browserauth`;
}

function createBrowserAuthFields(params: {
  context: CaptivePortalContext;
  username: string;
  password: string;
}) {
  const fields: Array<[string, string]> = [
    ["authType", AUTH_TYPE_EXTERNAL_RADIUS],
    ["username", params.username],
    ["password", params.password],
  ];

  if (params.context.clientMac) fields.push(["clientMac", params.context.clientMac]);
  if (params.context.clientIp) {
    fields.push(["clientIp", params.context.clientIp]);
    fields.push(["clientIP", params.context.clientIp]);
  }
  if (params.context.apMac) fields.push(["apMac", params.context.apMac]);
  if (params.context.gatewayMac) fields.push(["gatewayMac", params.context.gatewayMac]);
  if (params.context.ssidName) fields.push(["ssidName", params.context.ssidName]);
  if (params.context.radioId) fields.push(["radioId", params.context.radioId]);
  if (params.context.vid) fields.push(["vid", params.context.vid]);
  if (params.context.originUrl) fields.push(["originUrl", params.context.originUrl]);

  return fields;
}

function submitBrowserAuth(params: {
  actionUrl: string;
  context: CaptivePortalContext;
  username: string;
  password: string;
}) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = params.actionUrl;
  form.style.display = "none";

  const fields = createBrowserAuthFields({
    context: params.context,
    username: params.username,
    password: params.password,
  });

  for (const [name, value] of fields) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

function resolveBrowserAuthCredentials(params: {
  tenantSlug: string;
  manualUsername: string;
  manualPassword: string;
  defaultUsername?: string;
  defaultPassword?: string;
}) {
  const stored = getStoredAuth(params.tenantSlug);
  const username = (
    params.manualUsername.trim() ||
    params.defaultUsername?.trim() ||
    stored?.username?.trim() ||
    ""
  );
  const password = (
    params.manualPassword ||
    params.defaultPassword ||
    stored?.password ||
    ""
  ).trim();

  return { username, password };
}

export function CaptiveBrowserAuth({
  tenantSlug,
  portalContext,
  defaultUsername,
  defaultPassword,
  autoSubmitWhenReady = false,
}: Props) {
  const [manualUsername, setManualUsername] = useState(defaultUsername ?? "");
  const [manualPassword, setManualPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const autoSubmittedRef = useRef(false);

  const actionUrl = useMemo(
    () => (portalContext ? buildBrowserAuthUrl(portalContext) : null),
    [portalContext],
  );

  useEffect(() => {
    if (!autoSubmitWhenReady || autoSubmittedRef.current) {
      return;
    }

    if (!portalContext || !actionUrl) {
      return;
    }

    const { username, password } = resolveBrowserAuthCredentials({
      tenantSlug,
      manualUsername,
      manualPassword,
      defaultUsername,
      defaultPassword,
    });

    if (!username || !password) {
      return;
    }

    autoSubmittedRef.current = true;
    submitBrowserAuth({
      actionUrl,
      context: portalContext,
      username,
      password,
    });
  }, [
    actionUrl,
    autoSubmitWhenReady,
    defaultPassword,
    defaultUsername,
    manualPassword,
    manualUsername,
    portalContext,
    tenantSlug,
  ]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!portalContext || !actionUrl) {
      setError("Omada controller redirect data is missing. Reconnect to the Wi-Fi and try again.");
      return;
    }

    const { username, password } = resolveBrowserAuthCredentials({
      tenantSlug,
      manualUsername,
      manualPassword,
      defaultUsername,
      defaultPassword,
    });

    if (!username || !password) {
      setError("Enter your account email and password to complete Wi-Fi sign-in.");
      return;
    }

    submitBrowserAuth({
      actionUrl,
      context: portalContext,
      username,
      password,
    });
  }

  if (!portalContext) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-800">Complete Wi-Fi sign-in</p>
      <p className="text-xs text-slate-600">
        This sends your subscriber credentials back to the Omada controller so the captive portal can finish login.
      </p>
      {autoSubmitWhenReady ? (
        <p className="text-xs font-medium text-sky-700">
          If your saved subscriber credentials are available, PaySpot will continue sign-in automatically.
        </p>
      ) : null}
      <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor={`browserauth-email-${tenantSlug}`}>Email</Label>
          <Input
            id={`browserauth-email-${tenantSlug}`}
            type="email"
            value={manualUsername}
            onChange={(event) => setManualUsername(event.target.value)}
            placeholder={defaultUsername || "you@example.com"}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`browserauth-password-${tenantSlug}`}>Password</Label>
          <Input
            id={`browserauth-password-${tenantSlug}`}
            type="password"
            value={manualPassword}
            onChange={(event) => setManualPassword(event.target.value)}
            placeholder="Your subscriber password"
          />
        </div>
        {error ? <p className="text-xs text-rose-700 md:col-span-2">{error}</p> : null}
        <Button type="submit" className="md:col-span-2">
          Complete Wi-Fi sign-in
        </Button>
      </form>
    </div>
  );
}
