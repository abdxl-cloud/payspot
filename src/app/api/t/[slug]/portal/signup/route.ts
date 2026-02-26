import { z } from "zod";
import {
  createPortalSubscriber,
  createPortalSubscriberSession,
  getTenantBySlug,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  phone: z.string().min(7).optional(),
  fullName: z.string().min(2).optional(),
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

  const created = await createPortalSubscriber({
    tenantId: tenant.id,
    email: parsed.data.email,
    password: parsed.data.password,
    phone: parsed.data.phone,
    fullName: parsed.data.fullName,
  });
  if (created.status === "exists") {
    return Response.json({ error: "Account already exists" }, { status: 409 });
  }

  const token = await createPortalSubscriberSession({
    subscriberId: created.subscriber.id,
  });

  return Response.json({
    ok: true,
    token,
    subscriber: {
      id: created.subscriber.id,
      email: created.subscriber.email,
      phone: created.subscriber.phone,
      fullName: created.subscriber.full_name,
    },
  });
}
