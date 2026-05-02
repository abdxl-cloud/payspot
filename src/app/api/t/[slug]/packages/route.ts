import { getPackagesWithAvailability, resolveStorefrontContextBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const storefront = await resolveStorefrontContextBySlug(slug);
  if (!storefront || storefront.tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }
  const { tenant, location, accessMode, voucherSourceMode } = storefront;

  const autoProvisionVoucherMode =
    voucherSourceMode === "omada_openapi" ||
    voucherSourceMode === "mikrotik_rest" ||
    voucherSourceMode === "radius_voucher";
  const packages = (await getPackagesWithAvailability(tenant.id, location?.id ?? null))
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
