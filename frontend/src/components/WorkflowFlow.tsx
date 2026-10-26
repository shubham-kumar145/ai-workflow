import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Project, ProjectStatus, WorkflowEvent } from "../types";

interface Stage {
  name: string;
  role: string;
  mono: string;
  color: string;
  statuses: ProjectStatus[];
}

/** The office floor: each desk is a stage, and the project moves along them. */
const STAGES: Stage[] = [
  { name: "Planning", role: "Project Manager", mono: "PM", color: "var(--wf-plan)", statuses: ["SUBMITTED", "PLANNING", "CHANGES_REQUESTED_PLAN"] },
  { name: "Client review A", role: "Client", mono: "YOU", color: "var(--wf-review)", statuses: ["CLIENT_APPROVAL_PLAN"] },
  { name: "Development", role: "Frontend + Backend", mono: "DEV", color: "var(--wf-build)", statuses: ["DEVELOPMENT", "CODE_REVIEW", "CHANGES_REQUESTED_BUILD"] },
  { name: "QA", role: "QA Engineer", mono: "QA", color: "var(--wf-qa)", statuses: ["QA", "TEST_FAILED"] },
  { name: "Client review B", role: "Client", mono: "YOU", color: "var(--wf-review)", statuses: ["STAGING_REVIEW"] },
  { name: "Deploy", role: "DevOps", mono: "OPS", color: "var(--wf-ship)", statuses: ["PRODUCTION_APPROVAL", "DEPLOYMENT"] },
  { name: "Completed", role: "Released", mono: "OK", color: "var(--wf-done)", statuses: ["COMPLETED"] },
];

const WORKING = new Set<ProjectStatus>(["PLANNING", "CHANGES_REQUESTED_PLAN", "DEVELOPMENT", "CODE_REVIEW", "CHANGES_REQUESTED_BUILD", "QA", "TEST_FAILED", "DEPLOYMENT"]);
const LAST = STAGES.length - 1;

/** Which desk the project is at. A blocked project stays at the desk where it got stuck. */
function stageOf(status: ProjectStatus, events: WorkflowEvent[], hasPlan: boolean): number {
  const direct = STAGES.findIndex((s) => s.statuses.includes(status));
  if (direct >= 0) return direct;
  if (status === "BLOCKED") {
    const hit = events.find((e) => e.toStatus === "BLOCKED" && e.fromStatus);
    const from = hit?.fromStatus ? STAGES.findIndex((s) => s.statuses.includes(hit.fromStatus as ProjectStatus)) : -1;
    if (from >= 0) return from;
    return hasPlan ? 3 : 0;
  }
  return -1;
}

const CONFETTI_COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#fb923c", "#fb7185"];

function liveMessages(project: Project, maxRetries: number): string[] {
  const tasks = project.tasks ?? [];
  const working = tasks.find((t) => t.status === "IN_PROGRESS" || t.status === "CODE_REVIEW");
  const qaTask = tasks.find((t) => t.status === "QA");
  const failing = tasks.find((t) => t.status === "TEST_FAILED" || t.status === "BLOCKED");
  switch (project.status) {
    case "SUBMITTED": return ["Brief received"];
    case "PLANNING": return ["Reading the brief", "Splitting the work into tasks"];
    case "CHANGES_REQUESTED_PLAN": return ["Replanning with the client's feedback"];
    case "CLIENT_APPROVAL_PLAN": return ["Waiting for the client to approve the plan"];
    case "DEVELOPMENT":
    case "CODE_REVIEW":
    case "CHANGES_REQUESTED_BUILD":
      return working
        ? [working.title, `Attempt ${Math.max(1, working.attempts)} of ${maxRetries}`]
        : ["Developers are picking up the next task"];
    case "QA": return qaTask ? ["Running node --test", qaTask.title] : ["Running node --test"];
    case "TEST_FAILED": return failing ? ["Tests failed. Sending the output back", failing.title] : ["Tests failed"];
    case "STAGING_REVIEW": return ["Staging is live. Waiting for the client"];
    case "PRODUCTION_APPROVAL": return ["Waiting for admin sign-off"];
    case "DEPLOYMENT": return ["Starting the production server"];
    case "COMPLETED": return ["Released"];
    case "BLOCKED": return ["Needs a human", project.blockedReason?.slice(0, 110) ?? "The agents could not continue"];
    default: return [""];
  }
}

