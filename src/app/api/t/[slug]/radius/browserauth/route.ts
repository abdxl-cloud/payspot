import { z } from "zod";
import { getTenantBySlug } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  target: z.string().min(1),
  targetPort: z.string().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  clientMac: z.string().optional(),
  clientIp: z.string().optional(),
  apMac: z.string().optional(),
  gatewayMac: z.string().optional(),
  ssidName: z.string().optional(),
  radioId: z.string().optional(),
  vid: z.string().optional(),
  originUrl: z.string().optional(),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (tenant.portal_auth_mode !== "external_radius_portal") {
    return Response.json({ error: "Not supported" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { target, targetPort, username, password, ...contextFields } = parsed.data;

  // Strip any protocol prefix — always use HTTP to avoid cert errors with private LAN IPs
  const host = target.replace(/^https?:\/\//i, "").trim();
  const port = targetPort?.trim();
  const controllerUrl = `http://${host}${port ? `:${port}` : ""}/portal/radius/browserauth`;

  const formData = new URLSearchParams();
  formData.set("authType", "2");
  formData.set("username", username);
  formData.set("password", password);
  if (contextFields.clientMac) formData.set("clientMac", contextFields.clientMac);
  if (contextFields.clientIp) {
    formData.set("clientIp", contextFields.clientIp);
    formData.set("clientIP", contextFields.clientIp);
  }
  if (contextFields.apMac) formData.set("apMac", contextFields.apMac);
  if (contextFields.gatewayMac) formData.set("gatewayMac", contextFields.gatewayMac);
  if (contextFields.ssidName) formData.set("ssidName", contextFields.ssidName);
  if (contextFields.radioId) formData.set("radioId", contextFields.radioId);
  if (contextFields.vid) formData.set("vid", contextFields.vid);
  if (contextFields.originUrl) formData.set("originUrl", contextFields.originUrl);

  let response: Response;
  try {
    response = await fetch(controllerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      redirect: "manual",
    });
  } catch (err) {
    console.error("[radius/browserauth] Failed to reach controller:", err);
    return Response.json({ error: "Could not reach controller" }, { status: 502 });
  }

  const redirectUrl = response.headers.get("location");
  if (!redirectUrl) {
    return Response.json({ error: "No redirect from controller" }, { status: 502 });
  }

  return Response.json({ redirectUrl });
}
