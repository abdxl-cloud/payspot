"use client";

import { useEffect, useRef, useState } from "react";
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

async function performBrowserAuth(params: {
  tenantSlug: string;
  context: CaptivePortalContext;
  username: string;
  password: string;
}) {
  const response = await fetch(`/api/t/${params.tenantSlug}/radius/browserauth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target: params.context.target,
      targetPort: params.context.targetPort,
      scheme: params.context.scheme,
      username: params.username,
      password: params.password,
      clientMac: params.context.clientMac,
      clientIp: params.context.clientIp,
      apMac: params.context.apMac,
      gatewayMac: params.context.gatewayMac,
      ssidName: params.context.ssidName,
      radioId: params.context.radioId,
      vid: params.context.vid,
      originUrl: params.context.originUrl,
    }),
  });

  const data = await response.json() as {
    controllerUrl?: string;
    formFields?: Record<string, string>;
    error?: string;
  };

  if (!response.ok || !data.controllerUrl || !data.formFields) {
    throw new Error(data.error ?? "Authentication failed");
  }

  // Submit a form directly from the browser to the Omada controller.
  // The controller is on the client's local network and may not be reachable from
  // our cloud server, so the POST must originate from the client's browser.
  // A form navigation from an HTTPS page to an HTTP LAN address is permitted
  // by browsers (it is a top-level navigation, not a subresource fetch).
  const form = document.createElement("form");
  form.method = "POST";
  form.action = data.controllerUrl;
  for (const [key, value] of Object.entries(data.formFields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmittedRef = useRef(false);

  const hasTarget = Boolean(portalContext?.target);

  useEffect(() => {
    if (!autoSubmitWhenReady || autoSubmittedRef.current) {
      return;
    }

    if (!portalContext || !hasTarget) {
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
    const timeoutId = window.setTimeout(() => {
      setIsSubmitting(true);
      performBrowserAuth({ tenantSlug, context: portalContext, username, password })
        .catch((err: unknown) => {
          autoSubmittedRef.current = false;
          setIsSubmitting(false);
          setError(err instanceof Error ? err.message : "Authentication failed");
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    hasTarget,
    autoSubmitWhenReady,
    defaultPassword,
    defaultUsername,
    manualPassword,
    manualUsername,
    portalContext,
    tenantSlug,
  ]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!portalContext || !hasTarget) {
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

    setIsSubmitting(true);
    try {
      await performBrowserAuth({ tenantSlug, context: portalContext, username, password });
    } catch (err) {
      setIsSubmitting(false);
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
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
            disabled={isSubmitting}
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
            disabled={isSubmitting}
          />
        </div>
        {error ? <p className="text-xs text-rose-700 md:col-span-2">{error}</p> : null}
        <Button type="submit" className="md:col-span-2" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Complete Wi-Fi sign-in"}
        </Button>
      </form>
    </div>
  );
}
