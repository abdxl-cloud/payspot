"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Gift,
  Grid2X2,
  LayoutDashboard,
  List,
  Loader2,
  Settings,
  Wifi,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type Props = {
  tenantSlug: string;
  tenantName?: string;
};

type View = "overview" | "transactions" | "vouchers" | "plans" | "network" | "settings";
type PlanView = "list" | "grid";
type SettingsTab = "general" | "appearance" | "payments" | "sms" | "notifications";
type NetworkPlatform = "omada" | "mikrotik" | "radius" | "csv";

type Stats = {
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

type Plan = {
  id: string;
  code: string;
  name: string;
  durationMinutes: number | null;
  priceNgn: number;
  maxDevices: number | null;
  bandwidthProfile: string | null;
  dataLimitMb: number | null;
  active: number;
  description: string | null;
  unusedCount: number;
  assignedCount: number;
  totalCount: number;
};

type PlanFormState = {
  code: string;
  name: string;
  priceNgn: string;
  durationMinutes: string;
  maxDevices: string;
  bandwidthProfile: string;
  dataLimitMb: string;
  description: string;
  active: boolean;
};

type Transaction = {
  id: string;
  reference: string;
  email: string;
  phone: string;
  amountNgn: number;
  voucherCode: string | null;
  deliveryMode: string;
  paymentStatus: string;
  createdAt: string;
  paidAt: string | null;
  packageCode: string | null;
  packageName: string | null;
};

type Voucher = {
  id: string;
  voucherCode: string;
  status: string;
  packageId: string;
  packageCode: string;
  packageName: string;
  createdAt: string;
  assignedAt: string | null;
  assignedToEmail: string | null;
  assignedToPhone: string | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Architecture = {
  accessMode: "voucher_access" | "account_access";
  voucherSourceMode: "import_csv" | "omada_openapi" | "mikrotik_rest" | "radius_voucher";
  appearance: {
    storePrimaryColor: string;
    dashboardPrimaryColor: string;
  };
  payment: {
    hasPublicKey: boolean;
    publicKeyLast4: string;
  };
  notifications: {
    dailyRevenueSummary: boolean;
    failedPaymentAlerts: boolean;
    lowVoucherStockAlerts: boolean;
    weeklyAnalyticsDigest: boolean;
  };
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

const navItems: Array<{ key: View; label: string; short: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "Dashboard", short: "Dash", icon: LayoutDashboard },
  { key: "transactions", label: "Transactions", short: "Txns", icon: CreditCard },
  { key: "vouchers", label: "Vouchers", short: "Vouchers", icon: Gift },
  { key: "plans", label: "Plans", short: "Plans", icon: List },
  { key: "network", label: "Network Setup", short: "Network", icon: Wifi },
  { key: "settings", label: "Settings", short: "Settings", icon: Settings },
];

const settingsTabs: SettingsTab[] = ["general", "appearance", "payments", "sms", "notifications"];
const planViews: PlanView[] = ["list", "grid"];
const emptyPagination = { page: 1, pageSize: 20, total: 0, totalPages: 1 };

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

const tenantDashboardCriticalCss = `
#s-dash{min-height:100vh;background:var(--bg);color:var(--tx)}
#s-dash *{box-sizing:border-box}
#s-dash button,#s-dash input,#s-dash select,#s-dash textarea{font:inherit}
#s-dash .dash-layout{display:flex!important;min-height:100vh;background:var(--bg)}
#s-dash .sidebar{position:sticky;top:0;width:216px;height:100vh;overflow-y:auto;display:flex!important;flex-direction:column;flex-shrink:0;background:var(--s1);border-right:1px solid var(--bd)}
#s-dash .sb-brand{display:flex;align-items:center;gap:9px;padding:14px 12px;border-bottom:1px solid var(--bd)}
#s-dash .sb-mark,#s-dash .sb-av{display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--s2);border:1px solid var(--bd);color:var(--ac);font-family:var(--font-heading),sans-serif;font-weight:800}
#s-dash .sb-mark{width:32px;height:32px;border-radius:7px;font-size:13px}
#s-dash .sb-av{width:30px;height:30px;border-radius:50%;font-size:12px}
#s-dash .sb-name{font-size:13px;font-weight:600;color:var(--tx)}
#s-dash .sb-url,#s-dash .sb-urole{font-family:var(--font-mono),monospace;color:var(--tx3);font-size:10px}
#s-dash .sb-nav{flex:1;padding:8px 6px}
#s-dash .sb-sec{padding:12px 8px 6px;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.09em;text-transform:uppercase}
#s-dash .sb-item{position:relative;width:100%;display:flex!important;align-items:center;gap:8px;margin-bottom:1px;padding:7px 9px;border:0;border-radius:5px;background:transparent;color:var(--tx2);font-size:13px;font-weight:500;text-align:left;cursor:pointer;text-decoration:none}
#s-dash .sb-item:hover,#s-dash .sb-item.on{color:var(--tx);background:var(--s2)}
#s-dash .sb-item.on:after{content:"";position:absolute;left:0;top:50%;width:2px;height:16px;border-radius:0 2px 2px 0;background:var(--ac);transform:translateY(-50%)}
#s-dash .sb-bdg{margin-left:auto;border:1px solid var(--ac-bd);border-radius:999px;background:var(--ac-dim);color:var(--ac);padding:1px 6px;font-family:var(--font-mono),monospace;font-size:10px}
#s-dash .sb-foot{padding:10px;border-top:1px solid var(--bd)}
#s-dash .sb-user{display:flex;align-items:center;gap:9px;padding:8px;border-radius:var(--r)}
#s-dash .sb-uname{font-size:12px;font-weight:600;color:var(--tx)}
#s-dash .dash-main{min-width:0;flex:1;display:flex!important;flex-direction:column;overflow:hidden}
#s-dash .dash-topbar{height:52px;display:flex!important;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:0 20px;background:var(--s1);border-bottom:1px solid var(--bd)}
#s-dash .dash-crumb{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px;white-space:nowrap}
#s-dash .dash-crumb span:last-child{color:var(--tx)}
#s-dash .dash-crumb-sep{color:var(--bd2)}
#s-dash .dash-topbar-right{display:flex;align-items:center;gap:8px;flex-shrink:0}
#s-dash .dash-content{flex:1;overflow-y:auto;padding:clamp(14px,2.5vw,24px)}
#s-dash .dash-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px}
#s-dash .dash-title{font-family:var(--font-heading),sans-serif;font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--tx)}
#s-dash .dash-sub{margin-top:3px;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px}
#s-dash .dash-hdr-r{display:flex;flex-wrap:wrap;gap:8px}
#s-dash .dash-section{display:none!important}
#s-dash .dash-section.on{display:block!important}
#s-dash .btn{display:inline-flex!important;align-items:center;justify-content:center;gap:6px;padding:9px 18px;border-radius:var(--r);font-size:13px;font-weight:600;line-height:1;white-space:nowrap;cursor:pointer;text-decoration:none;transition:all .15s}
#s-dash .btn:disabled{opacity:.55;cursor:not-allowed}
#s-dash .btn-ac{background:var(--ac);color:#0d0d0d;border:1px solid transparent}
#s-dash .btn-muted{background:var(--s2);color:var(--tx2);border:1px solid var(--bd)}
#s-dash .btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--bd2)}
#s-dash .btn-red{background:oklch(0.65 0.18 25/.15);color:var(--red);border:1px solid oklch(0.65 0.18 25/.25)}
#s-dash .btn-sm{padding:6px 12px;font-size:12px}
#s-dash .btn-xs{padding:4px 9px;font-size:11px}
#s-dash .btn-icon{width:34px;height:34px;padding:0}
#s-dash .kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px}
#s-dash .kpi,#s-dash .ac,#s-dash .widget,#s-dash .settings-card,#s-dash .netform,#s-dash .plans-table-wrap,#s-dash .plan-grid-card{background:var(--s1);border:1px solid var(--bd);border-radius:var(--r2)}
#s-dash .kpi{padding:16px}
#s-dash .kpi-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
#s-dash .kpi-label{font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx3)}
#s-dash .kpi-val{margin-bottom:4px;color:var(--tx);font-family:var(--font-mono),monospace;font-size:clamp(18px,2.5vw,24px);font-variant-numeric:tabular-nums}
#s-dash .kpi-delta{font-family:var(--font-mono),monospace;font-size:11px}
#s-dash .kpi-delta.up{color:var(--green)}#s-dash .kpi-delta.warn,#s-dash .warn-text{color:var(--amber)}#s-dash .kpi-delta.neu{color:var(--tx3)}
#s-dash .dash-grid{display:grid;grid-template-columns:1fr 300px;gap:14px}
#s-dash .ac{overflow:hidden;margin-bottom:14px}
#s-dash .ac-hdr{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:13px 16px;border-bottom:1px solid var(--bd)}
#s-dash .ac-title{font-size:13px;font-weight:600;color:var(--tx)}
#s-dash .ac-sub{font-family:var(--font-mono),monospace;font-size:11px;color:var(--tx3)}
#s-dash .tbar,#s-dash .plans-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 16px;border-bottom:1px solid var(--bd)}
#s-dash .plans-toolbar{margin-bottom:14px;padding-inline:0;border-bottom:0}
#s-dash .tsearch,#s-dash .tfilter,#s-dash .field input,#s-dash .field select,#s-dash .field textarea{border:1px solid var(--bd)!important;border-radius:var(--r)!important;background:var(--s2)!important;color:var(--tx)!important;outline:none}
#s-dash .tsearch{width:200px;height:32px;padding:0 12px;font-family:var(--font-mono),monospace;font-size:12px}
#s-dash .tfilter{height:32px;padding:0 10px;font-family:var(--font-mono),monospace;font-size:12px;color:var(--tx2)!important}
#s-dash .table-scroll{overflow-x:auto}
#s-dash table.t,#s-dash table.plans-t{width:100%;border-collapse:collapse}
#s-dash table.t th,#s-dash table.plans-t th{padding:8px 14px;border-bottom:1px solid var(--bd);background:var(--s2)!important;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:10px;font-weight:500;letter-spacing:.06em;text-align:left;text-transform:uppercase;white-space:nowrap}
#s-dash table.t td,#s-dash table.plans-t td{padding:11px 14px;border-bottom:1px solid var(--bd);color:var(--tx2);font-size:12px;vertical-align:middle}
#s-dash .td-main,#s-dash table.plans-t .td-name{color:var(--tx);font-weight:600}
#s-dash .td-mono{color:var(--ac);font-family:var(--font-mono),monospace}
#s-dash .td-muted,#s-dash table.plans-t .td-stats,#s-dash table.plans-t .td-spec{color:var(--tx2);font-family:var(--font-mono),monospace;font-size:12px}
#s-dash table.plans-t .td-price{color:var(--tx);font-family:var(--font-mono),monospace}
#s-dash .badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-family:var(--font-mono),monospace;font-size:11px;font-weight:600;white-space:nowrap}
#s-dash .badge:before{content:"";width:5px;height:5px;border-radius:50%;flex-shrink:0}
#s-dash .badge-g{background:oklch(0.72 0.17 155/.12);color:var(--green);border:1px solid oklch(0.72 0.17 155/.2)}#s-dash .badge-g:before{background:var(--green)}
#s-dash .badge-a{background:oklch(0.78 0.18 80/.12);color:var(--amber);border:1px solid oklch(0.78 0.18 80/.2)}#s-dash .badge-a:before{background:var(--amber)}
#s-dash .badge-r{background:oklch(0.65 0.18 25/.12);color:var(--red);border:1px solid oklch(0.65 0.18 25/.2)}#s-dash .badge-r:before{background:var(--red)}
#s-dash .badge-m{background:var(--s2);color:var(--tx3);border:1px solid var(--bd)}#s-dash .badge-m:before{background:var(--tx3)}
#s-dash .t-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--bd);color:var(--tx3);font-family:var(--font-mono),monospace;font-size:12px}
#s-dash .pager-actions,#s-dash .plans-acts,#s-dash .plans-toolbar-r{display:flex;gap:6px}
#s-dash .plans-toolbar-r{margin-left:auto}
#s-dash .widget{padding:16px;margin-bottom:10px}
#s-dash .widget-title{margin-bottom:14px;color:var(--tx);font-size:12px;font-weight:600}
#s-dash .bar-row{margin-bottom:10px}
#s-dash .bar-meta,#s-dash .mini-row{display:flex;justify-content:space-between;gap:10px;margin-bottom:4px}
#s-dash .bar-name,#s-dash .mini-row span:first-child{color:var(--tx2);font-size:12px}
#s-dash .bar-val,#s-dash .mini-row span:last-child{color:var(--tx);font-family:var(--font-mono),monospace;font-size:12px}
#s-dash .bar-track{height:3px;border-radius:999px;background:var(--s2)}
#s-dash .bar-fill{height:3px;border-radius:999px;background:var(--ac)}
#s-dash .mini-stack{display:flex;flex-direction:column;gap:8px}
#s-dash .view-toggle{display:flex;overflow:hidden;border:1px solid var(--bd);border-radius:var(--r)}
#s-dash .view-btn{display:flex;align-items:center;gap:5px;padding:6px 10px;border:0;background:transparent;color:var(--tx3);font-size:12px;cursor:pointer}
#s-dash .view-btn.on,#s-dash .view-btn:hover{color:var(--tx);background:var(--s2)}
#s-dash .plans-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
#s-dash .plan-grid-card{padding:14px}
#s-dash .plan-grid-card.inactive{opacity:.55}
#s-dash .pgc-top,#s-dash .pgc-stats{display:flex;justify-content:space-between;gap:10px}
#s-dash .pgc-name{font-size:13px;font-weight:600;color:var(--tx)}
#s-dash .pgc-price{font-family:var(--font-mono),monospace;font-size:16px;color:var(--ac)}
#s-dash .pgc-specs,#s-dash .pgc-foot{display:flex;flex-wrap:wrap;gap:8px}
#s-dash .pgc-spec,#s-dash .pgc-stat-l{font-size:11px;color:var(--tx3)}
#s-dash .pgc-stats,#s-dash .pgc-foot{margin-top:10px;padding-top:10px;border-top:1px solid var(--bd)}
#s-dash .pgc-stat-v{font-family:var(--font-mono),monospace;font-size:12px;color:var(--tx)}
#s-dash .field label{display:block;margin-bottom:5px;color:var(--tx2);font-size:12px;font-weight:600}
#s-dash .field input,#s-dash .field select{height:42px;padding:0 13px}
#s-dash .field textarea{height:80px;padding:10px 13px;resize:vertical}
#s-dash .field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#s-dash .settings-card,#s-dash .netform{padding:20px;margin-bottom:16px}
#s-dash .settings-card-title,#s-dash .netform-title{margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--bd);font-family:var(--font-mono),monospace;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--tx)}
#s-dash .platform-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px}
#s-dash .platform-pill{padding:8px 16px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx2);font-size:13px;font-weight:500;cursor:pointer}
#s-dash .platform-pill.on,#s-dash .platform-pill:hover{border-color:var(--ac-bd);color:var(--ac);background:var(--ac-dim)}
#s-dash .net-status,#s-dash .alert-banner{display:flex;align-items:center;gap:8px;margin-top:16px;padding:10px 14px;border-radius:var(--r);font-size:13px;font-weight:500}
#s-dash .net-status.ok,#s-dash .alert-banner.info{color:var(--green);background:oklch(0.72 0.17 155/.08);border:1px solid oklch(0.72 0.17 155/.15)}
#s-dash .net-status.warn,#s-dash .alert-banner.warn{color:var(--amber);background:oklch(0.78 0.18 80/.08);border:1px solid oklch(0.78 0.18 80/.2)}
#s-dash .settings-layout{display:grid;grid-template-columns:180px 1fr;gap:16px;align-items:start}
#s-dash .settings-tabs{overflow:hidden;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1)}
#s-dash .settings-tab{width:100%;padding:10px 14px;border:0;border-bottom:1px solid var(--bd);background:transparent;color:var(--tx2);font-size:13px;font-weight:500;text-align:left}
#s-dash .settings-tab.on,#s-dash .settings-tab:hover{color:var(--ac);background:var(--ac-dim)}
#s-dash .settings-panel{display:none!important}
#s-dash .settings-panel.on{display:block!important}
#s-dash .settings-foot{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:8px}
#s-dash .key-display{display:flex;align-items:center;gap:8px;padding:10px 13px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2)}
#s-dash .key-display span{min-width:0;flex:1;overflow:hidden;color:var(--tx2);font-family:var(--font-mono),monospace;font-size:13px;text-overflow:ellipsis;white-space:nowrap}
#s-dash .toggle-list{display:flex;flex-direction:column;gap:12px}
#s-dash .toggle{display:flex;align-items:center;gap:8px}
#s-dash .toggle-track{position:relative;width:36px;height:20px;border:1px solid var(--bd2);border-radius:999px;background:var(--s3)}
#s-dash .toggle-track:after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff}
#s-dash .toggle-track.on{background:var(--ac);border-color:var(--ac)}
#s-dash .toggle-track.on:after{transform:translateX(16px)}
#s-dash .toggle-label{font-size:13px;color:var(--tx2)}
#s-dash .csv-drop{padding:28px;border:1px dashed var(--bd2);border-radius:var(--r);color:var(--tx3);font-size:13px;text-align:center}
#s-dash .mob-menu{display:none;position:fixed;left:0;right:0;bottom:0;z-index:50;gap:4px;padding:8px 16px;border-top:1px solid var(--bd);background:var(--s1)}
#s-dash .mob-btn{display:flex;flex:1;flex-direction:column;align-items:center;gap:3px;padding:6px 10px;border:0;border-radius:var(--r);background:transparent;color:var(--tx3);font-size:10px;cursor:pointer}
#s-dash .mob-btn.on,#s-dash .mob-btn:hover{color:var(--tx);background:var(--s2)}
#s-dash .spin{animation:payspot-spin .8s linear infinite}@keyframes payspot-spin{to{transform:rotate(360deg)}}
@media(max-width:1080px){#s-dash .dash-grid{grid-template-columns:1fr}}
@media(max-width:900px){#s-dash .sidebar{display:none!important}#s-dash .dash-layout{display:block!important}#s-dash .dash-main{min-height:100vh}#s-dash .dash-topbar{height:auto;min-height:52px;align-items:flex-start;flex-wrap:wrap;padding:10px 14px}#s-dash .dash-crumb,#s-dash .dash-topbar-right{width:100%}#s-dash .dash-topbar-right{overflow-x:auto}#s-dash .dash-content{padding:16px 14px 90px}#s-dash .mob-menu{display:flex!important;justify-content:flex-start;overflow-x:auto;padding:8px 10px}#s-dash .mob-btn{min-width:72px;flex:0 0 auto}#s-dash table.t,#s-dash table.plans-t{min-width:720px}}
@media(max-width:700px){#s-dash .field-row,#s-dash .settings-layout{grid-template-columns:1fr}#s-dash .kpi-row{grid-template-columns:repeat(2,minmax(0,1fr))}#s-dash .dash-hdr-r,#s-dash .tbar{width:100%;align-items:stretch}#s-dash .dash-hdr-r{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}#s-dash .dash-hdr-r .btn,#s-dash .tbar>*,#s-dash .tsearch,#s-dash .tfilter{width:100%!important}#s-dash .t-pagination{align-items:stretch;flex-direction:column}#s-dash .plans-toolbar-r{width:100%;margin-left:0}#s-dash .view-toggle,#s-dash .view-btn{width:100%}#s-dash .view-btn{justify-content:center}#s-dash .plans-grid{grid-template-columns:1fr}#s-dash .settings-tabs{display:flex;overflow-x:auto}#s-dash .settings-tab{flex:0 0 auto;width:auto;border-right:1px solid var(--bd);border-bottom:0;white-space:nowrap}#s-dash .key-display{align-items:stretch;flex-direction:column}#s-dash .key-display span{overflow:visible;text-overflow:clip;white-space:normal;word-break:break-all}#s-dash .settings-card{padding:16px}}
`;

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload.error === "string" ? payload.error : "Request failed");
  }
  return payload as T;
}

