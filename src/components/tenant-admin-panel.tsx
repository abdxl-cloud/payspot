"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  Menu,
  Package,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Ticket,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BottomSheet, BottomSheetContent, BottomSheetHeader, BottomSheetTitle } from "@/components/ui/bottom-sheet";
import { readJsonResponse } from "@/lib/http";
import { useTenantCapabilities, type TenantConfig } from "@/hooks/use-tenant-capabilities";

// Types
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
  radiusVoucherCodePrefix: string | null;
  radiusVoucherCodeLength: number | null;
  radiusVoucherCharacterSet: "alnum" | "letters" | "numbers" | null;
};

type PlanVoucherCharacterSet = "legacy" | "alnum" | "letters" | "numbers";

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
  voucherSourceMode: "import_csv" | "omada_openapi" | "mikrotik_rest" | "radius_voucher";
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

type NavTab = "overview" | "plans" | "vouchers" | "subscribers" | "settings";

const PAGE_SIZE = 20;
const PAID_RADIUS_VOUCHER_MIN_CODE_LENGTH = 6;
const PAID_RADIUS_VOUCHER_MAX_CODE_LENGTH = 24;

// Utility functions
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

function normalizeRadiusVoucherPrefixInput(value: string) {
  return value.trim().toUpperCase();
}

function validateRadiusVoucherPrefixInput(value: string) {
  const normalized = normalizeRadiusVoucherPrefixInput(value);
  if (!normalized) return { ok: true as const, value: "" };
  if (normalized.length > 16) {
    return { ok: false as const, error: "Paid voucher prefix must be 16 characters or fewer." };
  }
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    return { ok: false as const, error: "Paid voucher prefix may only contain A-Z, 0-9, underscore, or dash." };
  }
  return { ok: true as const, value: normalized };
}

function parseRadiusVoucherCodeLengthInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return Number.NaN;
  return parsed;
}

// Navigation tabs configuration
const NAV_TABS: Array<{ id: NavTab; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "plans", label: "Plans", icon: Package },
  { id: "vouchers", label: "Vouchers", icon: Ticket },
  { id: "subscribers", label: "Subscribers", icon: Users },
  { id: "settings", label: "Settings", icon: Settings },
];

