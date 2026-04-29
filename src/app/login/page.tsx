import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { SESSION_COOKIE_NAME } from "@/lib/auth-cookies";
import { getSessionUser } from "@/lib/store";

const loginCriticalCss = `
#s-login{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;background:var(--bg);color:var(--tx)}
#s-login *{box-sizing:border-box}
.logo{display:flex;align-items:center;gap:9px;text-decoration:none}.logo-text{font-family:var(--font-heading),sans-serif;font-weight:800;font-size:17px;letter-spacing:-.03em;color:var(--tx)}
.wifimark{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--bd);border-radius:7px;background:var(--s2);color:var(--ac);font-family:var(--font-heading),sans-serif;font-weight:800}
.login-brand{display:flex;flex-direction:column;justify-content:space-between;padding:clamp(32px,5vw,64px);background:var(--s1);border-right:1px solid var(--bd)}
.lb-copy{padding:clamp(40px,6vw,80px) 0}.lb-headline{margin-bottom:12px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:clamp(26px,3.5vw,40px);font-weight:800;line-height:1.15;letter-spacing:-.025em}.lb-sub{max-width:340px;color:var(--tx2);font-size:14px;line-height:1.7}
.lb-feats{display:flex;flex-direction:column;gap:10px}.lb-feat{display:flex;align-items:center;gap:10px;color:var(--tx2);font-size:13px}.lb-n{width:20px;flex-shrink:0;color:var(--ac);font-family:var(--font-mono),monospace;font-size:10px}
.login-form-col{display:flex;align-items:center;justify-content:center;padding:clamp(24px,4vw,56px);background:var(--bg)}
.lf-wrap{width:100%;max-width:360px}.lf-title{margin-bottom:6px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:24px;font-weight:800;letter-spacing:-.02em}.lf-sub{margin-bottom:24px;color:var(--tx2);font-size:13px}
.lf-card{padding:22px;border:1px solid var(--bd);border-radius:var(--r2);background:var(--s1)}
.field{margin-bottom:14px}.field label{display:block;margin-bottom:5px;color:var(--tx2);font-size:12px;font-weight:600;letter-spacing:.02em}.field input{width:100%;height:42px;padding:0 13px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx);font-size:14px;outline:none}.field input:focus{border-color:var(--ac-bd);background:var(--s1)}
.login-password-field{margin-bottom:8px}.lf-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}.lf-row label{margin-bottom:0}.lf-forgot{color:var(--tx3);font-size:12px;text-decoration:none}.lf-forgot:hover{color:var(--ac)}
.lf-submit{width:100%;height:46px;margin-top:4px;border:0;border-radius:var(--r);background:var(--ac);color:#0d0d0d;font-size:14px;font-weight:700;cursor:pointer}.lf-submit:disabled{opacity:.55;cursor:not-allowed}
.lf-footer{margin-top:16px;text-align:center;color:var(--tx3);font-size:12px}.lf-footer a{color:var(--ac);text-decoration:none}
.lf-error{margin-bottom:14px;padding:10px 12px;border:1px solid oklch(0.65 0.18 25/.25);border-radius:var(--r);background:oklch(0.65 0.18 25/.12);color:var(--red);font-size:12px}
@media(max-width:720px){#s-login{display:flex;flex-direction:column}.login-brand{display:none}.login-form-col{min-height:100vh}}
`;

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;
  const user = token ? await getSessionUser(token) : null;
  if (user) {
    if (user.role === "admin") redirect("/admin");
    if (user.tenantSlug) redirect(`/t/${user.tenantSlug}/admin`);
  }

  return (
    <>
      <style>{loginCriticalCss}</style>
      <div id="s-login" className="screen on" data-screen-label="05 Login">
        <section className="login-brand">
          <Link href="/" className="logo">
            <span className="wifimark">W</span>
            <span className="logo-text">PaySpot</span>
          </Link>
          <div className="lb-copy">
            <div className="lb-headline">Your WiFi business,<br />fully automated.</div>
            <div className="lb-sub">Manage vouchers, track revenue, and run your hotspot from one clean dashboard.</div>
            <div className="lb-feats">
              <div className="lb-feat"><span className="lb-n">01</span>Paystack payment collection</div>
              <div className="lb-feat"><span className="lb-n">02</span>Instant voucher delivery</div>
              <div className="lb-feat"><span className="lb-n">03</span>Real-time revenue dashboard</div>
              <div className="lb-feat"><span className="lb-n">04</span>MikroTik, Omada & RADIUS</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "var(--tx3)" }}>(c) 2026 PaySpot</div>
        </section>
        <div className="login-form-col">
          <LoginForm />
        </div>
      </div>
    </>
  );
}