function money(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function compact(value: number | null | undefined) {
  return new Intl.NumberFormat("en-NG").format(value ?? 0);
}

function duration(minutes: number | null | undefined) {
  if (!minutes) return "Flexible";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} hr`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "1 day" : `${days} days`;
}

function dateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function todayLabel() {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

function initials(value: string) {
  return value
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
}

function statusBadge(status: string) {
  if (status === "success") return { label: "Paid", className: "badge badge-g" };
  if (status === "pending" || status === "processing") return { label: "Pending", className: "badge badge-a" };
  if (status === "cancelled") return { label: "Cancelled", className: "badge badge-m" };
  return { label: "Failed", className: "badge badge-r" };
}

function voucherBadge(plan: { totalCount?: number; unusedCount?: number; total?: number; unused?: number }) {
  const total = plan.totalCount ?? plan.total ?? 0;
  const unused = plan.unusedCount ?? plan.unused ?? 0;
  const low = total > 0 && unused / total <= 0.2;
  return low
    ? { label: "Low", className: "badge badge-a" }
    : { label: "Good", className: "badge badge-g" };
}

function planSpec(plan: Plan) {
  const bits = [
    duration(plan.durationMinutes),
    plan.bandwidthProfile || null,
    plan.maxDevices ? `${plan.maxDevices} devices` : null,
    plan.dataLimitMb ? `${Math.round(plan.dataLimitMb / 1024)}GB` : null,
  ].filter(Boolean);
  return bits.join(" / ") || "No limits";
}

function planToForm(plan: Plan): PlanFormState {
  return {
    code: plan.code,
    name: plan.name,
    priceNgn: String(plan.priceNgn),
    durationMinutes: plan.durationMinutes ? String(plan.durationMinutes) : "",
    maxDevices: plan.maxDevices ? String(plan.maxDevices) : "",
    bandwidthProfile: plan.bandwidthProfile ?? "",
    dataLimitMb: plan.dataLimitMb ? String(plan.dataLimitMb) : "",
    description: plan.description ?? "",
    active: !!plan.active,
  };
}

function planFormPayload(form: PlanFormState) {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    priceNgn: Number(form.priceNgn),
    durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
    maxDevices: form.maxDevices ? Number(form.maxDevices) : null,
    bandwidthProfile: form.bandwidthProfile.trim() || null,
    dataLimitMb: form.dataLimitMb ? Number(form.dataLimitMb) : null,
    description: form.description.trim(),
    active: form.active,
  };
}

export function TenantAdminPanel({ tenantSlug, tenantName }: Props) {
  const name = tenantName || tenantSlug;
  const [view, setView] = useState<View>("overview");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [networkPlatform, setNetworkPlatform] = useState<NetworkPlatform>("omada");
  const [planView, setPlanView] = useState<PlanView>("list");
  const [stats, setStats] = useState<Stats | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionPagination, setTransactionPagination] = useState<Pagination>(emptyPagination);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherPagination, setVoucherPagination] = useState<Pagination>(emptyPagination);
  const [architecture, setArchitecture] = useState<Architecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [transactionQuery, setTransactionQuery] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("all");
  const [transactionPlan, setTransactionPlan] = useState("all");
  const [transactionPage, setTransactionPage] = useState(1);
  const [voucherQuery, setVoucherQuery] = useState("");
  const [voucherStatus, setVoucherStatus] = useState("all");
  const [voucherPlan, setVoucherPlan] = useState("all");
  const [voucherPage, setVoucherPage] = useState(1);
  const [planQuery, setPlanQuery] = useState("");
  const [planStatus, setPlanStatus] = useState("all");
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlan, setEditPlan] = useState<PlanFormState | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [voucherActionOpen, setVoucherActionOpen] = useState(false);
  const [creatingVouchers, setCreatingVouchers] = useState(false);
  const [savingArchitecture, setSavingArchitecture] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [origin, setOrigin] = useState("");
  const restoredUrlState = useRef(false);
  const skipNextUrlWrite = useRef(true);
  const importInput = useRef<HTMLInputElement | null>(null);

  const [newPlan, setNewPlan] = useState({
    name: "",
    priceNgn: "1000",
    durationMinutes: "1440",
    maxDevices: "1",
    bandwidthProfile: "",
    dataLimitMb: "",
    description: "",
  });
  const [voucherForm, setVoucherForm] = useState({
    packageId: "",
    voucherCode: "",
    generateCount: "25",
    prefix: "",
    codeLength: "10",
  });
  const [appearanceForm, setAppearanceForm] = useState({
    storePrimaryColor: "#72f064",
    dashboardPrimaryColor: "#72f064",
  });
  const [paymentForm, setPaymentForm] = useState({
    paystackPublicKey: "",
    paystackSecretKey: "",
  });
  const [notificationForm, setNotificationForm] = useState({
    dailyRevenueSummary: false,
    failedPaymentAlerts: false,
    lowVoucherStockAlerts: true,
    weeklyAnalyticsDigest: false,
  });

  async function refreshStats() {
    const payload = await readJson<{ stats: Stats }>(`/api/t/${tenantSlug}/admin/stats`);
    setStats(payload.stats);
  }

  async function refreshPlans() {
    const payload = await readJson<{ plans: Plan[] }>(`/api/t/${tenantSlug}/admin/plans`);
    setPlans(payload.plans);
    setVoucherForm((prev) => ({
      ...prev,
      packageId: prev.packageId || payload.plans[0]?.id || "",
    }));
  }

  async function refreshTransactions(page = transactionPage) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
      q: transactionQuery,
      status: transactionStatus,
    });
    if (transactionPlan !== "all") params.set("packageId", transactionPlan);
    const payload = await readJson<{ transactions: Transaction[]; pagination: Pagination }>(
      `/api/t/${tenantSlug}/admin/transactions?${params}`,
    );
    setTransactions(payload.transactions);
    setTransactionPagination(payload.pagination);
  }

  async function refreshVouchers(page = voucherPage) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
      q: voucherQuery,
      status: voucherStatus,
    });
    if (voucherPlan !== "all") params.set("packageId", voucherPlan);
    const payload = await readJson<{ vouchers: Voucher[]; pagination: Pagination }>(
      `/api/t/${tenantSlug}/admin/vouchers?${params}`,
    );
    setVouchers(payload.vouchers);
    setVoucherPagination(payload.pagination);
  }

  async function refreshArchitecture() {
    const payload = await readJson<{ architecture: Architecture }>(`/api/t/${tenantSlug}/admin/architecture`);
    setArchitecture(payload.architecture);
    setAppearanceForm({
      storePrimaryColor: payload.architecture.appearance.storePrimaryColor,
      dashboardPrimaryColor: payload.architecture.appearance.dashboardPrimaryColor,
    });
    setPaymentForm({ paystackPublicKey: "", paystackSecretKey: "" });
    setNotificationForm(payload.architecture.notifications);
    const source = payload.architecture.voucherSourceMode;
    setNetworkPlatform(
      source === "omada_openapi"
        ? "omada"
        : source === "mikrotik_rest"
          ? "mikrotik"
          : source === "radius_voucher"
            ? "radius"
            : "csv",
    );
  }

  async function refreshAll() {
    setError("");
    setLoading(true);
    try {
      await Promise.all([
        refreshStats(),
        refreshPlans(),
        refreshTransactions(1),
        refreshVouchers(1),
        refreshArchitecture(),
      ]);
      setTransactionPage(1);
      setVoucherPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tenant dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get("tab");
    const requestedSettingsTab = params.get("settings");
    const requestedPlanView = params.get("planView");

    if (navItems.some((item) => item.key === requestedView)) {
      setView(requestedView as View);
    }
    if (settingsTabs.includes(requestedSettingsTab as SettingsTab)) {
      setSettingsTab(requestedSettingsTab as SettingsTab);
    }
    if (planViews.includes(requestedPlanView as PlanView)) {
      setPlanView(requestedPlanView as PlanView);
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
      tab: view === "overview" ? null : view,
      settings: view === "settings" && settingsTab !== "general" ? settingsTab : null,
      planView: view === "plans" && planView !== "list" ? planView : null,
    });
  }, [planView, settingsTab, view]);

  useEffect(() => {
    if (!loading) void refreshTransactions(transactionPage).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionQuery, transactionStatus, transactionPlan, transactionPage]);

  useEffect(() => {
    if (!loading) void refreshVouchers(voucherPage).catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucherQuery, voucherStatus, voucherPlan, voucherPage]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  }

  async function createPlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingPlan(true);
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlan.name,
          priceNgn: Number(newPlan.priceNgn),
          durationMinutes: newPlan.durationMinutes ? Number(newPlan.durationMinutes) : null,
          maxDevices: newPlan.maxDevices ? Number(newPlan.maxDevices) : null,
          bandwidthProfile: newPlan.bandwidthProfile || null,
          dataLimitMb: newPlan.dataLimitMb ? Number(newPlan.dataLimitMb) : null,
          description: newPlan.description,
          active: true,
        }),
      });
      setNotice("Plan created.");
      setShowPlanForm(false);
      setNewPlan({
        name: "",
        priceNgn: "1000",
        durationMinutes: "1440",
        maxDevices: "1",
        bandwidthProfile: "",
        dataLimitMb: "",
        description: "",
      });
      await Promise.all([refreshPlans(), refreshStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create plan");
    } finally {
      setCreatingPlan(false);
    }
  }

  async function togglePlan(plan: Plan) {
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/plans`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id, active: !plan.active }),
      });
      await Promise.all([refreshPlans(), refreshStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update plan");
    }
  }

  function openEditPlan(plan: Plan) {
    setShowPlanForm(false);
    setEditingPlanId(plan.id);
    setEditPlan(planToForm(plan));
    setNotice("");
    setError("");
  }

  function closeEditPlan() {
    setEditingPlanId(null);
    setEditPlan(null);
  }

  async function updatePlan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlanId || !editPlan) return;
    setSavingPlan(true);
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/plans`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: editingPlanId,
          ...planFormPayload(editPlan),
        }),
      });
      setNotice("Plan updated.");
      closeEditPlan();
      await Promise.all([refreshPlans(), refreshStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update plan");
    } finally {
      setSavingPlan(false);
    }
  }

  async function deletePlan(plan: Plan) {
    if (!window.confirm(`Delete ${plan.name}? This removes related vouchers and transactions.`)) return;
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/plans`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete plan");
    }
  }

  async function createVouchers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingVouchers(true);
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: voucherForm.packageId,
          voucherCode: voucherForm.voucherCode.trim() || undefined,
          generateCount: voucherForm.voucherCode.trim() ? undefined : Number(voucherForm.generateCount),
          prefix: voucherForm.prefix || undefined,
          codeLength: voucherForm.codeLength ? Number(voucherForm.codeLength) : undefined,
          characterSet: "alnum",
        }),
      });
      setNotice("Voucher stock updated.");
      setVoucherActionOpen(false);
      setVoucherForm((prev) => ({ ...prev, voucherCode: "", generateCount: "25", prefix: "" }));
      await Promise.all([refreshVouchers(1), refreshPlans(), refreshStats()]);
      setVoucherPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create vouchers");
    } finally {
      setCreatingVouchers(false);
    }
  }

  async function importCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file || !voucherForm.packageId) return;
    setCreatingVouchers(true);
    setError("");
    try {
      const body = new FormData();
      const selectedPlan = plans.find((plan) => plan.id === voucherForm.packageId);
      if (selectedPlan?.code) body.set("packageCode", selectedPlan.code);
      body.set("file", file);
      await readJson(`/api/t/${tenantSlug}/admin/vouchers/import`, { method: "POST", body });
      setNotice("CSV imported.");
      await Promise.all([refreshVouchers(1), refreshPlans(), refreshStats()]);
      setVoucherPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import CSV");
    } finally {
      setCreatingVouchers(false);
      event.currentTarget.value = "";
    }
  }

  async function saveArchitecture(nextPlatform = networkPlatform) {
    setSavingArchitecture(true);
    setError("");
    const voucherSourceMode =
      nextPlatform === "omada"
        ? "omada_openapi"
        : nextPlatform === "mikrotik"
          ? "mikrotik_rest"
          : nextPlatform === "radius"
            ? "radius_voucher"
            : "import_csv";
    try {
      const payload = await readJson<{ architecture: Architecture }>(`/api/t/${tenantSlug}/admin/architecture`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voucherSourceMode }),
      });
      setArchitecture(payload.architecture);
      setNotice("Network source saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save network source");
    } finally {
      setSavingArchitecture(false);
    }
  }

  async function saveAppearance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAppearance(true);
    setError("");
    try {
      const payload = await readJson<{ architecture: Architecture }>(`/api/t/${tenantSlug}/admin/architecture`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appearance: appearanceForm }),
      });
      setArchitecture(payload.architecture);
      setAppearanceForm(payload.architecture.appearance);
      setNotice("Brand colors saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save brand colors");
    } finally {
      setSavingAppearance(false);
    }
  }

  async function savePayments(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPayments(true);
    setError("");
    try {
      const payload = await readJson<{ architecture: Architecture }>(`/api/t/${tenantSlug}/admin/payments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paystackPublicKey: paymentForm.paystackPublicKey.trim() || undefined,
          paystackSecretKey: paymentForm.paystackSecretKey.trim() || undefined,
        }),
      });
      setArchitecture(payload.architecture);
      setPaymentForm({ paystackPublicKey: "", paystackSecretKey: "" });
      setNotice("Payment settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save payment settings");
    } finally {
      setSavingPayments(false);
    }
  }

  async function saveNotifications(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingNotifications(true);
    setError("");
    try {
      const payload = await readJson<{ architecture: Architecture }>(`/api/t/${tenantSlug}/admin/architecture`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifications: notificationForm }),
      });
      setArchitecture(payload.architecture);
      setNotificationForm(payload.architecture.notifications);
      setNotice("Email notification settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save email notification settings");
    } finally {
      setSavingNotifications(false);
    }
  }

  async function cancelTransaction(reference: string) {
    if (!window.confirm("Cancel this pending payment? The poller will stop checking it.")) return;
    setError("");
    try {
      await readJson(`/api/t/${tenantSlug}/admin/transactions/${encodeURIComponent(reference)}/cancel`, {
        method: "POST",
      });
      setNotice("Pending payment cancelled.");
      await Promise.all([refreshTransactions(transactionPage), refreshStats()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel payment");
    }
  }

  const activePlans = plans.filter((plan) => !!plan.active);
  const totalVouchers = plans.reduce((sum, plan) => sum + Number(plan.totalCount ?? 0), 0);
  const availableVouchers = plans.reduce((sum, plan) => sum + Number(plan.unusedCount ?? 0), 0);
  const usedVouchers = plans.reduce((sum, plan) => sum + Number(plan.assignedCount ?? 0), 0);
  const lowStockPlans = plans.filter((plan) => plan.totalCount > 0 && plan.unusedCount / plan.totalCount <= 0.2);
  const successRate = stats?.transactions.total
    ? Math.round((stats.transactions.success / stats.transactions.total) * 1000) / 10
    : 0;
  const dashboardPrimaryColor =
    architecture?.appearance.dashboardPrimaryColor || appearanceForm.dashboardPrimaryColor || "#72f064";
  const dashboardStyle = {
    "--ac": dashboardPrimaryColor,
    "--ac-dim": `${dashboardPrimaryColor}1a`,
    "--ac-soft": `${dashboardPrimaryColor}2b`,
    "--ac-bd": `${dashboardPrimaryColor}55`,
  } as CSSProperties;
  const filteredPlans = plans.filter((plan) => {
    const matchesQuery =
      !planQuery ||
      plan.name.toLowerCase().includes(planQuery.toLowerCase()) ||
      plan.code.toLowerCase().includes(planQuery.toLowerCase());
    const matchesStatus =
      planStatus === "all" ||
      (planStatus === "active" && plan.active) ||
      (planStatus === "inactive" && !plan.active);
    return matchesQuery && matchesStatus;
  });
  const maxPlanTotal = Math.max(1, ...plans.map((plan) => plan.assignedCount));
  const currentLabel = navItems.find((item) => item.key === view)?.label || "Dashboard";

  return (
    <>
    <style suppressHydrationWarning>{tenantDashboardCriticalCss}</style>
    <div id="s-dash" className="screen on" data-screen-label="06 Tenant Dashboard" style={dashboardStyle}>
      <div className="dash-layout">
        <aside className="sidebar">
          <div className="sb-brand">
            <div className="sb-mark">{initials(name).slice(0, 1)}</div>
            <div>
              <div className="sb-name">{name}</div>
              <div className="sb-url">{tenantSlug}.payspot.app</div>
            </div>
          </div>

          <nav className="sb-nav">
            <div className="sb-sec">Operations</div>
            {navItems.slice(0, 3).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`sb-item ${view === item.key ? "on" : ""}`}
                onClick={() => setView(item.key)}
              >
                {item.label}
                {item.key === "transactions" && stats?.transactions.pending ? (
                  <span className="sb-bdg">{stats.transactions.pending + stats.transactions.processing}</span>
                ) : null}
              </button>
            ))}
            <div className="sb-sec">Configuration</div>
            {navItems.slice(3).map((item) => (
              <button
                key={item.key}
                type="button"
                className={`sb-item ${view === item.key ? "on" : ""}`}
                onClick={() => setView(item.key)}
              >
                {item.label}
              </button>
            ))}
            <div className="sb-sec">Links</div>
            <a className="sb-item" href={`/t/${tenantSlug}`}>
              My Store ↗
            </a>
          </nav>

          <div className="sb-foot">
            <div className="sb-user">
              <div className="sb-av">{initials(name).slice(0, 1)}</div>
              <div>
                <div className="sb-uname">{name} Admin</div>
                <div className="sb-urole">Tenant Admin</div>
              </div>
            </div>
          </div>
        </aside>

        <div className="dash-main">
          <div className="dash-topbar">
            <div className="dash-crumb">
              <span>PaySpot</span>
              <span className="dash-crumb-sep">›</span>
              <span>{tenantSlug}</span>
              <span className="dash-crumb-sep">›</span>
              <span>{currentLabel}</span>
            </div>
            <div className="dash-topbar-right">
              <button className="btn btn-icon" type="button" title="Notifications">
                <Bell size={15} />
              </button>
              <ThemeToggle />
              <a className="btn btn-ac btn-sm" href={`/t/${tenantSlug}`}>
                View Store
              </a>
              <button className="btn btn-ghost btn-sm" type="button" onClick={logout}>
                Logout
              </button>
            </div>
          </div>

          <div className="dash-content">
            {error ? <div className="alert-banner warn">{error}</div> : null}
            {notice ? (
              <div className="alert-banner info">
                <Check size={16} />
                {notice}
                <button className="btn btn-ghost btn-xs" type="button" onClick={() => setNotice("")}>
                  Dismiss
                </button>
              </div>
            ) : null}
            {loading ? (
              <div className="settings-card">
                <Loader2 className="spin" size={18} /> Loading tenant dashboard...
              </div>
            ) : null}

            <section className={`dash-section ${view === "overview" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Dashboard</div>
                  <div className="dash-sub">{todayLabel()} · All-time</div>
                </div>
                <div className="dash-hdr-r">
                  <button className="btn btn-muted btn-sm" type="button" onClick={() => setView("vouchers")}>
                    Import CSV
                  </button>
                  <button className="btn btn-ac btn-sm" type="button" onClick={() => { setView("plans"); setShowPlanForm(true); }}>
                    + Add Plan
                  </button>
                </div>
              </div>
              <KpiRow
                items={[
                  { label: "Total Revenue", value: money(stats?.transactions.revenueNgn), delta: "Live from successful payments", tone: "up" },
                  { label: "Transactions", value: compact(stats?.transactions.total), delta: `${compact(stats?.transactions.success)} successful`, tone: "up" },
                  { label: "Vouchers Left", value: compact(availableVouchers), delta: lowStockPlans.length ? `${lowStockPlans[0].name} stock low` : "Ready to sell", tone: lowStockPlans.length ? "warn" : "neu" },
                  { label: "Active Plans", value: compact(activePlans.length), delta: `${compact(plans.length)} total plans`, tone: "neu" },
                ]}
              />
              <div className="dash-grid">
                <div className="ac">
                  <div className="ac-hdr">
                    <div>
                      <div className="ac-title">Recent Transactions</div>
                      <div className="ac-sub">Latest customer payments</div>
                    </div>
                    <button className="btn btn-muted btn-sm" type="button" onClick={() => setView("transactions")}>
                      View all →
                    </button>
                  </div>
                  <TransactionsTable transactions={transactions.slice(0, 5)} compactTable onCancel={cancelTransaction} />
                </div>
                <div>
                  <div className="widget">
                    <div className="widget-title">Plan Breakdown</div>
                    {plans.length === 0 ? <EmptyInline label="No plans yet" /> : plans.slice(0, 6).map((plan, index) => (
                      <div className="bar-row" key={plan.id}>
                        <div className="bar-meta">
                          <span className="bar-name">{plan.name}</span>
                          <span className="bar-val">{Math.round((plan.assignedCount / maxPlanTotal) * 100)}%</span>
                        </div>
                        <div className="bar-track">
                          <div
                            className="bar-fill"
                            style={{
                              width: `${Math.max(3, Math.round((plan.assignedCount / maxPlanTotal) * 100))}%`,
                              background: index % 3 === 1 ? "var(--amber)" : index % 3 === 2 ? "var(--green)" : "var(--ac)",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="widget">
                    <div className="widget-title">Voucher Stock</div>
                    <div className="mini-stack">
                      {plans.length === 0 ? <EmptyInline label="No voucher stock yet" /> : plans.slice(0, 6).map((plan) => (
                        <div className="mini-row" key={plan.id}>
                          <span>{plan.name}</span>
                          <span className={plan.totalCount > 0 && plan.unusedCount / plan.totalCount <= 0.2 ? "warn-text" : ""}>
                            {compact(plan.unusedCount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`dash-section ${view === "transactions" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Transactions</div>
                  <div className="dash-sub">{compact(stats?.transactions.total)} total · {money(stats?.transactions.revenueNgn)} revenue</div>
                </div>
                <div className="dash-hdr-r">
                  <button className="btn btn-muted btn-sm" type="button" onClick={() => void refreshTransactions(transactionPage)}>
                    Refresh
                  </button>
                </div>
              </div>
              <KpiRow
                items={[
                  { label: "Total Txns", value: compact(stats?.transactions.total), delta: "All statuses", tone: "up" },
                  { label: "Success Rate", value: `${successRate}%`, delta: `${compact(stats?.transactions.success)} paid`, tone: "up" },
                  { label: "Pending", value: compact((stats?.transactions.pending ?? 0) + (stats?.transactions.processing ?? 0)), delta: "Awaiting confirm", tone: "warn" },
                  { label: "Failed", value: compact(stats?.transactions.failed), delta: "Needs retry or support", tone: "neu" },
                ]}
              />
              <div className="ac">
                <div className="tbar">
                  <input className="tsearch" placeholder="Search name, phone, code..." value={transactionQuery} onChange={(event) => { setTransactionPage(1); setTransactionQuery(event.target.value); }} />
                  <select className="tfilter" value={transactionStatus} onChange={(event) => { setTransactionPage(1); setTransactionStatus(event.target.value); }}>
                    <option value="all">All statuses</option>
                    <option value="success">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="failed">Failed</option>
                  </select>
                  <select className="tfilter" value={transactionPlan} onChange={(event) => { setTransactionPage(1); setTransactionPlan(event.target.value); }}>
                    <option value="all">All plans</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </div>
                <TransactionsTable transactions={transactions} onCancel={cancelTransaction} />
                <Pager pagination={transactionPagination} page={transactionPage} setPage={setTransactionPage} />
              </div>
            </section>

            <section className={`dash-section ${view === "vouchers" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Vouchers</div>
                  <div className="dash-sub">{compact(availableVouchers)} available · {compact(usedVouchers)} used</div>
                </div>
                <div className="dash-hdr-r">
                  <button className="btn btn-muted btn-sm" type="button" onClick={() => setVoucherActionOpen((open) => !open)}>
                    Import / Generate
                  </button>
                </div>
              </div>
              {lowStockPlans.length ? (
                <div className="alert-banner warn">Low stock warning: {lowStockPlans[0].name} is down to {compact(lowStockPlans[0].unusedCount)} vouchers.</div>
              ) : null}
              <KpiRow
                items={[
                  { label: "Total Stock", value: compact(totalVouchers), delta: "All plans combined", tone: "neu" },
                  { label: "Used", value: compact(usedVouchers), delta: `${totalVouchers ? Math.round((usedVouchers / totalVouchers) * 100) : 0}% utilisation`, tone: "neu" },
                  { label: "Available", value: compact(availableVouchers), delta: "Ready to sell", tone: "up" },
                  { label: "Low Stock Plans", value: compact(lowStockPlans.length), delta: lowStockPlans.length ? "Needs import" : "Healthy", tone: lowStockPlans.length ? "warn" : "neu" },
                ]}
              />
              {voucherActionOpen ? (
                <form className="settings-card" onSubmit={createVouchers}>
                  <div className="settings-card-title">Import or Generate Vouchers</div>
                  <div className="field-row">
                    <div className="field">
                      <label>Plan</label>
                      <select value={voucherForm.packageId} onChange={(event) => setVoucherForm((prev) => ({ ...prev, packageId: event.target.value }))}>
                        {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Generate Count</label>
                      <input value={voucherForm.generateCount} onChange={(event) => setVoucherForm((prev) => ({ ...prev, generateCount: event.target.value }))} />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <label>Optional Prefix</label>
                      <input value={voucherForm.prefix} onChange={(event) => setVoucherForm((prev) => ({ ...prev, prefix: event.target.value }))} placeholder="WIFI" />
                    </div>
                    <div className="field">
                      <label>Single Manual Code</label>
                      <input value={voucherForm.voucherCode} onChange={(event) => setVoucherForm((prev) => ({ ...prev, voucherCode: event.target.value }))} placeholder="Leave blank to auto-generate" />
                    </div>
                  </div>
                  <input ref={importInput} type="file" accept=".csv,text/csv" hidden onChange={importCsv} />
                  <div className="settings-foot">
                    <button className="btn btn-muted btn-sm" type="button" onClick={() => importInput.current?.click()} disabled={creatingVouchers}>
                      Import CSV
                    </button>
                    <button className="btn btn-ac btn-sm" type="submit" disabled={creatingVouchers || !voucherForm.packageId}>
                      {creatingVouchers ? <Loader2 className="spin" size={14} /> : null}
                      Generate
                    </button>
                  </div>
                </form>
              ) : null}
              <div className="ac">
                <div className="ac-hdr">
                  <div className="ac-title">Stock by Plan</div>
                  <button className="btn btn-ac btn-sm" type="button" onClick={() => setVoucherActionOpen(true)}>
                    Import CSV
                  </button>
                </div>
                <div className="table-scroll">
                  <table className="t">
                    <thead><tr><th>Plan</th><th>Duration</th><th>Total Imported</th><th>Used</th><th>Available</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {plans.map((plan) => {
                        const badge = voucherBadge(plan);
                        return (
                          <tr key={plan.id}>
                            <td className="td-main">{plan.name}</td>
                            <td>{duration(plan.durationMinutes)}</td>
                            <td className="td-muted">{compact(plan.totalCount)}</td>
                            <td className="td-muted">{compact(plan.assignedCount)}</td>
                            <td className="td-mono">{compact(plan.unusedCount)}</td>
                            <td><span className={badge.className}>{badge.label}</span></td>
                            <td><button className="btn btn-muted btn-xs" type="button" onClick={() => { setVoucherForm((prev) => ({ ...prev, packageId: plan.id })); setVoucherActionOpen(true); }}>Import more</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="ac">
                <div className="tbar">
                  <input className="tsearch" placeholder="Search code, plan, email..." value={voucherQuery} onChange={(event) => { setVoucherPage(1); setVoucherQuery(event.target.value); }} />
                  <select className="tfilter" value={voucherStatus} onChange={(event) => { setVoucherPage(1); setVoucherStatus(event.target.value); }}>
                    <option value="all">All statuses</option>
                    <option value="UNUSED">Available</option>
                    <option value="ASSIGNED">Used</option>
                  </select>
                  <select className="tfilter" value={voucherPlan} onChange={(event) => { setVoucherPage(1); setVoucherPlan(event.target.value); }}>
                    <option value="all">All plans</option>
                    {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
                  </select>
                </div>
                <div className="table-scroll">
                  <table className="t">
                    <thead><tr><th>Voucher</th><th>Plan</th><th>Assigned To</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {vouchers.length === 0 ? <EmptyRow colSpan={5} label="No vouchers match this filter." /> : vouchers.map((voucher) => (
                        <tr key={voucher.id}>
                          <td className="td-mono">{voucher.voucherCode}</td>
                          <td className="td-main">{voucher.packageName}</td>
                          <td>{voucher.assignedToEmail || voucher.assignedToPhone || "Unassigned"}</td>
                          <td>{dateTime(voucher.assignedAt || voucher.createdAt)}</td>
                          <td><span className={`badge ${voucher.status === "UNUSED" ? "badge-g" : "badge-a"}`}>{voucher.status === "UNUSED" ? "Available" : "Used"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pager pagination={voucherPagination} page={voucherPage} setPage={setVoucherPage} />
              </div>
            </section>

            <section className={`dash-section ${view === "plans" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Plans</div>
                  <div className="dash-sub">{compact(activePlans.length)} active plans</div>
                </div>
                <div className="dash-hdr-r">
                  <button className="btn btn-ac btn-sm" type="button" onClick={() => {
                    closeEditPlan();
                    setShowPlanForm((open) => !open);
                  }}>
                    + New Plan
                  </button>
                </div>
              </div>
              {showPlanForm ? (
                <form className="settings-card" onSubmit={createPlan}>
                  <div className="settings-card-title">New Plan</div>
                  <div className="field-row">
                    <div className="field"><label>Plan Name</label><input required value={newPlan.name} onChange={(event) => setNewPlan((prev) => ({ ...prev, name: event.target.value }))} placeholder="1 Day Wi-Fi" /></div>
                    <div className="field"><label>Price (NGN)</label><input required type="number" min="0" value={newPlan.priceNgn} onChange={(event) => setNewPlan((prev) => ({ ...prev, priceNgn: event.target.value }))} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Duration (minutes)</label><input type="number" min="1" value={newPlan.durationMinutes} onChange={(event) => setNewPlan((prev) => ({ ...prev, durationMinutes: event.target.value }))} /></div>
                    <div className="field"><label>Max Devices</label><input type="number" min="1" max="32" value={newPlan.maxDevices} onChange={(event) => setNewPlan((prev) => ({ ...prev, maxDevices: event.target.value }))} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Speed / Profile</label><input value={newPlan.bandwidthProfile} onChange={(event) => setNewPlan((prev) => ({ ...prev, bandwidthProfile: event.target.value }))} placeholder="10Mbps" /></div>
                    <div className="field"><label>Data Limit (MB)</label><input type="number" min="1" value={newPlan.dataLimitMb} onChange={(event) => setNewPlan((prev) => ({ ...prev, dataLimitMb: event.target.value }))} placeholder="Optional" /></div>
                  </div>
                  <div className="field"><label>Description</label><textarea value={newPlan.description} onChange={(event) => setNewPlan((prev) => ({ ...prev, description: event.target.value }))} /></div>
                  <div className="settings-foot">
                    <button className="btn btn-muted btn-sm" type="button" onClick={() => setShowPlanForm(false)}>Cancel</button>
                    <button className="btn btn-ac btn-sm" type="submit" disabled={creatingPlan}>{creatingPlan ? <Loader2 className="spin" size={14} /> : null}Create Plan</button>
                  </div>
                </form>
              ) : null}
              {editingPlanId && editPlan ? (
                <form className="settings-card" onSubmit={updatePlan}>
                  <div className="settings-card-title">Edit Plan</div>
                  <div className="field-row">
                    <div className="field"><label>Plan Name</label><input required value={editPlan.name} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, name: event.target.value }) : prev)} /></div>
                    <div className="field"><label>Plan Code</label><input required value={editPlan.code} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, code: event.target.value }) : prev)} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Price (NGN)</label><input required type="number" min="0" value={editPlan.priceNgn} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, priceNgn: event.target.value }) : prev)} /></div>
                    <div className="field"><label>Duration (minutes)</label><input type="number" min="1" value={editPlan.durationMinutes} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, durationMinutes: event.target.value }) : prev)} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Max Devices</label><input type="number" min="1" max="32" value={editPlan.maxDevices} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, maxDevices: event.target.value }) : prev)} /></div>
                    <div className="field"><label>Data Limit (MB)</label><input type="number" min="1" value={editPlan.dataLimitMb} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, dataLimitMb: event.target.value }) : prev)} placeholder="Optional" /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Speed / Profile</label><input value={editPlan.bandwidthProfile} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, bandwidthProfile: event.target.value }) : prev)} placeholder="10Mbps" /></div>
                    <label className="toggle" style={{ alignSelf: "end", marginBottom: 8 }}>
                      <input type="checkbox" checked={editPlan.active} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, active: event.target.checked }) : prev)} />
                      <span className="toggle-label">Plan is active</span>
                    </label>
                  </div>
                  <div className="field"><label>Description</label><textarea value={editPlan.description} onChange={(event) => setEditPlan((prev) => prev ? ({ ...prev, description: event.target.value }) : prev)} /></div>
                  <div className="settings-foot">
                    <button className="btn btn-muted btn-sm" type="button" onClick={closeEditPlan}>Cancel</button>
                    <button className="btn btn-ac btn-sm" type="submit" disabled={savingPlan}>{savingPlan ? <Loader2 className="spin" size={14} /> : null}Save Plan</button>
                  </div>
                </form>
              ) : null}
              <div className="plans-toolbar">
                <input className="tsearch" placeholder="Search plans..." style={{ width: 220 }} value={planQuery} onChange={(event) => setPlanQuery(event.target.value)} />
                <select className="tfilter" value={planStatus} onChange={(event) => setPlanStatus(event.target.value)}>
                  <option value="all">All plans</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                </select>
                <div className="plans-toolbar-r">
                  <div className="view-toggle">
                    <button className={`view-btn ${planView === "list" ? "on" : ""}`} type="button" onClick={() => setPlanView("list")}><List size={14} />List</button>
                    <button className={`view-btn ${planView === "grid" ? "on" : ""}`} type="button" onClick={() => setPlanView("grid")}><Grid2X2 size={14} />Grid</button>
                  </div>
                </div>
              </div>
              {planView === "list" ? (
                <div className="plans-table-wrap">
                  <div className="table-scroll">
                    <table className="plans-t">
                      <thead><tr><th>Plan Name</th><th>Price</th><th>Duration</th><th>Speed / Devices / Data</th><th>Used</th><th>Revenue est.</th><th>Status</th><th>Actions</th></tr></thead>
                      <tbody>{filteredPlans.map((plan) => <PlanRow key={plan.id} plan={plan} onEdit={openEditPlan} onToggle={togglePlan} onDelete={deletePlan} />)}</tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="plans-grid">
                  {filteredPlans.map((plan) => (
                    <div className={`plan-grid-card ${plan.active ? "" : "inactive"}`} key={plan.id}>
                      <div className="pgc-top"><div><div className="pgc-name">{plan.name}</div><div className="td-muted">{plan.code}</div></div><div className="pgc-price">{money(plan.priceNgn)}</div></div>
                      <div className="pgc-specs"><span className="pgc-spec">{duration(plan.durationMinutes)}</span><span className="pgc-spec">{plan.maxDevices || 1} devices</span><span className="pgc-spec">{plan.bandwidthProfile || "Standard"}</span></div>
                      <div className="pgc-stats"><div><div className="pgc-stat-v">{compact(plan.assignedCount)}</div><div className="pgc-stat-l">Used</div></div><div><div className="pgc-stat-v">{compact(plan.unusedCount)}</div><div className="pgc-stat-l">Available</div></div></div>
                      <div className="pgc-foot"><button className="btn btn-ac btn-xs" type="button" onClick={() => openEditPlan(plan)}>Edit</button><button className="btn btn-muted btn-xs" type="button" onClick={() => void togglePlan(plan)}>{plan.active ? "Pause" : "Activate"}</button><button className="btn btn-red btn-xs" type="button" onClick={() => void deletePlan(plan)}>Delete</button></div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className={`dash-section ${view === "network" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Network Setup</div>
                  <div className="dash-sub">Configure your hotspot platform</div>
                </div>
              </div>
              <div className="platform-pills">
                {[
                  ["omada", "Omada Cloud"],
                  ["mikrotik", "MikroTik RouterOS"],
                  ["radius", "RADIUS / FreeRADIUS"],
                  ["csv", "CSV Only"],
                ].map(([key, label]) => (
                  <button key={key} className={`platform-pill ${networkPlatform === key ? "on" : ""}`} type="button" onClick={() => setNetworkPlatform(key as NetworkPlatform)}>{label}</button>
                ))}
              </div>
              <div className="netform">
                <div className="netform-title">{networkPlatform === "omada" ? "Omada Cloud OpenAPI" : networkPlatform === "mikrotik" ? "MikroTik RouterOS REST API" : networkPlatform === "radius" ? "RADIUS Server" : "CSV Voucher Pool"}</div>
                {networkPlatform === "omada" ? <OmadaPanel architecture={architecture} /> : null}
                {networkPlatform === "mikrotik" ? <MikrotikPanel architecture={architecture} /> : null}
                {networkPlatform === "radius" ? <RadiusPanel architecture={architecture} /> : null}
                {networkPlatform === "csv" ? <CsvPanel /> : null}
                <div className="settings-foot">
                  <button className="btn btn-muted btn-sm" type="button" onClick={() => void refreshArchitecture()}>Reload</button>
                  <button className="btn btn-ac btn-sm" type="button" onClick={() => void saveArchitecture()} disabled={savingArchitecture}>
                    {savingArchitecture ? <Loader2 className="spin" size={14} /> : null}
                    Save
                  </button>
                </div>
                <div className={architecture ? "net-status ok" : "net-status warn"}>
                  {architecture ? "Configured mode loaded from backend." : "Not configured yet."}
                </div>
              </div>
            </section>

            <section className={`dash-section ${view === "settings" ? "on" : ""}`}>
              <div className="dash-header">
                <div>
                  <div className="dash-title">Settings</div>
                  <div className="dash-sub">Account and integration config</div>
                </div>
              </div>
              <div className="settings-layout">
                <div className="settings-tabs">
                  {[
                    ["general", "General"],
                    ["appearance", "Appearance"],
                    ["payments", "Payments"],
                    ["sms", "SMS"],
                    ["notifications", "Notifications"],
                  ].map(([key, label]) => (
                    <button key={key} className={`settings-tab ${settingsTab === key ? "on" : ""}`} type="button" onClick={() => setSettingsTab(key as SettingsTab)}>{label}</button>
                  ))}
                </div>
                <div>
                  <div className={`settings-panel ${settingsTab === "general" ? "on" : ""}`}>
                    <div className="settings-card">
                      <div className="settings-card-title">Venue Details</div>
                      <div className="field"><label>Venue Name</label><input value={name} readOnly /></div>
                      <div className="field"><label>Store URL Slug</label><input value={tenantSlug} readOnly /><div className="hint">Your store: {tenantSlug}.payspot.app</div></div>
                    </div>
                  </div>
                  <div className={`settings-panel ${settingsTab === "appearance" ? "on" : ""}`}>
                    <form className="settings-card" onSubmit={saveAppearance}>
                      <div className="settings-card-title">Brand Colors</div>
                      <div className="field-row">
                        <div className="field">
                          <label>Store Primary Color</label>
                          <input
                            type="color"
                            value={appearanceForm.storePrimaryColor}
                            onChange={(event) => setAppearanceForm((current) => ({ ...current, storePrimaryColor: event.target.value }))}
                          />
                          <div className="hint">Used on the public purchase page and receipt email.</div>
                        </div>
                        <div className="field">
                          <label>Dashboard Primary Color</label>
                          <input
                            type="color"
                            value={appearanceForm.dashboardPrimaryColor}
                            onChange={(event) => setAppearanceForm((current) => ({ ...current, dashboardPrimaryColor: event.target.value }))}
                          />
                          <div className="hint">Used for buttons, badges, and highlights in this dashboard.</div>
                        </div>
                      </div>
                      <div className="settings-foot">
                        <button className="btn btn-ac" type="submit" disabled={savingAppearance}>
                          {savingAppearance ? "Saving..." : "Save colors"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className={`settings-panel ${settingsTab === "payments" ? "on" : ""}`}>
                    <form className="settings-card" onSubmit={savePayments}>
                      <div className="settings-card-title">Paystack Configuration</div>
                      <div className="field-row">
                        <div className="field">
                          <label>Public Key</label>
                          <input
                            value={paymentForm.paystackPublicKey}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, paystackPublicKey: event.target.value }))}
                            placeholder={architecture?.payment.hasPublicKey ? `Stored - ending ${architecture.payment.publicKeyLast4}` : "pk_test_... or pk_live_..."}
                          />
                          <div className="hint">Used for popup checkout compatibility and operator reference.</div>
                        </div>
                        <div className="field">
                          <label>Secret Key</label>
                          <input
                            type="password"
                            value={paymentForm.paystackSecretKey}
                            onChange={(event) => setPaymentForm((current) => ({ ...current, paystackSecretKey: event.target.value }))}
                            placeholder="Leave blank to keep saved secret key"
                          />
                          <div className="hint">Server-side verification uses the secret key and never exposes it to customers.</div>
                        </div>
                      </div>
                      <div className="field">
                        <label>Webhook URL</label>
                        <div className="key-display"><span>{`${origin || "https://payspot.app"}/api/t/${tenantSlug}/payments/webhook`}</span></div>
                      </div>
                      <div className="settings-foot">
                        <button className="btn btn-ac" type="submit" disabled={savingPayments}>
                          {savingPayments ? "Saving..." : "Save payment settings"}
                        </button>
                      </div>
                    </form>
                  </div>
                  <div className={`settings-panel ${settingsTab === "sms" ? "on" : ""}`}>
                    <div className="settings-card">
                      <div className="settings-card-title">SMS Delivery</div>
                      <div className="field"><label>Sender ID</label><input value="PaySpot" readOnly /></div>
                      <div className="field"><label>SMS Template</label><textarea readOnly value={`Your ${name} WiFi code is {code}. Duration: {plan}. Enjoy!`} /></div>
                    </div>
                  </div>
                  <div className={`settings-panel ${settingsTab === "notifications" ? "on" : ""}`}>
                    <form className="settings-card" onSubmit={saveNotifications}>
                      <div className="settings-card-title">Email Notifications</div>
                      <div className="toggle-list">
                        <NotificationToggle
                          label="Daily revenue summary"
                          enabled={notificationForm.dailyRevenueSummary}
                          onChange={(dailyRevenueSummary) => setNotificationForm((current) => ({ ...current, dailyRevenueSummary }))}
                        />
                        <NotificationToggle
                          label="Failed payment alerts"
                          enabled={notificationForm.failedPaymentAlerts}
                          onChange={(failedPaymentAlerts) => setNotificationForm((current) => ({ ...current, failedPaymentAlerts }))}
                        />
                        <NotificationToggle
                          label="Low voucher stock alerts"
                          enabled={notificationForm.lowVoucherStockAlerts}
                          onChange={(lowVoucherStockAlerts) => setNotificationForm((current) => ({ ...current, lowVoucherStockAlerts }))}
                        />
                        <NotificationToggle
                          label="Weekly analytics digest"
                          enabled={notificationForm.weeklyAnalyticsDigest}
                          onChange={(weeklyAnalyticsDigest) => setNotificationForm((current) => ({ ...current, weeklyAnalyticsDigest }))}
                        />
                      </div>
                      <div className="hint" style={{ marginTop: 12 }}>
                        Default is off for all tenant emails except low voucher stock alerts for CSV voucher tenants.
                      </div>
                      <div className="settings-foot">
                        <button className="btn btn-ac" type="submit" disabled={savingNotifications}>
                          {savingNotifications ? "Saving..." : "Save notifications"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="mob-menu">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.key} className={`mob-btn ${view === item.key ? "on" : ""}`} type="button" onClick={() => setView(item.key)}>
                  <Icon size={18} />
                  {item.short}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function KpiRow({ items }: { items: Array<{ label: string; value: string; delta: string; tone: "up" | "dn" | "neu" | "warn" }> }) {
  return (
    <div className="kpi-row">
      {items.map((item) => (
        <div className="kpi" key={item.label}>
          <div className="kpi-hdr"><div className="kpi-label">{item.label}</div></div>
          <div className="kpi-val">{item.value}</div>
          <div className={`kpi-delta ${item.tone}`}>{item.delta}</div>
        </div>
      ))}
    </div>
  );
}

function TransactionsTable({
  transactions,
  compactTable = false,
  onCancel,
}: {
  transactions: Transaction[];
  compactTable?: boolean;
  onCancel?: (reference: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="t">
        <thead>
          <tr>
            <th>Customer</th>
            {!compactTable ? <th>Phone</th> : null}
            <th>Plan</th>
            {!compactTable ? <th>Method</th> : null}
            <th>Amount</th>
            <th>Voucher</th>
            <th>Status</th>
            <th>{compactTable ? "Time" : "Date"}</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 ? <EmptyRow colSpan={compactTable ? 7 : 9} label="No transactions yet." /> : transactions.map((transaction) => {
            const badge = statusBadge(transaction.paymentStatus);
            const canCancel = transaction.paymentStatus === "pending" || transaction.paymentStatus === "processing";
            return (
              <tr key={transaction.id}>
                <td className="td-main">{transaction.email || transaction.reference}</td>
                {!compactTable ? <td>{transaction.phone || "-"}</td> : null}
                <td>{transaction.packageName || transaction.packageCode || "Plan"}</td>
                {!compactTable ? <td>{transaction.deliveryMode === "account_access" ? "Account" : "Voucher"}</td> : null}
                <td className="td-muted">{money(transaction.amountNgn)}</td>
                <td className="td-mono">{transaction.voucherCode || "-"}</td>
                <td><span className={badge.className}>{badge.label}</span></td>
                <td>{dateTime(transaction.paidAt || transaction.createdAt)}</td>
                <td>
                  {canCancel ? (
                    <button className="btn btn-red btn-xs" type="button" onClick={() => onCancel?.(transaction.reference)}>
                      Cancel
                    </button>
                  ) : (
                    <span className="td-muted">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Pager({ pagination, page, setPage }: { pagination: Pagination; page: number; setPage: (page: number) => void }) {
  return (
    <div className="t-pagination">
      <span>
        Showing page {pagination.page} of {pagination.totalPages} · {compact(pagination.total)} total
      </span>
      <div className="pager-actions">
        <button className="btn btn-muted btn-xs" type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>
          <ChevronLeft size={12} /> Prev
        </button>
        <button className="btn btn-muted btn-xs" type="button" onClick={() => setPage(Math.min(pagination.totalPages, page + 1))} disabled={page >= pagination.totalPages}>
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

function PlanRow({
  plan,
  onEdit,
  onToggle,
  onDelete,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onToggle: (plan: Plan) => void;
  onDelete: (plan: Plan) => void;
}) {
  return (
    <tr>
      <td><div className="td-name">{plan.name}</div><div className="td-spec">{plan.code}</div></td>
      <td className="td-price">{money(plan.priceNgn)}</td>
      <td>{duration(plan.durationMinutes)}</td>
      <td className="td-spec">{planSpec(plan)}</td>
      <td className="td-stats">{compact(plan.assignedCount)}</td>
      <td className="td-price">{money(plan.assignedCount * plan.priceNgn)}</td>
      <td><span className={`badge ${plan.active ? "badge-g" : "badge-m"}`}>{plan.active ? "Active" : "Inactive"}</span></td>
      <td>
        <div className="plans-acts">
          <button className="btn btn-ac btn-xs" type="button" onClick={() => onEdit(plan)}>Edit</button>
          <button className="btn btn-muted btn-xs" type="button" onClick={() => onToggle(plan)}>{plan.active ? "Pause" : "Activate"}</button>
          <button className="btn btn-red btn-xs" type="button" onClick={() => onDelete(plan)}>Delete</button>
        </div>
      </td>
    </tr>
  );
}

function NotificationToggle({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <button className="toggle" type="button" onClick={() => onChange(!enabled)}>
      <span className={`toggle-track ${enabled ? "on" : ""}`} />
      <span className="toggle-label">{label}</span>
    </button>
  );
}

function OmadaPanel({ architecture }: { architecture: Architecture | null }) {
  return (
    <>
      <div className="field-row">
        <div className="field"><label>Omada API Base URL</label><input value={architecture?.omada.apiBaseUrl || ""} readOnly placeholder="https://openapi.tplinkcloud.com" /></div>
        <div className="field"><label>Omada Controller ID</label><input value={architecture?.omada.omadacId || ""} readOnly placeholder="Controller ID" /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Site ID</label><input value={architecture?.omada.siteId || ""} readOnly /></div>
        <div className="field"><label>Client ID</label><input value={architecture?.omada.clientId || ""} readOnly /></div>
      </div>
    </>
  );
}

function MikrotikPanel({ architecture }: { architecture: Architecture | null }) {
  return (
    <>
      <div className="field-row">
        <div className="field"><label>Router URL</label><input value={architecture?.mikrotik.baseUrl || ""} readOnly placeholder="https://192.168.88.1" /></div>
        <div className="field"><label>Username</label><input value={architecture?.mikrotik.username || ""} readOnly /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Hotspot Server</label><input value={architecture?.mikrotik.hotspotServer || ""} readOnly /></div>
        <div className="field"><label>Default Profile</label><input value={architecture?.mikrotik.defaultProfile || ""} readOnly /></div>
      </div>
    </>
  );
}

function RadiusPanel({ architecture }: { architecture: Architecture | null }) {
  return (
    <div className="field">
      <label>Adapter Secret</label>
      <div className="key-display"><span>{architecture?.radius.hasAdapterSecret ? `Configured · ending ${architecture.radius.adapterSecretLast4 || "****"}` : "Not configured"}</span></div>
    </div>
  );
}

function CsvPanel() {
  return (
    <div className="csv-drop">Upload pre-generated voucher codes via CSV. PaySpot will dispense them one per purchase.</div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="td-muted">{label}</td>
    </tr>
  );
}

function EmptyInline({ label }: { label: string }) {
  return <div className="td-muted">{label}</div>;
}
