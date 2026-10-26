import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AgentRun, Project, ProjectStatus, WorkflowEvent } from "../types";
import { AGENT, Icon, clock, money, num, runMs, secs, type IconName } from "./agentMeta";
import { Empty } from "./ui";

type Filter = "all" | "agent" | "test" | "status";

interface Item {
  id: string;
  kind: "phase" | "mile" | "alert" | "agent" | "test";
  at: string;
  color: string;
  icon?: IconName;
  title: string;
  sub?: string;
  pass?: boolean;
  output?: string;
  base?: string;
  count?: number;
}

const PHASE: Partial<Record<ProjectStatus, { label: string; color: string }>> = {
  SUBMITTED: { label: "Planning", color: "var(--wf-plan)" },
  PLANNING: { label: "Planning", color: "var(--wf-plan)" },
  CLIENT_APPROVAL_PLAN: { label: "Plan review", color: "var(--wf-review)" },
  CHANGES_REQUESTED_PLAN: { label: "Plan review", color: "var(--wf-review)" },
  DEVELOPMENT: { label: "Building", color: "var(--wf-build)" },
  CODE_REVIEW: { label: "Building", color: "var(--wf-build)" },
  QA: { label: "Building", color: "var(--wf-build)" },
  TEST_FAILED: { label: "Building", color: "var(--wf-build)" },
  CHANGES_REQUESTED_BUILD: { label: "Building", color: "var(--wf-build)" },
  STAGING_REVIEW: { label: "Staging review", color: "var(--wf-review)" },
  PRODUCTION_APPROVAL: { label: "Production sign-off", color: "var(--wf-ship)" },
  DEPLOYMENT: { label: "Deploying", color: "var(--wf-ship)" },
  COMPLETED: { label: "Released", color: "var(--wf-done)" },
  BLOCKED: { label: "Needs a human", color: "var(--wf-bad)" },
};

const IGNORED = new Set(["TASK_UPDATED", "AGENT_STARTED", "TASKS_CREATED"]);

/** Status changes the agents make on every task are noise; the rest are milestones. */
function isMilestone(ev: WorkflowEvent): boolean {
  const to = ev.toStatus;
  if (!to) return true;
  if (to === "QA" || to === "CODE_REVIEW" || to === "TEST_FAILED") return false;
  if (to === "DEVELOPMENT" && ev.actor === "ai-service") return false;
  return true;
}

function bits(run: AgentRun | undefined): string[] {
  const out: string[] = [];
  if (run) {
    const tokens = run.promptTokens + run.completionTokens;
    if (tokens) out.push(`${num(tokens)} tokens`, money(run.costUsd));
    const ms = runMs(run);
    if (ms !== null) out.push(secs(ms));
  }
  return out;
}

