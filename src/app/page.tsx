import Link from "next/link";
import { TenantRequestForm } from "@/components/tenant-request-form";
import { ThemeToggle } from "@/components/theme-toggle";

const landingCriticalCss = `
#s-land,#s-request{min-height:100vh;background:var(--bg);color:var(--tx)}
#s-land *,#s-request *{box-sizing:border-box}
.logo{display:flex;align-items:center;gap:9px}.logo-text{font-family:var(--font-heading),sans-serif;font-weight:800;font-size:17px;letter-spacing:-.03em;color:var(--tx)}
.wifimark{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:1px solid var(--bd);border-radius:7px;background:var(--s2);color:var(--ac);font-family:var(--font-heading),sans-serif;font-weight:800}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 18px;border-radius:var(--r);font-size:13px;font-weight:600;line-height:1;text-decoration:none;white-space:nowrap;cursor:pointer;transition:all .15s}
.btn-ac{background:var(--ac);color:#0d0d0d;border:1px solid transparent}.btn-ac:hover{filter:brightness(1.08);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--tx2);border:1px solid var(--bd2)}.btn-ghost:hover{border-color:var(--tx3);color:var(--tx);background:var(--s2)}
.btn-sm{padding:6px 12px;font-size:12px}.btn-lg{padding:13px 26px;font-size:14px;border-radius:var(--r2)}
.land-nav{position:sticky;top:0;z-index:100;height:62px;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 clamp(16px,4vw,56px);background:rgba(13,13,13,.9);backdrop-filter:blur(12px);border-bottom:1px solid var(--bd)}
.land-links{display:flex;gap:24px;list-style:none;margin:0;padding:0}.land-links a{font-size:13px;color:var(--tx2);text-decoration:none;transition:color .15s}.land-links a:hover{color:var(--tx)}
.land-nav-right{display:flex;gap:8px;align-items:center}.hero{max-width:1200px;margin:0 auto;padding:clamp(48px,8vw,96px) clamp(16px,4vw,56px) clamp(40px,6vw,72px)}
.hero-layout{display:grid;grid-template-columns:1fr 1fr;gap:clamp(40px,6vw,80px);align-items:center}
.hero-kicker,.sec-kicker,.req-kicker{display:flex;align-items:center;gap:8px;margin-bottom:24px;color:var(--ac);font-family:var(--font-mono),monospace;font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase}.hero-kicker:before,.sec-kicker:before,.req-kicker:before{content:"";width:20px;height:1px;background:var(--ac)}
.hero h1{margin:0 0 22px;font-family:var(--font-heading),sans-serif;font-size:clamp(36px,5.5vw,72px);font-weight:800;line-height:1.04;letter-spacing:-.035em;color:var(--tx);text-wrap:balance}.hero h1 em{font-style:normal;color:var(--ac)}
.hero-sub{max-width:480px;margin:0 0 32px;color:var(--tx2);font-size:clamp(14px,1.4vw,16px);line-height:1.75}.hero-ctas{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:48px}
.hero-stats{display:flex;gap:clamp(24px,4vw,48px);flex-wrap:wrap;padding-top:28px;border-top:1px solid var(--bd)}.stat-val{font-family:var(--font-heading),sans-serif;font-size:clamp(22px,2.5vw,30px);font-weight:800;color:var(--tx)}.stat-lbl{margin-top:2px;color:var(--tx3);font-size:12px}
.mockup{overflow:hidden;padding:16px;border:1px solid var(--bd);border-radius:var(--r3);background:var(--s1)}.mock-chrome{display:flex;align-items:center;gap:6px;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--bd)}.mock-dot{width:8px;height:8px;border-radius:50%}.mock-url{flex:1;padding:4px 10px;border-radius:4px;background:var(--s2);color:var(--tx3);font-family:var(--font-mono),monospace;font-size:10px}
.mock-kpis{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.mock-kpi{padding:10px;border:1px solid var(--bd);border-radius:8px;background:var(--s2)}.mock-kpi-l,.mock-txn-label{margin-bottom:4px;color:var(--tx3);font-family:var(--font-mono),monospace;font-size:9px;letter-spacing:.06em;text-transform:uppercase}.mock-kpi-v{font-family:var(--font-mono),monospace;font-size:18px;font-weight:600}.mock-kpi-v.a{color:var(--ac)}.mock-kpi-v.g{color:var(--green)}
.mock-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;padding:7px 9px;border:1px solid var(--bd);border-radius:6px;background:var(--s2)}.mock-av{width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%;color:#0d0d0d;font-family:var(--font-mono),monospace;font-size:9px;font-weight:700}.mock-name{color:var(--tx);font-size:10px;font-weight:500}.mock-amt{color:var(--tx3);font-size:10px}.mock-pill{margin-left:auto;padding:2px 6px;border-radius:3px;background:oklch(0.72 0.17 155/.15);color:var(--green);font-family:var(--font-mono),monospace;font-size:9px;font-weight:700}
.int-strip{padding:18px clamp(16px,4vw,56px);border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)}.int-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:20px;flex-wrap:wrap}.int-label{color:var(--tx3);font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase}.int-chips{display:flex;gap:8px;flex-wrap:wrap}.int-chip{padding:5px 12px;border:1px solid var(--bd);border-radius:4px;background:var(--s1);color:var(--tx2);font-size:12px}
.land-section{max-width:1200px;margin:0 auto;padding:clamp(32px,5vw,72px) clamp(16px,4vw,56px)}.sec-kicker{margin-bottom:14px}.sec-title{margin:0 0 12px;font-family:var(--font-heading),sans-serif;font-size:clamp(24px,3vw,38px);font-weight:800;letter-spacing:-.025em;color:var(--tx)}.sec-sub{max-width:480px;margin:0 0 36px;color:var(--tx2);font-size:15px;line-height:1.7}
.feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1px;overflow:hidden;border:1px solid var(--bd);border-radius:var(--r3);background:var(--bd)}.feat-card{padding:28px 26px;background:var(--s1);transition:background .2s}.feat-card:hover{background:var(--s2)}.feat-tag{margin-bottom:12px;color:var(--ac);font-family:var(--font-mono),monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.feat-title{margin-bottom:8px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:15px;font-weight:700}.feat-desc{color:var(--tx2);font-size:13px;line-height:1.65}
.cta-band{position:relative;overflow:hidden;padding:clamp(48px,6vw,80px) clamp(16px,4vw,56px);border-top:1px solid var(--bd);border-bottom:1px solid var(--bd);text-align:center}.cta-band:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 60% 120% at 50% 100%,oklch(0.85 0.22 140/.05),transparent)}.cta-band h2{position:relative;margin:0 0 10px;font-family:var(--font-heading),sans-serif;font-size:clamp(26px,3.5vw,44px);font-weight:800;letter-spacing:-.025em;color:var(--tx)}.cta-band p{position:relative;margin:0 0 28px;color:var(--tx2);font-size:15px}.cta-btns{position:relative;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.land-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:24px clamp(16px,4vw,56px);border-top:1px solid var(--bd)}.land-footer p{color:var(--tx3);font-size:12px}
.req-page{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:clamp(44px,7vw,84px) 20px}.req-inner{width:100%;max-width:960px;display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,5vw,72px);align-items:start}.req-brand-logo{display:flex;align-items:center;gap:9px;margin-bottom:32px}.req-title{margin:0 0 12px;font-family:var(--font-heading),sans-serif;font-size:clamp(26px,3.5vw,40px);font-weight:800;line-height:1.1;letter-spacing:-.025em;color:var(--tx)}.req-desc{margin:0 0 28px;color:var(--tx2);font-size:14px;line-height:1.75}.req-perks{display:flex;flex-direction:column;gap:10px}.req-perk{display:flex;align-items:center;gap:10px;color:var(--tx2);font-size:13px}.req-perk-dot{width:6px;height:6px;border-radius:50%;background:var(--ac);flex-shrink:0}
.req-form-card{padding:clamp(20px,3vw,32px);border:1px solid var(--bd);border-radius:var(--r3);background:var(--s1)}.req-form-title{margin-bottom:4px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:18px;font-weight:700}.req-form-sub{margin-bottom:20px;color:var(--tx3);font-size:12px}.field{margin-bottom:14px}.field label{display:block;margin-bottom:5px;color:var(--tx2);font-size:12px;font-weight:600}.field label span{color:var(--tx3);font-weight:400}.field input,.field select,.field textarea{width:100%;height:42px;padding:0 13px;border:1px solid var(--bd);border-radius:var(--r);background:var(--s2);color:var(--tx);font-size:14px;outline:none}.field textarea{height:72px;padding:10px 13px;resize:vertical}.field input:focus,.field select:focus,.field textarea:focus{border-color:var(--ac-bd);background:var(--s1)}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.req-submit{width:100%;height:48px;margin-top:4px;border:0;border-radius:var(--r2);background:var(--ac);color:#0d0d0d;font-size:14px;font-weight:700;cursor:pointer}.req-submit:disabled{opacity:.55;cursor:not-allowed}.req-footnote{text-align:center;color:var(--tx3);font-size:11px;margin-top:10px}.req-error{margin-bottom:14px;padding:10px 12px;border:1px solid oklch(0.65 0.18 25/.25);border-radius:var(--r);background:oklch(0.65 0.18 25/.12);color:var(--red);font-size:12px}
.req-success-live{text-align:center;padding:16px 0}.req-success-icon{width:52px;height:52px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;border:1px solid var(--ac-bd);border-radius:50%;background:var(--ac-dim);color:var(--ac)}.req-success h3{margin:0 0 6px;color:var(--tx);font-family:var(--font-heading),sans-serif;font-size:20px;font-weight:800}.req-success p{color:var(--tx2);font-size:13px;line-height:1.65}.req-success-actions{margin-top:20px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
@media(max-width:860px){.hero-layout{grid-template-columns:1fr}.mockup{max-width:560px}}@media(max-width:720px){.req-inner{grid-template-columns:1fr}}@media(max-width:640px){.land-links{display:none}.field-row{grid-template-columns:1fr}.hero-stats{gap:22px}.land-nav{height:auto;min-height:62px;flex-wrap:wrap;padding-block:10px}.land-nav-right{margin-left:auto}}
`;

