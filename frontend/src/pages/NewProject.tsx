import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { createProject } from "../store/projectsSlice";
import { Alert } from "../components/ui";
import { Icon, type IconName } from "../components/agentMeta";

const DEMO = `Build a task manager app. A user can:
- sign up and log in
- create projects
- add tasks to a project and assign them
- see a dashboard with task counts by status

Keep the UI simple and clean.`;

const MIN_REQUIREMENTS = 20;

const STEPS: { icon: IconName; name: string; does: string }[] = [
  { icon: "pm", name: "Project manager", does: "Splits the brief into tasks" },
  { icon: "arch", name: "Architect", does: "Picks the structure and plans the files" },
  { icon: "code", name: "Backend and frontend devs", does: "Write the code" },
  { icon: "qa", name: "QA engineer", does: "Runs the tests and repairs failures" },
  { icon: "ops", name: "DevOps", does: "Starts a live preview for you" },
];

/** Floating-label input in the sign-in page's style; `placeholder=" "` drives the label. */
function Float({ id, label, extra, children }: { id: string; label: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="ap-field">
      {children}
      <label htmlFor={id}>{label}</label>
      {extra}
    </div>
  );
}

export default function NewProject() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const actionError = useAppSelector((s) => s.projects.actionError);
  const [form, setForm] = useState({ title: "", requirements: "", budget: 500, budgetCapUsd: 5 });
  const [busy, setBusy] = useState(false);
  const length = form.requirements.trim().length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await dispatch(createProject(form));
    setBusy(false);
    if (createProject.fulfilled.match(result)) navigate(`/projects/${result.payload.id}`);
  }

  return (
    <div>
      <div className="ap-head">
        <div>
          <div className="ap-eyebrow">New brief</div>
          <h1 className="ap-h1">Submit a <span className="ap-grad-text">project</span></h1>
          <p className="ap-sub">Describe what you want built. The agents plan it, build it, test it and deploy a preview.</p>
        </div>
      </div>

      <div className="ap-split">
        <form className="ap-card ap-form" onSubmit={submit}>
          <Float id="np-title" label="Project title">
            <input id="np-title" placeholder=" " required minLength={3}
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Float>

          <div>
            <Float id="np-req" label="Requirements" extra={
              <span className={`ap-count${length >= MIN_REQUIREMENTS ? " ok" : ""}`}>
                {length >= MIN_REQUIREMENTS ? `${length} characters` : `${length} / ${MIN_REQUIREMENTS} min`}
              </span>
            }>
              <textarea id="np-req" placeholder=" " required minLength={MIN_REQUIREMENTS}
                value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} />
            </Float>
            <p className="ap-help">The Project Manager agent turns this into tasks.</p>
          </div>

          <div className="ap-row2">
            <div>
              <Float id="np-budget" label="Budget (project currency)">
                <input id="np-budget" placeholder=" " type="number" min={0}
                  value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
              </Float>
            </div>
            <div>
              <Float id="np-cap" label="LLM spend cap" extra={<span className="ap-suffix">USD</span>}>
                <input id="np-cap" placeholder=" " type="number" min={0.1} step={0.5}
                  value={form.budgetCapUsd} onChange={(e) => setForm({ ...form, budgetCapUsd: Number(e.target.value) })} />
              </Float>
              <p className="ap-help">The workflow pauses if agent costs pass this.</p>
            </div>
          </div>

          {actionError && <Alert>{actionError}</Alert>}

          <div className="ap-actions">
            <button className="ap-btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit to the agency"}</button>
            <button className="ap-btn outline" type="button"
              onClick={() => setForm({ ...form, title: "Task manager app", requirements: DEMO })}>
              Use the demo brief
            </button>
          </div>
        </form>

        <aside className="ap-card ap-side">
          <h3>What happens next</h3>
          <p>Six agents take your brief through four stages.</p>
          <ol className="ap-steps">
            {STEPS.map((s) => (
              <li key={s.name}>
                <span className="ap-step-ic"><Icon name={s.icon} /></span>
                <div><b>{s.name}</b><span>{s.does}</span></div>
              </li>
            ))}
          </ol>
          <div className="ap-tip">You approve the plan and the staging preview before anything is marked done.</div>
        </aside>
      </div>
    </div>
  );
}
