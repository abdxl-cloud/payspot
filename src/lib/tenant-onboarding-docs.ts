import { getAppEnv } from "@/lib/env";
import type { TenantRow } from "@/lib/store";

export type TenantOnboardingDocLink = {
  label: string;
  description: string;
  path: string;
  primary?: boolean;
};

export type TenantOnboardingDocs = {
  hotspotLabel: string;
  setupTitle: string;
  setupNote: string;
  personalizedGuidePath: string;
  links: TenantOnboardingDocLink[];
};

function normalizeHotspotType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function getTenantOnboardingDocs(params: {
  tenant: Pick<TenantRow, "slug">;
  hotspotType?: string | null;
}): TenantOnboardingDocs {
  const normalized = normalizeHotspotType(params.hotspotType);

  if (normalized.includes("omada")) {
    return {
      hotspotLabel: params.hotspotType?.trim() || "Omada",
      setupTitle: "Omada CSV voucher import setup",
      setupNote:
        "Omada Cloud/OpenAPI integration is not available for this onboarding path yet, so your portal will launch with Omada-generated vouchers imported into PaySpot by CSV.",
      personalizedGuidePath: `/t/${params.tenant.slug}/docs/csv-onboarding`,
      links: [
        {
          label: "Personalized Omada CSV onboarding",
          description: "Your PaySpot portal link, custom captive portal button, access list entries, and CSV workflow in one page.",
          path: `/t/${params.tenant.slug}/docs/csv-onboarding`,
          primary: true,
        },
        {
          label: "Create, export, and import Omada vouchers",
          description: "How to create vouchers in Omada, export CSV, and import them into the matching PaySpot plan.",
          path: "/help/csv-import",
        },
        {
          label: "Omada access list for captive checkout",
          description: "What to add to Pre-Authentication Access so PaySpot and Paystack load before customer login.",
          path: "/help/omada-access-list",
        },
        {
          label: "Custom captive portal page",
          description: "How to add a Buy Voucher button or configure External Web Portal behavior.",
          path: "/help/custom-portal",
        },
      ],
    };
  }

  if (normalized.includes("mikrotik")) {
    return {
      hotspotLabel: params.hotspotType?.trim() || "MikroTik RouterOS",
      setupTitle: "MikroTik RouterOS REST setup",
      setupNote:
        "Use this path when PaySpot should create MikroTik HotSpot users directly after successful payment.",
      personalizedGuidePath: "/help/mikrotik-rest",
      links: [
        {
          label: "MikroTik REST onboarding",
          description: "Collect RouterOS REST URL, user, password, HotSpot server, and profile values.",
          path: "/help/mikrotik-rest",
          primary: true,
        },
      ],
    };
  }

  if (normalized.includes("radius")) {
    return {
      hotspotLabel: params.hotspotType?.trim() || "RADIUS / FreeRADIUS",
      setupTitle: "RADIUS setup",
      setupNote:
        "Use RADIUS docs when an adapter or RADIUS service will enforce access, sessions, device limits, and accounting.",
      personalizedGuidePath: "/help/radius-voucher",
      links: [
        {
          label: "RADIUS voucher setup",
          description: "PaySpot issues paid voucher credentials while RADIUS enforces access.",
          path: "/help/radius-voucher",
          primary: true,
        },
        {
          label: "External RADIUS account access",
          description: "Account subscriptions and RADIUS-enforced entitlements.",
          path: "/help/external-radius",
        },
      ],
    };
  }

  return {
    hotspotLabel: params.hotspotType?.trim() || "CSV voucher pool",
    setupTitle: "CSV voucher import setup",
    setupNote:
      "Start with CSV import when the network platform is not confirmed or when you want the safest first launch.",
    personalizedGuidePath: `/t/${params.tenant.slug}/docs/csv-onboarding`,
    links: [
      {
        label: "Personalized CSV onboarding",
        description: "Your PaySpot portal link, access list entries, custom portal button, and CSV workflow in one page.",
        path: `/t/${params.tenant.slug}/docs/csv-onboarding`,
        primary: true,
      },
      {
        label: "Tenant onboarding guide list",
        description: "Choose the correct setup guide by hotspot platform.",
        path: "/help/onboarding",
      },
      {
        label: "CSV import guide",
        description: "Create vouchers first, export CSV, and import into PaySpot.",
        path: "/help/csv-import",
      },
    ],
  };
}

export function absoluteAppUrl(path: string) {
  const { APP_URL } = getAppEnv();
  return new URL(path, APP_URL).toString();
}

