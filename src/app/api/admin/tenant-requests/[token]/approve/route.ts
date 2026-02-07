import { getAppEnv } from "@/lib/env";
import { sendMail } from "@/lib/mailer";
import { generateToken } from "@/lib/tokens";
import {
  approveTenantRequest,
  getTenantById,
  getTenantPrimaryUser,
  setUserMustChangePassword,
  updateUserPassword,
} from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  const result = approveTenantRequest(token);

  if (result.status === "missing") {
    return new Response("Invalid request token.", { status: 404 });
  }

  if (result.status === "slug_taken") {
    return new Response(
      "Cannot approve: slug is already taken. Request was denied.",
      { status: 409 },
    );
  }

  if (result.status === "user_conflict") {
    return new Response(
      "Cannot approve: a user with that email/slug already exists. Request was denied.",
      { status: 409 },
    );
  }

  if (result.status === "already_reviewed") {
    const tenantId = result.request?.tenant_id;
    if (!tenantId) {
      return new Response("Request already reviewed.", { status: 409 });
    }

    const tenant = getTenantById(tenantId);
    if (!tenant) {
      return new Response("Request already reviewed.", { status: 409 });
    }

    const { APP_URL } = getAppEnv();
    const loginUrl = new URL("/login", APP_URL).toString();

    const tenantUser = getTenantPrimaryUser(tenant.id);
    if (!tenantUser) {
      return new Response("Tenant user missing.", { status: 500 });
    }

    const temporaryPassword = `Temp-${generateToken(9)}`;
    updateUserPassword({ userId: tenantUser.id, password: temporaryPassword });
    setUserMustChangePassword({
      userId: tenantUser.id,
      mustChangePassword: true,
    });

    await sendMail({
      to: tenant.admin_email,
      subject: `Login details (re-sent): ${tenant.name}`,
      text: [
        "Your tenant login details have been re-sent.",
        "",
        `Email: ${tenantUser.email}`,
        `Temporary password: ${temporaryPassword}`,
        "",
        "Sign in here:",
        loginUrl,
        "",
        "On first login, you must set your password and Paystack key before using the portal.",
      ].join("\n"),
    });

    return new Response("Already approved. Login details re-sent.", { status: 200 });
  }

  if (result.status !== "approved") {
    return new Response("Unable to approve request.", { status: 500 });
  }

  const { APP_URL } = getAppEnv();
  const loginUrl = new URL("/login", APP_URL).toString();

  const subject = `Your tenant portal is approved: ${result.tenant.name}`;
  const text = [
    "Your tenant portal has been approved.",
    "",
    `Tenant: ${result.tenant.name}`,
    `Slug: ${result.tenant.slug}`,
    `Purchase link: ${new URL(`/t/${result.tenant.slug}`, APP_URL).toString()}`,
    "",
    "Login details:",
    `Email: ${result.email}`,
    `Temporary password: ${result.temporaryPassword}`,
    "",
    "Sign in here:",
    loginUrl,
    "",
    "On first login, you must set your password and Paystack key before using the portal.",
  ].join("\n");

  await sendMail({
    to: result.tenant.admin_email,
    subject,
    text,
  });

  return new Response("Approved. Login details sent.", { status: 200 });
}
