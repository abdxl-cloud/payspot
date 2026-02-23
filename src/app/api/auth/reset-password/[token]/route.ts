import { z } from "zod";
import { consumePasswordResetToken, getUserById, revokeAllSessionsForUser, setUserMustChangePassword, updateUserPassword } from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

const schema = z.object({
  newPassword: z.string().min(8).max(200),
});

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export async function POST(request: Request, { params }: Props) {
  const { token } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const message = validatePassword(parsed.data.newPassword);
  if (message) {
    return Response.json({ error: message }, { status: 400 });
  }

  const consumed = await consumePasswordResetToken(token);
  if (consumed.status !== "ok") {
    return Response.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const user = await getUserById(consumed.userId);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  await updateUserPassword({ userId: user.id, password: parsed.data.newPassword });
  await setUserMustChangePassword({ userId: user.id, mustChangePassword: false });
  await revokeAllSessionsForUser(user.id);

  return Response.json({ status: "ok" });
}

