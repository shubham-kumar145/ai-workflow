import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { signup } from "../store/authSlice";
import { Alert, Button, Field, inputClass } from "../components/ui";

export default function Signup() {
  const dispatch = useAppDispatch();
  const { user, status, error } = useAppSelector((s) => s.auth);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  if (user) return <Navigate to="/projects" replace />;

  return (
    <div className="mx-auto mt-20 max-w-sm space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Create an account</h1>
        <p className="text-sm text-slate-400">Then submit a project and watch the agents build it.</p>
      </div>

      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); dispatch(signup(form)); }}>
        <Field label="Name">
          <input className={inputClass} required minLength={2}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" required
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input className={inputClass} type="password" required minLength={8}
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" className="w-full" disabled={status === "loading"}>
          {status === "loading" ? "Creating…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-slate-400">
        Already have one? <Link to="/login" className="text-sky-400 hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
