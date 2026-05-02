"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  CreditCard,
  Database,
  FileClock,
  Globe2,
  KeyRound,
  LogOut,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type View = "tenants" | "transactions" | "revenue" | "integrations" | "audit" | "settings";
type SettingsTab = "platform" | "billing" | "notifications";

type TenantDto = {
  id: string;
  slug: string;
  name: string;
  adminEmail: string;
  status: string;
  locationCount: number;
  maxLocations: number;
  paystackLast4: string | null;
  createdAt: string;
  updatedAt: string;
};

type TenantStatsDto = {
  id: string;
  slug: string;
  name: string;
  status: string;
  locationCount: number;
  maxLocations: number;
  paystackLast4: string | null;
  stats: {
    voucherPool: Array<{
      code: string;
      name: string;
      total: number;
      unused: number;
      assigned: number;
      percentageRemaining: number;
    }>;
    packages: Array<{
      id: string;
      code: string;
      name: string;
      durationMinutes: number | null;
      priceNgn: number;
      active: number;
    }>;
    transactions: {
      total: number;
      success: number;
      pending: number;
      processing: number;
      failed: number;
      revenueNgn: number;
    };
  };
};

type TenantRequestDto = {
  id: string;
  requestedSlug: string;
  requestedName: string;
  requestedEmail: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  tenantId: string | null;
};

type PlatformTransaction = {
  id: string;
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  reference: string;
  email: string;
  phone: string;
  amountNgn: number;
  voucherCode: string | null;
  packageCode: string | null;
  packageName: string | null;
  deliveryMode: string;
  paymentStatus: string;
  createdAt: string;
  paidAt: string | null;
};

type PlatformPaystackDto = {
  hasSecretKey: boolean;
  secretKeyLast4: string;
  hasPublicKey: boolean;
  publicKeyLast4: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const nav = [
  { key: "tenants", label: "Tenants", short: "Tenants", icon: Building2 },
  { key: "transactions", label: "Transactions", short: "Txns", icon: CreditCard },
  { key: "revenue", label: "Revenue", short: "Revenue", icon: BarChart3 },
  { key: "integrations", label: "Integrations", short: "Integr.", icon: PlugZap },
  { key: "audit", label: "Audit Log", short: "Audit", icon: FileClock },
  { key: "settings", label: "Settings", short: "Settings", icon: Settings },
] satisfies Array<{ key: View; label: string; short: string; icon: typeof Building2 }>;

const settingsTabs: SettingsTab[] = ["platform", "billing", "notifications"];

function replaceQueryParams(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
  }
  const query = url.searchParams.toString();
  window.history.replaceState(null, "", `${url.pathname}${query ? `?${query}` : ""}${url.hash}`);
}

