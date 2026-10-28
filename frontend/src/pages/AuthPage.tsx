import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { clearAuthError, login, signup } from "../store/authSlice";

type Mode = "signin" | "signup";

// The form that has slid away stays in the page for the animation, so take it out of
// the tab order and the accessibility tree. React 18 passes `inert` through as an attribute.
const offscreen = (hidden: boolean) =>
  (hidden ? { inert: "", "aria-hidden": true } : {}) as Record<string, unknown>;

/** Drifting dots linked by lines when close, reaching toward the pointer: the agents at work. */
function NetworkBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: -9999, y: -9999 };
    let w = 0, h = 0, raf = 0;
    let nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 16000));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 1.8,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (reduce) break;
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 140) {
            ctx.strokeStyle = `rgba(56,189,248,${(1 - d / 140) * 0.32})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const dp = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (dp < 190) {
          ctx.strokeStyle = `rgba(56,189,248,${(1 - dp / 190) * 0.6})`;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke();
        }
        ctx.fillStyle = "rgba(56,189,248,.75)";
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    const onMove = (e: PointerEvent) => { pointer.x = e.clientX; pointer.y = e.clientY; if (reduce) draw(); };
    const onResize = () => { resize(); if (reduce) draw(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("resize", onResize);
    resize(); draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="au-net" />;
}

function PasswordField({ id, label, autoComplete, minLength, value, onChange }: {
  id: string; label: string; autoComplete: string; minLength?: number; value: string; onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="au-field">
      <input id={id} type={show ? "text" : "password"} placeholder=" " autoComplete={autoComplete}
        required minLength={minLength} value={value} onChange={(e) => onChange(e.target.value)} />
      <label htmlFor={id}>{label}</label>
      <button type="button" className="au-toggle" onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}>
        {show ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function Field({ id, label, type = "text", autoComplete, minLength, value, onChange }: {
  id: string; label: string; type?: string; autoComplete: string; minLength?: number; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="au-field">
      <input id={id} type={type} placeholder=" " autoComplete={autoComplete} required minLength={minLength}
        value={value} onChange={(e) => onChange(e.target.value)} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

/** Sign in and create account on one page; the brand panel slides between them. */
export default function AuthPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const mode: Mode = pathname.startsWith("/signup") ? "signup" : "signin";
  const busy = status === "loading";

  const [signin, setSignin] = useState({ email: "", password: "" });
  const [account, setAccount] = useState({ name: "", email: "", password: "" });

  // An error from one form should not greet the user on the other.
  useEffect(() => { dispatch(clearAuthError()); }, [mode, dispatch]);

  if (user) return <Navigate to="/projects" replace />;

  const go = (m: Mode) => navigate(m === "signup" ? "/signup" : "/login");
  const onSignin = (e: FormEvent) => { e.preventDefault(); dispatch(login(signin)); };
  const onSignup = (e: FormEvent) => { e.preventDefault(); dispatch(signup(account)); };

  return (
    <div className="au-page">
      <div className="au-bg" aria-hidden="true">
        <div className="au-blob b1" /><div className="au-blob b2" /><div className="au-blob b3" />
        <div className="au-dots" />
        <NetworkBackground />
      </div>

      <main className="au-stage">
        <div className={`au-card ${mode === "signup" ? "is-signup" : ""}`}>
          <section className="au-pane signin" {...offscreen(mode !== "signin")}>
            <form onSubmit={onSignin}>
              <div className="au-head">
                <h2>Welcome</h2>
                <p>Sign in to your software agency</p>
              </div>
              <Field id="si-email" label="Email" type="email" autoComplete="email"
                value={signin.email} onChange={(v) => setSignin({ ...signin, email: v })} />
              <PasswordField id="si-password" label="Password" autoComplete="current-password"
                value={signin.password} onChange={(v) => setSignin({ ...signin, password: v })} />
              {mode === "signin" && error && <p className="au-error" role="alert">{error}</p>}
              <button className="au-primary" type="submit" disabled={busy}>
                {busy && mode === "signin" ? "Signing in…" : "Sign in"}
              </button>
              <p className="au-switch">Don't have an account? <button type="button" onClick={() => go("signup")}>Sign up</button></p>
              {/* Local demo accounts only; a live site sets its own passwords. */}
              {import.meta.env.DEV && (
                <p className="au-demo">Demo: client@aiworkflow.dev / client1234 · admin@aiworkflow.dev / admin1234</p>
              )}
            </form>
          </section>

          <section className="au-pane signup" {...offscreen(mode !== "signup")}>
            <form onSubmit={onSignup}>
              <div className="au-head">
                <h2>Create account</h2>
                <p>Then submit a brief and watch the agents build it</p>
              </div>
              <Field id="su-name" label="Name" autoComplete="name" minLength={2}
                value={account.name} onChange={(v) => setAccount({ ...account, name: v })} />
              <Field id="su-email" label="Email" type="email" autoComplete="email"
                value={account.email} onChange={(v) => setAccount({ ...account, email: v })} />
              <PasswordField id="su-password" label="Password" autoComplete="new-password" minLength={8}
                value={account.password} onChange={(v) => setAccount({ ...account, password: v })} />
              <p className="au-hint">At least 8 characters.</p>
              {mode === "signup" && error && <p className="au-error" role="alert">{error}</p>}
              <button className="au-primary" type="submit" disabled={busy}>
                {busy && mode === "signup" ? "Creating…" : "Create account"}
              </button>
              <p className="au-switch">Already have an account? <button type="button" onClick={() => go("signin")}>Sign in</button></p>
            </form>
          </section>

          <aside className="au-brand">
            <div className="au-brand-inner">
              <div className="au-logo" aria-hidden="true">
                <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="14" r="5" /><circle cx="36" cy="14" r="5" /><circle cx="24" cy="36" r="5" />
                  <path d="M17 14h14M15 18.5l6.5 13M33 18.5l-6.5 13" />
                </svg>
              </div>
              <div className="au-wordmark">AI Work Flow</div>
              {mode === "signin" ? (
                <div className="au-copy" key="in">
                  <h1>Welcome back!</h1>
                  <p>Your agents keep working while you're away. Sign in to check on your projects.</p>
                  <button type="button" className="au-ghost" onClick={() => go("signup")}>Create account</button>
                </div>
              ) : (
                <div className="au-copy" key="up">
                  <h1>Hello there!</h1>
                  <p>Submit a brief and six agents plan, build, test and deploy it for you.</p>
                  <button type="button" className="au-ghost" onClick={() => go("signin")}>Sign in</button>
                </div>
              )}
              <div className="au-pipeline" aria-label="How a project moves">
                <span>Plan</span><i /><span>Build</span><i /><span>QA</span><i /><span>Deploy</span>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
