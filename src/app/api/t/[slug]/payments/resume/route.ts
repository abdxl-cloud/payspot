import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { getTenantBySlug, getTransactionByReferenceEmail } from "@/lib/store";
import { getResumeTtlMs } from "@/lib/payments";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  reference: z.string().min(6),
  email: z.string().email(),
});

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export async function POST(request: Request, { params }: Props) {
  const { slug } = await params;
  const tenant = getTenantBySlug(slug);
  if (!tenant || tenant.status !== "active") {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`resume:${tenant.slug}:${ip}`, 8, 60_000);
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

  if (transaction.payment_status !== "pending") {
    return Response.json(
      { error: "Transaction cannot be resumed" },
      { status: 409 },
    );
  }

  const ttlMs = getResumeTtlMs();
  const derivedExpiresAt =
    transaction.expires_at ??
    new Date(new Date(transaction.created_at).getTime() + ttlMs).toISOString();

  if (isExpired(derivedExpiresAt)) {
    return Response.json({ error: "Transaction expired" }, { status: 410 });
  }

  if (!transaction.authorization_url) {
    return Response.json(
      { error: "Missing payment authorization" },
      { status: 409 },
    );
  }

  return Response.json({
    status: "pending",
    authorizationUrl: transaction.authorization_url,
    ttlMs,
  });
}