const platformAdminCriticalCss = `
#s-platform{min-height:100vh;background:var(--bg);color:var(--tx)}
#s-platform *{box-sizing:border-box}
#s-platform button,#s-platform input,#s-platform select,#s-platform textarea{font:inherit}
#s-platform .dash-layout{display:flex!important;min-height:100vh;background:var(--bg)}
#s-platform .sidebar{position:sticky;top:0;width:230px;height:100vh;overflow-y:auto;display:flex!important;flex-direction:column;flex-shrink:0;background:var(--s1);border-right:1px solid var(--bd)}
#s-platform .sb-brand{display:flex;align-items:center;gap:10px;padding:14px 12px;border-bottom:1px solid var(--bd)}
#s-platform .sb-mark,#s-platform .sb-av{display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--s2);border:1px solid var(--bd);color:var(--ac);font-family:var(--font-heading),sans-serif;font-weight:900}
#s-platform .sb-mark{width:36px;height:36px;border-radius:9px;font-size:13px}
#s-platform .sb-av{width:30px;height:30px;border-radius:50%;font-size:12px}
#s-platform .sb-name{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--tx)}
#s-platform .plat-tag{border:1px solid var(--ac-bd);border-radius:999px;background:var(--ac-dim);color:var(--ac);padding:1px 6px;font-family:var(--font-mono),monospace;font-size:8px;letter-spacing:.08em}
#s-platform .sb-url,#s-platform .sb-urole{font-family:var(--font-mono),monospace;color:var(--tx3);font-size:10px}
#s-platform .sb-nav{flex:1;padding:8px 6px}
#s-platform .sb-sec{padding:12px 8px 6px;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase}
#s-platform .sb-item{position:relative;width:100%;display:flex!important;align-items:center;gap:8px;margin-bottom:1px;padding:8px 9px;border:0;border-radius:6px;background:transparent;color:var(--tx2);font-size:13px;font-weight:600;text-align:left;cursor:pointer;text-decoration:none}
#s-platform .sb-item:hover,#s-platform .sb-item.on{color:var(--tx);background:var(--s2)}
#s-platform .sb-item.on:after{content:"";position:absolute;left:0;top:50%;width:2px;height:18px;border-radius:0 2px 2px 0;background:var(--ac);transform:translateY(-50%)}
#s-platform .sb-bdg{margin-left:auto;border:1px solid var(--ac-bd);border-radius:999px;background:var(--ac-dim);color:var(--ac);padding:1px 6px;font-family:var(--font-mono),monospace;font-size:10px}
#s-platform .sb-foot{padding:10px;border-top:1px solid var(--bd)}
#s-platform .sb-user{display:flex;align-items:center;gap:9px;padding:8px;border-radius:var(--r)}
#s-platform .sb-uname{font-size:12px;font-weight:700;color:var(--tx)}
#s-platform .dash-main{min-width:0;flex:1;display:flex!important;flex-direction:column;overflow:hidden}
#s-platform .dash-topbar{height:54px;display:flex!important;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:0 20px;background:var(--s1);border-bottom:1px solid var(--bd)}
#s-platform .dash-crumb{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px;white-space:nowrap}
#s-platform .dash-crumb span:last-child{color:var(--tx)}
#s-platform .dash-crumb-sep{color:var(--bd2)}
#s-platform .dash-topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
#s-platform .dash-content{flex:1;overflow-y:auto;padding:clamp(14px,2.5vw,24px)}
#s-platform .dash-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px}
#s-platform .dash-title{font-family:var(--font-heading),sans-serif;font-size:22px;font-weight:900;letter-spacing:-.03em;color:var(--tx)}
#s-platform .dash-sub{margin-top:3px;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px}
#s-platform .dash-hdr-r{display:flex;flex-wrap:wrap;gap:8px}
#s-platform .dash-section{display:none!important}
#s-platform .dash-section.on{display:block!important}
#s-platform .btn{display:inline-flex!important;align-items:center;justify-content:center;gap:6px;padding:9px 16px;border-radius:var(--r);font-size:13px;font-weight:700;line-height:1;white-space:nowrap;cursor:pointer;text-decoration:none;transition:all .15s}
#s-platform .btn:disabled{opacity:.55;cursor:not-allowed}
#s-platform .btn-ac{background:var(--ac);color:#0d0d0d;border:1px solid transparent}
#s-platform .btn-muted{background:var(--s2);color:var(--tx2);border:1px solid var(--bd)}
#s-platform .btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--bd2)}
#s-platform .btn-red{background:oklch(0.65 0.18 25/.15);color:var(--red);border:1px solid oklch(0.65 0.18 25/.25)}
#s-platform .btn-sm{padding:6px 10px;font-size:12px}
#s-platform .btn-xs{padding:4px 8px;font-size:11px}
#s-platform .btn-icon{width:34px;height:34px;padding:0}
#s-platform .theme-toggle{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid var(--bd2);border-radius:999px;background:var(--s2);color:var(--tx2);font-family:var(--font-mono),monospace;font-size:11px;text-transform:uppercase}
#s-platform .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;margin-bottom:18px}
#s-platform .kpi,#s-platform .ac,#s-platform .settings-card,#s-platform .int-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)}
#s-platform .kpi{padding:16px}
#s-platform .kpi-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
#s-platform .kpi-label{font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx3)}
#s-platform .kpi-val{margin-bottom:4px;color:var(--tx);font-family:var(--font-mono),monospace;font-size:clamp(18px,2.5vw,24px);font-variant-numeric:tabular-nums}
#s-platform .kpi-delta{font-family:var(--font-mono),monospace;font-size:11px}
#s-platform .kpi-delta.up{color:var(--green)}#s-platform .kpi-delta.warn{color:var(--amber)}#s-platform .kpi-delta.neu{color:var(--tx3)}
#s-platform .dash-grid{display:grid;grid-template-columns:1fr 320px;gap:14px}
#s-platform .ac{overflow:hidden;margin-bottom:14px}
#s-platform .ac-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd)}
#s-platform .ac-title{font-size:13px;font-weight:700;color:var(--tx)}
#s-platform .ac-sub{font-family:var(--font-mono),monospace;font-size:11px;color:var(--tx3)}
#s-platform .tbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd)}
#s-platform .tsearch,#s-platform .tfilter,#s-platform .field input,#s-platform .field select,#s-platform .field textarea{border:1px solid var(--bd)!important;border-radius:var(--r)!important;background:var(--s2)!important;color:var(--tx)!important;outline:none}
#s-platform .tsearch{width:220px;height:32px;padding:0 12px;font-family:var(--font-mono),monospace;font-size:12px}
#s-platform .tfilter{width:auto!important;min-width:150px;height:32px;padding:0 10px;font-family:var(--font-mono),monospace;font-size:12px;color:var(--tx2)!important}
#s-platform .table-scroll{overflow-x:auto}
#s-platform table.t{width:100%;border-collapse:collapse}
#s-platform table.t th{padding:8px 14px;border-bottom:1px solid var(--bd);background:var(--s2)!important;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:10px;font-weight:600;letter-spacing:.06em;text-align:left;text-transform:uppercase;white-space:nowrap}
#s-platform table.t td{padding:11px 14px;border-bottom:1px solid var(--bd);color:var(--tx2);font-size:12px;vertical-align:middle}
#s-platform .td-main{color:var(--tx);font-weight:700}
#s-platform .td-mono{color:var(--ac);font-family:var(--font-mono),monospace}
#s-platform .td-muted{color:var(--tx2);font-family:var(--font-mono),monospace;font-size:12px}
#s-platform .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-family:var(--font-mono),monospace;font-size:11px;font-weight:700;white-space:nowrap}
#s-platform .badge:before{content:"";width:5px;height:5px;border-radius:50%;flex-shrink:0}
#s-platform .badge-g{background:oklch(0.72 0.17 155/.12);color:var(--green);border:1px solid oklch(0.72 0.17 155/.2)}#s-platform .badge-g:before{background:var(--green)}
#s-platform .badge-a{background:oklch(0.78 0.18 80/.12);color:var(--amber);border:1px solid oklch(0.78 0.18 80/.2)}#s-platform .badge-a:before{background:var(--amber)}
#s-platform .badge-r{background:oklch(0.65 0.18 25/.12);color:var(--red);border:1px solid oklch(0.65 0.18 25/.2)}#s-platform .badge-r:before{background:var(--red)}
#s-platform .badge-m{background:var(--s2);color:var(--tx3);border:1px solid var(--bd)}#s-platform .badge-m:before{background:var(--tx3)}
#s-platform .tenant-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto auto auto;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--bd)}
#s-platform .tenant-row:last-child{border-bottom:0}
#s-platform .t-av{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid var(--bd);border-radius:10px;background:var(--s2);color:var(--ac);font-weight:900}
#s-platform .t-name{color:var(--tx);font-weight:800}
#s-platform .t-slug{font-family:var(--font-mono),monospace;color:var(--tx3);font-size:11px}
#s-platform .t-rev,#s-platform .t-txn{text-align:right;font-family:var(--font-mono),monospace}
#s-platform .t-rev span,#s-platform .t-txn span{display:block;color:var(--tx);font-size:13px}
#s-platform .t-rev small,#s-platform .t-txn small{display:block;color:var(--tx3);font-size:10px}
#s-platform .row-actions{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:6px}
#s-platform .request-row{grid-template-columns:38px minmax(0,1fr) auto}
#s-platform .t-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--bd);color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px}
#s-platform .pager-actions{display:flex;gap:6px}
#s-platform .settings-card{padding:18px;margin-bottom:14px}
#s-platform .settings-card-title{margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--bd);font-family:var(--font-mono),monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx)}
#s-platform .field>span{display:block;margin-bottom:5px;color:var(--tx2);font-size:12px;font-weight:700}
#s-platform .field input,#s-platform .field select{height:42px;padding:0 13px}
#s-platform .field textarea{min-height:92px;padding:10px 13px;resize:vertical}
#s-platform .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#s-platform .settings-layout{display:grid;grid-template-columns:190px 1fr;gap:16px;align-items:start}
#s-platform .settings-tabs{overflow:hidden;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1)}
#s-platform .settings-tab{width:100%;padding:10px 14px;border:0;border-bottom:1px solid var(--bd);background:transparent;color:var(--tx2);font-size:13px;font-weight:700;text-align:left;cursor:pointer}
#s-platform .settings-tab.on,#s-platform .settings-tab:hover{color:var(--ac);background:var(--ac-dim)}
#s-platform .settings-panel{display:none!important}
#s-platform .settings-panel.on{display:block!important}
#s-platform .settings-foot{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:12px}
#s-platform .int-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
#s-platform .int-card{padding:16px}
#s-platform .int-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
#s-platform .int-title{color:var(--tx);font-size:14px;font-weight:800}
#s-platform .int-copy{color:var(--tx3);font-size:12px;line-height:1.5}
#s-platform .rev-bars{display:flex;flex-direction:column;gap:12px;padding:16px}
#s-platform .rev-row{display:grid;grid-template-columns:130px 1fr 105px;align-items:center;gap:10px}
#s-platform .rev-name{overflow:hidden;color:var(--tx2);font-size:12px;text-overflow:ellipsis;white-space:nowrap}
#s-platform .rev-track{height:8px;border-radius:999px;background:var(--s2);overflow:hidden}
#s-platform .rev-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--ac),oklch(0.78 0.18 80))}
#s-platform .rev-val{font-family:var(--font-mono),monospace;color:var(--tx);font-size:12px;text-align:right}
#s-platform .alert-banner{display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 14px;border-radius:var(--r);font-size:13px;font-weight:700}
#s-platform .alert-banner.info{color:var(--green);background:oklch(0.72 0.17 155/.08);border:1px solid oklch(0.72 0.17 155/.15)}
#s-platform .alert-banner.warn{color:var(--amber);background:oklch(0.78 0.18 80/.08);border:1px solid oklch(0.78 0.18 80/.2)}
#s-platform .alert-banner.err{color:var(--red);background:oklch(0.65 0.18 25/.10);border:1px solid oklch(0.65 0.18 25/.22)}
#s-platform .toggle-list{display:flex;flex-direction:column;gap:12px}
#s-platform .toggle{display:flex;align-items:center;gap:8px}
#s-platform .toggle-track{position:relative;width:36px;height:20px;border:1px solid var(--bd2);border-radius:999px;background:var(--s3)}
#s-platform .toggle-track:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff}
#s-platform .toggle-track.on{background:var(--ac);border-color:var(--ac)}
#s-platform .toggle-track.on:after{transform:translateX(16px)}
#s-platform .toggle-label{font-size:13px;color:var(--tx2)}
#s-platform .mob-menu{display:none;position:fixed;left:0;right:0;bottom:0;z-index:50;gap:4px;padding:8px 16px;border-top:1px solid var(--bd);background:var(--s1)}
#s-platform .mob-btn{display:flex;flex:1;flex-direction:column;align-items:center;gap:3px;padding:6px 10px;border:0;border-radius:var(--r);background:transparent;color:var(--tx3);font-size:10px;cursor:pointer}
#s-platform .mob-btn.on,#s-platform .mob-btn:hover{color:var(--tx);background:var(--s2)}
#s-platform .spin{animation:payspot-spin .8s linear infinite}@keyframes payspot-spin{to{transform:rotate(360deg)}}
@media(max-width:1080px){#s-platform .dash-grid{grid-template-columns:1fr}}
@media(max-width:900px){#s-platform .sidebar{display:none!important}#s-platform .dash-layout{display:block!important}#s-platform .dash-main{min-height:100vh}#s-platform .dash-topbar{height:auto;min-height:54px;align-items:flex-start;flex-wrap:wrap;padding:10px 14px}#s-platform .dash-crumb,#s-platform .dash-topbar-right{width:100%}#s-platform .dash-topbar-right{overflow-x:auto}#s-platform .dash-content{padding:16px 14px 90px}#s-platform .mob-menu{display:flex!important;justify-content:flex-start;overflow-x:auto;padding:8px 10px}#s-platform .mob-btn{min-width:72px;flex:0 0 auto}#s-platform table.t{min-width:760px}}
@media(max-width:700px){#s-platform .field-row,#s-platform .settings-layout{grid-template-columns:1fr}#s-platform .kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))}#s-platform .dash-hdr-r,#s-platform .tbar{width:100%;align-items:stretch}#s-platform .dash-hdr-r{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}#s-platform .dash-hdr-r .btn,#s-platform .tbar>*,#s-platform .tsearch,#s-platform .tfilter{width:100%!important}#s-platform .tenant-row,#s-platform .request-row{grid-template-columns:38px 1fr}#s-platform .t-rev,#s-platform .t-txn{text-align:left}#s-platform .row-actions{grid-column:1/-1;justify-content:flex-start}#s-platform .t-pagination{align-items:stretch;flex-direction:column}#s-platform .settings-tabs{display:flex;overflow-x:auto}#s-platform .settings-tab{flex:0 0 auto;width:auto;border-right:1px solid var(--bd);border-bottom:0;white-space:nowrap}#s-platform .rev-row{grid-template-columns:1fr}#s-platform .rev-val{text-align:left}}
`;

