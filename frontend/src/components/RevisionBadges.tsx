import type { Project } from "../types";

/**
 * Three separate budgets, shown separately on purpose: the client's two
 * revision rounds, and the agents' per-task self-repair allowance.
 */
export function RevisionBadges({ project, maxRetries = 3 }: { project: Project; maxRetries?: number }) {
  const worstTask = (project.tasks ?? []).reduce((max, t) => Math.max(max, t.attempts ?? 0), 0);

  const items = [
    { label: "plan changes", used: project.planRevisionCount, max: project.maxPlanRevisions, tone: "sky" },
    { label: "build changes", used: project.buildRevisionCount, max: project.maxBuildRevisions, tone: "sky" },
    { label: "agent self-repair", used: worstTask, max: maxRetries, tone: "violet" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const full = item.used >= item.max;
        return (
          <span
            key={item.label}
            title={item.label === "agent self-repair"
              ? "Per-task retries after a failed test. Never consumes a client revision."
              : "Client-requested changes for this stage."}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              full
                ? "border-rose-500/50 bg-rose-500/15 text-rose-300"
                : item.tone === "violet"
                  ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                  : "border-slate-700 bg-slate-800/60 text-slate-300"
            }`}
          >
            {item.used}/{item.max} {item.label}
          </span>
        );
      })}
    </div>
  );
}
