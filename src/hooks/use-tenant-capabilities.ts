import { useMemo } from "react"

/**
 * Tenant configuration type matching the database schema
 */
export interface TenantArchitecture {
  accessMode: "voucher_access" | "account_access"
  voucherSourceMode: "import_csv" | "omada_openapi" | "mikrotik_rest" | "radius_voucher"
  portalAuthMode?: "omada_builtin" | "external_portal_api" | "external_radius_portal"
}

/**
 * Capability flags returned by the hook
 */
export interface TenantCapabilities {
  // Access mode flags
  isVoucherAccess: boolean
  isAccountAccess: boolean

  // Voucher source mode flags
  isCsvMode: boolean
  isOmadaMode: boolean
  isMikrotikMode: boolean
  isRadiusVoucherMode: boolean

  // Derived capability flags
  isApiAutomationMode: boolean // Omada or MikroTik - vouchers generated on-demand
  isManualVoucherMode: boolean // CSV or RADIUS - vouchers managed manually

  // Feature visibility flags
  canImportVouchers: boolean
  canManuallyCreateVouchers: boolean
  canBatchGenerate: boolean
  canReclaimVouchers: boolean
  canDeleteVouchers: boolean
  canTestConnection: boolean

  // Section visibility flags
  showVoucherPool: boolean
  showSubscribers: boolean
  showEntitlements: boolean
  showOmadaConfig: boolean
  showMikrotikConfig: boolean
  showRadiusConfig: boolean
  showPoolHealth: boolean
  showDurationField: boolean

  // Navigation tabs that should be visible
  visibleTabs: TabConfig[]

  // Empty state messages
  emptyStateMessage: string
  emptyStateDescription: string
}

export interface TabConfig {
  id: string
  label: string
  icon: string // Lucide icon name
}

/**
 * Hook to derive UI capabilities from tenant configuration
 *
 * This centralizes all the visibility logic so components don't have to
 * compute these flags individually.
 *
 * @param architecture - The tenant's architecture configuration
 * @returns Capability flags for conditional rendering
 */
export function useTenantCapabilities(
  architecture: TenantArchitecture | null | undefined
): TenantCapabilities {
  return useMemo(() => {
    // Default to safe values if no architecture provided
    if (!architecture) {
      return getDefaultCapabilities()
    }

    const { accessMode, voucherSourceMode } = architecture

    // Access mode flags
    const isVoucherAccess = accessMode === "voucher_access"
    const isAccountAccess = accessMode === "account_access"

    // Voucher source mode flags
    const isCsvMode = voucherSourceMode === "import_csv"
    const isOmadaMode = voucherSourceMode === "omada_openapi"
    const isMikrotikMode = voucherSourceMode === "mikrotik_rest"
    const isRadiusVoucherMode = voucherSourceMode === "radius_voucher"

    // Derived modes
    const isApiAutomationMode = isOmadaMode || isMikrotikMode
    const isManualVoucherMode = isCsvMode || isRadiusVoucherMode

    // Feature capabilities
    const canImportVouchers = isCsvMode
    const canManuallyCreateVouchers = isCsvMode || isRadiusVoucherMode
    const canBatchGenerate = isCsvMode || isRadiusVoucherMode
    const canReclaimVouchers = isCsvMode
    const canDeleteVouchers = isCsvMode || isRadiusVoucherMode
    const canTestConnection = isOmadaMode || isMikrotikMode

    // Section visibility
    const showVoucherPool = isVoucherAccess && isManualVoucherMode
    const showSubscribers = isAccountAccess
    const showEntitlements = isAccountAccess
    const showOmadaConfig = isOmadaMode
    const showMikrotikConfig = isMikrotikMode
    const showRadiusConfig = isRadiusVoucherMode || isAccountAccess
    const showPoolHealth = isVoucherAccess && isManualVoucherMode
    const showDurationField = !isAccountAccess && !isMikrotikMode

    // Determine visible tabs based on configuration
    const visibleTabs = getVisibleTabs({
      isVoucherAccess,
      isAccountAccess,
      isManualVoucherMode,
    })

    // Get appropriate empty state messages
    const { emptyStateMessage, emptyStateDescription } = getEmptyStateContent({
      isCsvMode,
      isOmadaMode,
      isMikrotikMode,
      isRadiusVoucherMode,
      isAccountAccess,
    })

    return {
      // Access mode flags
      isVoucherAccess,
      isAccountAccess,

      // Voucher source mode flags
      isCsvMode,
      isOmadaMode,
      isMikrotikMode,
      isRadiusVoucherMode,

      // Derived flags
      isApiAutomationMode,
      isManualVoucherMode,

      // Feature capabilities
      canImportVouchers,
      canManuallyCreateVouchers,
      canBatchGenerate,
      canReclaimVouchers,
      canDeleteVouchers,
      canTestConnection,

      // Section visibility
      showVoucherPool,
      showSubscribers,
      showEntitlements,
      showOmadaConfig,
      showMikrotikConfig,
      showRadiusConfig,
      showPoolHealth,
      showDurationField,

      // Navigation
      visibleTabs,

      // Empty states
      emptyStateMessage,
      emptyStateDescription,
    }
  }, [architecture])
}

