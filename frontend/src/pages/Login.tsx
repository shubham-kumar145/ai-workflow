import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { login } from "../store/authSlice";
import { Alert, Button, Field, inputClass } from "../components/ui";

export default function Login() {
  const dispatch = useAppDispatch();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const [form, setForm] = useState({ email: "", password: "" });

  if (user) return <Navigate to="/projects" replace />;

  return (
    <div className="mx-auto mt-20 max-w-sm space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">AI Work Flow</h1>
        <p className="text-sm text-slate-400">Sign in to your software agency.</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(e) => { e.preventDefault(); dispatch(login(form)); }}
      >
        <Field label="Email">
          <input className={inputClass} type="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password">
          <input className={inputClass} type="password" required
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={status === "loading"}>
          {status === "loading" ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="text-sm text-slate-400">
        No account? <Link to="/signup" className="text-sky-400 hover:underline">Sign up</Link>
      </p>
      {/* Local demo accounts only; a live site sets its own passwords. */}
      {import.meta.env.DEV && (
        <p className="rounded-lg bg-slate-900 p-3 text-xs text-slate-500">
          Seeded accounts: <code className="text-slate-300">client@aiworkflow.dev / client1234</code> ·{" "}
          <code className="text-slate-300">admin@aiworkflow.dev / admin1234</code>
        </p>
      )}
    </div>
  );
}
