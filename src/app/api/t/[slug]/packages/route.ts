import { getPackagesWithAvailability, getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const packages = getPackagesWithAvailability(tenant.id).map((pkg) => ({
    code: pkg.code,
    name: pkg.name,
    durationMinutes: pkg.duration_minutes,
    priceNgn: pkg.price_ngn,
    description: pkg.description,
    availableCount: pkg.available_count,
  }));

  return Response.json({ packages });
}
