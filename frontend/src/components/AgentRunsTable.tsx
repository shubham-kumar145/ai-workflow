import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AgentRun, AgentRole } from "../types";
import { AGENT, money, num, runMs, secs } from "./agentMeta";
import { Empty } from "./ui";

const COST_AGENTS: AgentRole[] = ["PROJECT_MANAGER", "ARCHITECT", "BACKEND_DEV", "FRONTEND_DEV"];

export function AgentRunsTable({ runs, budgetCap }: { runs: AgentRun[]; budgetCap: number }) {
  const [modelOnly, setModelOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [, setTick] = useState(0);

  const running = runs.some((r) => r.status === "RUNNING");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const stats = useMemo(() => {
    const finished = runs.filter((r) => r.status !== "RUNNING");
    const tokens = runs.reduce((s, r) => s + r.promptTokens + r.completionTokens, 0);
    const cost = runs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const ok = finished.filter((r) => r.status === "SUCCESS").length;
    const byAgent = COST_AGENTS.map((role) => ({
      role,
      cost: runs.filter((r) => r.agentRole === role).reduce((s, r) => s + (r.costUsd ?? 0), 0),
    }));
    return { tokens, cost, success: finished.length ? Math.round((ok / finished.length) * 100) : null, byAgent };
  }, [runs]);

  if (!runs.length) return <Empty>No agent runs yet.</Empty>;

  const rows = runs.filter((r) => !(modelOnly && AGENT[r.agentRole].tool));
  const maxTokens = Math.max(1, ...rows.map((r) => r.promptTokens + r.completionTokens));
  const maxCost = Math.max(0.0001, ...stats.byAgent.map((a) => a.cost));
  const over = stats.cost > budgetCap;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div>
      <div className="wf-runsum">
        <div><b>{runs.length}</b><span>Runs</span></div>
        <div><b>{num(stats.tokens)}</b><span>Tokens</span></div>
        <div><b>{money(stats.cost)}</b><span>Cost</span></div>
        <div><b>{stats.success === null ? "-" : `${stats.success}%`}</b><span>Succeeded</span></div>
      </div>

      <div className="wf-budget">
        <div className={`wf-meter ${over ? "over" : ""}`}><i style={{ width: `${Math.min(100, (stats.cost / budgetCap) * 100)}%` }} /></div>
        <small>{money(stats.cost)} of ${budgetCap.toFixed(2)} budget used</small>
      </div>

      <div className="wf-bars">
        <h3>Cost by agent</h3>
        {stats.byAgent.map((a) => (
          <div key={a.role} className="wf-bar" style={{ "--c": AGENT[a.role].color } as CSSProperties}>
            <span>{AGENT[a.role].label}</span>
            <i><b style={{ width: `${(a.cost / maxCost) * 100}%` }} /></i>
            <em>{money(a.cost)}</em>
          </div>
        ))}
      </div>

      <div className="mt-3.5">
        <label className="wf-toggle">
          <input type="checkbox" checked={modelOnly} onChange={(e) => setModelOnly(e.target.checked)} />
          Hide test and deploy runs
        </label>
      </div>

      <div className="wf-runs-scroll mt-1">
        <div className="wf-runs">
          <div className="wf-rh">
            <span>Agent</span><span>Tokens</span><span className="r">Cost</span><span className="r">Time</span><span className="r">Result</span>
          </div>
          {rows.map((run) => {
            const meta = AGENT[run.agentRole];
            const tokens = run.promptTokens + run.completionTokens;
            const ms = runMs(run) ?? (run.status === "RUNNING" ? Date.now() - new Date(run.startedAt).getTime() : null);
            const failed = run.status === "FAILED";
            const text = (failed ? run.error ?? run.summary : run.summary) ?? "";
            const long = text.length > 140;
            const open = expanded.has(run.id);
            const badge = failed ? ["fail", "FAILED"] : run.status === "RUNNING" ? ["run", "RUNNING"] : ["ok", "SUCCESS"];
            return (
              <div
                key={run.id}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onClick={() => toggle(run.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(run.id); } }}
                className={`wf-run wf-focus ${failed ? "failed" : ""}`}
                style={{ "--c": meta.color } as CSSProperties}
              >
                <div className="a">
                  <i />
                  <div>
                    <b>{meta.label}</b>
                    <small>{run.model}</small>
                  </div>
                </div>
                <div className="tk">
                  <span>{num(tokens)}</span>
                  <i><b style={{ width: `${(tokens / maxTokens) * 100}%` }} /></i>
                </div>
                <div className="cost">{money(run.costUsd ?? 0)}</div>
                <div className="dur">{ms === null ? "-" : secs(ms)}</div>
                <div className="r"><span className={`wf-badge ${badge[0]}`}>{badge[1]}</span></div>
                {text && <p className={`rsum ${long && !open ? "clamp" : ""}`}>{text}</p>}
              </div>
            );
          })}
          {rows.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Every run is a test or deploy run. Untick the box to see them.</p>}
        </div>
      </div>
    </div>
  );
}
