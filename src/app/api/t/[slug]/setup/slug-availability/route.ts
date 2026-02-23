import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getTenantBySlug, isTenantSlugAvailable } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export async function GET(request: Request, { params }: Props) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (sessionUser.role !== "tenant" || sessionUser.tenantId !== tenant.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const candidateRaw = url.searchParams.get("slug");
  const parsed = schema.safeParse({ slug: candidateRaw ?? "" });
  if (!parsed.success) {
    return Response.json({ available: false, reason: "invalid" }, { status: 200 });
  }

  const candidate = parsed.data.slug.toLowerCase();
  const available = candidate === tenant.slug || await isTenantSlugAvailable(candidate);
  return Response.json({ available, normalizedSlug: candidate });
}
