import { getAppEnv } from "@/lib/env";
import { getSessionUserFromRequest } from "@/lib/auth";
import { sendMail } from "@/lib/mailer";
import { generateToken } from "@/lib/tokens";
import {
  getTenantById,
  getTenantPrimaryUser,
  setUserMustChangePassword,
  updateUserPassword,
} from "@/lib/store";

type Props = {
  params: Promise<{ tenantId: string }>;
};

export async function POST(request: Request, { params }: Props) {
  const user = getSessionUserFromRequest(request);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = await params;
  const tenant = getTenantById(tenantId);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  const tenantUser = getTenantPrimaryUser(tenantId);
  if (!tenantUser) {
    return Response.json({ error: "Tenant user not found" }, { status: 404 });
  }

  const temporaryPassword = `Temp-${generateToken(9)}`;
  updateUserPassword({ userId: tenantUser.id, password: temporaryPassword });
  setUserMustChangePassword({ userId: tenantUser.id, mustChangePassword: true });

  const { APP_URL } = getAppEnv();
  const loginUrl = new URL("/login", APP_URL).toString();
  const subject = `Password reset: ${tenant.name}`;
  const text = [
    "Your tenant portal password has been reset.",
    "",
    "Login details:",
    `Email: ${tenantUser.email}`,
    `Temporary password: ${temporaryPassword}`,
    "",
    "Sign in here:",
    loginUrl,
    "",
    "You will be asked to set a new password after login.",
  ].join("\n");

  let mailSent = true;
  try {
    await sendMail({ to: tenant.admin_email, subject, text });
  } catch (error) {
    mailSent = false;
    console.error("Tenant reset password email failed", error);
  }

  return Response.json({
    status: "ok",
    temporaryPassword,
    mailSent,
  });
}
