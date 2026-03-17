import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  getTenantBySlug,
  getTransactionByReferenceEmail,
  getTransactionByReferencePhone,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  reference: z.string().min(6),
  phone: z.string().min(7).optional(),
  email: z.string().email().optional(),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`status:${tenant.slug}:${ip}`, 12, 60_000);
  if (!limiter.allowed) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const { reference, phone, email } = parsed.data;
  const accountAccessMode = tenant.portal_auth_mode === "external_radius_portal";
  if (accountAccessMode && !email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }
  if (!accountAccessMode && !email && !phone) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const transaction = accountAccessMode
    ? await getTransactionByReferenceEmail(tenant.id, reference, email ?? "")
    : email
      ? await getTransactionByReferencePhone(tenant.id, reference, email)
      : await getTransactionByReferencePhone(tenant.id, reference, phone ?? "");

  if (!transaction) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (transaction.payment_status === "success") {
    return Response.json({
      status: "success",
      reference,
      mode: transaction.delivery_mode,
    });
  }

  return Response.json({
    status: transaction.payment_status,
    reference,
  });
}
