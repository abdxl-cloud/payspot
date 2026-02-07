import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getTenantBySlug, getTransactionByReferenceEmail } from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  reference: z.string().min(6),
  email: z.string().email(),
});

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
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

  const { reference, email } = parsed.data;
  const transaction = getTransactionByReferenceEmail(tenant.id, reference, email);

  if (!transaction) {
    return Response.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (transaction.payment_status === "success" && transaction.voucher_code) {
    return Response.json({
      status: "success",
      reference,
    });
  }

  return Response.json({
    status: transaction.payment_status,
    reference,
  });
}
