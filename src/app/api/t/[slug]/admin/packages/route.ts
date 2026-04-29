import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantBySlug, isTenantPaymentConfigured, updatePackagePrice } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const user = await getSessionUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  if (user.role === "tenant") {
    if (user.tenantId !== tenant.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const needsSetup =
      user.mustChangePassword ||
      !isTenantPaymentConfigured(tenant) ||
      tenant.status !== "active";
    if (needsSetup) {
      return Response.json(
        { error: "Complete setup before editing packages" },
        { status: 409 },
      );
    }
  }

  const body = (await request.json()) as {
    packageId?: string;
    priceNgn?: number;
  };

  const packageId = body.packageId?.trim();
  const priceNgn = body.priceNgn;

  if (!packageId) {
    return Response.json({ error: "Missing packageId" }, { status: 400 });
  }
  if (typeof priceNgn !== "number" || !Number.isFinite(priceNgn)) {
    return Response.json({ error: "Invalid price" }, { status: 400 });
  }
  if (priceNgn < 0) {
    return Response.json({ error: "Price must be >= 0" }, { status: 400 });
  }

  const updated = await updatePackagePrice({
    tenantId: tenant.id,
    packageId,
    priceNgn: Math.round(priceNgn),
  });

  if (!updated) {
    return Response.json({ error: "Package not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