async function readJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error || "Request failed.");
  if (!data) throw new Error("Request failed.");
  return data;
}

function money(value?: number | null) {
  return `NGN ${new Intl.NumberFormat("en-NG").format(Math.round(value ?? 0))}`;
}

function compact(value?: number | null) {
  return new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "active" || normalized === "success" || normalized === "approved") return "badge badge-g";
  if (normalized.includes("pending") || normalized === "processing") return "badge badge-a";
  if (normalized === "denied" || normalized === "suspended" || normalized === "failed") return "badge badge-r";
  return "badge badge-m";
}

function tenantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "PS";
}

export function AdminTenantsPanel() {
  const [view, setView] = useState<View>("tenants");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("platform");
  const restoredUrlState = useRef(false);
  const skipNextUrlWrite = useRef(true);
  const [tenants, setTenants] = useState<TenantDto[]>([]);
  const [statsTenants, setStatsTenants] = useState<TenantStatsDto[]>([]);
  const [requests, setRequests] = useState<TenantRequestDto[]>([]);
  const [transactions, setTransactions] = useState<PlatformTransaction[]>([]);
  const [platformPaystack, setPlatformPaystack] = useState<PlatformPaystackDto | null>(null);
  const [platformPaystackForm, setPlatformPaystackForm] = useState({ secretKey: "", publicKey: "" });
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");
  const [txQuery, setTxQuery] = useState("");
  const [txStatus, setTxStatus] = useState("all");
  const [newTenant, setNewTenant] = useState({
    slug: "",
    name: "",
    adminEmail: "",
    password: "",
    maxLocations: "1",
  });

  const statByTenantId = useMemo(() => new Map(statsTenants.map((tenant) => [tenant.id, tenant])), [statsTenants]);
  const pendingRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("tab");
    const requestedSettingsTab = params.get("settings");

    if (nav.some((item) => item.key === requestedView)) {
      setView(requestedView as View);
    }
    if (settingsTabs.includes(requestedSettingsTab as SettingsTab)) {
      setSettingsTab(requestedSettingsTab as SettingsTab);
    }

    restoredUrlState.current = true;
  }, []);

  useEffect(() => {
    if (!restoredUrlState.current) return;
    if (skipNextUrlWrite.current) {
      skipNextUrlWrite.current = false;
      return;
    }

    replaceQueryParams({
      tab: view === "tenants" ? null : view,
      settings: view === "settings" && settingsTab !== "platform" ? settingsTab : null,
    });
  }, [settingsTab, view]);

  const platformStats = useMemo(() => {
    const totalRevenue = statsTenants.reduce((sum, tenant) => sum + tenant.stats.transactions.revenueNgn, 0);
    const totalTransactions = statsTenants.reduce((sum, tenant) => sum + tenant.stats.transactions.total, 0);
    const success = statsTenants.reduce((sum, tenant) => sum + tenant.stats.transactions.success, 0);
    const failed = statsTenants.reduce((sum, tenant) => sum + tenant.stats.transactions.failed, 0);
    const vouchersIssued = statsTenants.reduce(
      (sum, tenant) => sum + tenant.stats.voucherPool.reduce((poolSum, pkg) => poolSum + pkg.assigned, 0),
      0,
    );
    const activeTenants = tenants.filter((tenant) => tenant.status.toLowerCase() === "active").length;
    return {
      totalRevenue,
      totalTransactions,
      success,
      failed,
      vouchersIssued,
      activeTenants,
      platformFee: Math.round(totalRevenue * 0.02),
      paystackEstimate: Math.round(totalRevenue * 0.015),
      netOperatorRevenue: Math.max(0, Math.round(totalRevenue * 0.965)),
    };
  }, [statsTenants, tenants]);

  const filteredTenants = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return tenants.filter((tenant) => {
      const statusOk =
        tenantStatusFilter === "all" || tenant.status.toLowerCase() === tenantStatusFilter.toLowerCase();
      if (!statusOk) return false;
      if (!normalized) return true;
      return [tenant.slug, tenant.name, tenant.adminEmail].some((value) =>
        value.toLowerCase().includes(normalized),
      );
    });
  }, [tenants, query, tenantStatusFilter]);

  const topRevenueTenants = useMemo(() => {
    return [...statsTenants]
      .sort((a, b) => b.stats.transactions.revenueNgn - a.stats.transactions.revenueNgn)
      .slice(0, 8);
  }, [statsTenants]);

  const activityRows = useMemo(() => {
    const requestRows = requests.slice(0, 8).map((request) => ({
      id: `request-${request.id}`,
      time: request.reviewedAt ?? request.createdAt,
      actor: "Operator request",
      event: `${request.requestedName} requested ${request.requestedSlug}`,
      status: request.status,
    }));
    const txRows = transactions.slice(0, 8).map((transaction) => ({
      id: `tx-${transaction.id}`,
      time: transaction.paidAt ?? transaction.createdAt,
      actor: transaction.tenantName ?? transaction.tenantSlug ?? "Tenant",
      event: `${transaction.reference} for ${money(transaction.amountNgn)}`,
      status: transaction.paymentStatus,
    }));
    const tenantRows = tenants.slice(0, 8).map((tenant) => ({
      id: `tenant-${tenant.id}`,
      time: tenant.updatedAt,
      actor: "Tenant lifecycle",
      event: `${tenant.name} is ${tenant.status}`,
      status: tenant.status,
    }));
    return [...requestRows, ...txRows, ...tenantRows]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 14);
  }, [requests, tenants, transactions]);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const [tenantsData, statsData, requestsData, paystackData] = await Promise.all([
        readJson<{ tenants: TenantDto[] }>("/api/admin/tenants"),
        readJson<{ tenants: TenantStatsDto[] }>("/api/admin/stats"),
        readJson<{ requests: TenantRequestDto[] }>("/api/admin/tenant-requests?status=all&limit=120"),
        readJson<{ settings: PlatformPaystackDto }>("/api/admin/platform/paystack"),
      ]);
      setTenants(tenantsData.tenants);
      setStatsTenants(statsData.tenants);
      setRequests(requestsData.requests);
      setPlatformPaystack(paystackData.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const loadTransactions = useCallback(async (page = 1) => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pagination.pageSize),
        status: txStatus,
      });
      if (txQuery.trim()) params.set("q", txQuery.trim());
      const data = await readJson<{ transactions: PlatformTransaction[]; pagination: Pagination }>(
        `/api/admin/transactions?${params}`,
      );
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load platform transactions.");
    } finally {
      setTxLoading(false);
    }
  }, [pagination.pageSize, txQuery, txStatus]);

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTransactions(1);
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [loadTransactions]);

  async function refreshAll() {
    await Promise.all([loadDashboard(), loadTransactions(pagination.page)]);
  }

  async function createTenant(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<{
        tenant: TenantDto;
        credentials: { email: string; temporaryPassword: string; mailSent: boolean };
      }>("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: newTenant.slug.trim(),
          name: newTenant.name.trim(),
          adminEmail: newTenant.adminEmail.trim(),
          password: newTenant.password.trim() || undefined,
          maxLocations: Number(newTenant.maxLocations || 1),
        }),
      });
      setNotice(
        `Created ${data.tenant.slug}. Login: ${data.credentials.email}. Temp password: ${data.credentials.temporaryPassword}.`,
      );
      setNewTenant({ slug: "", name: "", adminEmail: "", password: "", maxLocations: "1" });
      setShowCreate(false);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create tenant.");
    } finally {
      setLoading(false);
    }
  }

  async function reviewRequest(requestId: string, action: "approve" | "deny") {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<{ tenant?: TenantDto; credentials?: { temporaryPassword: string } }>(
        "/api/admin/tenant-requests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, action }),
        },
      );
      setNotice(
        action === "approve"
          ? `Request approved. Temp password: ${data.credentials?.temporaryPassword ?? "emailed to operator"}.`
          : "Request denied.",
      );
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to review request.");
    } finally {
      setLoading(false);
    }
  }

  async function updateTenantStatus(tenant: TenantDto, status: string) {
    setLoading(true);
    setError(null);
    try {
      await readJson(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: tenant.slug,
          name: tenant.name,
          adminEmail: tenant.adminEmail,
          status,
        }),
      });
      setNotice(`${tenant.name} marked ${status}.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update tenant.");
    } finally {
      setLoading(false);
    }
  }

  async function updateTenantLocationLimit(tenant: TenantDto) {
    const nextValue = window.prompt(
      `How many storefront locations can ${tenant.name} have?`,
      String(tenant.maxLocations ?? 1),
    );
    if (nextValue === null) return;
    const maxLocations = Math.floor(Number(nextValue));
    if (!Number.isFinite(maxLocations) || maxLocations < 1 || maxLocations > 50) {
      setError("Location limit must be between 1 and 50.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await readJson(`/api/admin/tenants/${tenant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: tenant.slug,
          name: tenant.name,
          adminEmail: tenant.adminEmail,
          status: tenant.status,
          maxLocations,
        }),
      });
      setNotice(`${tenant.name} can now have up to ${maxLocations} storefront location${maxLocations === 1 ? "" : "s"}.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update location limit.");
    } finally {
      setLoading(false);
    }
  }

  async function savePlatformPaystack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const data = await readJson<{ settings: PlatformPaystackDto }>("/api/admin/platform/paystack", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretKey: platformPaystackForm.secretKey.trim() || undefined,
          publicKey: platformPaystackForm.publicKey.trim() || undefined,
        }),
      });
      setPlatformPaystack(data.settings);
      setPlatformPaystackForm({ secretKey: "", publicKey: "" });
      setNotice("Platform Paystack keys saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save platform Paystack keys.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(tenant: TenantDto) {
    if (!window.confirm(`Reset password for ${tenant.name}?`)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await readJson<{ temporaryPassword: string; mailSent: boolean }>(
        `/api/admin/tenants/${tenant.id}/reset-password`,
        { method: "POST" },
      );
      setNotice(`Password reset for ${tenant.slug}. Temp password: ${data.temporaryPassword}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset tenant password.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTenant(tenant: TenantDto) {
    if (!window.confirm(`Delete ${tenant.name} and all tenant data? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    try {
      await readJson(`/api/admin/tenants/${tenant.id}`, { method: "DELETE" });
      setNotice(`${tenant.name} deleted.`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete tenant.");
    } finally {
      setLoading(false);
    }
  }

  async function cancelTransaction(reference: string) {
    if (!window.confirm("Cancel this pending payment? The poller will stop checking it.")) return;
    setError(null);
    try {
      await readJson(`/api/admin/transactions/${encodeURIComponent(reference)}/cancel`, {
        method: "POST",
      });
      setNotice("Pending payment cancelled.");
      await Promise.all([loadTransactions(pagination.page), loadDashboard()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel payment.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  const currentLabel = nav.find((item) => item.key === view)?.label ?? "Tenants";

  return (
    <>
      <style suppressHydrationWarning>{platformAdminCriticalCss}</style>
      <div id="s-platform" className="screen on" data-screen-label="07 Platform Admin">
        <div className="dash-layout">
          <aside className="sidebar">
            <div className="sb-brand">
              <div className="sb-mark">PS</div>
              <div>
                <div className="sb-name">
                  PaySpot <span className="plat-tag">SUPER</span>
                </div>
                <div className="sb-url">admin.payspot.app</div>
              </div>
            </div>
            <nav className="sb-nav">
              <div className="sb-sec">Platform</div>
              {nav.slice(0, 3).map((item) => (
                <SideButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />
              ))}
              <div className="sb-sec">System</div>
              {nav.slice(3).map((item) => (
                <SideButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />
              ))}
            </nav>
            <div className="sb-foot">
              <div className="sb-user">
                <div className="sb-av">AD</div>
                <div>
                  <div className="sb-uname">Platform Admin</div>
                  <div className="sb-urole">{tenants.length} tenants managed</div>
                </div>
              </div>
            </div>
          </aside>

          <main className="dash-main">
            <div className="dash-topbar">
              <div className="dash-crumb">
                <span>Admin</span>
                <span className="dash-crumb-sep"><ChevronRight size={13} /></span>
                <span>{currentLabel}</span>
              </div>
              <div className="dash-topbar-right">
                <ThemeToggle />
                <button className="btn btn-muted btn-sm" type="button" onClick={refreshAll} disabled={loading || txLoading}>
                  <RefreshCw size={14} className={loading || txLoading ? "spin" : ""} />
                  Refresh
                </button>
                <button className="btn btn-ac btn-sm" type="button" onClick={() => setShowCreate((value) => !value)}>
                  + New Tenant
                </button>
                <button className="btn btn-ghost btn-icon" type="button" onClick={logout} aria-label="Logout">
                  <LogOut size={15} />
                </button>
              </div>
            </div>

            <div className="dash-content">
              {error ? <div className="alert-banner err"><X size={15} /> {error}</div> : null}
              {notice ? <div className="alert-banner info"><Check size={15} /> {notice}</div> : null}

              <section className={`dash-section ${view === "tenants" ? "on" : ""}`}>
                <SectionHeader
                  title="Tenant Command Center"
                  subtitle={`${compact(tenants.length)} tenants, ${compact(pendingRequests.length)} pending operator requests`}
                  actions={
                    <>
                      <button className="btn btn-muted btn-sm" type="button" onClick={() => setView("transactions")}>
                        View Transactions
                      </button>
                      <button className="btn btn-ac btn-sm" type="button" onClick={() => setShowCreate((value) => !value)}>
                        + Add Tenant
                      </button>
                    </>
                  }
                />

                <KpiRow
                  items={[
                    { label: "Platform Revenue", value: money(platformStats.totalRevenue), delta: "Across all tenants", tone: "up", icon: WalletCards },
                    { label: "Transactions", value: compact(platformStats.totalTransactions), delta: `${compact(platformStats.success)} paid`, tone: "up", icon: CreditCard },
                    { label: "Active Tenants", value: compact(platformStats.activeTenants), delta: `${compact(pendingRequests.length)} requests pending`, tone: "warn", icon: Users },
                    { label: "Vouchers Issued", value: compact(platformStats.vouchersIssued), delta: `${compact(platformStats.failed)} failed payments`, tone: "neu", icon: KeyRound },
                  ]}
                />

                {showCreate ? (
                  <CreateTenantCard
                    value={newTenant}
                    loading={loading}
                    onChange={setNewTenant}
                    onCancel={() => setShowCreate(false)}
                    onSubmit={createTenant}
                  />
                ) : null}

                <div className="dash-grid">
                  <div>
                    <div className="ac">
                      <div className="ac-hdr">
                        <div>
                          <div className="ac-title">All Tenants</div>
                          <div className="ac-sub">Operator lifecycle, status, revenue, and controls.</div>
                        </div>
                      </div>
                      <div className="tbar">
                        <Search size={14} />
                        <input
                          className="tsearch"
                          placeholder="Search tenant, slug, email"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                        <select
                          className="tfilter"
                          value={tenantStatusFilter}
                          onChange={(event) => setTenantStatusFilter(event.target.value)}
                        >
                          <option value="all">All statuses</option>
                          <option value="active">Active</option>
                          <option value="pending_setup">Pending setup</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </div>
                      {filteredTenants.length === 0 ? (
                        <EmptyBlock label={loading ? "Loading tenants..." : "No tenants match this filter."} />
                      ) : (
                        filteredTenants.map((tenant) => (
                          <TenantRow
                            key={tenant.id}
                            tenant={tenant}
                            stats={statByTenantId.get(tenant.id)}
                            loading={loading}
                            onActivate={() => updateTenantStatus(tenant, "active")}
                            onSuspend={() => updateTenantStatus(tenant, "suspended")}
                            onSetLocations={() => updateTenantLocationLimit(tenant)}
                            onReset={() => resetPassword(tenant)}
                            onDelete={() => deleteTenant(tenant)}
                          />
                        ))
                      )}
                    </div>
                  </div>

                  <aside>
                    <div className="ac">
                      <div className="ac-hdr">
                        <div>
                          <div className="ac-title">Operator Requests</div>
                          <div className="ac-sub">Approve or reject landing page requests.</div>
                        </div>
                        <span className="badge badge-a">{pendingRequests.length} pending</span>
                      </div>
                      {pendingRequests.length === 0 ? (
                        <EmptyBlock label="No pending operator requests." compact />
                      ) : (
                        pendingRequests.slice(0, 6).map((request) => (
                          <div className="tenant-row request-row" key={request.id}>
                            <div className="t-av">{tenantInitials(request.requestedName)}</div>
                            <div className="t-mid">
                              <div className="t-name">{request.requestedName}</div>
                              <div className="t-slug">/{request.requestedSlug} - {request.requestedEmail}</div>
                            </div>
                            <div className="row-actions">
                              <button
                                className="btn btn-ac btn-xs"
                                type="button"
                                disabled={loading}
                                onClick={() => reviewRequest(request.id, "approve")}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-red btn-xs"
                                type="button"
                                disabled={loading}
                                onClick={() => reviewRequest(request.id, "deny")}
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="ac">
                      <div className="ac-hdr">
                        <div>
                          <div className="ac-title">System Pulse</div>
                          <div className="ac-sub">Current platform health.</div>
                        </div>
                      </div>
                      <MiniRows
                        rows={[
                          ["Paystack tenant keys", `${tenants.filter((tenant) => tenant.paystackLast4).length}/${tenants.length}`],
                          ["Pending review queue", compact(pendingRequests.length)],
                          ["Recent transaction feed", `${pagination.total} rows`],
                          ["Platform fee estimate", money(platformStats.platformFee)],
                        ]}
                      />
                    </div>
                  </aside>
                </div>
              </section>

              <section className={`dash-section ${view === "transactions" ? "on" : ""}`}>
                <SectionHeader
                  title="Platform Transactions"
                  subtitle={`${compact(pagination.total)} payments across every tenant`}
                  actions={
                    <button className="btn btn-muted btn-sm" type="button" onClick={() => loadTransactions(pagination.page)}>
                      <RefreshCw size={14} className={txLoading ? "spin" : ""} />
                      Sync
                    </button>
                  }
                />
                <KpiRow
                  items={[
                    { label: "Total Transactions", value: compact(platformStats.totalTransactions), delta: "All tenant activity", tone: "up", icon: Activity },
                    { label: "Paid", value: compact(platformStats.success), delta: money(platformStats.totalRevenue), tone: "up", icon: ShieldCheck },
                    { label: "Pending", value: compact(statsTenants.reduce((sum, tenant) => sum + tenant.stats.transactions.pending + tenant.stats.transactions.processing, 0)), delta: "Awaiting confirmation", tone: "warn", icon: Clock3 },
                    { label: "Failed", value: compact(platformStats.failed), delta: "Needs retry or support", tone: "neu", icon: X },
                  ]}
                />
                <TransactionsPanel
                  transactions={transactions}
                  pagination={pagination}
                  query={txQuery}
                  status={txStatus}
                  loading={txLoading}
                  onQuery={setTxQuery}
                  onStatus={setTxStatus}
                  onPage={loadTransactions}
                  onCancel={cancelTransaction}
                />
              </section>

              <section className={`dash-section ${view === "revenue" ? "on" : ""}`}>
                <SectionHeader
                  title="Revenue Intelligence"
                  subtitle="Platform take rate, operator revenue, and tenant concentration."
                  actions={<button className="btn btn-muted btn-sm" type="button">Export CSV</button>}
                />
                <KpiRow
                  items={[
                    { label: "Gross Revenue", value: money(platformStats.totalRevenue), delta: "Successful tenant payments", tone: "up", icon: WalletCards },
                    { label: "Platform Fee", value: money(platformStats.platformFee), delta: "Estimated 2 percent", tone: "up", icon: BarChart3 },
                    { label: "Processor Fees", value: money(platformStats.paystackEstimate), delta: "Estimated 1.5 percent", tone: "warn", icon: CreditCard },
                    { label: "Operator Net", value: money(platformStats.netOperatorRevenue), delta: "After estimated fees", tone: "neu", icon: Building2 },
                  ]}
                />
                <div className="dash-grid">
                  <div className="ac">
                    <div className="ac-hdr">
                      <div>
                        <div className="ac-title">Revenue By Tenant</div>
                        <div className="ac-sub">Sorted by successful payment volume.</div>
                      </div>
                    </div>
                    <div className="rev-bars">
                      {topRevenueTenants.length === 0 ? (
                        <EmptyBlock label="No revenue yet." compact />
                      ) : (
                        topRevenueTenants.map((tenant) => {
                          const max = Math.max(...topRevenueTenants.map((item) => item.stats.transactions.revenueNgn), 1);
                          const width = Math.max(4, Math.round((tenant.stats.transactions.revenueNgn / max) * 100));
                          return (
                            <div className="rev-row" key={tenant.id}>
                              <div className="rev-name">{tenant.name}</div>
                              <div className="rev-track">
                                <div className="rev-fill" style={{ width: `${width}%` }} />
                              </div>
                              <div className="rev-val">{money(tenant.stats.transactions.revenueNgn)}</div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className="ac">
                    <div className="ac-hdr">
                      <div>
                        <div className="ac-title">Revenue Breakdown</div>
                        <div className="ac-sub">Operational finance snapshot.</div>
                      </div>
                    </div>
                    <MiniRows
                      rows={[
                        ["Gross paid volume", money(platformStats.totalRevenue)],
                        ["Estimated PaySpot fee", money(platformStats.platformFee)],
                        ["Estimated Paystack cost", money(platformStats.paystackEstimate)],
                        ["Estimated operator net", money(platformStats.netOperatorRevenue)],
                        ["Average transaction", money(platformStats.success ? platformStats.totalRevenue / platformStats.success : 0)],
                      ]}
                    />
                  </div>
                </div>
              </section>

              <section className={`dash-section ${view === "integrations" ? "on" : ""}`}>
                <SectionHeader
                  title="Platform Integrations"
                  subtitle="Payment, delivery, database, and network adapters used by tenants."
                />
                <div className="int-grid">
                  <IntegrationCard title="Paystack" status="Connected" copy="Tenant checkout, transaction verification, and customer payment sessions." icon={CreditCard} />
                  <IntegrationCard title="SMTP Mailer" status="Connected" copy="Operator approvals, login credentials, and voucher delivery emails." icon={Globe2} />
                  <IntegrationCard title="Postgres Database" status="Connected" copy="Tenants, requests, vouchers, transactions, subscribers, and sessions." icon={Database} />
                  <IntegrationCard title="Omada / MikroTik / RADIUS" status="Tenant managed" copy="Each tenant can choose imported vouchers, controller APIs, or RADIUS voucher mode." icon={PlugZap} />
                </div>
              </section>

              <section className={`dash-section ${view === "audit" ? "on" : ""}`}>
                <SectionHeader
                  title="Audit Log"
                  subtitle="A live operational snapshot synthesized from requests, tenants, and transactions."
                />
                <div className="ac">
                  <div className="ac-hdr">
                    <div>
                      <div className="ac-title">Recent Platform Events</div>
                      <div className="ac-sub">Until a dedicated audit table is added, these rows come from real system records.</div>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table className="t">
                      <thead>
                        <tr>
                          <th>Time</th>
                          <th>Actor</th>
                          <th>Event</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activityRows.length === 0 ? (
                          <EmptyRow colSpan={4} label="No platform activity yet." />
                        ) : (
                          activityRows.map((row) => (
                            <tr key={row.id}>
                              <td className="td-muted">{formatDate(row.time)}</td>
                              <td className="td-main">{row.actor}</td>
                              <td>{row.event}</td>
                              <td><span className={statusBadgeClass(row.status)}>{row.status}</span></td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <section className={`dash-section ${view === "settings" ? "on" : ""}`}>
                <SectionHeader
                  title="Platform Settings"
                  subtitle="Prototype-matched settings surface for platform operations."
                />
                <div className="settings-layout">
                  <div className="settings-tabs">
                    {(["platform", "billing", "notifications"] as SettingsTab[]).map((tab) => (
                      <button
                        key={tab}
                        className={`settings-tab ${settingsTab === tab ? "on" : ""}`}
                        type="button"
                        onClick={() => setSettingsTab(tab)}
                      >
                        {tab[0].toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className={`settings-panel ${settingsTab === "platform" ? "on" : ""}`}>
                      <div className="settings-card">
                        <div className="settings-card-title">Platform Identity</div>
                        <div className="field-row">
                          <Field label="Platform Name" value="PaySpot" readOnly />
                          <Field label="Admin Domain" value="admin.payspot.app" readOnly />
                        </div>
                      </div>
                    </div>
                    <div className={`settings-panel ${settingsTab === "billing" ? "on" : ""}`}>
                      <form className="settings-card" onSubmit={savePlatformPaystack}>
                        <div className="settings-card-title">Platform Paystack Keys</div>
                        <p className="td-muted" style={{ margin: "0 0 14px", lineHeight: 1.6 }}>
                          These are the admin live keys used for percentage billing and tenant subscription payments.
                          Get them from Paystack Dashboard -&gt; Settings -&gt; API Keys &amp; Webhooks.
                        </p>
                        <div className="field-row">
                          <Field
                            label="Live Public Key"
                            value={platformPaystackForm.publicKey}
                            placeholder={
                              platformPaystack?.hasPublicKey
                                ? `Saved key ending ${platformPaystack.publicKeyLast4}`
                                : "pk_live_..."
                            }
                            onChange={(publicKey) => setPlatformPaystackForm((form) => ({ ...form, publicKey }))}
                          />
                          <Field
                            label="Live Secret Key"
                            type="password"
                            value={platformPaystackForm.secretKey}
                            placeholder={
                              platformPaystack?.hasSecretKey
                                ? `Saved key ending ${platformPaystack.secretKeyLast4}`
                                : "sk_live_..."
                            }
                            onChange={(secretKey) => setPlatformPaystackForm((form) => ({ ...form, secretKey }))}
                          />
                        </div>
                        <div className="approval-review-actions" style={{ marginTop: 14 }}>
                          <button type="submit" disabled={loading}>
                            {loading ? "Saving..." : "Save Paystack keys"}
                            <KeyRound size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </form>
                    </div>
                    <div className={`settings-panel ${settingsTab === "notifications" ? "on" : ""}`}>
                      <div className="settings-card">
                        <div className="settings-card-title">Notifications</div>
                        <div className="toggle-list">
                          <Toggle label="Operator approval emails" enabled />
                          <Toggle label="Credential delivery" enabled />
                          <Toggle label="Failed payment digest" enabled={false} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </main>
        </div>

        <div className="mob-menu">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`mob-btn ${view === item.key ? "on" : ""}`}
                type="button"
                onClick={() => setView(item.key)}
              >
                <Icon size={15} />
                {item.short}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SideButton({
  item,
  active,
  onClick,
}: {
  item: (typeof nav)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button className={`sb-item ${active ? "on" : ""}`} type="button" onClick={onClick}>
      <Icon size={15} />
      <span>{item.label}</span>
      {item.key === "transactions" ? <span className="sb-bdg">live</span> : null}
    </button>
  );
}

function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="dash-header">
      <div>
        <div className="dash-title">{title}</div>
        <div className="dash-sub">{subtitle}</div>
      </div>
      {actions ? <div className="dash-hdr-r">{actions}</div> : null}
    </div>
  );
}

function KpiRow({
  items,
}: {
  items: Array<{
    label: string;
    value: string;
    delta: string;
    tone: "up" | "warn" | "neu";
    icon: typeof Building2;
  }>;
}) {
  return (
    <div className="kpi-row">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div className="kpi" key={item.label}>
            <div className="kpi-hdr">
              <div className="kpi-label">{item.label}</div>
              <Icon size={16} color="var(--ac)" />
            </div>
            <div className="kpi-val">{item.value}</div>
            <div className={`kpi-delta ${item.tone}`}>{item.delta}</div>
          </div>
        );
      })}
    </div>
  );
}

function CreateTenantCard({
  value,
  loading,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: { slug: string; name: string; adminEmail: string; password: string; maxLocations: string };
  loading: boolean;
  onChange: (value: { slug: string; name: string; adminEmail: string; password: string; maxLocations: string }) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form className="settings-card" onSubmit={onSubmit}>
      <div className="settings-card-title">Create Tenant</div>
      <div className="field-row">
        <Field label="Slug" value={value.slug} onChange={(slug) => onChange({ ...value, slug })} placeholder="wallstreet" />
        <Field label="Business Name" value={value.name} onChange={(name) => onChange({ ...value, name })} placeholder="WALLSTREET" />
        <Field label="Admin Email" type="email" value={value.adminEmail} onChange={(adminEmail) => onChange({ ...value, adminEmail })} placeholder="operator@example.com" />
        <Field label="Temp Password" value={value.password} onChange={(password) => onChange({ ...value, password })} placeholder="Optional" />
        <Field
          label="Max Locations"
          type="number"
          value={value.maxLocations}
          onChange={(maxLocations) => onChange({ ...value, maxLocations })}
          placeholder="1"
          min={1}
          max={50}
        />
      </div>
      <div className="settings-foot">
        <button className="btn btn-muted" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn btn-ac" type="submit" disabled={loading || value.slug.trim().length < 2 || !value.adminEmail.includes("@")}>
          Create Tenant
        </button>
      </div>
    </form>
  );
}

function TenantRow({
  tenant,
  stats,
  loading,
  onActivate,
  onSuspend,
  onSetLocations,
  onReset,
  onDelete,
}: {
  tenant: TenantDto;
  stats?: TenantStatsDto;
  loading: boolean;
  onActivate: () => void;
  onSuspend: () => void;
  onSetLocations: () => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="tenant-row">
      <div className="t-av">{tenantInitials(tenant.name)}</div>
      <div className="t-mid">
        <div className="t-name">{tenant.name}</div>
        <div className="t-slug">/{tenant.slug} - {tenant.adminEmail}</div>
        <div className="t-slug">
          {tenant.locationCount ?? 1} / {tenant.maxLocations ?? 1} storefront location{(tenant.maxLocations ?? 1) === 1 ? "" : "s"} allowed
        </div>
      </div>
      <div className="t-rev">
        <span>{money(stats?.stats.transactions.revenueNgn ?? 0)}</span>
        <small>{compact(stats?.stats.transactions.total ?? 0)} transactions</small>
      </div>
      <div className="t-txn">
        <span className={statusBadgeClass(tenant.status)}>{tenant.status}</span>
        <small>{tenant.paystackLast4 ? `Paystack ****${tenant.paystackLast4}` : "Paystack missing"}</small>
      </div>
      <div className="row-actions">
        <a className="btn btn-muted btn-xs" href={`/t/${tenant.slug}/admin`}>Open</a>
        {tenant.status.toLowerCase() === "active" ? (
          <button className="btn btn-ghost btn-xs" type="button" disabled={loading} onClick={onSuspend}>Suspend</button>
        ) : (
          <button className="btn btn-ac btn-xs" type="button" disabled={loading} onClick={onActivate}>Activate</button>
        )}
        <button className="btn btn-ghost btn-xs" type="button" disabled={loading} onClick={onReset}>
          <ShieldCheck size={12} /> Reset
        </button>
        <button className="btn btn-muted btn-xs" type="button" disabled={loading} onClick={onSetLocations}>
          Locations
        </button>
        <button className="btn btn-red btn-xs" type="button" disabled={loading} onClick={onDelete}>
          <Trash2 size={12} /> Delete
        </button>
      </div>
    </div>
  );
}

function TransactionsPanel({
  transactions,
  pagination,
  query,
  status,
  loading,
  onQuery,
  onStatus,
  onPage,
  onCancel,
}: {
  transactions: PlatformTransaction[];
  pagination: Pagination;
  query: string;
  status: string;
  loading: boolean;
  onQuery: (value: string) => void;
  onStatus: (value: string) => void;
  onPage: (page: number) => void;
  onCancel: (reference: string) => void;
}) {
  return (
    <div className="ac">
      <div className="ac-hdr">
        <div>
          <div className="ac-title">All Customer Payments</div>
          <div className="ac-sub">Search by reference, email, voucher, tenant, or plan.</div>
        </div>
      </div>
      <div className="tbar">
        <Search size={14} />
        <input className="tsearch" placeholder="Search payments" value={query} onChange={(event) => onQuery(event.target.value)} />
        <select className="tfilter" value={status} onChange={(event) => onStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="success">Paid</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <div className="table-scroll">
        <table className="t">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Customer</th>
              <th>Plan</th>
              <th>Amount</th>
              <th>Voucher</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <EmptyRow colSpan={8} label={loading ? "Loading transactions..." : "No transactions found."} />
            ) : (
              transactions.map((transaction) => {
                const canCancel = transaction.paymentStatus === "pending" || transaction.paymentStatus === "processing";
                return (
                  <tr key={transaction.id}>
                    <td>
                      <div className="td-main">{transaction.tenantName ?? transaction.tenantSlug ?? "Unknown"}</div>
                      <div className="td-muted">/{transaction.tenantSlug ?? "missing"}</div>
                    </td>
                    <td>
                      <div>{transaction.email}</div>
                      <div className="td-muted">{transaction.reference}</div>
                    </td>
                    <td>{transaction.packageName ?? transaction.packageCode ?? "Unknown plan"}</td>
                    <td className="td-main">{money(transaction.amountNgn)}</td>
                    <td className="td-mono">{transaction.voucherCode ?? "-"}</td>
                    <td><span className={statusBadgeClass(transaction.paymentStatus)}>{transaction.paymentStatus}</span></td>
                    <td className="td-muted">{formatDate(transaction.paidAt ?? transaction.createdAt)}</td>
                    <td>
                      {canCancel ? (
                        <button className="btn btn-red btn-xs" type="button" onClick={() => onCancel(transaction.reference)}>
                          Cancel
                        </button>
                      ) : (
                        <span className="td-muted">-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="t-pagination">
        <span>Page {pagination.page} of {pagination.totalPages} - {pagination.total} total</span>
        <div className="pager-actions">
          <button className="btn btn-muted btn-xs" type="button" disabled={pagination.page <= 1 || loading} onClick={() => onPage(pagination.page - 1)}>Prev</button>
          <button className="btn btn-muted btn-xs" type="button" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => onPage(pagination.page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  title,
  status,
  copy,
  icon: Icon,
}: {
  title: string;
  status: string;
  copy: string;
  icon: typeof Building2;
}) {
  return (
    <div className="int-card">
      <div className="int-top">
        <Icon size={18} color="var(--ac)" />
        <span className="badge badge-g">{status}</span>
      </div>
      <div className="int-title">{title}</div>
      <p className="int-copy">{copy}</p>
    </div>
  );
}

function MiniRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="settings-card" style={{ border: 0, margin: 0, borderRadius: 0 }}>
      {rows.map(([label, value]) => (
        <div className="rev-row" key={label} style={{ gridTemplateColumns: "1fr auto", marginBottom: 10 }}>
          <div className="rev-name">{label}</div>
          <div className="rev-val">{value}</div>
        </div>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  readOnly = false,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  readOnly?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        min={min}
        max={max}
        onChange={(event) => onChange?.(event.target.value)}
      />
    </label>
  );
}

function Toggle({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="toggle">
      <span className={`toggle-track ${enabled ? "on" : ""}`} />
      <span className="toggle-label">{label}</span>
    </div>
  );
}

function EmptyBlock({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className="td-muted" style={{ padding: compact ? "14px 16px" : "22px 16px" }}>
      {label}
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="td-muted">{label}</td>
    </tr>
  );
}