const features = [
  ["Payments", "Paystack Collection", "Card, bank transfer, USSD. Funds land directly in your account - we never hold your money."],
  ["Delivery", "Instant SMS Vouchers", "Termii delivers voucher codes the moment payment is confirmed. Zero manual work."],
  ["Network", "Multi-platform Hotspot", "Omada Cloud OpenAPI, MikroTik REST, RADIUS portals, or just upload a CSV."],
  ["Analytics", "Real-time Dashboard", "Revenue, transactions, voucher inventory, plan performance - all in one view, live."],
  ["Branding", "Branded Portal", "Your customers see your name on a custom URL. Mobile-first checkout in minutes."],
  ["Security", "Secure by Default", "Encrypted credentials, HttpOnly sessions, Paystack webhooks verified on every event."],
];

export default function Home() {
  return (
    <>
      <style>{landingCriticalCss}</style>
      <main id="s-land" className="screen on" data-screen-label="01 Landing">
        <nav className="land-nav">
          <Link href="/" className="logo">
            <span className="wifimark">W</span>
            <span className="logo-text">PaySpot</span>
          </Link>
          <ul className="land-links">
            <li><a href="#features">Features</a></li>
            <li><a href="#integrations">Integrations</a></li>
            <li><a href="#request-access">Pricing</a></li>
            <li><Link href="/help/onboarding">Docs</Link></li>
          </ul>
          <div className="land-nav-right">
            <ThemeToggle />
            <Link className="btn btn-ghost btn-sm" href="/login">Sign in</Link>
            <a className="btn btn-ac btn-sm" href="#request-access">Request Access</a>
          </div>
        </nav>

        <section className="hero">
          <div className="hero-layout">
            <div>
              <div className="hero-kicker">MikroTik / Omada / RADIUS</div>
              <h1>Sell WiFi.<br /><em>Get paid.</em><br />Instantly.</h1>
              <p className="hero-sub">
                A branded online store, Paystack payments, and automatic voucher delivery - for hotspot operators who want to stop doing it manually.
              </p>
              <div className="hero-ctas">
                <Link className="btn btn-ac btn-lg" href="/t/wallstreet">See Demo Store &gt;</Link>
                <a className="btn btn-ghost btn-lg" href="#request-access">Request Access</a>
              </div>
              <div className="hero-stats">
                <div><div className="stat-val">500+</div><div className="stat-lbl">Operators</div></div>
                <div><div className="stat-val">NGN 2.4B+</div><div className="stat-lbl">Processed</div></div>
                <div><div className="stat-val">99.9%</div><div className="stat-lbl">Uptime</div></div>
              </div>
            </div>

            <div className="mockup">
              <div className="mock-chrome">
                <div className="mock-dot" style={{ background: "#ef4444" }} />
                <div className="mock-dot" style={{ background: "#f59e0b" }} />
                <div className="mock-dot" style={{ background: "#22c55e" }} />
                <div className="mock-url">walstreet.payspot.app/admin</div>
              </div>
              <div className="mock-txn-label">Dashboard / Today</div>
              <div className="mock-kpis">
                <div className="mock-kpi"><div className="mock-kpi-l">Revenue</div><div className="mock-kpi-v a">NGN 48,500</div></div>
                <div className="mock-kpi"><div className="mock-kpi-l">Txns</div><div className="mock-kpi-v">142</div></div>
                <div className="mock-kpi"><div className="mock-kpi-l">Vouchers</div><div className="mock-kpi-v g">834</div></div>
                <div className="mock-kpi"><div className="mock-kpi-l">Plans</div><div className="mock-kpi-v">4</div></div>
              </div>
              <div className="mock-txn-label">Recent</div>
              <MockRow initial="A" color="var(--ac)" name="Amaka Obi" detail="1 Day / NGN 1,000" status="Paid" />
              <MockRow initial="K" color="#a78bfa" name="Kelechi Eze" detail="3 Hours / NGN 500" status="Paid" />
              <MockRow initial="T" color="var(--amber)" name="Taiwo Adeyemi" detail="1 Week / NGN 3,500" status="Pending" pending />
            </div>
          </div>
        </section>

        <section id="integrations" className="int-strip">
          <div className="int-inner">
            <span className="int-label">Works with</span>
            <div className="int-chips">
              {["Paystack", "Termii SMS", "Omada Cloud", "MikroTik RouterOS", "FreeRADIUS"].map((item) => <span className="int-chip" key={item}>{item}</span>)}
            </div>
          </div>
        </section>

        <section id="features" className="land-section">
          <div className="sec-kicker">Built for operators</div>
          <h2 className="sec-title">Everything to monetize WiFi</h2>
          <p className="sec-sub">From CSV import to full Omada API - PaySpot adapts to your existing setup.</p>
          <div className="feat-grid">
            {features.map(([tag, title, copy]) => (
              <article className="feat-card" key={title}>
                <div className="feat-tag">{tag}</div>
                <div className="feat-title">{title}</div>
                <div className="feat-desc">{copy}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <h2>Ready to start?</h2>
          <p>Join hundreds of operators already running their WiFi business on PaySpot.</p>
          <div className="cta-btns">
            <a className="btn btn-ac btn-lg" href="#request-access">Request Operator Access</a>
            <Link className="btn btn-ghost btn-lg" href="/t/wallstreet">See Live Demo &gt;</Link>
          </div>
        </section>

        <section id="request-access">
          <div id="s-request" className="screen" data-screen-label="06 Request Access">
            <div className="req-page">
              <div className="req-inner">
                <div className="req-brand">
                  <div className="req-brand-logo">
                    <span className="wifimark">W</span>
                    <span className="logo-text">PaySpot</span>
                  </div>
                  <div className="req-kicker">Operator Access</div>
                  <h1 className="req-title">Start selling WiFi in minutes</h1>
                  <p className="req-desc">Tell us about your setup and we&apos;ll get you onboarded within 24 hours. No setup fees, no contracts.</p>
                  <div className="req-perks">
                    <Perk text="Branded portal live in under 10 minutes" />
                    <Perk text="Paystack payments directly to your account" />
                    <Perk text="Works with Omada, MikroTik, RADIUS or CSV" />
                    <Perk text="Instant voucher delivery after payment" />
                    <Perk text="2% platform fee - no monthly charges" />
                  </div>
                </div>
                <div className="req-form-card">
                  <TenantRequestForm />
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="land-footer">
          <Link href="/" className="logo">
            <span className="wifimark">W</span>
            <span className="logo-text">PaySpot</span>
          </Link>
          <p>(c) 2026 PaySpot / All rights reserved</p>
        </footer>
      </main>
    </>
  );
}

function MockRow({ initial, color, name, detail, status, pending = false }: { initial: string; color: string; name: string; detail: string; status: string; pending?: boolean }) {
  return (
    <div className="mock-row">
      <div className="mock-av" style={{ background: color }}>{initial}</div>
      <div style={{ flex: 1 }}>
        <div className="mock-name">{name}</div>
        <div className="mock-amt">{detail}</div>
      </div>
      <div className="mock-pill" style={pending ? { background: "oklch(0.78 0.18 80/.15)", color: "var(--amber)" } : undefined}>{status}</div>
    </div>
  );
}

function Perk({ text }: { text: string }) {
  return <div className="req-perk"><div className="req-perk-dot" />{text}</div>;
}
