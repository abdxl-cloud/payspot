import { z } from "zod";
import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";
import { createPasswordResetToken, getUserByEmail } from "@/lib/store";

const schema = z.object({
  email: z.string().email().max(200),
});

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const limiter = rateLimit(`forgot_password:${ip}`, 10, 60 * 60_000);
  if (!limiter.allowed) {
    return Response.json({ error: "Too many attempts" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = getUserByEmail(email);

  if (user) {
    const { token } = createPasswordResetToken({ userId: user.id, ttlMinutes: 60 });
    const { APP_URL } = getAppEnv();
    const resetUrl = new URL(`/reset-password/${token}`, APP_URL).toString();

    const subject = "Reset your Vince Stack password";
    const text = [
      "We received a password reset request for your account.",
      "",
      "Reset link (valid for 60 minutes):",
      resetUrl,
      "",
      "If you didn't request this, you can ignore this email.",
    ].join("\n");

    try {
      await sendMail({ to: user.email, subject, text });
    } catch (error) {
      console.error("Password reset email failed", error);
    }
  }

  // Always return ok to avoid leaking whether an email exists.
  return Response.json({ status: "ok" });
}