/** Collapse the raw event log (about ten lines per task) into one entry per thing that happened. */
export function buildFeed(events: WorkflowEvent[], runs: AgentRun[]): Item[] {
  const byId = new Map(runs.map((r) => [r.id, r]));
  const out: Item[] = [];
  let phase: string | null = null;
  let pending: { ev: WorkflowEvent; run: AgentRun } | null = null;

  const agentItem = (ev: WorkflowEvent, run: AgentRun | undefined): Item | null => {
    const meta = run ? AGENT[run.agentRole] : null;
    if (!meta || run?.agentRole === "QA_ENGINEER") return null;
    const failed = run!.status === "FAILED";
    const detail = failed ? (run!.error ?? run!.summary ?? "") : (run!.summary ?? ev.dataJson?.summary ?? "");
    return {
      id: ev.id, kind: failed ? "alert" : "agent", at: ev.createdAt, color: failed ? "var(--wf-bad)" : meta.color, icon: failed ? "warn" : meta.icon,
      title: `${meta.label} ${failed ? "failed" : "finished"}`,
      sub: [detail.slice(0, 220), ...bits(run)].filter(Boolean).join(" · "),
    };
  };
  const flush = () => {
    if (!pending) return;
    const item = agentItem(pending.ev, pending.run);
    if (item) out.push(item);
    pending = null;
  };

  for (const ev of [...events].reverse()) {
    // Bookkeeping events carry nothing the feed shows, and one sits between a
    // developer finishing and its CODE_WRITTEN, so skip them before merging.
    if (IGNORED.has(ev.type)) continue;
    if (ev.type === "CODE_WRITTEN" && pending) {
      const run = pending.run, meta = AGENT[run.agentRole];
      const files: string[] = ev.dataJson?.files ?? [];
      const task = ev.message.split(": ")[0];
      out.push({
        id: ev.id, kind: "agent", at: ev.createdAt, color: meta.color, icon: meta.icon,
        title: files.length ? `${meta.label} wrote ${files[0]}${files.length > 1 ? ` and ${files.length - 1} more` : ""}` : `${meta.label} finished`,
        sub: [task, ...bits(run)].join(" · "),
      });
      pending = null;
      continue;
    }
    flush();

    switch (ev.type) {
      case "STATUS_CHANGE": {
        const p = ev.toStatus ? PHASE[ev.toStatus] : undefined;
        if (p && p.label !== phase) {
          phase = p.label;
          out.push({ id: ev.id + ":phase", kind: "phase", at: ev.createdAt, color: p.color, title: p.label });
        }
        if (!isMilestone(ev)) break;
        const bad = ev.toStatus === "BLOCKED";
        const prev = out[out.length - 1];
        // The same notice repeated back to back (for example after restarts) becomes one entry with a count.
        if (prev && prev.kind === (bad ? "alert" : "mile") && prev.base === ev.message) {
          prev.count = (prev.count ?? 1) + 1;
          prev.title = `${ev.message} (×${prev.count})`;
          prev.at = ev.createdAt;
          prev.id = ev.id;
          break;
        }
        out.push({ id: ev.id, kind: bad ? "alert" : "mile", at: ev.createdAt, color: bad ? "var(--wf-bad)" : "var(--wf-done)", icon: bad ? "warn" : "flag", title: ev.message, base: ev.message });
        break;
      }
      case "AGENT_FINISHED": {
        const run = byId.get(ev.dataJson?.agentRunId);
        if (run && (run.agentRole === "BACKEND_DEV" || run.agentRole === "FRONTEND_DEV") && run.status === "SUCCESS") pending = { ev, run };
        else {
          const item = agentItem(ev, run);
          if (item) out.push(item);
        }
        break;
      }
      case "TEST_RUN": {
        const d = ev.dataJson ?? {};
        const pass = d.passed !== false;
        const task = ev.message.split(": ")[0];
        const rest = ev.message.slice(ev.message.indexOf(": ") + 2).replace(/\s*\(exit code[^)]*\)/, "");
        out.push({
          id: ev.id, kind: "test", at: ev.createdAt, color: pass ? "var(--wf-done)" : "var(--wf-bad)", icon: pass ? "ok" : "bad",
          title: rest, sub: `QA after “${task}”`, pass, output: d.output,
        });
        break;
      }
      case "PROJECT_SUBMITTED":
      case "VERSION_CREATED":
        out.push({ id: ev.id, kind: "mile", at: ev.createdAt, color: "var(--wf-done)", icon: "flag", title: ev.message });
        break;
      case "WORKFLOW_ERROR":
        out.push({ id: ev.id, kind: "alert", at: ev.createdAt, color: "var(--wf-bad)", icon: "warn", title: ev.message });
        break;
      default:
        break;
    }
  }
  flush();
  return out.reverse();
}

interface Now { mode: "work" | "wait" | "done" | "alert"; color: string; title: string; sub: string }

function nowInfo(project: Project, maxRetries: number): Now {
  const tasks = project.tasks ?? [];
  const working = tasks.find((t) => t.status === "IN_PROGRESS" || t.status === "CODE_REVIEW");
  const role = working?.agentRole === "FRONTEND_DEV" ? "Frontend dev" : "Backend dev";
  switch (project.status) {
    case "SUBMITTED": return { mode: "work", color: "var(--wf-plan)", title: "Brief received", sub: "Handing it to the project manager" };
    case "PLANNING": return { mode: "work", color: "var(--wf-plan)", title: "Project manager is reading the brief", sub: "Then the architect designs the system" };
    case "CHANGES_REQUESTED_PLAN": return { mode: "work", color: "var(--wf-plan)", title: "Replanning with the client's feedback", sub: "Project manager and architect" };
    case "CLIENT_APPROVAL_PLAN": return { mode: "wait", color: "var(--wf-review)", title: "Waiting for the client to approve the plan", sub: "Nothing runs until then" };
    case "DEVELOPMENT":
    case "CODE_REVIEW":
    case "CHANGES_REQUESTED_BUILD":
      return working
        ? { mode: "work", color: "var(--wf-build)", title: `${role} is working on a task`, sub: `${working.title}, attempt ${Math.max(1, working.attempts)} of ${maxRetries}` }
        : { mode: "work", color: "var(--wf-build)", title: "Developers are picking up the next task", sub: "" };
    case "QA": return { mode: "work", color: "var(--wf-qa)", title: "QA engineer is running node --test", sub: "Then starting server.js to check /api/health" };
    case "TEST_FAILED": return { mode: "work", color: "var(--wf-bad)", title: "Tests failed. Sending the output back", sub: "The developer gets the real error to fix" };
    case "STAGING_REVIEW": return { mode: "wait", color: "var(--wf-review)", title: "Staging is live. Waiting for the client", sub: project.stagingUrl ?? "" };
    case "PRODUCTION_APPROVAL": return { mode: "wait", color: "var(--wf-ship)", title: "Waiting for admin sign-off", sub: "The admin decides whether it goes live" };
    case "DEPLOYMENT": return { mode: "work", color: "var(--wf-ship)", title: "DevOps is starting the production server", sub: "Then a smoke test on /api/health" };
    case "COMPLETED": return { mode: "done", color: "var(--wf-done)", title: "All done. The project is released", sub: project.productionUrl ?? "" };
    case "BLOCKED": return { mode: "alert", color: "var(--wf-bad)", title: "Needs a human", sub: project.blockedReason ?? "The agents could not continue" };
    default: return { mode: "done", color: "var(--wf-muted)", title: project.status.replace(/_/g, " ").toLowerCase(), sub: "" };
  }
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "agent", label: "Agents" },
  { id: "test", label: "Tests" },
  { id: "status", label: "Milestones" },
];

