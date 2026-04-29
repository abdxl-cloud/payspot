import { getSessionUserFromRequest } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cancelPendingTransaction } from "@/lib/store";

type Props = {
  params: Promise<{ reference: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const user = await getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { reference } = await params;
  const decodedReference = decodeURIComponent(reference);
  const db = getDb();
  const row = await db
    .prepare("SELECT tenant_id FROM transactions WHERE reference = ? LIMIT 1")
    .get(decodedReference) as { tenant_id: string } | undefined;

  if (!row) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  const changes = await cancelPendingTransaction({
    tenantId: row.tenant_id,
    reference: decodedReference,
  });

  if (changes === 0) {
    return Response.json(
      { error: "Only pending or processing transactions can be cancelled" },
      { status: 409 },
    );
  }

  return Response.json({ status: "ok" });
}