function getDefaultCapabilities(): TenantCapabilities {
  return {
    isVoucherAccess: true,
    isAccountAccess: false,
    isCsvMode: true,
    isOmadaMode: false,
    isMikrotikMode: false,
    isRadiusVoucherMode: false,
    isApiAutomationMode: false,
    isManualVoucherMode: true,
    canImportVouchers: true,
    canManuallyCreateVouchers: true,
    canBatchGenerate: true,
    canReclaimVouchers: true,
    canDeleteVouchers: true,
    canTestConnection: false,
    showVoucherPool: true,
    showSubscribers: false,
    showEntitlements: false,
    showOmadaConfig: false,
    showMikrotikConfig: false,
    showRadiusConfig: false,
    showPoolHealth: true,
    showDurationField: true,
    visibleTabs: [
      { id: "overview", label: "Overview", icon: "LayoutDashboard" },
      { id: "plans", label: "Plans", icon: "Package" },
      { id: "vouchers", label: "Vouchers", icon: "Ticket" },
      { id: "transactions", label: "Transactions", icon: "Receipt" },
      { id: "settings", label: "Settings", icon: "Settings" },
    ],
    emptyStateMessage: "No vouchers available",
    emptyStateDescription: "Import vouchers from your Omada CSV export to get started.",
  }
}

function getVisibleTabs({
  isVoucherAccess,
  isAccountAccess,
  isManualVoucherMode,
}: {
  isVoucherAccess: boolean
  isAccountAccess: boolean
  isManualVoucherMode: boolean
}): TabConfig[] {
  const tabs: TabConfig[] = [
    { id: "overview", label: "Overview", icon: "LayoutDashboard" },
    { id: "plans", label: "Plans", icon: "Package" },
  ]

  if (isVoucherAccess && isManualVoucherMode) {
    tabs.push({ id: "vouchers", label: "Vouchers", icon: "Ticket" })
  }

  if (isAccountAccess) {
    tabs.push({ id: "subscribers", label: "Subscribers", icon: "Users" })
    tabs.push({ id: "entitlements", label: "Entitlements", icon: "Key" })
  }

  tabs.push({ id: "transactions", label: "Transactions", icon: "Receipt" })
  tabs.push({ id: "settings", label: "Settings", icon: "Settings" })

  return tabs
}

function getEmptyStateContent({
  isCsvMode,
  isOmadaMode,
  isMikrotikMode,
  isRadiusVoucherMode,
  isAccountAccess,
}: {
  isCsvMode: boolean
  isOmadaMode: boolean
  isMikrotikMode: boolean
  isRadiusVoucherMode: boolean
  isAccountAccess: boolean
}): { emptyStateMessage: string; emptyStateDescription: string } {
  if (isAccountAccess) {
    return {
      emptyStateMessage: "No subscribers yet",
      emptyStateDescription: "Subscribers will appear here after they complete their first purchase.",
    }
  }

  if (isCsvMode) {
    return {
      emptyStateMessage: "No vouchers in pool",
      emptyStateDescription: "Import vouchers from your Omada CSV export to get started.",
    }
  }

  if (isOmadaMode) {
    return {
      emptyStateMessage: "Vouchers generated automatically",
      emptyStateDescription: "Vouchers are created on-demand via the Omada API when customers complete purchases.",
    }
  }

  if (isMikrotikMode) {
    return {
      emptyStateMessage: "Users provisioned automatically",
      emptyStateDescription: "HotSpot users are created on-demand via MikroTik when customers complete purchases.",
    }
  }

  if (isRadiusVoucherMode) {
    return {
      emptyStateMessage: "No vouchers in pool",
      emptyStateDescription: "Generate or manually create RADIUS vouchers to get started.",
    }
  }

  return {
    emptyStateMessage: "No data available",
    emptyStateDescription: "Check your configuration settings.",
  }
}

/**
 * Helper to check if a specific tab should be visible
 */
export function isTabVisible(
  tabId: string,
  capabilities: TenantCapabilities
): boolean {
  return capabilities.visibleTabs.some((tab) => tab.id === tabId)
}

/**
 * Helper to get the first available tab (for default navigation)
 */
export function getDefaultTab(capabilities: TenantCapabilities): string {
  return capabilities.visibleTabs[0]?.id ?? "overview"
}
