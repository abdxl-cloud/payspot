import { z } from "zod";
import { getSessionUserFromRequest } from "@/lib/auth";
import { isPaystackSecretKey } from "@/lib/paystack-key";
import {
  type AccessMode,
  getTenantBySlug,
  getUserById,
  isTenantSlugAvailable,
  setTenantArchitecture,
  setTenantPaystackSecret,
  type PortalAuthMode,
  setUserMustChangePassword,
  type VoucherSourceMode,
  updateTenant,
  updateUserPassword,
} from "@/lib/store";

type Props = {
  params: Promise<{ slug: string }>;
};

const schema = z.object({
  newPassword: z.string().min(8).max(200).optional(),
  paystackSecretKey: z.string().min(10).max(200).optional(),
  newSlug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format")
    .optional(),
  architecture: z
    .object({
      accessMode: z.enum(["voucher_access", "account_access"]).optional(),
      voucherSourceMode: z.enum(["import_csv", "omada_openapi", "mikrotik_rest"]).optional(),
      portalAuthMode: z.enum(["omada_builtin", "external_radius_portal"]).optional(),
      omada: z
        .object({
          apiBaseUrl: z.string().max(300).optional(),
          omadacId: z.string().max(200).optional(),
          siteId: z.string().max(200).optional(),
          clientId: z.string().max(200).optional(),
          clientSecret: z.string().max(500).optional(),
          hotspotOperatorUsername: z.string().max(200).optional(),
          hotspotOperatorPassword: z.string().max(500).optional(),
        })
        .optional(),
      mikrotik: z
        .object({
          baseUrl: z.string().max(300).optional(),
          username: z.string().max(200).optional(),
          password: z.string().max(500).optional(),
          hotspotServer: z.string().max(200).optional(),
          defaultProfile: z.string().max(200).optional(),
          verifyTls: z.boolean().optional(),
        })
        .optional(),
      radius: z
        .object({
          adapterSecret: z.string().max(500).optional(),
        })
        .optional(),
    })
    .optional(),
});

function validatePassword(pw: string) {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/.test(pw)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(pw)) return "Password must include an uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must include a number.";
  return null;
}

