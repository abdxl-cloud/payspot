import { getSessionUserFromRequest } from "@/lib/auth";
import { cancelPendingTransaction, getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string; reference: string }>;
};

async function normalizeTenantAccess(request: Request, tenantId: string) {
  const user = await getSessionUserFromRequest(request);
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (user.role === "tenant" && user.tenantId !== tenantId) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

export async function POST(request: Request, { params }: Props) {
  const { slug, reference } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });

  const access = await normalizeTenantAccess(request, tenant.id);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const changes = await cancelPendingTransaction({
    tenantId: tenant.id,
    reference: decodeURIComponent(reference),
  });

  if (changes === 0) {
    return Response.json(
      { error: "Only pending or processing transactions can be cancelled" },
      { status: 409 },
    );
  }

  return Response.json({ status: "ok" });
}
