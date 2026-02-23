import { sendMail } from "@/lib/mailer";
import { denyTenantRequest } from "@/lib/store";

type Props = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, { params }: Props) {
  const { token } = await params;
  const result = await denyTenantRequest(token);

  if (result.status === "missing_or_reviewed") {
    return new Response("Invalid token or already reviewed.", { status: 404 });
  }

  const request = result.request;
  if (request?.requested_email) {
    const subject = "Tenant portal request update";
    const text = [
      "Your tenant portal request was not approved at this time.",
      "",
      "If you believe this was a mistake, reply to this email.",
    ].join("\n");

    await sendMail({ to: request.requested_email, subject, text });
  }

  return new Response("Denied.", { status: 200 });
}