export async function POST(request: Request, { params }: Props) {
  const sessionUser = await getSessionUserFromRequest(request);
  if (!sessionUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) {
    return Response.json({ error: "Tenant not found" }, { status: 404 });
  }

  if (sessionUser.role !== "tenant" || sessionUser.tenantId !== tenant.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const userRow = await getUserById(sessionUser.id);
  if (!userRow) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const mustChangePassword = userRow.must_change_password === 1;
  const requirePaystackKey = !tenant.paystack_secret_enc;
  const requestedSlug = parsed.data.newSlug?.toLowerCase() ?? tenant.slug;

  if (mustChangePassword) {
    if (!parsed.data.newPassword) {
      return Response.json({ error: "New password is required" }, { status: 400 });
    }
    const message = validatePassword(parsed.data.newPassword);
    if (message) {
      return Response.json({ error: message }, { status: 400 });
    }
  }

  if (requirePaystackKey && !parsed.data.paystackSecretKey) {
    return Response.json({ error: "Paystack secret key is required" }, { status: 400 });
  }

  if (parsed.data.paystackSecretKey && !isPaystackSecretKey(parsed.data.paystackSecretKey)) {
    return Response.json(
      { error: "Use a valid Paystack secret key (sk_test_... or sk_live_...)." },
      { status: 400 },
    );
  }

  const selectedAccessMode = parsed.data.architecture?.accessMode
    ?? (parsed.data.architecture?.portalAuthMode === "external_radius_portal"
      ? "account_access"
      : "voucher_access");

  if (
    parsed.data.architecture?.voucherSourceMode === "omada_openapi" &&
    selectedAccessMode === "voucher_access"
  ) {
    const omada = parsed.data.architecture.omada;
    const hasSavedSecret = !!tenant.omada_client_secret_enc;
    if (!omada?.apiBaseUrl?.trim()) {
      return Response.json({ error: "Omada API base URL is required for API automation." }, { status: 400 });
    }
    if (!omada.omadacId?.trim()) {
      return Response.json({ error: "Omada ID is required for API automation." }, { status: 400 });
    }
    if (!omada.siteId?.trim()) {
      return Response.json({ error: "Omada site ID is required for API automation." }, { status: 400 });
    }
    if (!omada.clientId?.trim()) {
      return Response.json({ error: "Omada client ID is required for API automation." }, { status: 400 });
    }
    if (!omada.clientSecret?.trim() && !hasSavedSecret) {
      return Response.json({ error: "Omada client secret is required for API automation." }, { status: 400 });
    }
  }
  if (
    parsed.data.architecture?.voucherSourceMode === "mikrotik_rest" &&
    selectedAccessMode === "voucher_access"
  ) {
    const mikrotik = parsed.data.architecture.mikrotik;
    const hasSavedPassword = !!tenant.mikrotik_password_enc;
    if (!mikrotik?.baseUrl?.trim()) {
      return Response.json({ error: "MikroTik base URL is required for direct mode." }, { status: 400 });
    }
    if (!mikrotik.username?.trim()) {
      return Response.json({ error: "MikroTik username is required for direct mode." }, { status: 400 });
    }
    if (!mikrotik.password?.trim() && !hasSavedPassword) {
      return Response.json({ error: "MikroTik password is required for direct mode." }, { status: 400 });
    }
  }

  if (requestedSlug !== tenant.slug && !await isTenantSlugAvailable(requestedSlug)) {
    return Response.json({ error: "That link name is not available" }, { status: 409 });
  }

  if (parsed.data.newPassword) {
    const message = validatePassword(parsed.data.newPassword);
    if (message) {
      return Response.json({ error: message }, { status: 400 });
    }
    await updateUserPassword({ userId: userRow.id, password: parsed.data.newPassword });
    await setUserMustChangePassword({ userId: userRow.id, mustChangePassword: false });
  }

  if (parsed.data.paystackSecretKey) {
    try {
      const res = await setTenantPaystackSecret({
        tenantId: tenant.id,
        paystackSecretKey: parsed.data.paystackSecretKey,
      });
      if (res.status !== "ok") {
        return Response.json(
          { error: "Unable to save Paystack key" },
          { status: 500 },
        );
      }
    } catch (error) {
      console.error("Paystack key encryption failed", error);
      return Response.json(
        { error: "Server crypto not configured" },
        { status: 500 },
      );
    }
  }

  if (parsed.data.architecture) {
    try {
      const architectureResult = await setTenantArchitecture({
        tenantId: tenant.id,
        accessMode: parsed.data.architecture.accessMode as AccessMode | undefined,
        voucherSourceMode: parsed.data.architecture.voucherSourceMode as VoucherSourceMode | undefined,
        portalAuthMode: parsed.data.architecture.portalAuthMode as PortalAuthMode | undefined,
        omada: parsed.data.architecture.omada
          ? {
              apiBaseUrl: parsed.data.architecture.omada.apiBaseUrl?.trim(),
              omadacId: parsed.data.architecture.omada.omadacId?.trim(),
              siteId: parsed.data.architecture.omada.siteId?.trim(),
              clientId: parsed.data.architecture.omada.clientId?.trim(),
              clientSecret: parsed.data.architecture.omada.clientSecret?.trim() || undefined,
              hotspotOperatorUsername:
                parsed.data.architecture.omada.hotspotOperatorUsername?.trim() || undefined,
              hotspotOperatorPassword:
                parsed.data.architecture.omada.hotspotOperatorPassword?.trim() || undefined,
            }
          : undefined,
        mikrotik: parsed.data.architecture.mikrotik
          ? {
              baseUrl: parsed.data.architecture.mikrotik.baseUrl?.trim(),
              username: parsed.data.architecture.mikrotik.username?.trim(),
              password: parsed.data.architecture.mikrotik.password?.trim() || undefined,
              hotspotServer: parsed.data.architecture.mikrotik.hotspotServer?.trim() || undefined,
              defaultProfile: parsed.data.architecture.mikrotik.defaultProfile?.trim() || undefined,
              verifyTls: parsed.data.architecture.mikrotik.verifyTls,
            }
          : undefined,
        radius: parsed.data.architecture.radius
          ? {
              adapterSecret: parsed.data.architecture.radius.adapterSecret?.trim() || undefined,
            }
          : undefined,
      });
      if (architectureResult.status !== "ok") {
        return Response.json({ error: "Unable to save architecture settings" }, { status: 500 });
      }
    } catch (error) {
      console.error("Tenant setup architecture save failed", error);
      return Response.json({ error: "Unable to save architecture settings" }, { status: 500 });
    }
  }

  if (requestedSlug !== tenant.slug) {
    const updated = await updateTenant({
      tenantId: tenant.id,
      slug: requestedSlug,
    });
    if (updated.status === "slug_taken") {
      return Response.json({ error: "That link name is not available" }, { status: 409 });
    }
    if (updated.status === "missing") {
      return Response.json({ error: "Tenant not found" }, { status: 404 });
    }
  }

  const latest = await getTenantBySlug(requestedSlug) ?? tenant;

  return Response.json({
    status: "ok",
    redirectTo: `/t/${latest.slug}/admin`,
  });
}
