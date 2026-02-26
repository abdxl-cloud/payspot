import { z } from "zod";
import {
  authenticatePortalSubscriber,
  createPortalSubscriberSession,
  getTenantBySlug,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const subscriber = await authenticatePortalSubscriber({
    tenantId: tenant.id,
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!subscriber) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createPortalSubscriberSession({
    subscriberId: subscriber.id,
  });

  return Response.json({
    ok: true,
    token,
    subscriber: {
      id: subscriber.id,
      email: subscriber.email,
      phone: subscriber.phone,
      fullName: subscriber.full_name,
    },
  });
}
