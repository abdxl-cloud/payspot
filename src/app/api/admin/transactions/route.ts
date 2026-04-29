import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";

function parsePositiveInt(value: string | null, fallback: number) {
  const num = Number.parseInt(value ?? "", 10);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export async function GET(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const status = (url.searchParams.get("status") ?? "all").trim().toLowerCase();
  const tenantId = url.searchParams.get("tenantId")?.trim() ?? "";
  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const pageSize = Math.min(parsePositiveInt(url.searchParams.get("pageSize"), 25), 100);
  const offset = (page - 1) * pageSize;

  const where: string[] = ["1 = 1"];
  const args: Array<string | number> = [];

  if (tenantId) {
    where.push("tx.tenant_id = ?");
    args.push(tenantId);
  }

  if (status === "success" || status === "paid") {
    where.push("tx.payment_status = 'success'");
  } else if (status === "pending") {
    where.push("tx.payment_status IN ('pending', 'processing')");
  } else if (status === "failed") {
    where.push("tx.payment_status NOT IN ('pending', 'processing', 'success')");
  } else if (status && status !== "all") {
    where.push("LOWER(tx.payment_status) = ?");
    args.push(status);
  }

  if (q) {
    const token = `%${q}%`;
    where.push(
      `(
        tx.reference LIKE ?
        OR tx.email LIKE ?
        OR tx.phone LIKE ?
        OR COALESCE(tx.voucher_code, '') LIKE ?
        OR COALESCE(t.slug, '') LIKE ?
        OR COALESCE(t.name, '') LIKE ?
        OR COALESCE(p.code, '') LIKE ?
        OR COALESCE(p.name, '') LIKE ?
      )`,
    );
    args.push(token, token, token, token, token, token, token, token);
  }

  const whereSql = where.join(" AND ");
  const db = getDb();

  const totals = await db
    .prepare(
      `
      SELECT COUNT(1) as total
      FROM transactions tx
      LEFT JOIN tenants t ON t.id = tx.tenant_id
      LEFT JOIN voucher_packages p
        ON p.tenant_id = tx.tenant_id AND p.id = tx.package_id
      WHERE ${whereSql}
    `,
    )
    .get(...args) as { total: number };

  const transactions = await db
    .prepare(
      `
      SELECT
        tx.id,
        tx.tenant_id as "tenantId",
        t.slug as "tenantSlug",
        t.name as "tenantName",
        tx.reference,
        tx.email,
        tx.phone,
        tx.amount_ngn as "amountNgn",
        tx.voucher_code as "voucherCode",
        tx.voucher_source_mode as "voucherSourceMode",
        tx.package_id as "packageId",
        tx.delivery_mode as "deliveryMode",
        tx.payment_status as "paymentStatus",
        tx.created_at as "createdAt",
        tx.expires_at as "expiresAt",
        tx.paid_at as "paidAt",
        p.code as "packageCode",
        p.name as "packageName"
      FROM transactions tx
      LEFT JOIN tenants t ON t.id = tx.tenant_id
      LEFT JOIN voucher_packages p
        ON p.tenant_id = tx.tenant_id AND p.id = tx.package_id
      WHERE ${whereSql}
      ORDER BY tx.created_at DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...args, pageSize, offset);

  return Response.json({
    transactions,
    pagination: {
      page,
      pageSize,
      total: totals.total ?? 0,
      totalPages: Math.max(1, Math.ceil((totals.total ?? 0) / pageSize)),
    },
  });
}
