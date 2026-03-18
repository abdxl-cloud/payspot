"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readJsonResponse } from "@/lib/http";

type VoucherStat = {
  code: string;
  name: string;
  total: number;
  unused: number;
  assigned: number;
  percentageRemaining: number;
};

type AdminStats = {
  voucherPool: VoucherStat[];
  transactions: {
    total: number;
    success: number;
    pending: number;
    processing: number;
    failed: number;
    revenueNgn: number;
  };
};

type PlanRow = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number | null;
  priceNgn: number;
  maxDevices: number | null;
  bandwidthProfile: string | null;
  dataLimitMb: number | null;
  availableFrom: string | null;
  availableTo: string | null;
  active: number;
  totalCount: number;
  unusedCount: number;
  assignedCount: number;
};

type VoucherRow = {
  id: string;
  voucherCode: string;
  status: "UNUSED" | "ASSIGNED";
  packageId: string;
  packageCode: string;
  packageName: string;
  createdAt: string;
  assignedAt: string | null;
  assignedToEmail: string | null;
  assignedToPhone: string | null;
};

type ArchitectureConfig = {
  accessMode: "voucher_access" | "account_access";
  voucherSourceMode: "import_csv" | "omada_openapi" | "mikrotik_rest";
  omada: {
    apiBaseUrl: string;
    omadacId: string;
    siteId: string;
    clientId: string;
    hasClientSecret: boolean;
    hotspotOperatorUsername: string;
    hasHotspotOperatorPassword: boolean;
  };
  mikrotik: {
    baseUrl: string;
    username: string;
    hasPassword: boolean;
    hotspotServer: string;
    defaultProfile: string;
    verifyTls: boolean;
  };
  radius: {
    hasAdapterSecret: boolean;
    adapterSecretLast4: string;
  };
};

type SubscriberOverviewRow = {
  subscriberId: string;
  email: string;
  phone: string | null;
  fullName: string | null;
  status: string;
  activeSessions: number;
  entitlement: null | {
    id: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    maxDevices: number | null;
    bandwidthProfile: string | null;
    dataLimitMb: number | null;
    planName: string | null;
    planCode: string | null;
  };
};

type OmadaSiteOption = {
  siteId: string;
  name: string;
};

type Props = {
  tenantSlug: string;
};

const PAGE_SIZE = 20;

function money(value: number) {
  return `NGN ${Math.round(value || 0).toLocaleString()}`;
}

function dt(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString();
}

function parseDurationToMinutes(input: string): number | undefined {
  const raw = input.trim().toLowerCase();
  if (!raw) return undefined;

  const matched = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)?$/i);
  if (!matched) return Number.NaN;

  const value = Number.parseFloat(matched[1]);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;

  const unit = (matched[2] || "m").toLowerCase();
  const factor =
    unit === "w" || unit === "week" || unit === "weeks"
      ? 7 * 24 * 60
      : unit === "d" || unit === "day" || unit === "days"
        ? 24 * 60
        : unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours"
          ? 60
          : 1;
  return Math.round(value * factor);
}

function parsePriceToNgn(input: string): number | undefined {
  const raw = input.trim().toLowerCase();
  if (!raw) return undefined;

  const cleaned = raw.replace(/[\s,₦]/g, "").replace(/^ngn/, "");
  const matched = cleaned.match(/^([0-9]+(?:\.[0-9]+)?)(k|m|b)?$/i);
  if (!matched) return Number.NaN;

  const value = Number.parseFloat(matched[1]);
  if (!Number.isFinite(value) || value < 0) return Number.NaN;

  const suffix = (matched[2] || "").toLowerCase();
  const factor = suffix === "b" ? 1_000_000_000 : suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
  return Math.round(value * factor);
}

function parseDataLimitToMb(input: string): number | undefined {
  const raw = input.trim().toLowerCase();
  if (!raw) return undefined;

  const matched = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*(mb|m|gb|g|tb|t)?$/i);
  if (!matched) return Number.NaN;

  const value = Number.parseFloat(matched[1]);
  if (!Number.isFinite(value) || value <= 0) return Number.NaN;

  const unit = (matched[2] || "mb").toLowerCase();
  const factor =
    unit === "tb" || unit === "t"
      ? 1024 * 1024
      : unit === "gb" || unit === "g"
        ? 1024
        : 1;

  return Math.round(value * factor);
}

