import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { getPlatformPaystackSettings, setPlatformPaystackKeys } from "@/lib/store";

const schema = z.object({
  secretKey: z.string().max(200).optional(),
  publicKey: z.string().max(200).optional(),
});

async function requireAdmin(request: Request) {
  const user = await getSessionUserFromRequest(request);
  return user?.role === "admin";
}

export async function GET(request: Request) {
  if (!await requireAdmin(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ settings: await getPlatformPaystackSettings() });
}

export async function PATCH(request: Request) {
  if (!await requireAdmin(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await setPlatformPaystackKeys({
    secretKey: parsed.data.secretKey?.trim() || undefined,
    publicKey: parsed.data.publicKey?.trim() || undefined,
  });
  if (result.status === "invalid_secret_key") {
    return Response.json({ error: "Use a valid live Paystack secret key (sk_live_...)." }, { status: 400 });
  }
  if (result.status === "invalid_public_key") {
    return Response.json({ error: "Use a valid live Paystack public key (pk_live_...)." }, { status: 400 });
  }

  return Response.json({ ok: true, settings: result.settings });
}
