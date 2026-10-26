import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { createProject } from "../store/projectsSlice";
import { Alert, Button, Card, Field, inputClass } from "../components/ui";

const DEMO = `Build a task manager app. A user can:
- sign up and log in
- create projects
- add tasks to a project and assign them
- see a dashboard with task counts by status

Keep the UI simple and clean.`;

export default function NewProject() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const actionError = useAppSelector((s) => s.projects.actionError);
  const [form, setForm] = useState({ title: "", requirements: "", budget: 500, budgetCapUsd: 5 });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await dispatch(createProject(form));
    setBusy(false);
    if (createProject.fulfilled.match(result)) navigate(`/projects/${result.payload.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Submit a project</h1>

      <Card>
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Project title">
            <input className={inputClass} required minLength={3}
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Task manager app" />
          </Field>

          <Field label="Requirements" hint="At least 20 characters. The Project Manager agent turns this into tasks.">
            <textarea className={`${inputClass} h-44 resize-none`} required minLength={20}
              value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })}
              placeholder={DEMO} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Budget (project currency)">
              <input className={inputClass} type="number" min={0}
                value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} />
            </Field>
            <Field label="LLM spend cap (USD)" hint="The workflow pauses if agent costs exceed this.">
              <input className={inputClass} type="number" min={0.1} step={0.5}
                value={form.budgetCapUsd} onChange={(e) => setForm({ ...form, budgetCapUsd: Number(e.target.value) })} />
            </Field>
          </div>

          {actionError && <Alert>{actionError}</Alert>}

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit to the agency"}</Button>
            <Button type="button" variant="ghost"
              onClick={() => setForm({ ...form, title: "Task manager app", requirements: DEMO })}>
              Use the demo brief
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