function formatDurationPreview(minutes: number) {
  if (minutes % (7 * 24 * 60) === 0) return `${minutes / (7 * 24 * 60)} week(s)`;
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)} day(s)`;
  if (minutes % 60 === 0) return `${minutes / 60} hour(s)`;
  return `${minutes} minute(s)`;
}

function formatDataLimitPreviewMb(mb: number) {
  if (mb >= 1024 * 1024) return `${(mb / (1024 * 1024)).toFixed(2).replace(/\.00$/, "")} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2).replace(/\.00$/, "")} GB`;
  return `${mb} MB`;
}

function isoToLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function TenantAdminPanel({ tenantSlug }: Props) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  const [architecture, setArchitecture] = useState<ArchitectureConfig | null>(null);
  const [architectureError, setArchitectureError] = useState<string | null>(null);
  const [architectureLoading, setArchitectureLoading] = useState(false);
  const [architectureSaving, setArchitectureSaving] = useState(false);
  const [architectureNotice, setArchitectureNotice] = useState<string | null>(null);
  const [omadaTestLoading, setOmadaTestLoading] = useState(false);
  const [omadaTestNotice, setOmadaTestNotice] = useState<string | null>(null);
  const [omadaTestError, setOmadaTestError] = useState<string | null>(null);
  const [omadaSitesLoading, setOmadaSitesLoading] = useState(false);
  const [omadaSitesError, setOmadaSitesError] = useState<string | null>(null);
  const [omadaSitesNotice, setOmadaSitesNotice] = useState<string | null>(null);
  const [omadaSiteOptions, setOmadaSiteOptions] = useState<OmadaSiteOption[]>([]);
  const [omadaClientSecret, setOmadaClientSecret] = useState("");
  const [omadaHotspotOperatorPassword, setOmadaHotspotOperatorPassword] = useState("");
  const [mikrotikTestLoading, setMikrotikTestLoading] = useState(false);
  const [mikrotikTestNotice, setMikrotikTestNotice] = useState<string | null>(null);
  const [mikrotikTestError, setMikrotikTestError] = useState<string | null>(null);
  const [mikrotikPassword, setMikrotikPassword] = useState("");

  const [vouchers, setVouchers] = useState<VoucherRow[]>([]);
  const [vouchersError, setVouchersError] = useState<string | null>(null);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [voucherNotice, setVoucherNotice] = useState<string | null>(null);
  const [voucherQuery, setVoucherQuery] = useState("");
  const [voucherStatus, setVoucherStatus] = useState("all");
  const [voucherPlan, setVoucherPlan] = useState("all");
  const [voucherPage, setVoucherPage] = useState(1);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [voucherTotalPages, setVoucherTotalPages] = useState(1);
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);

  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDuration, setNewPlanDuration] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [newPlanMaxDevices, setNewPlanMaxDevices] = useState("");
  const [newPlanBandwidthProfile, setNewPlanBandwidthProfile] = useState("");
  const [newPlanDataLimitMb, setNewPlanDataLimitMb] = useState("");
  const [newPlanAvailableFrom, setNewPlanAvailableFrom] = useState("");
  const [newPlanAvailableTo, setNewPlanAvailableTo] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);

  const [planDrafts, setPlanDrafts] = useState<
    Record<string, {
      name: string;
      code: string;
      duration: string;
      price: string;
      maxDevices: string;
      bandwidthProfile: string;
      dataLimitMb: string;
      availableFrom: string;
      availableTo: string;
      active: boolean;
    }>
  >({});
  const [savingPlanIds, setSavingPlanIds] = useState<Record<string, boolean>>({});
  const [deletingPlanIds, setDeletingPlanIds] = useState<Record<string, boolean>>({});

  const [newVoucherCode, setNewVoucherCode] = useState("");
  const [newVoucherPackageId, setNewVoucherPackageId] = useState("");
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [generateCount, setGenerateCount] = useState("20");
  const [generatePrefix, setGeneratePrefix] = useState("");
  const [generateCodeLength, setGenerateCodeLength] = useState("10");
  const [generatingVouchers, setGeneratingVouchers] = useState(false);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importPackageCode, setImportPackageCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [showCreateVoucherModal, setShowCreateVoucherModal] = useState(false);
  const [showGenerateVoucherModal, setShowGenerateVoucherModal] = useState(false);
  const [showImportVoucherModal, setShowImportVoucherModal] = useState(false);
  const [showQuickActionsModal, setShowQuickActionsModal] = useState(false);
  const [subscribers, setSubscribers] = useState<SubscriberOverviewRow[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersError, setSubscribersError] = useState<string | null>(null);
  const parsedNewPlanDuration = useMemo(
    () => parseDurationToMinutes(newPlanDuration),
    [newPlanDuration],
  );
  const parsedNewPlanPrice = useMemo(
    () => parsePriceToNgn(newPlanPrice),
    [newPlanPrice],
  );
  const parsedNewPlanDataLimit = useMemo(
    () => parseDataLimitToMb(newPlanDataLimitMb),
    [newPlanDataLimitMb],
  );

  const loadStats = useCallback(async () => {
    setStatsError(null);
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/stats`);
      const data = await readJsonResponse<{ error?: string; stats?: AdminStats }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load stats.");
      setStats(data?.stats ?? null);
    } catch (error) {
      setStats(null);
      setStatsError(error instanceof Error ? error.message : "Unable to load stats.");
    } finally {
      setStatsLoading(false);
    }
  }, [tenantSlug]);

  const loadPlans = useCallback(async () => {
    setPlansError(null);
    setPlansLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`);
      const data = await readJsonResponse<{ error?: string; plans?: PlanRow[] }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load plans.");
      setPlans(data?.plans ?? []);
    } catch (error) {
      setPlans([]);
      setPlansError(error instanceof Error ? error.message : "Unable to load plans.");
    } finally {
      setPlansLoading(false);
    }
  }, [tenantSlug]);

  const loadArchitecture = useCallback(async () => {
    setArchitectureError(null);
    setArchitectureLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/architecture`);
      const data = await readJsonResponse<{ error?: string; architecture?: ArchitectureConfig }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load architecture settings.");
      setArchitecture(data?.architecture ?? null);
    } catch (error) {
      setArchitecture(null);
      setArchitectureError(
        error instanceof Error ? error.message : "Unable to load architecture settings.",
      );
    } finally {
      setArchitectureLoading(false);
    }
  }, [tenantSlug]);

  const loadSubscribers = useCallback(async () => {
    setSubscribersError(null);
    setSubscribersLoading(true);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/subscribers`);
      const data = await readJsonResponse<{ error?: string; subscribers?: SubscriberOverviewRow[] }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load subscribers.");
      setSubscribers(data?.subscribers ?? []);
    } catch (error) {
      setSubscribers([]);
      setSubscribersError(error instanceof Error ? error.message : "Unable to load subscribers.");
    } finally {
      setSubscribersLoading(false);
    }
  }, [tenantSlug]);

  const loadVouchers = useCallback(async () => {
    setVouchersError(null);
    setVouchersLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(voucherPage),
        pageSize: String(PAGE_SIZE),
      });
      if (voucherQuery.trim()) params.set("q", voucherQuery.trim());
      if (voucherStatus !== "all") params.set("status", voucherStatus);
      if (voucherPlan !== "all") params.set("packageId", voucherPlan);

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers?${params.toString()}`);
      const data = await readJsonResponse<{
        error?: string;
        vouchers?: VoucherRow[];
        pagination?: { total: number; totalPages: number };
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to load vouchers.");
      setVouchers(data?.vouchers ?? []);
      setVoucherTotal(data?.pagination?.total ?? 0);
      setVoucherTotalPages(data?.pagination?.totalPages ?? 1);
      setSelectedVoucherIds([]);
    } catch (error) {
      setVouchers([]);
      setVouchersError(error instanceof Error ? error.message : "Unable to load vouchers.");
    } finally {
      setVouchersLoading(false);
    }
  }, [tenantSlug, voucherPage, voucherPlan, voucherQuery, voucherStatus]);

  useEffect(() => {
    void loadStats();
    void loadPlans();
    void loadArchitecture();
    void loadSubscribers();
  }, [loadArchitecture, loadPlans, loadStats, loadSubscribers]);

  useEffect(() => {
    void loadVouchers();
  }, [loadVouchers]);

  useEffect(() => {
    setVoucherPage(1);
  }, [voucherQuery, voucherStatus, voucherPlan]);

  useEffect(() => {
    const drafts: Record<string, {
      name: string;
      code: string;
      duration: string;
      price: string;
      maxDevices: string;
      bandwidthProfile: string;
      dataLimitMb: string;
      availableFrom: string;
      availableTo: string;
      active: boolean;
    }> = {};
    for (const plan of plans) {
      drafts[plan.id] = {
        name: plan.name,
        code: plan.code,
        duration: plan.durationMinutes === null ? "" : String(plan.durationMinutes),
        price: String(plan.priceNgn),
        maxDevices: plan.maxDevices === null ? "" : String(plan.maxDevices),
        bandwidthProfile: plan.bandwidthProfile ?? "",
        dataLimitMb: plan.dataLimitMb ? String(plan.dataLimitMb) : "",
        availableFrom: isoToLocalInput(plan.availableFrom),
        availableTo: isoToLocalInput(plan.availableTo),
        active: plan.active === 1,
      };
    }
    setPlanDrafts(drafts);
    if (!newVoucherPackageId && plans.length > 0) setNewVoucherPackageId(plans[0].id);
  }, [plans, newVoucherPackageId]);

  const voucherTotals = useMemo(() => {
    return (stats?.voucherPool ?? []).reduce(
      (acc, item) => {
        acc.total += item.total;
        acc.unused += item.unused;
        acc.assigned += item.assigned;
        return acc;
      },
      { total: 0, unused: 0, assigned: 0 },
    );
  }, [stats]);

  const voucherSourceMode = architecture?.voucherSourceMode ?? null;
  const isCsvMode = voucherSourceMode === "import_csv";
  const isOmadaMode = voucherSourceMode === "omada_openapi";
  const isMikrotikMode = voucherSourceMode === "mikrotik_rest";
  const isApiAutomationMode = isOmadaMode || isMikrotikMode;
  const isExternalAccessMode = architecture?.accessMode === "account_access";
  const hasArchitectureConfigured = !!architecture;
  const hasPlans = plans.length > 0;

  async function refreshAll() {
    await Promise.all([loadStats(), loadPlans(), loadVouchers(), loadArchitecture(), loadSubscribers()]);
  }

  function jumpToVoucherTools() {
    setShowQuickActionsModal(true);
  }

  async function saveArchitecture(event: React.FormEvent) {
    event.preventDefault();
    if (!architecture) return;

    setArchitectureSaving(true);
    setArchitectureError(null);
    setArchitectureNotice(null);
    setMikrotikTestError(null);
    setMikrotikTestNotice(null);
    setOmadaTestError(null);
    setOmadaTestNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/architecture`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessMode: architecture.accessMode,
          voucherSourceMode: architecture.voucherSourceMode,
          omada: {
            apiBaseUrl: architecture.omada.apiBaseUrl.trim(),
            omadacId: architecture.omada.omadacId.trim(),
            siteId: architecture.omada.siteId.trim(),
            clientId: architecture.omada.clientId.trim(),
            clientSecret: omadaClientSecret || undefined,
            hotspotOperatorUsername: architecture.omada.hotspotOperatorUsername.trim(),
            hotspotOperatorPassword: omadaHotspotOperatorPassword || undefined,
          },
          mikrotik: {
            baseUrl: architecture.mikrotik.baseUrl.trim(),
            username: architecture.mikrotik.username.trim(),
            password: mikrotikPassword || undefined,
            hotspotServer: architecture.mikrotik.hotspotServer.trim(),
            defaultProfile: architecture.mikrotik.defaultProfile.trim(),
            verifyTls: architecture.mikrotik.verifyTls,
          },
        }),
      });
      const data = await readJsonResponse<{ error?: string; architecture?: ArchitectureConfig }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save architecture settings.");
      setArchitecture(data?.architecture ?? architecture);
      setArchitectureNotice("Architecture settings saved.");
      setOmadaClientSecret("");
      setOmadaHotspotOperatorPassword("");
      setMikrotikPassword("");
      setShowArchitectureModal(false);
    } catch (error) {
      setArchitectureError(
        error instanceof Error ? error.message : "Unable to save architecture settings.",
      );
    } finally {
      setArchitectureSaving(false);
    }
  }

  async function testOmadaConnection() {
    if (!architecture) return;

    setOmadaTestLoading(true);
    setOmadaTestError(null);
    setOmadaTestNotice(null);

    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/architecture/test-omada`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          omada: {
            apiBaseUrl: architecture.omada.apiBaseUrl.trim(),
            omadacId: architecture.omada.omadacId.trim(),
            siteId: architecture.omada.siteId.trim(),
            clientId: architecture.omada.clientId.trim(),
            clientSecret: omadaClientSecret || undefined,
          },
        }),
      });
      const data = await readJsonResponse<{ error?: string; message?: string; latencyMs?: number }>(response);
      if (!response.ok) {
        const fallback = `Omada test failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
        throw new Error(data?.error || fallback);
      }
      const latency = typeof data?.latencyMs === "number" ? ` (${data.latencyMs}ms)` : "";
      setOmadaTestNotice(`${data?.message || "Omada connection successful."}${latency}`);
    } catch (error) {
      setOmadaTestError(error instanceof Error ? error.message : "Omada test failed.");
    } finally {
      setOmadaTestLoading(false);
    }
  }

  async function testMikrotikConnection() {
    if (!architecture) return;

    setMikrotikTestLoading(true);
    setMikrotikTestError(null);
    setMikrotikTestNotice(null);

    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/architecture/test-mikrotik`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mikrotik: {
            baseUrl: architecture.mikrotik.baseUrl.trim(),
            username: architecture.mikrotik.username.trim(),
            password: mikrotikPassword || undefined,
            hotspotServer: architecture.mikrotik.hotspotServer.trim(),
            defaultProfile: architecture.mikrotik.defaultProfile.trim(),
            verifyTls: architecture.mikrotik.verifyTls,
          },
        }),
      });
      const data = await readJsonResponse<{
        error?: string;
        message?: string;
        latencyMs?: number;
        info?: { version?: string | null; boardName?: string | null; uptime?: string | null };
      }>(response);
      if (!response.ok) {
        const fallback = `MikroTik test failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
        throw new Error(data?.error || fallback);
      }
      const latency = typeof data?.latencyMs === "number" ? ` (${data.latencyMs}ms)` : "";
      const details = [
        data?.info?.boardName ? `board ${data.info.boardName}` : null,
        data?.info?.version ? `RouterOS ${data.info.version}` : null,
        data?.info?.uptime ? `uptime ${data.info.uptime}` : null,
      ].filter(Boolean).join(" | ");
      setMikrotikTestNotice(
        `${data?.message || "MikroTik connection successful."}${latency}${details ? ` | ${details}` : ""}`,
      );
    } catch (error) {
      setMikrotikTestError(error instanceof Error ? error.message : "MikroTik test failed.");
    } finally {
      setMikrotikTestLoading(false);
    }
  }

  async function discoverOmadaSites() {
    if (!architecture) return;

    setOmadaSitesLoading(true);
    setOmadaSitesError(null);
    setOmadaSitesNotice(null);

    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/architecture/discover-sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          omada: {
            apiBaseUrl: architecture.omada.apiBaseUrl.trim(),
            omadacId: architecture.omada.omadacId.trim(),
            clientId: architecture.omada.clientId.trim(),
            clientSecret: omadaClientSecret || undefined,
          },
        }),
      });

      const data = await readJsonResponse<{
        error?: string;
        sites?: OmadaSiteOption[];
        omadacId?: string;
      }>(response);
      if (!response.ok) {
        const fallback = `Omada site discovery failed (HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}).`;
        throw new Error(data?.error || fallback);
      }

      const sites = (data?.sites ?? []).filter((site) => site?.siteId);
      setOmadaSiteOptions(sites);
      if (sites.length === 0) {
        setOmadaSitesNotice("No sites were returned by Omada for the supplied Omada ID.");
        return;
      }

      if (sites.length === 1) {
        setArchitecture((prev) =>
          prev
            ? {
                ...prev,
                omada: { ...prev.omada, siteId: sites[0].siteId },
              }
            : prev,
        );
      }

      setOmadaSitesNotice(
        sites.length === 1
          ? `Found 1 site and selected it automatically (${sites[0].siteId}).`
          : `Found ${sites.length} sites. Select one below to fill Site ID.`,
      );
    } catch (error) {
      setOmadaSitesError(error instanceof Error ? error.message : "Unable to discover Omada sites.");
    } finally {
      setOmadaSitesLoading(false);
    }
  }

  async function createPlan(event: React.FormEvent) {
    event.preventDefault();
    const duration = parseDurationToMinutes(newPlanDuration);
    const price = parsePriceToNgn(newPlanPrice);
    const maxDevices = newPlanMaxDevices.trim()
      ? Number.parseInt(newPlanMaxDevices, 10)
      : null;
    const dataLimitMb = parseDataLimitToMb(newPlanDataLimitMb);
    const availableFrom = localInputToIso(newPlanAvailableFrom);
    const availableTo = localInputToIso(newPlanAvailableTo);
    const normalizedDuration = duration ?? null;
    const normalizedDataLimit = dataLimitMb ?? null;
    const durationRequired =
      architecture?.accessMode !== "account_access" &&
      architecture?.voucherSourceMode !== "mikrotik_rest";
    if (
      !newPlanName.trim() ||
      (normalizedDuration !== null && (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0)) ||
      price === undefined ||
      !Number.isFinite(price) ||
      price < 0 ||
      (maxDevices !== null && (!Number.isFinite(maxDevices) || maxDevices < 1)) ||
      (normalizedDataLimit !== null && (!Number.isFinite(normalizedDataLimit) || normalizedDataLimit < 1)) ||
      availableFrom === undefined ||
      availableTo === undefined
    ) {
      setPlansError("Provide valid plan name, duration (e.g. 1h/2d), and price (e.g. 25k).");
      return;
    }
    if (availableFrom && availableTo && new Date(availableFrom).getTime() > new Date(availableTo).getTime()) {
      setPlansError("Plan available-from must be before available-to.");
      return;
    }
    if (durationRequired && normalizedDuration === null) {
      setPlansError("Duration is required unless you are using MikroTik direct mode.");
      return;
    }
    if (normalizedDuration === null && normalizedDataLimit === null) {
      setPlansError("Set at least one limit: duration or data.");
      return;
    }
    setCreatingPlan(true);
    setPlansError(null);
    setPlanNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlanName.trim(),
          durationMinutes: normalizedDuration,
          priceNgn: price,
          maxDevices,
          bandwidthProfile: newPlanBandwidthProfile.trim() || undefined,
          dataLimitMb: normalizedDataLimit,
          availableFrom,
          availableTo,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to create plan.");
      setPlanNotice("Plan created.");
      setNewPlanName("");
      setNewPlanDuration("");
      setNewPlanPrice("");
      setNewPlanMaxDevices("");
      setNewPlanBandwidthProfile("");
      setNewPlanDataLimitMb("");
      setNewPlanAvailableFrom("");
      setNewPlanAvailableTo("");
      setShowCreatePlanModal(false);
      await Promise.all([loadPlans(), loadStats()]);
    } catch (error) {
      setPlansError(error instanceof Error ? error.message : "Unable to create plan.");
    } finally {
      setCreatingPlan(false);
    }
  }

  async function savePlan(plan: PlanRow) {
    const draft = planDrafts[plan.id];
    if (!draft) return;
    const duration = parseDurationToMinutes(draft.duration);
    const price = parsePriceToNgn(draft.price);
    const maxDevices = draft.maxDevices.trim()
      ? Number.parseInt(draft.maxDevices, 10)
      : null;
    const parsedDataLimit = parseDataLimitToMb(draft.dataLimitMb);
    const dataLimitMb = draft.dataLimitMb.trim() ? parsedDataLimit : null;
    const availableFrom = localInputToIso(draft.availableFrom);
    const availableTo = localInputToIso(draft.availableTo);
    const normalizedDuration = draft.duration.trim() ? duration ?? null : null;
    const durationRequired =
      architecture?.accessMode !== "account_access" &&
      architecture?.voucherSourceMode !== "mikrotik_rest";
    if (
      !draft.name.trim() ||
      !draft.code.trim() ||
      (normalizedDuration !== null && (!Number.isFinite(normalizedDuration) || normalizedDuration <= 0)) ||
      price === undefined ||
      !Number.isFinite(price) ||
      price < 0 ||
      (maxDevices !== null && (!Number.isFinite(maxDevices) || maxDevices < 1)) ||
      (dataLimitMb != null && (!Number.isFinite(dataLimitMb) || dataLimitMb < 1)) ||
      availableFrom === undefined ||
      availableTo === undefined
    ) {
      setPlansError(`Invalid values for ${plan.name}.`);
      return;
    }
    if (availableFrom && availableTo && new Date(availableFrom).getTime() > new Date(availableTo).getTime()) {
      setPlansError(`Availability window is invalid for ${plan.name}.`);
      return;
    }
    if (durationRequired && normalizedDuration === null) {
      setPlansError("Duration is required unless you are using MikroTik direct mode.");
      return;
    }
    if (normalizedDuration === null && dataLimitMb === null) {
      setPlansError("Set at least one limit: duration or data.");
      return;
    }
    setSavingPlanIds((prev) => ({ ...prev, [plan.id]: true }));
    setPlansError(null);
    setPlanNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan.id,
          name: draft.name.trim(),
          code: draft.code.trim(),
          durationMinutes: normalizedDuration,
          priceNgn: price,
          maxDevices,
          bandwidthProfile: draft.bandwidthProfile.trim() || null,
          dataLimitMb,
          availableFrom,
          availableTo,
          active: draft.active,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save plan.");
      setPlanNotice(`Saved ${draft.name}.`);
      await Promise.all([loadPlans(), loadStats(), loadVouchers()]);
    } catch (error) {
      setPlansError(error instanceof Error ? error.message : "Unable to save plan.");
    } finally {
      setSavingPlanIds((prev) => ({ ...prev, [plan.id]: false }));
    }
  }

  async function deletePlan(plan: PlanRow) {
    const ok = window.confirm(`Delete plan "${plan.name}" and all its vouchers?`);
    if (!ok) return;

    setDeletingPlanIds((prev) => ({ ...prev, [plan.id]: true }));
    setPlansError(null);
    setPlanNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/plans`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to delete plan.");
      setPlanNotice(`Deleted ${plan.name}.`);
      await Promise.all([loadPlans(), loadStats(), loadVouchers()]);
    } catch (error) {
      setPlansError(error instanceof Error ? error.message : "Unable to delete plan.");
    } finally {
      setDeletingPlanIds((prev) => ({ ...prev, [plan.id]: false }));
    }
  }

  async function createVoucher(event: React.FormEvent) {
    event.preventDefault();
    if (!newVoucherCode.trim() || !newVoucherPackageId) {
      setVouchersError("Voucher code and plan are required.");
      return;
    }
    setCreatingVoucher(true);
    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voucherCode: newVoucherCode.trim(),
          packageId: newVoucherPackageId,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to create voucher.");
      setVoucherNotice("Voucher created.");
      setNewVoucherCode("");
      setShowCreateVoucherModal(false);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to create voucher.");
    } finally {
      setCreatingVoucher(false);
    }
  }

  async function generateVouchers(event: React.FormEvent) {
    event.preventDefault();
    if (!newVoucherPackageId) {
      setVouchersError("Plan is required.");
      return;
    }

    const count = Number.parseInt(generateCount, 10);
    if (!Number.isFinite(count) || count <= 0) {
      setVouchersError("Provide a valid quantity.");
      return;
    }

    const codeLength = Number.parseInt(generateCodeLength, 10);
    if (!Number.isFinite(codeLength) || codeLength <= 0) {
      setVouchersError("Provide a valid code length.");
      return;
    }

    setGeneratingVouchers(true);
    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: newVoucherPackageId,
          generateCount: count,
          prefix: generatePrefix.trim() || undefined,
          codeLength,
        }),
      });
      const data = await readJsonResponse<{ error?: string; created?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to auto-generate vouchers.");
      setVoucherNotice(`Generated ${data?.created ?? 0} voucher(s).`);
      setShowGenerateVoucherModal(false);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to auto-generate vouchers.");
    } finally {
      setGeneratingVouchers(false);
    }
  }

  async function reclaimSelected() {
    if (selectedVoucherIds.length === 0) return;
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherIds: selectedVoucherIds, status: "UNUSED" }),
      });
      const data = await readJsonResponse<{ error?: string; updated?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to reclaim vouchers.");
      setVoucherNotice(`Reclaimed ${data?.updated ?? 0} voucher(s).`);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to reclaim vouchers.");
    }
  }

  async function deleteSelected() {
    if (selectedVoucherIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedVoucherIds.length} selected voucher(s)?`);
    if (!ok) return;
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherIds: selectedVoucherIds }),
      });
      const data = await readJsonResponse<{ error?: string; deleted?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to delete vouchers.");
      setVoucherNotice(`Deleted ${data?.deleted ?? 0} voucher(s).`);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to delete vouchers.");
    }
  }

  async function importCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile) {
      setImportError("Choose a CSV file.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const form = new FormData();
      form.append("file", csvFile);
      if (importPackageCode.trim()) form.append("packageCode", importPackageCode.trim());
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: form,
      });
      const data = await readJsonResponse<{
        error?: string;
        imported?: number;
        duplicates?: number;
        skipped?: number;
        packagesCreated?: number;
      }>(response);
      if (!response.ok) throw new Error(data?.error || "Import failed.");
      setImportNotice(
        `Imported ${data?.imported ?? 0} | Duplicates ${data?.duplicates ?? 0} | Skipped ${data?.skipped ?? 0} | Plans created ${data?.packagesCreated ?? 0}`,
      );
      setCsvFile(null);
      setImportPackageCode("");
      setShowImportVoucherModal(false);
      await refreshAll();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setImportLoading(false);
    }
  }

  return (
    <>
      <div className="grid gap-5">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={refreshAll}
            disabled={statsLoading || plansLoading || vouchersLoading}
            aria-label="Refresh dashboard data"
            title="Refresh all"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-50"
          >
            <RefreshCw className={["size-3.5", statsLoading || plansLoading || vouchersLoading ? "animate-spin" : ""].join(" ")} />
            Refresh
          </button>
          <button
            type="button"
            onClick={jumpToVoucherTools}
            aria-label="Quick actions"
            title="Quick actions"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-indigo-200 hover:text-indigo-600"
          >
            <Plus className="size-3.5" />
            Quick actions
          </button>
        </div>
        <div className="grid gap-3 grid-cols-2 [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child]:col-span-1 lg:grid-cols-5">
          <StatTile label="Revenue" value={money(stats?.transactions.revenueNgn ?? 0)} />
          <StatTile label="Successful payments" value={String(stats?.transactions.success ?? 0)} />
          <StatTile label="Total vouchers" value={String(voucherTotals.total)} />
          <StatTile label="Unused vouchers" value={String(voucherTotals.unused)} />
          <StatTile label="Assigned vouchers" value={String(voucherTotals.assigned)} />
        </div>

        {(stats?.voucherPool.length ?? 0) > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats?.voucherPool.slice(0, 6).map((item) => (
              <div key={item.code} className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-[var(--shadow-sm)] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight text-slate-900">{item.name}</p>
                  <span className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    item.percentageRemaining > 30
                      ? "bg-emerald-100 text-emerald-700"
                      : item.percentageRemaining > 10
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700",
                  ].join(" ")}>
                    {item.percentageRemaining.toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.unused}/{item.total} unused</p>
                <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                  <div
                    className={[
                      "h-1.5 rounded-full transition-all duration-500",
                      item.percentageRemaining > 30
                        ? "bg-emerald-500"
                        : item.percentageRemaining > 10
                          ? "bg-amber-500"
                          : "bg-rose-500",
                    ].join(" ")}
                    style={{ width: `${Math.min(100, Math.max(0, item.percentageRemaining))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {statsError ? (
          <Alert variant="destructive">
            <AlertTitle>Stats failed</AlertTitle>
            <AlertDescription>{statsError}</AlertDescription>
          </Alert>
        ) : null}

        <section id="ops-subscribers" className="panel-surface">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="section-kicker">Live</p>
              <h2 className="mt-1 section-title">Subscriber monitoring</h2>
              <p className="mt-1 text-sm text-slate-600">
                Monitor active plans, live sessions, and policy limits for account-based access.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={loadSubscribers} disabled={subscribersLoading}>
              {subscribersLoading ? "Refreshing..." : "Refresh subscribers"}
            </Button>
          </div>
          {subscribersError ? (
            <Alert variant="destructive" className="mt-3">
              <AlertTitle>Subscribers failed</AlertTitle>
              <AlertDescription>{subscribersError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="mt-3 space-y-2">
            {subscribers.length === 0 && !subscribersLoading ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-500">
                No subscribers yet.
              </p>
            ) : null}
            {subscribers.map((row) => (
              <div key={row.subscriberId} className="rounded-2xl border border-slate-200/85 bg-white px-4 py-3.5 shadow-[var(--shadow-sm)] transition-[box-shadow] duration-200 hover:shadow-[var(--shadow-md)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.fullName || row.email}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {row.email} {row.phone ? `· ${row.phone}` : ""}
                    </p>
                  </div>
                  <Badge className={row.activeSessions > 0 ? "shrink-0 bg-emerald-600 text-white" : "shrink-0 bg-slate-400 text-white"}>
                    {row.activeSessions} session{row.activeSessions !== 1 ? "s" : ""}
                  </Badge>
                </div>
                {row.entitlement ? (
                  <div className="mt-3 grid gap-1.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                    <span><span className="font-medium text-slate-700">Plan:</span> {row.entitlement.planName || row.entitlement.planCode || "-"}</span>
                    <span><span className="font-medium text-slate-700">Ends:</span> {dt(row.entitlement.endsAt)}</span>
                    <span><span className="font-medium text-slate-700">Devices:</span> {row.entitlement.maxDevices ?? "Unlimited"}</span>
                    <span><span className="font-medium text-slate-700">Profile:</span> {row.entitlement.bandwidthProfile || "-"}</span>
                  </div>
                ) : (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">No active entitlement.</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section id="ops-architecture" className="panel-surface">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="section-kicker">Config</p>
              <h2 className="mt-1 section-title">Architecture settings</h2>
              <p className="mt-1 text-sm text-slate-600">
                Keep advanced config out of the main screen. Open the editor only when needed.
              </p>
              {architecture ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    Access mode: {architecture.accessMode}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                    Voucher source: {architecture.accessMode === "account_access" ? "n/a" : architecture.voucherSourceMode}
                  </span>
                </div>
              ) : null}
            </div>
            <Button type="button" variant="outline" onClick={() => setShowArchitectureModal(true)}>
              <Settings className="size-4" />
              Configure architecture
            </Button>
          </div>

          {architectureLoading ? (
            <p className="mt-3 text-sm text-slate-600">Loading architecture settings...</p>
          ) : null}

        {architectureError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Architecture error</AlertTitle>
            <AlertDescription>{architectureError}</AlertDescription>
          </Alert>
        ) : null}
        {architectureNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>Architecture updated</AlertTitle>
            <AlertDescription>{architectureNotice}</AlertDescription>
          </Alert>
        ) : null}
        {omadaTestError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Omada test failed</AlertTitle>
            <AlertDescription>{omadaTestError}</AlertDescription>
          </Alert>
        ) : null}
        {omadaTestNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>Omada test passed</AlertTitle>
            <AlertDescription>{omadaTestNotice}</AlertDescription>
          </Alert>
        ) : null}
        {mikrotikTestError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>MikroTik test failed</AlertTitle>
            <AlertDescription>{mikrotikTestError}</AlertDescription>
          </Alert>
        ) : null}
        {mikrotikTestNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>MikroTik test passed</AlertTitle>
            <AlertDescription>{mikrotikTestNotice}</AlertDescription>
          </Alert>
        ) : null}
        </section>

        <section id="ops-plans" className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="section-kicker">Plans</p>
            <h2 className="mt-1 section-title">Plan management</h2>
            <p className="mt-1 text-sm text-slate-600">Create, update pricing, and toggle availability per plan.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setShowCreatePlanModal(true)}>
            Add plan
          </Button>
        </div>

        <div className="mt-3 space-y-3 lg:hidden">
          {plans.map((plan) => {
            const draft = planDrafts[plan.id];
            if (!draft) return null;
            return (
              <article key={plan.id} className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-[var(--shadow-sm)]">
                <div className="grid gap-2">
                  <Input
                    value={draft.code}
                    onChange={(event) =>
                      setPlanDrafts((prev) => ({
                        ...prev,
                        [plan.id]: { ...prev[plan.id], code: event.target.value },
                      }))
                    }
                  />
                  <Input
                    value={draft.name}
                    onChange={(event) =>
                      setPlanDrafts((prev) => ({
                        ...prev,
                        [plan.id]: { ...prev[plan.id], name: event.target.value },
                      }))
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={draft.duration}
                      inputMode="text"
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], duration: event.target.value },
                        }))
                      }
                      placeholder="1h / 2d / 1w"
                    />
                    <Input
                      value={draft.price}
                      inputMode="text"
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], price: event.target.value },
                        }))
                      }
                      placeholder="25k / NGN 12000"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={draft.maxDevices}
                      inputMode="numeric"
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], maxDevices: event.target.value },
                        }))
                      }
                      placeholder="Max devices (blank = unlimited)"
                    />
                    <Input
                      value={draft.dataLimitMb}
                      inputMode="text"
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], dataLimitMb: event.target.value },
                        }))
                      }
                      placeholder="500MB / 1.5GB / 2TB"
                    />
                    <Input
                      value={draft.bandwidthProfile}
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], bandwidthProfile: event.target.value },
                        }))
                      }
                      placeholder="Bandwidth profile"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="datetime-local"
                      value={draft.availableFrom}
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], availableFrom: event.target.value },
                        }))
                      }
                      placeholder="Available from"
                    />
                    <Input
                      type="datetime-local"
                      value={draft.availableTo}
                      onChange={(event) =>
                        setPlanDrafts((prev) => ({
                          ...prev,
                          [plan.id]: { ...prev[plan.id], availableTo: event.target.value },
                        }))
                      }
                      placeholder="Available to"
                    />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">Unused: {plan.unusedCount}</span>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">Assigned: {plan.assignedCount}</span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={draft.active}
                    aria-label={`Set ${plan.name} active`}
                    title={draft.active ? "Active" : "Inactive"}
                    onClick={() =>
                      setPlanDrafts((prev) => ({
                        ...prev,
                        [plan.id]: { ...prev[plan.id], active: !prev[plan.id].active },
                      }))
                    }
                    className={[
                      "relative inline-flex h-6 w-10 items-center rounded-full border transition",
                      draft.active
                        ? "border-emerald-600 bg-emerald-600/90"
                        : "border-slate-300 bg-slate-200",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-block size-4 rounded-full bg-white shadow-sm transition",
                        draft.active ? "translate-x-5" : "translate-x-1",
                      ].join(" ")}
                    />
                  </button>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => savePlan(plan)}
                      disabled={savingPlanIds[plan.id] || deletingPlanIds[plan.id]}
                      aria-label="Save plan"
                      title="Save plan"
                      className="size-8"
                    >
                      <Save className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      onClick={() => deletePlan(plan)}
                      disabled={savingPlanIds[plan.id] || deletingPlanIds[plan.id]}
                      aria-label="Delete plan"
                      title="Delete plan"
                      className="size-8"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
          {plans.length === 0 && !plansLoading ? (
            <p className="rounded-2xl border border-slate-200/85 bg-white p-4 text-sm text-slate-600">No plans available.</p>
          ) : null}
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200/85 bg-white lg:block [&_input]:h-8 [&_input]:px-2 [&_input]:text-xs [&_input]:shadow-none">
          <table className="w-full min-w-[1060px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Minutes</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">Max devices</th>
                <th className="px-3 py-2">Bandwidth profile</th>
                <th className="px-3 py-2">Data MB</th>
                <th className="px-3 py-2">Available from</th>
                <th className="px-3 py-2">Available to</th>
                <th className="px-3 py-2">Unused</th>
                <th className="px-3 py-2">Assigned</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const draft = planDrafts[plan.id];
                if (!draft) return null;
                return (
                  <tr key={plan.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">
                      <Input
                        value={draft.code}
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], code: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.name}
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], name: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.duration}
                        inputMode="text"
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], duration: event.target.value },
                          }))
                        }
                        placeholder="1h / 2d / 1w"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.price}
                        inputMode="text"
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], price: event.target.value },
                          }))
                        }
                        placeholder="25k / NGN 12000"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.maxDevices}
                        inputMode="numeric"
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], maxDevices: event.target.value },
                          }))
                        }
                        placeholder="Blank = unlimited"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.bandwidthProfile}
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], bandwidthProfile: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={draft.dataLimitMb}
                        inputMode="text"
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], dataLimitMb: event.target.value },
                          }))
                        }
                        placeholder="500MB / 1.5GB / 2TB"
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[170px]">
                      <Input
                        type="datetime-local"
                        value={draft.availableFrom}
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], availableFrom: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 min-w-[170px]">
                      <Input
                        type="datetime-local"
                        value={draft.availableTo}
                        onChange={(event) =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], availableTo: event.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{plan.unusedCount}</td>
                    <td className="px-3 py-2">{plan.assignedCount}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={draft.active}
                        aria-label={`Set ${plan.name} active`}
                        title={draft.active ? "Active" : "Inactive"}
                        onClick={() =>
                          setPlanDrafts((prev) => ({
                            ...prev,
                            [plan.id]: { ...prev[plan.id], active: !prev[plan.id].active },
                          }))
                        }
                        className={[
                          "relative inline-flex h-6 w-10 items-center rounded-full border transition",
                          draft.active
                            ? "border-emerald-600 bg-emerald-600/90"
                            : "border-slate-300 bg-slate-200",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-block size-4 rounded-full bg-white shadow-sm transition",
                            draft.active ? "translate-x-5" : "translate-x-1",
                          ].join(" ")}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => savePlan(plan)}
                          disabled={savingPlanIds[plan.id] || deletingPlanIds[plan.id]}
                          aria-label="Save plan"
                          title="Save plan"
                          className="size-8"
                        >
                          <Save className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          onClick={() => deletePlan(plan)}
                          disabled={savingPlanIds[plan.id] || deletingPlanIds[plan.id]}
                          aria-label="Delete plan"
                          title="Delete plan"
                          className="size-8"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {plans.length === 0 && !plansLoading ? (
            <p className="p-4 text-sm text-slate-600">No plans available.</p>
          ) : null}
        </div>

        {plansError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Plan action failed</AlertTitle>
            <AlertDescription>{plansError}</AlertDescription>
          </Alert>
        ) : null}
        {planNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>Plan update</AlertTitle>
            <AlertDescription>{planNotice}</AlertDescription>
          </Alert>
        ) : null}
        </section>

        <section id="ops-vouchers" className="panel-surface">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="section-kicker">Inventory</p>
            <h2 className="mt-1 section-title">Voucher operations</h2>
            <p className="mt-1 text-sm text-slate-600">
              {hasArchitectureConfigured
                ? isExternalAccessMode
                  ? "External account-access mode: voucher inventory is bypassed. Use subscriber monitoring and RADIUS accounting."
                  : isApiAutomationMode
                  ? isOmadaMode
                    ? "Omada automation mode: vouchers are created automatically after each successful customer payment."
                    : "MikroTik direct mode: vouchers are created automatically after each successful customer payment."
                  : hasPlans
                    ? "CSV mode: create manually, batch generate, or import CSV."
                    : "CSV mode active. Create at least one plan before adding or generating vouchers."
                : "Configure architecture first to unlock voucher action flows."}
            </p>
          </div>
          {hasArchitectureConfigured ? (
            <div className="flex flex-wrap items-center gap-2">
              {isCsvMode && hasPlans && !isExternalAccessMode ? (
                <Button type="button" variant="outline" onClick={() => setShowCreateVoucherModal(true)}>
                  Add voucher
                </Button>
              ) : null}
              {isCsvMode && hasPlans && !isExternalAccessMode ? (
                <Button type="button" variant="outline" onClick={() => setShowGenerateVoucherModal(true)}>
                  Batch generate
                </Button>
              ) : null}
              {isCsvMode && !isExternalAccessMode ? (
                <Button type="button" variant="outline" onClick={() => setShowImportVoucherModal(true)}>
                  Import CSV
                </Button>
              ) : null}
            </div>
          ) : (
            <Button type="button" variant="outline" onClick={() => setShowArchitectureModal(true)}>
              <Settings className="size-4" />
              Configure architecture
            </Button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_170px_170px_auto]">
          <Input
            placeholder="Search voucher, plan, email, phone"
            value={voucherQuery}
            onChange={(event) => setVoucherQuery(event.target.value)}
          />
          <select className="h-11" value={voucherStatus} onChange={(event) => setVoucherStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="UNUSED">Unused</option>
            <option value="ASSIGNED">Assigned</option>
          </select>
          <select className="h-11" value={voucherPlan} onChange={(event) => setVoucherPlan(event.target.value)}>
            <option value="all">All plans</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={loadVouchers} disabled={vouchersLoading}>
            {vouchersLoading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        <div className="mt-3 space-y-3 lg:hidden">
          {vouchers.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-200/85 bg-white p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-start gap-3">
                <input
                  aria-label={`Select voucher ${row.voucherCode}`}
                  type="checkbox"
                  className="mt-1 shrink-0"
                  checked={selectedVoucherIds.includes(row.id)}
                  onChange={(event) =>
                    setSelectedVoucherIds((prev) =>
                      event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                    )
                  }
                />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 break-all">{row.voucherCode}</p>
                  <p className="text-xs text-slate-500">{row.packageName}</p>
                </div>
              </div>
              <div className="mt-2">
                {row.status === "UNUSED" ? (
                  <Badge className="bg-emerald-700 text-white">UNUSED</Badge>
                ) : (
                  <Badge className="bg-amber-600 text-white">ASSIGNED</Badge>
                )}
              </div>
              <div className="mt-3 grid gap-1 text-xs text-slate-600">
                <p>Email: {row.assignedToEmail || "-"}</p>
                <p>Phone: {row.assignedToPhone || "-"}</p>
                <p>Created: {dt(row.createdAt)}</p>
                <p>Assigned: {dt(row.assignedAt)}</p>
              </div>
            </article>
          ))}
          {vouchers.length === 0 && !vouchersLoading ? (
            <p className="rounded-2xl border border-slate-200/85 bg-white p-4 text-sm text-slate-600">No vouchers found.</p>
          ) : null}
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-xl border border-slate-200/85 bg-white lg:block">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/95 text-left text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-3 py-2"></th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned email</th>
                <th className="px-3 py-2">Assigned phone</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Select voucher ${row.voucherCode}`}
                      type="checkbox"
                      checked={selectedVoucherIds.includes(row.id)}
                      onChange={(event) =>
                        setSelectedVoucherIds((prev) =>
                          event.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.voucherCode}</td>
                  <td className="px-3 py-2">{row.packageName}</td>
                  <td className="px-3 py-2">
                    {row.status === "UNUSED" ? (
                      <Badge className="bg-emerald-700 text-white">UNUSED</Badge>
                    ) : (
                      <Badge className="bg-amber-600 text-white">ASSIGNED</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.assignedToEmail || "-"}</td>
                  <td className="px-3 py-2">{row.assignedToPhone || "-"}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{dt(row.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{dt(row.assignedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {vouchers.length === 0 && !vouchersLoading ? (
            <p className="p-4 text-sm text-slate-600">No vouchers found.</p>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-600">
            Showing {vouchers.length} / {voucherTotal} | Selected {selectedVoucherIds.length}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={reclaimSelected} disabled={selectedVoucherIds.length === 0}>
              <ArchiveRestore className="size-4" />
              Unarchive
            </Button>
            <Button type="button" variant="destructive" onClick={deleteSelected} disabled={selectedVoucherIds.length === 0}>
              <Trash2 className="size-4" />
              Delete
            </Button>
            <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" />
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoucherPage((prev) => Math.max(1, prev - 1))}
              disabled={voucherPage <= 1}
            >
              <ChevronLeft className="size-4" />
              Prev
            </Button>
            <span className="text-xs text-slate-600">{voucherPage} / {voucherTotalPages}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoucherPage((prev) => Math.min(voucherTotalPages, prev + 1))}
              disabled={voucherPage >= voucherTotalPages}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {vouchersError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Voucher action failed</AlertTitle>
            <AlertDescription>{vouchersError}</AlertDescription>
          </Alert>
        ) : null}
        {voucherNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>Voucher update</AlertTitle>
            <AlertDescription>{voucherNotice}</AlertDescription>
          </Alert>
        ) : null}
        {importError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Import failed</AlertTitle>
            <AlertDescription>{importError}</AlertDescription>
          </Alert>
        ) : null}
        {importNotice ? (
          <Alert variant="success" className="mt-4">
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>{importNotice}</AlertDescription>
          </Alert>
        ) : null}
        </section>
      </div>

      {showQuickActionsModal ? (
        <ModalShell title="Quick actions" onClose={() => setShowQuickActionsModal(false)}>
          <div className="grid gap-2">
            <Button type="button" variant="outline" onClick={() => { setShowQuickActionsModal(false); setShowCreatePlanModal(true); }}>
              Add plan
            </Button>
            {hasArchitectureConfigured && isCsvMode && hasPlans && !isExternalAccessMode ? (
              <Button type="button" variant="outline" onClick={() => { setShowQuickActionsModal(false); setShowCreateVoucherModal(true); }}>
                Add voucher
              </Button>
            ) : null}
            {hasArchitectureConfigured && isCsvMode && hasPlans && !isExternalAccessMode ? (
              <Button type="button" variant="outline" onClick={() => { setShowQuickActionsModal(false); setShowGenerateVoucherModal(true); }}>
                Batch generate vouchers
              </Button>
            ) : null}
            {hasArchitectureConfigured && isCsvMode && !isExternalAccessMode ? (
              <Button type="button" variant="outline" onClick={() => { setShowQuickActionsModal(false); setShowImportVoucherModal(true); }}>
                Import voucher CSV
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => { setShowQuickActionsModal(false); setShowArchitectureModal(true); }}>
              <Settings className="size-4" />
              Configure architecture
            </Button>
          </div>
        </ModalShell>
      ) : null}

      {showArchitectureModal && architecture ? (
        <ModalShell title="Configure architecture" onClose={() => setShowArchitectureModal(false)}>
          <form className="grid gap-3" onSubmit={saveArchitecture}>
            <div className="flex items-center justify-end">
              {architecture.accessMode === "voucher_access" && architecture.voucherSourceMode === "omada_openapi" ? (
                <Link
                  href="/help/omada-openapi"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <CircleHelp className="size-3.5" />
                  Omada setup help
                </Link>
              ) : architecture.accessMode === "voucher_access" && architecture.voucherSourceMode === "mikrotik_rest" ? (
                <Link
                  href="/help/mikrotik-rest"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <CircleHelp className="size-3.5" />
                  MikroTik setup help
                </Link>
              ) : architecture.accessMode === "account_access" ? (
                <Link
                  href="/help/external-radius"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                >
                  <CircleHelp className="size-3.5" />
                  External RADIUS help
                </Link>
                ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="accessMode">Access mode</Label>
                <select
                  id="accessMode"
                  value={architecture.accessMode}
                  onChange={(event) =>
                    setArchitecture((prev) =>
                      prev
                        ? (() => {
                            const nextMode = event.target.value as ArchitectureConfig["accessMode"];
                            return {
                              ...prev,
                              accessMode: nextMode,
                              voucherSourceMode:
                                nextMode === "account_access" ? "import_csv" : prev.voucherSourceMode,
                            };
                          })()
                        : prev,
                    )
                  }
                >
                  <option value="voucher_access">Voucher access</option>
                  <option value="account_access">Account access (External RADIUS)</option>
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="voucherSourceMode">Voucher source</Label>
                <select
                  id="voucherSourceMode"
                  value={architecture.voucherSourceMode}
                  disabled={architecture.accessMode === "account_access"}
                  onChange={(event) =>
                    setArchitecture((prev) =>
                      prev
                        ? {
                            ...prev,
                            voucherSourceMode: event.target.value as ArchitectureConfig["voucherSourceMode"],
                          }
                        : prev,
                    )
                  }
                >
                  <option value="import_csv">Import CSV (default)</option>
                  <option value="omada_openapi">Omada OpenAPI sync</option>
                  <option value="mikrotik_rest">MikroTik direct (REST)</option>
                </select>
                {architecture.accessMode === "account_access" ? (
                  <p className="text-xs text-slate-500">
                    Voucher source is disabled in account-access mode.
                  </p>
                ) : null}
              </div>
            </div>

            {architecture.accessMode === "voucher_access" && architecture.voucherSourceMode === "omada_openapi" ? (
              <div className="rounded-2xl border border-slate-200/85 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Omada OpenAPI credentials</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={architecture.omada.apiBaseUrl}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, omada: { ...prev.omada, apiBaseUrl: event.target.value } }
                          : prev,
                      )
                    }
                    placeholder="https://use1-omada-northbound.tplinkcloud.com"
                  />
                  <Input
                    value={architecture.omada.omadacId}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev ? { ...prev, omada: { ...prev.omada, omadacId: event.target.value } } : prev,
                      )
                    }
                    placeholder="Omada ID"
                  />
                  <Input
                    value={architecture.omada.siteId}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev ? { ...prev, omada: { ...prev.omada, siteId: event.target.value } } : prev,
                      )
                    }
                    placeholder="Site ID"
                  />
                  <Input
                    value={architecture.omada.clientId}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev ? { ...prev, omada: { ...prev.omada, clientId: event.target.value } } : prev,
                      )
                    }
                    placeholder="Client ID"
                  />
                  <Input
                    type="password"
                    value={omadaClientSecret}
                    onChange={(event) => setOmadaClientSecret(event.target.value)}
                    placeholder={
                      architecture.omada.hasClientSecret
                        ? "Client secret (leave blank to keep)"
                        : "Client secret"
                    }
                  />
                  <Input
                    value={architecture.omada.hotspotOperatorUsername}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? {
                              ...prev,
                              omada: { ...prev.omada, hotspotOperatorUsername: event.target.value },
                            }
                          : prev,
                      )
                    }
                    placeholder="Hotspot operator username"
                  />
                  <Input
                    type="password"
                    value={omadaHotspotOperatorPassword}
                    onChange={(event) => setOmadaHotspotOperatorPassword(event.target.value)}
                    placeholder={
                      architecture.omada.hasHotspotOperatorPassword
                        ? "Hotspot operator password (leave blank to keep)"
                        : "Hotspot operator password"
                    }
                  />
                </div>
                <div className="mt-3 grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Need Site ID? Fetch available sites from Omada using the current credentials.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={discoverOmadaSites}
                      disabled={omadaSitesLoading || architectureSaving || omadaTestLoading}
                    >
                      {omadaSitesLoading ? "Fetching sites..." : "Fetch sites"}
                    </Button>
                  </div>
                  {omadaSiteOptions.length > 0 ? (
                    <select
                      value={architecture.omada.siteId}
                      onChange={(event) =>
                        setArchitecture((prev) =>
                          prev ? { ...prev, omada: { ...prev.omada, siteId: event.target.value } } : prev,
                        )
                      }
                    >
                      <option value="">Select discovered site</option>
                      {omadaSiteOptions.map((site) => (
                        <option key={site.siteId} value={site.siteId}>
                          {site.name ? `${site.name} (${site.siteId})` : site.siteId}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {omadaSitesError ? <p className="text-sm text-red-700">{omadaSitesError}</p> : null}
                  {omadaSitesNotice ? <p className="text-sm text-slate-600">{omadaSitesNotice}</p> : null}
                </div>
              </div>
            ) : null}

            {architecture.accessMode === "voucher_access" && architecture.voucherSourceMode === "mikrotik_rest" ? (
              <div className="rounded-2xl border border-slate-200/85 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">MikroTik REST credentials</p>
                <p className="mt-2 text-xs text-slate-600">
                  Enter the router or controller URL once. PaySpot will create the hotspot user automatically after successful payment using the plan&apos;s duration and data limit.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Input
                    value={architecture.mikrotik.baseUrl}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, mikrotik: { ...prev.mikrotik, baseUrl: event.target.value } }
                          : prev,
                      )
                    }
                    placeholder="https://router.example.com"
                  />
                  <Input
                    value={architecture.mikrotik.username}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, mikrotik: { ...prev.mikrotik, username: event.target.value } }
                          : prev,
                      )
                    }
                    placeholder="REST username"
                  />
                  <Input
                    type="password"
                    value={mikrotikPassword}
                    onChange={(event) => setMikrotikPassword(event.target.value)}
                    placeholder={
                      architecture.mikrotik.hasPassword
                        ? "REST password (leave blank to keep)"
                        : "REST password"
                    }
                  />
                  <Input
                    value={architecture.mikrotik.hotspotServer}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, mikrotik: { ...prev.mikrotik, hotspotServer: event.target.value } }
                          : prev,
                      )
                    }
                    placeholder="Hotspot server (optional)"
                  />
                  <Input
                    value={architecture.mikrotik.defaultProfile}
                    onChange={(event) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, mikrotik: { ...prev.mikrotik, defaultProfile: event.target.value } }
                          : prev,
                      )
                    }
                    placeholder="Default profile (optional)"
                  />
                  <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={architecture.mikrotik.verifyTls}
                      onChange={(event) =>
                        setArchitecture((prev) =>
                          prev
                            ? { ...prev, mikrotik: { ...prev.mikrotik, verifyTls: event.target.checked } }
                            : prev,
                        )
                      }
                    />
                    Verify TLS certificate
                  </label>
                </div>
                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  Voucher code = transaction reference. Password = same as voucher code. Duration and data limit come from each PaySpot plan.
                </div>
              </div>
            ) : null}

            {architecture.accessMode === "account_access" ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-900">External RADIUS adapter</p>
                <p className="mt-2 text-xs text-amber-900/80">
                  Shared secret for `/api/t/&lt;slug&gt;/radius/*` is generated and managed automatically.
                </p>
                {architecture.radius?.hasAdapterSecret ? (
                  <p className="mt-1 text-xs text-amber-900/80">
                    Current secret fingerprint: <code>****{architecture.radius.adapterSecretLast4}</code>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {architecture.voucherSourceMode === "omada_openapi" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={testOmadaConnection}
                  disabled={omadaTestLoading || architectureSaving}
                >
                  {omadaTestLoading ? "Testing..." : "Test Omada connection"}
                </Button>
              ) : null}
              {architecture.voucherSourceMode === "mikrotik_rest" ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={testMikrotikConnection}
                  disabled={mikrotikTestLoading || architectureSaving}
                >
                  {mikrotikTestLoading ? "Testing..." : "Test MikroTik connection"}
                </Button>
              ) : null}
              <Button type="submit" disabled={architectureSaving || omadaTestLoading || mikrotikTestLoading}>
                {architectureSaving ? "Saving..." : "Save architecture"}
              </Button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {showCreatePlanModal ? (
        <ModalShell title="Add plan" onClose={() => setShowCreatePlanModal(false)}>
          <form className="grid gap-2" onSubmit={createPlan}>
            <Input value={newPlanName} onChange={(event) => setNewPlanName(event.target.value)} placeholder="Name" />
            <Input
              value={newPlanDuration}
              inputMode="text"
              onChange={(event) => setNewPlanDuration(event.target.value)}
              placeholder="Duration optional (e.g. 90m, 1h, 2d, 1w)"
            />
            <Input
              value={newPlanPrice}
              inputMode="text"
              onChange={(event) => setNewPlanPrice(event.target.value)}
              placeholder="Price (e.g. 25000, 25k, NGN 25,000)"
            />
            <Input
              value={newPlanMaxDevices}
              inputMode="numeric"
              onChange={(event) => setNewPlanMaxDevices(event.target.value)}
              placeholder="Max devices (optional, blank = unlimited)"
            />
            <Input
              value={newPlanBandwidthProfile}
              onChange={(event) => setNewPlanBandwidthProfile(event.target.value)}
              placeholder="Bandwidth profile (optional)"
            />
            <Input
              value={newPlanDataLimitMb}
              inputMode="text"
              onChange={(event) => setNewPlanDataLimitMb(event.target.value)}
              placeholder="Data limit (e.g. 500MB, 1.5GB, 2TB)"
            />
            <Input
              type="datetime-local"
              value={newPlanAvailableFrom}
              onChange={(event) => setNewPlanAvailableFrom(event.target.value)}
              placeholder="Available from (optional)"
            />
            <Input
              type="datetime-local"
              value={newPlanAvailableTo}
              onChange={(event) => setNewPlanAvailableTo(event.target.value)}
              placeholder="Available to (optional)"
            />
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {newPlanDuration.trim() ? (
                Number.isFinite(parsedNewPlanDuration ?? Number.NaN)
                  ? `Duration: ${formatDurationPreview(parsedNewPlanDuration!)}`
                  : "Duration: invalid format"
              ) : architecture?.accessMode === "account_access"
                ? "Duration: optional (leave blank for unlimited time)"
                : architecture?.voucherSourceMode === "mikrotik_rest"
                  ? "Duration: optional in MikroTik mode (data-only plans supported)"
                  : "Duration: required for voucher plans"}
              {" | "}
              {newPlanPrice.trim() ? (
                Number.isFinite(parsedNewPlanPrice ?? Number.NaN)
                  ? `Price: NGN ${parsedNewPlanPrice!.toLocaleString()}`
                  : "Price: invalid format"
              ) : "Price: enter 25000, 25k, or NGN 25,000"}
              {" | "}
              {newPlanDataLimitMb.trim() ? (
                Number.isFinite(parsedNewPlanDataLimit ?? Number.NaN)
                  ? `Data: ${formatDataLimitPreviewMb(parsedNewPlanDataLimit!)}`
                  : "Data: invalid format"
              ) : "Data: optional (leave blank for unlimited data)"}
              {" | "}
              {newPlanAvailableFrom.trim() || newPlanAvailableTo.trim()
                ? "Availability window set"
                : "Availability: always on"}
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={creatingPlan}>{creatingPlan ? "Creating..." : "Add plan"}</Button>
            </div>
            {plansError ? <p className="text-sm text-red-700">{plansError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

      {showCreateVoucherModal && isCsvMode ? (
        <ModalShell title="Add voucher" onClose={() => setShowCreateVoucherModal(false)}>
          <form className="grid gap-2" onSubmit={createVoucher}>
            <Input
              value={newVoucherCode}
              onChange={(event) => setNewVoucherCode(event.target.value)}
              placeholder="Voucher code"
            />
            <select value={newVoucherPackageId} onChange={(event) => setNewVoucherPackageId(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end">
              <Button type="submit" disabled={creatingVoucher}>{creatingVoucher ? "Adding..." : "Add voucher"}</Button>
            </div>
            {vouchersError ? <p className="text-sm text-red-700">{vouchersError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

      {showGenerateVoucherModal && isCsvMode ? (
        <ModalShell title="Batch generate vouchers" onClose={() => setShowGenerateVoucherModal(false)}>
          <form className="grid gap-2" onSubmit={generateVouchers}>
            <Input
              value={generateCount}
              inputMode="numeric"
              onChange={(event) => setGenerateCount(event.target.value)}
              placeholder="Quantity"
            />
            <Input
              value={generatePrefix}
              onChange={(event) => setGeneratePrefix(event.target.value)}
              placeholder="Optional prefix"
            />
            <Input
              value={generateCodeLength}
              inputMode="numeric"
              onChange={(event) => setGenerateCodeLength(event.target.value)}
              placeholder="Code length"
            />
            <select value={newVoucherPackageId} onChange={(event) => setNewVoucherPackageId(event.target.value)}>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end">
              <Button type="submit" disabled={generatingVouchers}>{generatingVouchers ? "Generating..." : "Generate"}</Button>
            </div>
            {vouchersError ? <p className="text-sm text-red-700">{vouchersError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

      {showImportVoucherModal && isCsvMode ? (
        <ModalShell title="Import voucher CSV" onClose={() => setShowImportVoucherModal(false)}>
          <form className="grid gap-2" onSubmit={importCsv}>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setCsvFile(event.target.files?.[0] ?? null)}
            />
            <Input
              value={importPackageCode}
              onChange={(event) => setImportPackageCode(event.target.value)}
              placeholder="Optional forced plan code"
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={importLoading}>{importLoading ? "Importing..." : "Import"}</Button>
            </div>
            {importError ? <p className="text-sm text-red-700">{importError}</p> : null}
          </form>
        </ModalShell>
      ) : null}

    </>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="dashboard-kpi">
      <p className="dashboard-kpi-label">{label}</p>
      <p className="dashboard-kpi-value">{value}</p>
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-slate-200/90 bg-white p-5 shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
