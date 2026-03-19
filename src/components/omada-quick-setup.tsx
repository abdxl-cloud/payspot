"use client";

import { useState } from "react";

type Site = { siteId: string; name: string };
type DiscoverSitesDebug = {
  stage?: "token" | "site_list";
  attemptedBaseUrls?: string[];
  attemptedUrls?: string[];
  attempts?: Array<{ target: string; message: string }>;
};

type Props = {
  tenantSlug: string;
};

export function OmadaQuickSetup({ tenantSlug }: Props) {
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [omadacId, setOmadacId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [siteId, setSiteId] = useState("");

  const [sites, setSites] = useState<Site[]>([]);
  const [fetchingError, setFetchingError] = useState<string | null>(null);
  const [fetchingDebug, setFetchingDebug] = useState<DiscoverSitesDebug | null>(null);
  const [fetching, setFetching] = useState(false);
  const [browserTesting, setBrowserTesting] = useState(false);
  const [browserSitesTesting, setBrowserSitesTesting] = useState(false);
  const [browserTestMessage, setBrowserTestMessage] = useState<string | null>(null);
  const [browserTestKind, setBrowserTestKind] = useState<"ok" | "warn" | "error" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleFetchSites() {
    setFetchingError(null);
    setFetchingDebug(null);
    setSites([]);
    setFetching(true);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/voucher/discover-sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl, omadacId, clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFetchingError(data.error ?? "Failed to fetch sites");
        setFetchingDebug(data.debug ?? null);
        return;
      }
      setSites(data.sites ?? []);
      if (data.omadacId && !omadacId) setOmadacId(data.omadacId);
      if ((data.sites ?? []).length === 1) setSiteId(data.sites[0].siteId);
    } catch {
      setFetchingError("Network error — could not reach server");
    } finally {
      setFetching(false);
    }
  }

  async function handleSave() {
    setSaveError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/t/${tenantSlug}/voucher/save-omada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiBaseUrl, omadacId, siteId, clientId, clientSecret }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save");
        return;
      }
      setSaved(true);
      // Reload so the voucher page picks up the new Omada config
      window.location.reload();
    } catch {
      setSaveError("Network error — could not reach server");
    } finally {
      setSaving(false);
    }
  }

  async function handleBrowserDirectTest() {
    const base = apiBaseUrl.trim().replace(/\/+$/, "");
    if (!base) {
      setBrowserTestKind("error");
      setBrowserTestMessage("Enter API Base URL first.");
      return;
    }

    const tokenUrl = `${base}/openapi/authorize/token?grant_type=client_credentials`;
    setBrowserTesting(true);
    setBrowserTestKind(null);
    setBrowserTestMessage(null);

    try {
      const response = await fetch(tokenUrl, {
        method: "GET",
        cache: "no-store",
      });
      setBrowserTestKind("ok");
      setBrowserTestMessage(
        `Browser reached Omada directly (HTTP ${response.status}). This only proves browser connectivity.`,
      );
      return;
    } catch {
      // Distinguish likely CORS blocks from pure network failures:
      // if no-cors resolves, endpoint is reachable but not CORS-readable.
      try {
        await fetch(tokenUrl, {
          method: "GET",
          mode: "no-cors",
          cache: "no-store",
        });
        setBrowserTestKind("warn");
        setBrowserTestMessage(
          "Browser can reach endpoint, but response is not readable (likely CORS). Backend connectivity may still differ.",
        );
      } catch {
        setBrowserTestKind("error");
        setBrowserTestMessage(
          "Browser direct test failed to reach endpoint (network/DNS/TLS from this device).",
        );
      }
    } finally {
      setBrowserTesting(false);
    }
  }

  async function handleBrowserFetchSitesTest() {
    const base = apiBaseUrl.trim().replace(/\/+$/, "");
    const omadaId = omadacId.trim();
    const cid = clientId.trim();
    const csec = clientSecret.trim();
    if (!base || !omadaId || !cid || !csec) {
      setBrowserTestKind("error");
      setBrowserTestMessage("Fill API Base URL, Omada ID, Client ID, and Client Secret first.");
      return;
    }

    const tokenUrl = `${base}/openapi/authorize/token?grant_type=client_credentials`;
    setBrowserSitesTesting(true);
    setBrowserTestKind(null);
    setBrowserTestMessage(null);
    try {
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          omadacId: omadaId,
          client_id: cid,
          client_secret: csec,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const msg = typeof data?.msg === "string" ? data.msg : `HTTP ${response.status}`;
        setBrowserTestKind("error");
        setBrowserTestMessage(`Browser token POST failed: ${msg}`);
        return;
      }
      const token = data?.result?.accessToken as string | undefined;
      if (!(typeof data?.errorCode === "number" && data.errorCode === 0 && token)) {
        const apiMsg = typeof data?.msg === "string" ? data.msg : "Unexpected token response";
        setBrowserTestKind("warn");
        setBrowserTestMessage(`Browser reached token endpoint, but API returned: ${apiMsg}`);
        return;
      }

      const sitesUrl = `${base}/openapi/v1/${encodeURIComponent(omadaId)}/sites?page=1&pageSize=1000`;
      const sitesResponse = await fetch(sitesUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `AccessToken=${token}`,
        },
      });
      const sitesData = await sitesResponse.json().catch(() => null);
      if (!sitesResponse.ok) {
        const msg = typeof sitesData?.msg === "string" ? sitesData.msg : `HTTP ${sitesResponse.status}`;
        setBrowserTestKind("error");
        setBrowserTestMessage(`Browser fetch-sites failed: ${msg}`);
        return;
      }

      const errorCode = sitesData?.errorCode;
      const rows = sitesData?.result?.data;
      if (typeof errorCode === "number" && errorCode === 0 && Array.isArray(rows)) {
        setBrowserTestKind("ok");
        setBrowserTestMessage(
          `Browser fetch-sites succeeded (${rows.length} site${rows.length === 1 ? "" : "s"} found).`,
        );
        return;
      }

      const msg = typeof sitesData?.msg === "string" ? sitesData.msg : "Unexpected sites response";
      setBrowserTestKind("warn");
      setBrowserTestMessage(`Browser reached sites endpoint, but API returned: ${msg}`);
    } catch {
      setBrowserTestKind("error");
      setBrowserTestMessage(
        "Browser fetch-sites test failed (likely CORS, network, DNS, or TLS from this device).",
      );
    } finally {
      setBrowserSitesTesting(false);
    }
  }

  const canFetch = apiBaseUrl.trim() && clientId.trim() && clientSecret.trim();
  const canSave = canFetch && siteId.trim();

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-500">
        Omada controller — not configured
      </p>
      <p className="mt-1 text-sm text-amber-800">
        Fill in your Omada Open API credentials to enable live voucher status lookup.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">API Base URL</label>
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://192.168.1.100:8043"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Omada Controller ID</label>
          <input
            type="text"
            value={omadacId}
            onChange={(e) => setOmadacId(e.target.value)}
            placeholder="auto-filled after fetching sites"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Client ID</label>
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-slate-600">Client Secret</label>
          <input
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleFetchSites}
          disabled={!canFetch || fetching}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          {fetching ? "Fetching…" : "Fetch sites"}
        </button>
        {fetchingError && (
          <p className="text-xs text-red-600">{fetchingError}</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={handleBrowserDirectTest}
          disabled={!apiBaseUrl.trim() || browserTesting}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          {browserTesting ? "Testing browser…" : "Browser direct test (optional)"}
        </button>
        <button
          type="button"
          onClick={handleBrowserFetchSitesTest}
          disabled={!apiBaseUrl.trim() || !omadacId.trim() || !clientId.trim() || !clientSecret.trim() || browserSitesTesting}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
        >
          {browserSitesTesting ? "Testing fetch sites…" : "Browser fetch sites (optional)"}
        </button>
      </div>
      {browserTestMessage && (
        <p
          className={`mt-2 text-xs ${
            browserTestKind === "ok"
              ? "text-emerald-700"
              : browserTestKind === "warn"
              ? "text-amber-700"
              : "text-red-700"
          }`}
        >
          {browserTestMessage}
        </p>
      )}
      {fetchingDebug && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <p className="font-semibold">Debug details</p>
          <p className="mt-1">
            Stage: <span className="font-mono">{fetchingDebug.stage ?? "unknown"}</span>
          </p>
          {(fetchingDebug.attemptedBaseUrls ?? []).length > 0 && (
            <p className="mt-1 break-all">
              Base URLs:{" "}
              <span className="font-mono">
                {(fetchingDebug.attemptedBaseUrls ?? []).join(", ")}
              </span>
            </p>
          )}
          {(fetchingDebug.attempts ?? []).length > 0 && (
            <div className="mt-2 space-y-1">
              {(fetchingDebug.attempts ?? []).map((attempt, index) => (
                <p key={`${attempt.target}:${index}`} className="break-all">
                  <span className="font-mono">{attempt.target}</span>: {attempt.message}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {sites.length > 0 && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600">Site</label>
          <select
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            <option value="">Select a site…</option>
            {sites.map((s) => (
              <option key={s.siteId} value={s.siteId}>
                {s.name} ({s.siteId})
              </option>
            ))}
          </select>
        </div>
      )}

      {sites.length === 0 && siteId && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600">Site ID (manual)</label>
          <input
            type="text"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving || saved}
          className="rounded-xl bg-sky-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved!" : "Save"}
        </button>
        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
      </div>
    </div>
  );
}