export function TenantAdminPanel({ tenantSlug }: Props) {
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Stats state
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Plans state
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planNotice, setPlanNotice] = useState<string | null>(null);

  // Architecture state
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

  // Vouchers state
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

  // New plan form state
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanDuration, setNewPlanDuration] = useState("");
  const [newPlanPrice, setNewPlanPrice] = useState("");
  const [newPlanMaxDevices, setNewPlanMaxDevices] = useState("");
  const [newPlanBandwidthProfile, setNewPlanBandwidthProfile] = useState("");
  const [newPlanDataLimitMb, setNewPlanDataLimitMb] = useState("");
  const [newPlanAvailableFrom, setNewPlanAvailableFrom] = useState("");
  const [newPlanAvailableTo, setNewPlanAvailableTo] = useState("");
  const [newPlanRadiusVoucherCodePrefix, setNewPlanRadiusVoucherCodePrefix] = useState("PS");
  const [newPlanRadiusVoucherCodeLength, setNewPlanRadiusVoucherCodeLength] = useState("8");
  const [newPlanRadiusVoucherCharacterSet, setNewPlanRadiusVoucherCharacterSet] = useState<PlanVoucherCharacterSet>("legacy");
  const [creatingPlan, setCreatingPlan] = useState(false);

  // Plan drafts for inline editing
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
      radiusVoucherCodePrefix: string;
      radiusVoucherCodeLength: string;
      radiusVoucherCharacterSet: PlanVoucherCharacterSet;
      active: boolean;
    }>
  >({});
  const [savingPlanIds, setSavingPlanIds] = useState<Record<string, boolean>>({});
  const [deletingPlanIds, setDeletingPlanIds] = useState<Record<string, boolean>>({});

  // Voucher creation state
  const [newVoucherCode, setNewVoucherCode] = useState("");
  const [newVoucherPackageId, setNewVoucherPackageId] = useState("");
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [generateCount, setGenerateCount] = useState("20");
  const [generatePrefix, setGeneratePrefix] = useState("");
  const [generateCodeLength, setGenerateCodeLength] = useState("10");
  const [generateCharacterSet, setGenerateCharacterSet] = useState("alnum");
  const [generatingVouchers, setGeneratingVouchers] = useState(false);

  // CSV import state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importPackageCode, setImportPackageCode] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Modal states
  const [showArchitectureSheet, setShowArchitectureSheet] = useState(false);
  const [showCreatePlanSheet, setShowCreatePlanSheet] = useState(false);
  const [showCreateVoucherSheet, setShowCreateVoucherSheet] = useState(false);
  const [showGenerateVoucherSheet, setShowGenerateVoucherSheet] = useState(false);
  const [showImportVoucherSheet, setShowImportVoucherSheet] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  // Subscribers state
  const [subscribers, setSubscribers] = useState<SubscriberOverviewRow[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [subscribersError, setSubscribersError] = useState<string | null>(null);

  // Computed values
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

  // Use tenant capabilities hook
  const tenantConfig: TenantConfig | null = architecture ? {
    accessMode: architecture.accessMode,
    voucherSourceMode: architecture.voucherSourceMode,
    hasPlans: plans.length > 0,
    hasVouchers: vouchers.length > 0,
    hasSubscribers: subscribers.length > 0,
    omadaConfigured: !!(architecture.omada.apiBaseUrl && architecture.omada.hasClientSecret),
    mikrotikConfigured: !!(architecture.mikrotik.baseUrl && architecture.mikrotik.hasPassword),
    radiusConfigured: architecture.radius.hasAdapterSecret,
  } : null;

  const capabilities = useTenantCapabilities(tenantConfig);

  // Data loading functions
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

  // Effects
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
      radiusVoucherCodePrefix: string;
      radiusVoucherCodeLength: string;
      radiusVoucherCharacterSet: PlanVoucherCharacterSet;
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
        radiusVoucherCodePrefix: plan.radiusVoucherCodePrefix ?? "PS",
        radiusVoucherCodeLength: plan.radiusVoucherCodeLength ? String(plan.radiusVoucherCodeLength) : "8",
        radiusVoucherCharacterSet: plan.radiusVoucherCharacterSet ?? "legacy",
        active: plan.active === 1,
      };
    }
    setPlanDrafts(drafts);
    if (!newVoucherPackageId && plans.length > 0) setNewVoucherPackageId(plans[0].id);
  }, [plans, newVoucherPackageId]);

  // Computed values for stats
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

  // Action handlers
  async function refreshAll() {
    await Promise.all([loadStats(), loadPlans(), loadVouchers(), loadArchitecture(), loadSubscribers()]);
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
      setShowArchitectureSheet(false);
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
    const useConfiguredPaidVoucherCode =
      architecture?.voucherSourceMode === "radius_voucher" &&
      newPlanRadiusVoucherCharacterSet !== "legacy";
    const paidVoucherPrefix = validateRadiusVoucherPrefixInput(newPlanRadiusVoucherCodePrefix);
    const paidVoucherCodeLength = parseRadiusVoucherCodeLengthInput(newPlanRadiusVoucherCodeLength);
    const durationRequired =
      architecture?.accessMode !== "account_access" &&
      architecture?.voucherSourceMode !== "mikrotik_rest" &&
      architecture?.voucherSourceMode !== "radius_voucher";
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
      setPlansError("Duration is required unless you are using MikroTik direct mode or RADIUS voucher mode.");
      return;
    }
    if (normalizedDuration === null && normalizedDataLimit === null) {
      setPlansError("Set at least one limit: duration or data.");
      return;
    }
    if (!paidVoucherPrefix.ok) {
      setPlansError(paidVoucherPrefix.error);
      return;
    }
    if (
      useConfiguredPaidVoucherCode &&
      (paidVoucherCodeLength === undefined ||
        !Number.isFinite(paidVoucherCodeLength) ||
        paidVoucherCodeLength < PAID_RADIUS_VOUCHER_MIN_CODE_LENGTH ||
        paidVoucherCodeLength > PAID_RADIUS_VOUCHER_MAX_CODE_LENGTH)
    ) {
      setPlansError(
        `Paid voucher code length must be between ${PAID_RADIUS_VOUCHER_MIN_CODE_LENGTH} and ${PAID_RADIUS_VOUCHER_MAX_CODE_LENGTH}.`,
      );
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
          radiusVoucherCodePrefix:
            architecture?.voucherSourceMode === "radius_voucher" && newPlanRadiusVoucherCharacterSet !== "legacy"
              ? paidVoucherPrefix.value || null
              : null,
          radiusVoucherCodeLength:
            architecture?.voucherSourceMode === "radius_voucher" && newPlanRadiusVoucherCharacterSet !== "legacy"
              ? paidVoucherCodeLength ?? 8
              : null,
          radiusVoucherCharacterSet:
            architecture?.voucherSourceMode === "radius_voucher" && newPlanRadiusVoucherCharacterSet !== "legacy"
              ? newPlanRadiusVoucherCharacterSet
              : null,
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
      setNewPlanRadiusVoucherCodePrefix("PS");
      setNewPlanRadiusVoucherCodeLength("8");
      setNewPlanRadiusVoucherCharacterSet("legacy");
      setShowCreatePlanSheet(false);
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
    const useConfiguredPaidVoucherCode =
      architecture?.voucherSourceMode === "radius_voucher" &&
      draft.radiusVoucherCharacterSet !== "legacy";
    const paidVoucherPrefix = validateRadiusVoucherPrefixInput(draft.radiusVoucherCodePrefix);
    const paidVoucherCodeLength = parseRadiusVoucherCodeLengthInput(draft.radiusVoucherCodeLength);
    const durationRequired =
      architecture?.accessMode !== "account_access" &&
      architecture?.voucherSourceMode !== "mikrotik_rest" &&
      architecture?.voucherSourceMode !== "radius_voucher";
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
      setPlansError("Duration is required unless you are using MikroTik direct mode or RADIUS voucher mode.");
      return;
    }
    if (normalizedDuration === null && dataLimitMb === null) {
      setPlansError("Set at least one limit: duration or data.");
      return;
    }
    if (!paidVoucherPrefix.ok) {
      setPlansError(paidVoucherPrefix.error);
      return;
    }
    if (
      useConfiguredPaidVoucherCode &&
      (paidVoucherCodeLength === undefined ||
        !Number.isFinite(paidVoucherCodeLength) ||
        paidVoucherCodeLength < PAID_RADIUS_VOUCHER_MIN_CODE_LENGTH ||
        paidVoucherCodeLength > PAID_RADIUS_VOUCHER_MAX_CODE_LENGTH)
    ) {
      setPlansError(
        `Paid voucher code length must be between ${PAID_RADIUS_VOUCHER_MIN_CODE_LENGTH} and ${PAID_RADIUS_VOUCHER_MAX_CODE_LENGTH}.`,
      );
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
          radiusVoucherCodePrefix:
            architecture?.voucherSourceMode === "radius_voucher" && draft.radiusVoucherCharacterSet !== "legacy"
              ? paidVoucherPrefix.value || null
              : null,
          radiusVoucherCodeLength:
            architecture?.voucherSourceMode === "radius_voucher" && draft.radiusVoucherCharacterSet !== "legacy"
              ? paidVoucherCodeLength ?? 8
              : null,
          radiusVoucherCharacterSet:
            architecture?.voucherSourceMode === "radius_voucher" && draft.radiusVoucherCharacterSet !== "legacy"
              ? draft.radiusVoucherCharacterSet
              : null,
          active: draft.active,
        }),
      });
      const data = await readJsonResponse<{ error?: string }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to save plan.");
      setPlanNotice(`Saved ${draft.name}.`);
      setEditingPlanId(null);
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
      setShowCreateVoucherSheet(false);
      await Promise.all([loadVouchers(), loadStats()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to create voucher.");
    } finally {
      setCreatingVoucher(false);
    }
  }

  async function generateVouchers(event: React.FormEvent) {
    event.preventDefault();
    const count = Number.parseInt(generateCount, 10);
    const codeLength = Number.parseInt(generateCodeLength, 10);
    if (!Number.isFinite(count) || count < 1 || count > 500) {
      setVouchersError("Count must be 1-500.");
      return;
    }
    if (!Number.isFinite(codeLength) || codeLength < 6 || codeLength > 32) {
      setVouchersError("Code length must be 6-32.");
      return;
    }
    if (!newVoucherPackageId) {
      setVouchersError("Select a plan first.");
      return;
    }
    setGeneratingVouchers(true);
    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: newVoucherPackageId,
          count,
          prefix: generatePrefix.trim() || undefined,
          codeLength,
          characterSet: generateCharacterSet,
        }),
      });
      const data = await readJsonResponse<{ error?: string; created?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to generate vouchers.");
      setVoucherNotice(`Generated ${data?.created ?? count} vouchers.`);
      setShowGenerateVoucherSheet(false);
      await Promise.all([loadVouchers(), loadStats()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to generate vouchers.");
    } finally {
      setGeneratingVouchers(false);
    }
  }

  async function importCsv(event: React.FormEvent) {
    event.preventDefault();
    if (!csvFile) {
      setImportError("Select a CSV file first.");
      return;
    }
    if (!importPackageCode.trim()) {
      setImportError("Package code is required.");
      return;
    }
    setImportLoading(true);
    setImportError(null);
    setImportNotice(null);
    try {
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("packageCode", importPackageCode.trim());

      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/import`, {
        method: "POST",
        body: formData,
      });
      const data = await readJsonResponse<{ error?: string; imported?: number; skipped?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to import vouchers.");
      setImportNotice(`Imported ${data?.imported ?? 0} vouchers${data?.skipped ? `, skipped ${data.skipped}` : ""}.`);
      setCsvFile(null);
      setImportPackageCode("");
      setShowImportVoucherSheet(false);
      await Promise.all([loadVouchers(), loadStats(), loadPlans()]);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Unable to import vouchers.");
    } finally {
      setImportLoading(false);
    }
  }

  async function deleteSelectedVouchers() {
    if (selectedVoucherIds.length === 0) return;
    const ok = window.confirm(`Delete ${selectedVoucherIds.length} selected voucher(s)?`);
    if (!ok) return;

    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedVoucherIds }),
      });
      const data = await readJsonResponse<{ error?: string; deleted?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to delete vouchers.");
      setVoucherNotice(`Deleted ${data?.deleted ?? selectedVoucherIds.length} voucher(s).`);
      setSelectedVoucherIds([]);
      await Promise.all([loadVouchers(), loadStats()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to delete vouchers.");
    }
  }

  async function reclaimSelectedVouchers() {
    if (selectedVoucherIds.length === 0) return;
    const ok = window.confirm(`Reclaim ${selectedVoucherIds.length} selected voucher(s) back to unused?`);
    if (!ok) return;

    setVouchersError(null);
    setVoucherNotice(null);
    try {
      const response = await fetch(`/api/t/${tenantSlug}/admin/vouchers/reclaim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedVoucherIds }),
      });
      const data = await readJsonResponse<{ error?: string; reclaimed?: number }>(response);
      if (!response.ok) throw new Error(data?.error || "Unable to reclaim vouchers.");
      setVoucherNotice(`Reclaimed ${data?.reclaimed ?? selectedVoucherIds.length} voucher(s).`);
      setSelectedVoucherIds([]);
      await Promise.all([loadVouchers(), loadStats()]);
    } catch (error) {
      setVouchersError(error instanceof Error ? error.message : "Unable to reclaim vouchers.");
    }
  }

  // Get visible tabs based on capabilities
  const visibleTabs = NAV_TABS.filter((tab) => {
    if (tab.id === "vouchers") return capabilities.showVoucherSection;
    if (tab.id === "subscribers") return capabilities.showSubscriberSection;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <h1 className="text-lg font-semibold text-foreground">Admin Dashboard</h1>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile Menu Sheet */}
      <BottomSheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Navigation</BottomSheetTitle>
          </BottomSheetHeader>
          <nav className="mt-4 space-y-1">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <tab.icon className="h-5 w-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-6 border-t border-border pt-4">
            <Link
              href={`/t/${tenantSlug}`}
              className="flex items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground hover:bg-muted"
            >
              <Home className="h-5 w-5" />
              <span className="font-medium">Back to Portal</span>
            </Link>
          </div>
        </BottomSheetContent>
      </BottomSheet>

      <div className="lg:flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
          <div className="flex flex-1 flex-col border-r border-border bg-card">
            <div className="flex h-16 items-center gap-3 border-b border-border px-6">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold text-foreground">Admin</span>
            </div>
            <nav className="flex-1 space-y-1 px-3 py-4">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              ))}
            </nav>
            <div className="border-t border-border p-3">
              <Link
                href={`/t/${tenantSlug}`}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground hover:bg-muted"
              >
                <Home className="h-5 w-5" />
                <span className="font-medium">Back to Portal</span>
              </Link>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 lg:pl-64">
          <div className="px-4 py-6 lg:px-8 lg:py-8">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Overview</h1>
                    <p className="mt-1 text-muted-foreground">
                      {capabilities.modeLabel} - {capabilities.flowLabel}
                    </p>
                  </div>
                  <Button variant="outline" onClick={refreshAll} disabled={statsLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    title="Total Revenue"
                    value={money(stats?.transactions.revenueNgn ?? 0)}
                    icon={CreditCard}
                    trend={stats?.transactions.success ? `${stats.transactions.success} successful` : undefined}
                  />
                  <StatCard
                    title="Transactions"
                    value={stats?.transactions.total ?? 0}
                    icon={FileText}
                    trend={stats?.transactions.pending ? `${stats.transactions.pending} pending` : undefined}
                  />
                  {capabilities.showVoucherSection && (
                    <StatCard
                      title="Vouchers Available"
                      value={voucherTotals.unused}
                      icon={Ticket}
                      trend={`${voucherTotals.assigned} assigned`}
                    />
                  )}
                  {capabilities.showSubscriberSection && (
                    <StatCard
                      title="Subscribers"
                      value={subscribers.length}
                      icon={Users}
                      trend={subscribersLoading ? "Refreshing..." : undefined}
                    />
                  )}
                  <StatCard
                    title="Active Plans"
                    value={plans.filter((p) => p.active === 1).length}
                    icon={Package}
                    trend={`${plans.length} total plans`}
                  />
                </div>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                    <CardDescription>Common tasks for your portal</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" onClick={() => setActiveTab("plans")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Plan
                      </Button>
                      {capabilities.canManuallyCreateVouchers && plans.length > 0 && (
                        <Button variant="outline" onClick={() => setShowCreateVoucherSheet(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Voucher
                        </Button>
                      )}
                      {capabilities.canBatchGenerateVouchers && (
                        <Button variant="outline" onClick={() => setShowGenerateVoucherSheet(true)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Generate Vouchers
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => setShowArchitectureSheet(true)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Errors */}
                {statsError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error loading stats</AlertTitle>
                    <AlertDescription>{statsError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Plans Tab */}
            {activeTab === "plans" && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Plans</h1>
                    <p className="mt-1 text-muted-foreground">
                      Manage your WiFi access plans and pricing
                    </p>
                  </div>
                  <Button onClick={() => setShowCreatePlanSheet(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Plan
                  </Button>
                </div>

                {/* Plans List */}
                <div className="space-y-4">
                  {plans.map((plan) => {
                    const draft = planDrafts[plan.id];
                    const isEditing = editingPlanId === plan.id;

                    return (
                      <Card key={plan.id}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                                <Badge variant={plan.active === 1 ? "success" : "secondary"}>
                                  {plan.active === 1 ? "Active" : "Inactive"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span>Code: {plan.code}</span>
                                {plan.durationMinutes && (
                                  <span>Duration: {formatDurationPreview(plan.durationMinutes)}</span>
                                )}
                                <span>Price: {money(plan.priceNgn)}</span>
                              </div>
                              {capabilities.showVoucherSection && (
                                <div className="flex gap-4 text-sm">
                                  <span className="text-success-foreground">
                                    {plan.unusedCount} available
                                  </span>
                                  <span className="text-muted-foreground">
                                    {plan.assignedCount} assigned
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditingPlanId(isEditing ? null : plan.id)}
                              >
                                {isEditing ? "Cancel" : "Edit"}
                              </Button>
                              {isEditing && (
                                <Button
                                  size="sm"
                                  onClick={() => savePlan(plan)}
                                  disabled={savingPlanIds[plan.id]}
                                >
                                  <Save className="mr-1 h-4 w-4" />
                                  Save
                                </Button>
                              )}
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deletePlan(plan)}
                                disabled={deletingPlanIds[plan.id]}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Edit Form */}
                          {isEditing && draft && (
                            <div className="mt-6 grid gap-4 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-3">
                              <div className="space-y-2">
                                <Label>Name</Label>
                                <Input
                                  value={draft.name}
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], name: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Code</Label>
                                <Input
                                  value={draft.code}
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], code: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Duration</Label>
                                <Input
                                  value={draft.duration}
                                  placeholder="1h / 2d / 1w"
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], duration: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Price (NGN)</Label>
                                <Input
                                  value={draft.price}
                                  placeholder="500 / 1k / 2.5k"
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], price: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Max Devices</Label>
                                <Input
                                  value={draft.maxDevices}
                                  placeholder="Leave blank for unlimited"
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], maxDevices: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Data Limit</Label>
                                <Input
                                  value={draft.dataLimitMb}
                                  placeholder="500MB / 1GB"
                                  onChange={(e) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], dataLimitMb: e.target.value },
                                    }))
                                  }
                                />
                              </div>
                              <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
                                <Label>Active</Label>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={draft.active}
                                  onClick={() =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.id]: { ...prev[plan.id], active: !prev[plan.id].active },
                                    }))
                                  }
                                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                    draft.active ? "bg-primary" : "bg-muted"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                      draft.active ? "translate-x-6" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}

                  {plans.length === 0 && !plansLoading && (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <Package className="h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold text-foreground">No plans yet</h3>
                        <p className="mt-1 text-muted-foreground">Create your first plan to get started</p>
                        <Button className="mt-4" onClick={() => setShowCreatePlanSheet(true)}>
                          <Plus className="mr-2 h-4 w-4" />
                          Create Plan
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Alerts */}
                {plansError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{plansError}</AlertDescription>
                  </Alert>
                )}
                {planNotice && (
                  <Alert variant="success">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{planNotice}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Vouchers Tab */}
            {activeTab === "vouchers" && capabilities.showVoucherSection && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Vouchers</h1>
                    <p className="mt-1 text-muted-foreground">
                      {capabilities.flowLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {capabilities.canManuallyCreateVouchers && plans.length > 0 && (
                      <Button variant="outline" onClick={() => setShowCreateVoucherSheet(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    )}
                    {capabilities.canBatchGenerateVouchers && (
                      <Button variant="outline" onClick={() => setShowGenerateVoucherSheet(true)}>
                        Generate
                      </Button>
                    )}
                    {capabilities.canImportCsv && (
                      <Button variant="outline" onClick={() => setShowImportVoucherSheet(true)}>
                        Import CSV
                      </Button>
                    )}
                  </div>
                </div>

                {/* Filters */}
                <Card>
                  <CardContent className="p-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <Input
                        placeholder="Search voucher, email, phone..."
                        value={voucherQuery}
                        onChange={(e) => setVoucherQuery(e.target.value)}
                      />
                      <select
                        className="h-12 rounded-xl border border-input bg-background px-4 text-foreground"
                        value={voucherStatus}
                        onChange={(e) => setVoucherStatus(e.target.value)}
                      >
                        <option value="all">All statuses</option>
                        <option value="UNUSED">Unused</option>
                        <option value="ASSIGNED">Assigned</option>
                      </select>
                      <select
                        className="h-12 rounded-xl border border-input bg-background px-4 text-foreground"
                        value={voucherPlan}
                        onChange={(e) => setVoucherPlan(e.target.value)}
                      >
                        <option value="all">All plans</option>
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {plan.name}
                          </option>
                        ))}
                      </select>
                      <Button variant="outline" onClick={loadVouchers} disabled={vouchersLoading}>
                        {vouchersLoading ? "Loading..." : "Refresh"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Voucher Actions */}
                {selectedVoucherIds.length > 0 && (
                  <div className="flex items-center gap-4 rounded-xl bg-muted p-4">
                    <span className="text-sm text-muted-foreground">
                      {selectedVoucherIds.length} selected
                    </span>
                    {capabilities.canDeleteVouchers && (
                      <Button variant="destructive" size="sm" onClick={deleteSelectedVouchers}>
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                    {capabilities.canReclaimVouchers && (
                      <Button variant="outline" size="sm" onClick={reclaimSelectedVouchers}>
                        <ArchiveRestore className="mr-1 h-4 w-4" />
                        Reclaim
                      </Button>
                    )}
                  </div>
                )}

                {/* Voucher Cards (Mobile) */}
                <div className="space-y-3 lg:hidden">
                  {vouchers.map((row) => (
                    <Card key={row.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selectedVoucherIds.includes(row.id)}
                            onChange={(e) =>
                              setSelectedVoucherIds((prev) =>
                                e.target.checked
                                  ? [...prev, row.id]
                                  : prev.filter((id) => id !== row.id)
                              )
                            }
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-mono font-semibold text-foreground">{row.voucherCode}</p>
                              <Badge variant={row.status === "UNUSED" ? "success" : "warning"}>
                                {row.status}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{row.packageName}</p>
                            {row.assignedToEmail && (
                              <p className="mt-2 text-sm text-muted-foreground">
                                Assigned to: {row.assignedToEmail}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Voucher Table (Desktop) */}
                <div className="hidden lg:block">
                  <Card>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="border-b border-border bg-muted/50">
                          <tr>
                            <th className="px-4 py-3 text-left">
                              <input
                                type="checkbox"
                                checked={selectedVoucherIds.length === vouchers.length && vouchers.length > 0}
                                onChange={(e) =>
                                  setSelectedVoucherIds(
                                    e.target.checked ? vouchers.map((v) => v.id) : []
                                  )
                                }
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                              Voucher
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                              Plan
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                              Assigned To
                            </th>
                            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                              Created
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {vouchers.map((row) => (
                            <tr key={row.id} className="border-b border-border last:border-0">
                              <td className="px-4 py-4">
                                <input
                                  type="checkbox"
                                  checked={selectedVoucherIds.includes(row.id)}
                                  onChange={(e) =>
                                    setSelectedVoucherIds((prev) =>
                                      e.target.checked
                                        ? [...prev, row.id]
                                        : prev.filter((id) => id !== row.id)
                                    )
                                  }
                                />
                              </td>
                              <td className="px-4 py-4">
                                <span className="font-mono font-medium text-foreground">
                                  {row.voucherCode}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">{row.packageName}</td>
                              <td className="px-4 py-4">
                                <Badge variant={row.status === "UNUSED" ? "success" : "warning"}>
                                  {row.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">
                                {row.assignedToEmail || "-"}
                              </td>
                              <td className="px-4 py-4 text-muted-foreground">{dt(row.createdAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                {/* Pagination */}
                {voucherTotalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Showing {(voucherPage - 1) * PAGE_SIZE + 1} to{" "}
                      {Math.min(voucherPage * PAGE_SIZE, voucherTotal)} of {voucherTotal}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVoucherPage((p) => Math.max(1, p - 1))}
                        disabled={voucherPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVoucherPage((p) => Math.min(voucherTotalPages, p + 1))}
                        disabled={voucherPage === voucherTotalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {vouchers.length === 0 && !vouchersLoading && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Ticket className="h-12 w-12 text-muted-foreground" />
                      <h3 className="mt-4 text-lg font-semibold text-foreground">No vouchers found</h3>
                      <p className="mt-1 text-muted-foreground">
                        {capabilities.canManuallyCreateVouchers
                          ? "Create or generate vouchers to get started"
                          : "Vouchers will be created automatically after payments"}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Alerts */}
                {vouchersError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{vouchersError}</AlertDescription>
                  </Alert>
                )}
                {voucherNotice && (
                  <Alert variant="success">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{voucherNotice}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Subscribers Tab */}
            {activeTab === "subscribers" && capabilities.showSubscriberSection && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Subscribers</h1>
                    <p className="mt-1 text-muted-foreground">
                      Manage portal subscribers and their entitlements
                    </p>
                  </div>
                  <Button variant="outline" onClick={loadSubscribers} disabled={subscribersLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${subscribersLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                {/* Subscriber Cards */}
                <div className="space-y-4">
                  {subscribers.map((sub) => (
                    <Card key={sub.subscriberId}>
                      <CardContent className="p-4 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground">
                                {sub.fullName || sub.email}
                              </h3>
                              <Badge variant={sub.status === "active" ? "success" : "secondary"}>
                                {sub.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{sub.email}</p>
                            {sub.phone && (
                              <p className="text-sm text-muted-foreground">{sub.phone}</p>
                            )}
                          </div>
                          <div className="text-sm">
                            <p className="text-muted-foreground">
                              Active sessions: {sub.activeSessions}
                            </p>
                            {sub.entitlement && (
                              <p className="text-muted-foreground">
                                Plan: {sub.entitlement.planName}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  {subscribers.length === 0 && !subscribersLoading && (
                    <Card>
                      <CardContent className="flex flex-col items-center justify-center py-12">
                        <Users className="h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-semibold text-foreground">
                          No subscribers yet
                        </h3>
                        <p className="mt-1 text-muted-foreground">
                          Subscribers will appear here when they create accounts
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {subscribersError && (
                  <Alert variant="destructive">
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{subscribersError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-foreground lg:text-3xl">Settings</h1>
                  <p className="mt-1 text-muted-foreground">
                    Configure your portal architecture and integrations
                  </p>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Architecture</CardTitle>
                    <CardDescription>
                      Configure how your WiFi portal operates
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-xl bg-muted p-4">
                        <div>
                          <p className="font-medium text-foreground">Access Mode</p>
                          <p className="text-sm text-muted-foreground">
                            {capabilities.modeLabel}
                          </p>
                        </div>
                        <Badge>{architecture?.accessMode || "Not configured"}</Badge>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-muted p-4">
                        <div>
                          <p className="font-medium text-foreground">Voucher Source</p>
                          <p className="text-sm text-muted-foreground">
                            {capabilities.flowLabel}
                          </p>
                        </div>
                        <Badge>{architecture?.voucherSourceMode || "Not configured"}</Badge>
                      </div>
                      <Button onClick={() => setShowArchitectureSheet(true)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Configure Architecture
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {architectureNotice && (
                  <Alert variant="success">
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{architectureNotice}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden">
        <div className="flex">
          {visibleTabs.slice(0, 5).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <tab.icon className="h-5 w-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Create Plan Sheet */}
      <BottomSheet open={showCreatePlanSheet} onOpenChange={setShowCreatePlanSheet}>
        <BottomSheetContent className="max-h-[90vh] overflow-y-auto">
          <BottomSheetHeader>
            <BottomSheetTitle>Create Plan</BottomSheetTitle>
          </BottomSheetHeader>
          <form onSubmit={createPlan} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Plan Name</Label>
              <Input
                value={newPlanName}
                onChange={(e) => setNewPlanName(e.target.value)}
                placeholder="e.g. 1 Hour Access"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration</Label>
                <Input
                  value={newPlanDuration}
                  onChange={(e) => setNewPlanDuration(e.target.value)}
                  placeholder="1h / 2d / 1w"
                />
                {parsedNewPlanDuration && Number.isFinite(parsedNewPlanDuration) && (
                  <p className="text-xs text-muted-foreground">
                    {formatDurationPreview(parsedNewPlanDuration)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Price (NGN)</Label>
                <Input
                  value={newPlanPrice}
                  onChange={(e) => setNewPlanPrice(e.target.value)}
                  placeholder="500 / 1k"
                  required
                />
                {parsedNewPlanPrice && Number.isFinite(parsedNewPlanPrice) && (
                  <p className="text-xs text-muted-foreground">{money(parsedNewPlanPrice)}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Devices</Label>
                <Input
                  value={newPlanMaxDevices}
                  onChange={(e) => setNewPlanMaxDevices(e.target.value)}
                  placeholder="Unlimited"
                />
              </div>
              <div className="space-y-2">
                <Label>Data Limit</Label>
                <Input
                  value={newPlanDataLimitMb}
                  onChange={(e) => setNewPlanDataLimitMb(e.target.value)}
                  placeholder="500MB / 1GB"
                />
                {parsedNewPlanDataLimit && Number.isFinite(parsedNewPlanDataLimit) && (
                  <p className="text-xs text-muted-foreground">
                    {formatDataLimitPreviewMb(parsedNewPlanDataLimit)}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bandwidth Profile</Label>
              <Input
                value={newPlanBandwidthProfile}
                onChange={(e) => setNewPlanBandwidthProfile(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button type="submit" className="w-full" disabled={creatingPlan}>
              {creatingPlan ? "Creating..." : "Create Plan"}
            </Button>
          </form>
        </BottomSheetContent>
      </BottomSheet>

      {/* Create Voucher Sheet */}
      <BottomSheet open={showCreateVoucherSheet} onOpenChange={setShowCreateVoucherSheet}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Add Voucher</BottomSheetTitle>
          </BottomSheetHeader>
          <form onSubmit={createVoucher} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Voucher Code</Label>
              <Input
                value={newVoucherCode}
                onChange={(e) => setNewVoucherCode(e.target.value)}
                placeholder="Enter voucher code"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Plan</Label>
              <select
                className="h-12 w-full rounded-xl border border-input bg-background px-4"
                value={newVoucherPackageId}
                onChange={(e) => setNewVoucherPackageId(e.target.value)}
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" className="w-full" disabled={creatingVoucher}>
              {creatingVoucher ? "Creating..." : "Add Voucher"}
            </Button>
          </form>
        </BottomSheetContent>
      </BottomSheet>

      {/* Generate Vouchers Sheet */}
      <BottomSheet open={showGenerateVoucherSheet} onOpenChange={setShowGenerateVoucherSheet}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Generate Vouchers</BottomSheetTitle>
          </BottomSheetHeader>
          <form onSubmit={generateVouchers} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <select
                className="h-12 w-full rounded-xl border border-input bg-background px-4"
                value={newVoucherPackageId}
                onChange={(e) => setNewVoucherPackageId(e.target.value)}
                required
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Count</Label>
                <Input
                  type="number"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(e.target.value)}
                  min={1}
                  max={500}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Code Length</Label>
                <Input
                  type="number"
                  value={generateCodeLength}
                  onChange={(e) => setGenerateCodeLength(e.target.value)}
                  min={6}
                  max={32}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prefix (Optional)</Label>
              <Input
                value={generatePrefix}
                onChange={(e) => setGeneratePrefix(e.target.value)}
                placeholder="e.g. WIFI-"
              />
            </div>
            <Button type="submit" className="w-full" disabled={generatingVouchers}>
              {generatingVouchers ? "Generating..." : "Generate Vouchers"}
            </Button>
          </form>
        </BottomSheetContent>
      </BottomSheet>

      {/* Import CSV Sheet */}
      <BottomSheet open={showImportVoucherSheet} onOpenChange={setShowImportVoucherSheet}>
        <BottomSheetContent>
          <BottomSheetHeader>
            <BottomSheetTitle>Import Vouchers from CSV</BottomSheetTitle>
          </BottomSheetHeader>
          <form onSubmit={importCsv} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] ?? null)}
                required
              />
              <p className="text-xs text-muted-foreground">
                <Link href="/help/csv-import" className="underline" target="_blank">
                  View CSV format requirements
                </Link>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Package Code</Label>
              <Input
                value={importPackageCode}
                onChange={(e) => setImportPackageCode(e.target.value)}
                placeholder="e.g. 1HR"
                required
              />
            </div>
            {importError && (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            {importNotice && (
              <Alert variant="success">
                <AlertDescription>{importNotice}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={importLoading}>
              {importLoading ? "Importing..." : "Import Vouchers"}
            </Button>
          </form>
        </BottomSheetContent>
      </BottomSheet>

      {/* Architecture Settings Sheet */}
      <BottomSheet open={showArchitectureSheet} onOpenChange={setShowArchitectureSheet}>
        <BottomSheetContent className="max-h-[90vh] overflow-y-auto">
          <BottomSheetHeader>
            <BottomSheetTitle>Architecture Settings</BottomSheetTitle>
          </BottomSheetHeader>
          {architecture && (
            <form onSubmit={saveArchitecture} className="mt-4 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Access Mode</Label>
                  <select
                    className="h-12 w-full rounded-xl border border-input bg-background px-4"
                    value={architecture.accessMode}
                    onChange={(e) =>
                      setArchitecture((prev) =>
                        prev ? { ...prev, accessMode: e.target.value as ArchitectureConfig["accessMode"] } : prev
                      )
                    }
                  >
                    <option value="voucher_access">Voucher Access</option>
                    <option value="account_access">Account Access (RADIUS)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Voucher Source Mode</Label>
                  <select
                    className="h-12 w-full rounded-xl border border-input bg-background px-4"
                    value={architecture.voucherSourceMode}
                    onChange={(e) =>
                      setArchitecture((prev) =>
                        prev
                          ? { ...prev, voucherSourceMode: e.target.value as ArchitectureConfig["voucherSourceMode"] }
                          : prev
                      )
                    }
                  >
                    <option value="import_csv">CSV Import</option>
                    <option value="omada_openapi">Omada API</option>
                    <option value="mikrotik_rest">MikroTik REST</option>
                    <option value="radius_voucher">RADIUS Voucher</option>
                  </select>
                </div>
              </div>

              {/* Omada Settings */}
              {architecture.voucherSourceMode === "omada_openapi" && (
                <div className="space-y-4 rounded-xl border border-border p-4">
                  <h4 className="font-medium text-foreground">Omada Controller</h4>
                  <div className="space-y-2">
                    <Label>API Base URL</Label>
                    <Input
                      value={architecture.omada.apiBaseUrl}
                      onChange={(e) =>
                        setArchitecture((prev) =>
                          prev ? { ...prev, omada: { ...prev.omada, apiBaseUrl: e.target.value } } : prev
                        )
                      }
                      placeholder="https://omada.example.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <Input
                        value={architecture.omada.clientId}
                        onChange={(e) =>
                          setArchitecture((prev) =>
                            prev ? { ...prev, omada: { ...prev.omada, clientId: e.target.value } } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Client Secret</Label>
                      <Input
                        type="password"
                        value={omadaClientSecret}
                        onChange={(e) => setOmadaClientSecret(e.target.value)}
                        placeholder={architecture.omada.hasClientSecret ? "••••••••" : "Enter secret"}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={testOmadaConnection} disabled={omadaTestLoading}>
                      {omadaTestLoading ? "Testing..." : "Test Connection"}
                    </Button>
                    <Button type="button" variant="outline" onClick={discoverOmadaSites} disabled={omadaSitesLoading}>
                      {omadaSitesLoading ? "Discovering..." : "Discover Sites"}
                    </Button>
                  </div>
                  {omadaTestNotice && <p className="text-sm text-success-foreground">{omadaTestNotice}</p>}
                  {omadaTestError && <p className="text-sm text-destructive">{omadaTestError}</p>}
                </div>
              )}

              {/* MikroTik Settings */}
              {architecture.voucherSourceMode === "mikrotik_rest" && (
                <div className="space-y-4 rounded-xl border border-border p-4">
                  <h4 className="font-medium text-foreground">MikroTik Router</h4>
                  <div className="space-y-2">
                    <Label>Base URL</Label>
                    <Input
                      value={architecture.mikrotik.baseUrl}
                      onChange={(e) =>
                        setArchitecture((prev) =>
                          prev ? { ...prev, mikrotik: { ...prev.mikrotik, baseUrl: e.target.value } } : prev
                        )
                      }
                      placeholder="https://192.168.1.1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        value={architecture.mikrotik.username}
                        onChange={(e) =>
                          setArchitecture((prev) =>
                            prev ? { ...prev, mikrotik: { ...prev.mikrotik, username: e.target.value } } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={mikrotikPassword}
                        onChange={(e) => setMikrotikPassword(e.target.value)}
                        placeholder={architecture.mikrotik.hasPassword ? "••••••••" : "Enter password"}
                      />
                    </div>
                  </div>
                  <Button type="button" variant="outline" onClick={testMikrotikConnection} disabled={mikrotikTestLoading}>
                    {mikrotikTestLoading ? "Testing..." : "Test Connection"}
                  </Button>
                  {mikrotikTestNotice && <p className="text-sm text-success-foreground">{mikrotikTestNotice}</p>}
                  {mikrotikTestError && <p className="text-sm text-destructive">{mikrotikTestError}</p>}
                </div>
              )}

              {architectureError && (
                <Alert variant="destructive">
                  <AlertDescription>{architectureError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={architectureSaving}>
                {architectureSaving ? "Saving..." : "Save Settings"}
              </Button>
            </form>
          )}
        </BottomSheetContent>
      </BottomSheet>

      {/* Spacer for bottom nav on mobile */}
      <div className="h-20 lg:hidden" />
    </div>
  );
}
