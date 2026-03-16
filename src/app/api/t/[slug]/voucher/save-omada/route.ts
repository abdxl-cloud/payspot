import { z } from "zod";
import { getTenantBySlug, setTenantArchitecture } from "@/lib/store";

type Props = { params: Promise<{ slug: string }> };

const schema = z.object({
  apiBaseUrl: z.string().min(1).max(300),
  omadacId: z.string().min(1).max(200),
  siteId: z.string().min(1).max(200),
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

  const result = await setTenantArchitecture({
    tenantId: tenant.id,
    omada: {
      apiBaseUrl: parsed.data.apiBaseUrl,
      omadacId: parsed.data.omadacId,
      siteId: parsed.data.siteId,
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
    },
  });

  if (result.status !== "ok") {
    return Response.json({ error: `Save failed: ${result.status}` }, { status: 400 });
  }

  return Response.json({ ok: true });
}
