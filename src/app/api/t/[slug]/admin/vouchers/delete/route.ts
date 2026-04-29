import { parse } from "csv-parse/sync";
import { getDb } from "@/lib/db";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantBySlug, isTenantPaymentConfigured } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

function normalizeCode(value: string) {
  return value.trim();
}

function collectCodesFromRows(rows: Array<Record<string, unknown>>) {
  const codes: string[] = [];
  for (const row of rows) {
    const entries = Object.entries(row).reduce<Record<string, unknown>>(
      (acc, [key, value]) => {
        const normalizedKey = key.toLowerCase().replace(/\s+/g, "");
        acc[normalizedKey] = typeof value === "string" ? value.trim() : value;
        return acc;
      },
      {},
    );

    const code =
      (entries.code as string | undefined) ||
      (entries.vouchercode as string | undefined) ||
      (entries.csvcode as string | undefined) ||
      null;
    if (code) codes.push(code);
  }
  return codes;
}

function extractCodesFromCsv(csvText: string) {
  if (!csvText.trim()) return [];
  let codes: string[] = [];
  try {
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
    }) as Array<Record<string, unknown>>;
    codes = collectCodesFromRows(rows);
  } catch {
    codes = [];
  }

  if (codes.length > 0) return codes;

  const rawRows = parse(csvText, {
    columns: false,
    skip_empty_lines: true,
  }) as Array<string[]>;
  return rawRows
    .map((row) => row[0])
    .filter((value) => typeof value === "string" && value.trim().length > 0);
}

function extractCodesFromText(value: string | null) {
  if (!value) return [];
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeStatus(value: string | null) {
  if (!value) return "ALL";
  const upper = value.toUpperCase();
  if (upper === "UNUSED" || upper === "ASSIGNED") return upper;
  return "ALL";
}

function buildStatusClause(status: string) {
  if (status === "UNUSED") return { clause: "AND status = 'UNUSED'", args: [] };
  if (status === "ASSIGNED") return { clause: "AND status = 'ASSIGNED'", args: [] };
  return { clause: "", args: [] };
}

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
        { error: "Complete setup before deleting vouchers" },
        { status: 409 },
      );
    }
  }

  const form = await request.formData();
  const mode = String(form.get("mode") ?? "").toLowerCase();
  const packageId = (form.get("packageId") as string | null) ?? null;
  const status = normalizeStatus((form.get("status") as string | null) ?? null);
  const codesText = (form.get("codes") as string | null) ?? null;
  const file = form.get("file");

  const db = getDb();
  const { clause: statusClause } = buildStatusClause(status);

  if (mode === "plan") {
    if (!packageId) {
      return Response.json({ error: "Missing package" }, { status: 400 });
    }
    const result = await db
      .prepare(
        `
        DELETE FROM voucher_pool
        WHERE tenant_id = ? AND package_id = ?
        ${statusClause}
      `,
      )
      .run(tenant.id, packageId);
    return Response.json({ deleted: result.changes });
  }

  if (mode === "status") {
    const result = await db
      .prepare(
        `
        DELETE FROM voucher_pool
        WHERE tenant_id = ?
        ${statusClause}
      `,
      )
      .run(tenant.id);
    return Response.json({ deleted: result.changes });
  }

  if (mode === "codes") {
    const codes = new Set<string>();
    for (const code of extractCodesFromText(codesText)) {
      codes.add(normalizeCode(code));
    }

    if (file && typeof file !== "string") {
      const csvText = await file.text();
      for (const code of extractCodesFromCsv(csvText)) {
        codes.add(normalizeCode(code));
      }
    }

    const deduped = [...codes].filter(Boolean);
    if (deduped.length === 0) {
      return Response.json({ error: "No codes provided" }, { status: 400 });
    }

    const deleteStatementBase = `
      DELETE FROM voucher_pool
      WHERE tenant_id = ?
        ${statusClause}
        AND voucher_code IN (`;
    const deleteStatementSuffix = ")";

    const chunkSize = 200;
    let deleted = 0;
    const run = db.transaction(async () => {
      for (let i = 0; i < deduped.length; i += chunkSize) {
        const chunk = deduped.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => "?").join(", ");
        const stmt = db.prepare(
          `${deleteStatementBase}${placeholders}${deleteStatementSuffix}`,
        );
        const result = await stmt.run(tenant.id, ...chunk);
        deleted += result.changes;
      }
    });
    await run();

    return Response.json({ deleted });
  }

  return Response.json({ error: "Invalid delete mode" }, { status: 400 });
}
