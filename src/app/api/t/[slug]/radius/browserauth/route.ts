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

  // Build the form fields the Omada controller expects.
  // The POST must come from the client's browser (not our server) so that:
  //   1. The Omada controller can match the request to the client's Wi-Fi session by MAC/IP.
  //   2. The controller is typically on the client's local network and is not reachable
  //      from this cloud server.
  // We return the URL + fields to the client and let it submit the form directly.
  const formFields: Record<string, string> = {
    authType: "2",
    username,
    password,
  };
  if (contextFields.clientMac) formFields.clientMac = contextFields.clientMac;
  if (contextFields.clientIp) {
    formFields.clientIp = contextFields.clientIp;
    formFields.clientIP = contextFields.clientIp;
  }
  if (contextFields.apMac) formFields.apMac = contextFields.apMac;
  if (contextFields.gatewayMac) formFields.gatewayMac = contextFields.gatewayMac;
  if (contextFields.ssidName) formFields.ssidName = contextFields.ssidName;
  if (contextFields.radioId) formFields.radioId = contextFields.radioId;
  if (contextFields.vid) formFields.vid = contextFields.vid;
  if (contextFields.originUrl) formFields.originUrl = contextFields.originUrl;

  return Response.json({ controllerUrl, formFields });
}