export function EventTimeline({ project, maxRetries = 6 }: { project: Project; maxRetries?: number }) {
  const events = project.events ?? [];
  const runs = project.agentRuns ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const [openOut, setOpenOut] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  const feed = useMemo(() => buildFeed(events, runs), [events, runs]);
  const shown = feed.filter((i) => filter === "all" || (filter === "agent" && i.kind === "agent") || (filter === "test" && i.kind === "test") || (filter === "status" && (i.kind === "mile" || i.kind === "phase" || i.kind === "alert")));

  // Items that arrive while the page is open slide in; everything already there does not.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(feed.map((i) => i.id));
  const fresh = (id: string) => !seen.current!.has(id);
  useEffect(() => { feed.forEach((i) => seen.current!.add(i.id)); });

  const now = nowInfo(project, maxRetries);
  const lastAt = events[0]?.createdAt;
  useEffect(() => {
    if (now.mode !== "work") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [now.mode]);
  const elapsed = lastAt && now.mode === "work" ? `${Math.max(0, Math.floor((Date.now() - new Date(lastAt).getTime()) / 1000))}s` : "";
  const finished = project.status === "COMPLETED" || project.status === "CANCELLED";

  if (!events.length) return <Empty>Nothing has happened yet.</Empty>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="wf-seg" role="group" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className="wf-focus">
              {f.label}
            </button>
          ))}
        </div>
        <span className={`wf-livedot ${finished || now.mode === "alert" ? "off" : ""}`}>
          {project.status === "COMPLETED" ? "Finished" : now.mode === "alert" ? "Stopped" : "Live"}
        </span>
      </div>

      <div className={`wf-now ${now.mode}`} style={{ "--c": now.color } as CSSProperties}>
        <span className="wf-spin" />
        <span className="wf-pulsedot" />
        <div className="txt">
          {now.title}
          {now.sub && <small>{now.sub}</small>}
        </div>
        <span className="elapsed" title="Time since the last update">{elapsed}</span>
      </div>

      <ol className="wf-feed" aria-live="polite">
        {shown.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Nothing matches this filter yet.</li>}
        {shown.map((item) => {
          const cls = `wf-ev ${item.kind === "phase" ? "phase" : ""} ${item.kind === "alert" || (item.kind === "test" && !item.pass) ? "fail" : ""} ${fresh(item.id) ? "new" : ""}`;
          const style = { "--c": item.color } as CSSProperties;
          if (item.kind === "phase") {
            return <li key={item.id} className={cls} style={style}><span>{item.title}</span></li>;
          }
          // An error message can be a whole stack trace; show the start and keep the rest on hover.
          const clipped = item.title.length > 200;
          const heading = clipped ? item.title.slice(0, 200).trimEnd() + "…" : item.title;
          return (
            <li key={item.id} className={cls} style={style}>
              <span className="wf-ico">{item.icon && <Icon name={item.icon} />}</span>
              <div className="min-w-0">
                <h4 title={clipped ? item.title : undefined}>
                  {heading}
                  {item.kind === "test" && <span className={`wf-chipres ${item.pass ? "pass" : "fail"}`}>{item.pass ? "PASS" : "FAIL"}</span>}
                </h4>
                {item.sub && <p>{item.sub}</p>}
                {item.kind === "test" && item.output && (
                  <details
                    open={openOut.has(item.id)}
                    onToggle={(e) => {
                      const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                      setOpenOut((prev) => {
                        if (prev.has(item.id) === isOpen) return prev;
                        const next = new Set(prev);
                        if (isOpen) next.add(item.id); else next.delete(item.id);
                        return next;
                      });
                    }}
                  >
                    <summary>Show real test output</summary>
                    <pre>{item.output}</pre>
                  </details>
                )}
              </div>
              <time>{clock(item.at)}</time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
