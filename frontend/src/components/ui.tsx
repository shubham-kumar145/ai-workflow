import type { ReactNode } from "react";
import type { ProjectStatus, TaskStatus } from "../types";

export function Card({ title, children, className = "", actions }: {
  title?: string; children: ReactNode; className?: string; actions?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-slate-800 bg-slate-900/60 ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-slate-700 text-slate-200",
  PLANNING: "bg-indigo-500/20 text-indigo-300 border-indigo-500/40",
  CLIENT_APPROVAL_PLAN: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  CHANGES_REQUESTED_PLAN: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  DEVELOPMENT: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  CODE_REVIEW: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  QA: "bg-violet-500/20 text-violet-300 border-violet-500/40",
  TEST_FAILED: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  STAGING_REVIEW: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  CHANGES_REQUESTED_BUILD: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  PRODUCTION_APPROVAL: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  DEPLOYMENT: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
  COMPLETED: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  BLOCKED: "bg-red-500/25 text-red-300 border-red-500/50",
  CANCELLED: "bg-slate-700 text-slate-400",
  PENDING: "bg-slate-700 text-slate-300",
  IN_PROGRESS: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  DONE: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
};

export function StatusBadge({ status }: { status: ProjectStatus | TaskStatus | string }) {
  const cls = STATUS_COLORS[status] ?? "bg-slate-700 text-slate-300";
  return (
    <span className={`inline-block rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {String(status).replace(/_/g, " ")}
    </span>
  );
}

export function Button({ children, variant = "primary", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-sky-500 text-slate-950 hover:bg-sky-400",
    ghost: "border border-slate-700 text-slate-300 hover:bg-slate-800",
    danger: "bg-rose-500 text-slate-950 hover:bg-rose-400",
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500";

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" | "warn" }) {
  const styles = {
    error: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}