export function WorkflowFlow({ project, maxRetries = 6 }: { project: Project; maxRetries?: number }) {
  const status = project.status;
  const events = project.events ?? [];
  const stage = stageOf(status, events, (project.versions?.length ?? 0) > 0);
  const blocked = status === "BLOCKED";
  const completed = status === "COMPLETED";
  const color = blocked ? "var(--wf-bad)" : stage >= 0 ? STAGES[stage].color : "var(--wf-muted)";

  // The glowing dot only shows while the project travels to a new desk.
  const [moving, setMoving] = useState(false);
  const prev = useRef(stage);
  useEffect(() => {
    if (prev.current === stage) return;
    prev.current = stage;
    setMoving(true);
    const t = setTimeout(() => setMoving(false), 1000);
    return () => clearTimeout(t);
  }, [stage]);

  // Confetti when the project finishes while the page is open (not on a page load).
  const prevStatus = useRef(status);
  const [burst, setBurst] = useState(false);
  const bits = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: 30 + Math.random() * 40,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        x: Math.random() * 520 - 260,
        r: Math.random() * 720 - 360,
        delay: Math.random() * 0.25,
      })),
    []
  );
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (was === "COMPLETED" || status !== "COMPLETED") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 2600);
    return () => clearTimeout(t);
  }, [status]);

  // Rotate between the active desk's messages.
  const messages = liveMessages(project, maxRetries);
  const key = messages.join("|");
  const [msgI, setMsgI] = useState(0);
  useEffect(() => setMsgI(0), [key]);
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setMsgI((i) => (i + 1) % messages.length), 2400);
    return () => clearInterval(t);
  }, [key, messages.length]);

  // Keep the active desk in view on narrow screens.
  const scroller = useRef<HTMLDivElement>(null);
  const deskRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const sc = scroller.current, d = deskRefs.current[stage];
    if (!sc || !d) return;
    sc.scrollTo({ left: d.offsetLeft + d.offsetWidth / 2 - sc.clientWidth / 2, behavior: "smooth" });
  }, [stage]);

  const pct = stage >= 0 ? (stage / LAST) * 100 : 0;
  const chipLeft = `calc(100% / 14 + (100% - 100% / 7) * ${stage >= 0 ? stage / LAST : 0})`;
  const vars = (c: string) => ({ "--c": c }) as CSSProperties;

  return (
    <div ref={scroller} className="wf-scroll">
      {burst && (
        <div className="wf-confetti" aria-hidden="true">
          {bits.map((b, i) => (
            <span
              key={i}
              className="wf-bit"
              style={{ left: `${b.left}%`, background: b.color, animationDelay: `${b.delay}s`, "--x": `${b.x}px`, "--r": `${b.r}deg` } as CSSProperties}
            />
          ))}
        </div>
      )}
      <div className="wf-pipeline">
        <div className="wf-desks">
          <div className="wf-track">
            <div className="wf-fill" style={{ width: `${pct}%`, ...vars(color) }} />
            <div className={`wf-token ${moving ? "moving" : ""}`} style={{ left: `${pct}%`, ...vars(color) }} />
          </div>
          {stage >= 0 && (
            <div className="wf-chip" style={{ left: chipLeft, ...vars(color) }}>
              {status.replace(/_/g, " ")}
            </div>
          )}

          {STAGES.map((s, k) => {
            const done = stage >= 0 && (k < stage || (completed && k === stage));
            const active = k === stage && !done && !blocked;
            const isBlocked = blocked && k === stage;
            const upcoming = stage < 0 || k > stage;
            const typing = active && WORKING.has(status);
            const text = k === stage ? messages[msgI % messages.length] : done ? "Done" : "";
            return (
              <div
                key={s.name + k}
                ref={(el) => { deskRefs.current[k] = el; }}
                className={`wf-desk ${done ? "done" : ""} ${active ? "active" : ""} ${isBlocked ? "blocked" : ""} ${upcoming ? "upcoming" : ""} ${typing ? "typing" : ""}`}
                style={vars(s.color)}
              >
                <div className="wf-avatar">
                  <i className="wf-ring" />
                  {s.mono}
                  <span className="wf-tick">
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.3l2.4 2.4 4.6-5" />
                    </svg>
                  </span>
                </div>
                <div className="wf-name">{s.name}</div>
                <div className="wf-role">{s.role}</div>
                <div className="wf-live">
                  {text}
                  <span className="wf-dots"><i /><i /><i /></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
