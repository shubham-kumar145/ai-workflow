import type { ProjectVersion } from "../types";
import { Empty } from "./ui";

/** What the client is actually approving at Review A. */
export function PlanView({ version }: { version?: ProjectVersion }) {
  if (!version) return <Empty>The Project Manager agent has not delivered a plan yet.</Empty>;

  const plan = version.planJson ?? {};
  const arch = version.architectureJson ?? {};
  const paths = Object.keys(arch.apiContract?.paths ?? version.apiContractJson?.paths ?? {});

  return (
    <div className="space-y-5 text-sm">
      <p className="text-xs text-slate-500">
        Snapshot v{version.versionNumber} · {new Date(version.createdAt).toLocaleString()}
      </p>

      {plan.scope && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Scope</h4>
          <p className="text-slate-300">{plan.scope}</p>
        </section>
      )}

      {plan.assumptions?.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Assumptions</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-slate-300">
            {plan.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}
          </ul>
        </section>
      )}

      {plan.milestones?.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Milestones</h4>
          <ul className="space-y-1 text-slate-300">
            {plan.milestones.map((m: any, i: number) => (
              <li key={i}><span className="font-medium text-slate-200">{m.name}</span> — {m.deliverable}</li>
            ))}
          </ul>
        </section>
      )}

      {arch.overview && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Architecture</h4>
          <p className="text-slate-300">{arch.overview}</p>
        </section>
      )}

      {arch.dataModel?.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Data model</h4>
          <div className="space-y-2">
            {arch.dataModel.map((c: any, i: number) => (
              <div key={i} className="rounded-lg bg-slate-950/60 p-2.5">
                <p className="font-mono text-xs text-sky-300">{c.collection}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {(c.fields ?? []).map((f: any) => `${f.name}: ${f.type}`).join(", ")}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {paths.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">API contract</h4>
          <ul className="space-y-0.5 font-mono text-xs text-slate-300">
            {paths.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </section>
      )}

      {plan.risks?.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold uppercase text-slate-400">Risks</h4>
          <ul className="list-disc space-y-0.5 pl-5 text-amber-200/80">
            {plan.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
