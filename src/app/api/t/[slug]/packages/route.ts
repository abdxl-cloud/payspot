import { getPackagesWithAvailability, getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const accessMode = tenant.portal_auth_mode === "external_radius_portal"
    ? "account_access"
    : "voucher_access";
  const autoProvisionVoucherMode =
    tenant.voucher_source_mode === "omada_openapi" ||
    tenant.voucher_source_mode === "mikrotik_rest";
  const packages = (await getPackagesWithAvailability(tenant.id))
    .filter((pkg) =>
      accessMode === "account_access"
        ? pkg.price_ngn > 0
        : autoProvisionVoucherMode
        ? pkg.price_ngn > 0
        : pkg.price_ngn > 0 && pkg.total_count > 0,
    )
    .map((pkg) => ({
      code: pkg.code,
      name: pkg.name,
      durationMinutes: pkg.duration_minutes,
      priceNgn: pkg.price_ngn,
      maxDevices: pkg.max_devices,
      bandwidthProfile: pkg.bandwidth_profile,
      dataLimitMb: pkg.data_limit_mb,
      description: pkg.description,
      availableCount:
        accessMode === "account_access"
          ? 999999
          : autoProvisionVoucherMode
          ? Math.max(1, pkg.available_count)
          : pkg.available_count,
    }));

  return Response.json({
    packages,
    accessMode,
  });
}
