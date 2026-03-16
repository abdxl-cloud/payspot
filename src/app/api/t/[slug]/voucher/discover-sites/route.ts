import { z } from "zod";
import { getTenantBySlug } from "@/lib/store";
import { listOmadaSites } from "@/lib/omada";

type Props = { params: Promise<{ slug: string }> };

const schema = z.object({
  apiBaseUrl: z.string().min(1).max(300),
  omadacId: z.string().min(1).max(200),
  clientId: z.string().min(1).max(200),
  clientSecret: z.string().min(1).max(500),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Missing required fields", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const sites = await listOmadaSites(parsed.data);
    return Response.json({ ok: true, omadacId: parsed.data.omadacId, sites });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to discover Omada sites";
    return Response.json({ error: message }, { status: 502 });
  }
}
