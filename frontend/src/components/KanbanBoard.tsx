import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Task, TaskStatus } from "../types";
import { StatusBadge, Empty } from "./ui";

type ColumnId = "backlog" | "building" | "review" | "qa" | "failed" | "done";

const COLUMNS: { id: ColumnId; label: string; color: string }[] = [
  { id: "backlog", label: "Backlog", color: "var(--wf-muted)" },
  { id: "building", label: "Building", color: "var(--wf-build)" },
  { id: "review", label: "Code review", color: "var(--wf-review)" },
  { id: "qa", label: "In QA", color: "var(--wf-qa)" },
  { id: "failed", label: "Failed", color: "var(--wf-bad)" },
  { id: "done", label: "Done", color: "var(--wf-done)" },
];

const COLUMN_OF: Record<TaskStatus, ColumnId> = {
  PENDING: "backlog",
  IN_PROGRESS: "building",
  CODE_REVIEW: "review",
  QA: "qa",
  TEST_FAILED: "failed",
  BLOCKED: "failed",
  DONE: "done",
};

const colorOf = (id: ColumnId) => COLUMNS.find((c) => c.id === id)!.color;

function roleBadge(role: Task["agentRole"]): { text: string; cls: string } {
  if (role === "BACKEND_DEV") return { text: "backend", cls: "backend" };
  if (role === "FRONTEND_DEV") return { text: "frontend", cls: "frontend" };
  return { text: role.replace(/_/g, " ").toLowerCase(), cls: "other" };
}

function metaText(task: Task, maxRetries: number): string {
  switch (task.status) {
    case "PENDING": return "Queued";
    case "IN_PROGRESS": return "Agent is writing code";
    case "CODE_REVIEW": return "Reviewing the diff";
    case "QA": return "node --test running";
    case "TEST_FAILED": return task.attempts >= maxRetries ? "Out of attempts" : "Tests failing, retrying";
    case "BLOCKED": return "Out of attempts. Needs a human";
    case "DONE": return task.filesJson?.files?.length ? `Passed · ${task.filesJson.files.length} file(s)` : "Passed";
    default: return "";
  }
}

export function KanbanBoard({ tasks, maxRetries = 3 }: { tasks: Task[]; maxRetries?: number }) {
  const [open, setOpen] = useState<Task | null>(null);

  // FLIP: remember where every card was, and when it lands somewhere else, slide it over.
  const nodes = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, { x: number; y: number }>());
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, { x: number; y: number }>();
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const pos = { x: r.left + window.scrollX, y: r.top + window.scrollY };
      next.set(id, pos);
      const before = last.current.get(id);
      if (!reduce && before && Math.abs(before.x - pos.x) + Math.abs(before.y - pos.y) > 2) {
        el.animate(
          [{ transform: `translate(${before.x - pos.x}px, ${before.y - pos.y}px) scale(1.03)` }, { transform: "none" }],
          { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }
    });
    last.current = next;
  });

  if (!tasks.length) return <Empty>No tasks yet — the Project Manager agent creates them during planning.</Empty>;

  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const ordered = [...tasks].sort((a, b) => a.orderIndex - b.orderIndex);
  const pips = Math.min(Math.max(maxRetries, 1), 12);

  return (
    <>
      <div className="wf-scroll">
        <div className="wf-board">
          {COLUMNS.map((col) => {
            const items = ordered.filter((t) => COLUMN_OF[t.status] === col.id);
            return (
              <div key={col.id} className={`wf-col ${items.length ? "has" : ""}`} style={{ "--c": col.color } as CSSProperties}>
                <div className="wf-colhead">
                  <span>{col.label}</span>
                  <em>{items.length}</em>
                </div>
                <div className="wf-slot">
                  {items.map((task) => {
                    const cid = COLUMN_OF[task.status];
                    const badge = roleBadge(task.agentRole);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        ref={(el) => {
                          if (el) nodes.current.set(task.id, el);
                          else nodes.current.delete(task.id);
                        }}
                        onClick={() => setOpen(task)}
                        className={`wf-card wf-focus c-${cid}`}
                        style={{ "--c": colorOf(cid) } as CSSProperties}
                      >
                        <div className="top">
                          <span className={`wf-role-badge ${badge.cls}`}>{badge.text}</span>
                          <span className="wf-spin" />
                          <span className="wf-pulsedot" />
                          <svg className="wf-cktick" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2.5 6.3l2.4 2.4 4.6-5" />
                          </svg>
                        </div>
                        <h3>{task.title}</h3>
                        <div className="wf-pips" title={`Self-repair attempts used: ${task.attempts} of ${maxRetries}`}>
                          {Array.from({ length: pips }, (_, i) => <i key={i} className={i < task.attempts ? "on" : ""} />)}
                        </div>
                        <div className="wf-meta">{metaText(task, maxRetries)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {blocked.length > 0 && (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          <p className="text-sm font-semibold text-rose-200">
            {blocked.length} task{blocked.length > 1 ? "s" : ""} escalated to a human
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-rose-300/90">
            {blocked.map((t) => (
              <li key={t.id}>{t.title} — exhausted its self-repair budget</li>
            ))}
          </ul>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-100">{open.title}</h3>
              <StatusBadge status={open.status} />
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {open.agentRole.replace(/_/g, " ")} · self-repair attempts {open.attempts}/{maxRetries}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{open.description}</p>

            {open.filesJson?.files?.length ? (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase text-slate-400">Files written</h4>
                <ul className="mt-1 space-y-0.5 font-mono text-xs text-sky-300">
                  {open.filesJson.files.map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            ) : null}

            {open.lastTestOutput && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase text-slate-400">Last real test output</h4>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-300">
                  {open.lastTestOutput}
                </pre>
              </div>
            )}

            <button onClick={() => setOpen(null)} className="mt-5 text-sm text-sky-400 hover:underline">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
