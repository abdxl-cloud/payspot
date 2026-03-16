import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  getPackageById,
  getTenantBySlug,
  getTransactionByVoucherCode,
  getVoucherPoolEntryByCode,
  resolveTenantOmadaConfigIfPresent,
} from "@/lib/store";
import { lookupOmadaVoucherStatus } from "@/lib/omada";

type Props = {
  params: Promise<{ slug: string }>;
};

const codeSchema = z.string().min(1).max(64).transform((v) => v.trim());

export async function GET(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`voucher-check:${tenant.slug}:${ip}`, 10, 60_000);
  if (!limiter.allowed) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  const rawCode = new URL(request.url).searchParams.get("code");
  const parsed = codeSchema.safeParse(rawCode);
  if (!parsed.success) {
    return Response.json({ error: "A voucher code is required" }, { status: 400 });
  }
  const code = parsed.data;

  // Primary source of truth: our own database
  const [transaction, poolEntry] = await Promise.all([
    getTransactionByVoucherCode(tenant.id, code),
    getVoucherPoolEntryByCode(tenant.id, code),
  ]);

  if (!transaction && !poolEntry) {
    return Response.json({ found: false });
  }

  const packageId = transaction?.package_id ?? poolEntry?.package_id;
  const pkg = packageId ? await getPackageById(tenant.id, packageId) : null;

  // Compute estimated expiry from purchase time + package duration
  let estimatedExpiresAt: string | null = null;
  if (transaction?.paid_at && pkg?.duration_minutes && pkg.duration_minutes > 0) {
    const paidMs = new Date(transaction.paid_at).getTime();
    if (!isNaN(paidMs)) {
      estimatedExpiresAt = new Date(
        paidMs + pkg.duration_minutes * 60 * 1000,
      ).toISOString();
    }
  }

  // Derive pool status: ASSIGNED (sold & issued) or UNUSED (in pool, not yet sold)
  const poolStatus: "UNUSED" | "ASSIGNED" | null =
    poolEntry?.status === "UNUSED"
      ? "UNUSED"
      : poolEntry?.status === "ASSIGNED" || transaction
      ? "ASSIGNED"
      : null;

  // Best-effort live status from Omada controller (Open API v1)
  // Works on all controller types at v5.15+ (Cloud, OC200, OC300, Software).
  // Falls back gracefully if the controller is unreachable or on an older version.
  let omadaStatus: {
    found: boolean;
    unavailable?: boolean;
    status?: string;
    usedAt?: string | null;
    expireAt?: string | null;
    durationMinutes?: number | null;
  } | null = null;

  try {
    const omadaConfig = await resolveTenantOmadaConfigIfPresent(tenant.id);
    if (omadaConfig) {
      const result = await lookupOmadaVoucherStatus(omadaConfig, code);
      if (!result.found) {
        omadaStatus = { found: false, unavailable: result.unavailable };
      } else {
        omadaStatus = {
          found: true,
          status: result.status,
          usedAt: result.usedAt,
          expireAt: result.expireAt,
          durationMinutes: result.durationMinutes,
        };
      }
    }
  } catch {
    // Omada lookup is best-effort — never fail the response because of it
  }

  return Response.json({
    found: true,
    code: code.toUpperCase(),
    package: pkg
      ? {
          name: pkg.name,
          durationMinutes: pkg.duration_minutes,
          priceNgn: pkg.price_ngn,
        }
      : null,
    purchasedAt: transaction?.paid_at ?? poolEntry?.assigned_at ?? null,
    estimatedExpiresAt,
    poolStatus,
    omadaStatus,
  });
}
