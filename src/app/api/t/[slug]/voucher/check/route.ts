import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  getPackageById,
  getTenantBySlug,
  getTransactionByVoucherCode,
  getVoucherPoolEntryByCode,
  normalizeVoucherSourceMode,
  resolveTenantOmadaConfigIfPresent,
} from "@/lib/store";
import { lookupOmadaVoucherStatus } from "@/lib/omada";

type Props = {
  params: Promise<{ slug: string }>;
};

const codeSchema = z.string().trim().min(1).max(64);

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
  const voucherSourceMode = normalizeVoucherSourceMode(tenant.voucher_source_mode);
  const shouldCheckPool = voucherSourceMode === "import_csv";

  // Primary source of truth: our own database
  const [transaction, poolEntry] = await Promise.all([
    getTransactionByVoucherCode(tenant.id, code, voucherSourceMode),
    shouldCheckPool ? getVoucherPoolEntryByCode(tenant.id, code) : Promise.resolve(null),
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

  // Live status from Omada controller (Open API v1).
  // Works on controllers that expose hotspot voucher lookup endpoints.
  // null  = Omada not configured for this tenant (section hidden in UI)
  // error = Omada is configured but the lookup failed (shown as an error in UI)
  type OmadaStatusPayload =
    | null
    | { error: true; message: string }
    | { found: false; unavailable?: boolean }
    | { found: true; status: string; usedAt: string | null; expireAt: string | null; durationMinutes: number | null };

  let omadaStatus: OmadaStatusPayload = null;

  const omadaConfig = await resolveTenantOmadaConfigIfPresent(tenant.id);
  if (omadaConfig) {
    try {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error during Omada lookup";
      console.error("[voucher/check] Omada lookup failed", { slug, code, error: message });
      omadaStatus = { error: true, message };
    }
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
