import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { fetchProject } from "../store/projectsSlice";
import { useProjectSocket } from "../hooks/useProjectSocket";
import { WorkflowFlow } from "../components/WorkflowFlow";
import { KanbanBoard } from "../components/KanbanBoard";
import { EventTimeline } from "../components/EventTimeline";
import { AgentRunsTable } from "../components/AgentRunsTable";
import { ApprovalPanel } from "../components/ApprovalPanel";
import { PlanView } from "../components/PlanView";
import { RevisionBadges } from "../components/RevisionBadges";
import { Alert, Button, Card, Empty, StatusBadge } from "../components/ui";
import { api } from "../api/client";

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const dispatch = useAppDispatch();
  const project = useAppSelector((s) => s.projects.current);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [maxRetries, setMaxRetries] = useState<number | undefined>(undefined);

  useProjectSocket(id);

  useEffect(() => {
    api
      .get<{ maxSelfRepairRetries: number | null }>("/api/meta/limits")
      .then((r) => setMaxRetries(r.maxSelfRepairRetries ?? undefined))
      .catch(() => undefined);
  }, []);

  async function downloadSource() {
    if (!id) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await api.download(`/api/projects/${id}/download`, "project-source.zip");
    } catch (e) {
      setDownloadError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    if (id) dispatch(fetchProject(id));
  }, [id, dispatch]);

  // The live feed carries status changes, but a status change usually means
  // tasks and agent runs changed too — so refetch when the status moves.
  useEffect(() => {
    if (id && project?.status) dispatch(fetchProject(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.status]);

  if (!project || project.id !== id) return <Empty>Loading project…</Empty>;

  const overBudget = project.costUsd > project.budgetCapUsd;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{project.title}</h1>
          <p className="mt-0.5 text-xs text-slate-500">
            submitted {new Date(project.createdAt).toLocaleString()}
            {project.client && ` · ${project.client.name}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge status={project.status} />
          <RevisionBadges project={project} maxRetries={maxRetries} />
        </div>
      </header>

      {project.status === "BLOCKED" && (
        <Alert>
          <strong>Escalated to a human.</strong> {project.blockedReason ?? "The agents could not continue."}
        </Alert>
      )}
      {overBudget && (
        <Alert tone="warn">
          Agent spend (${project.costUsd.toFixed(4)}) has passed the ${project.budgetCapUsd.toFixed(2)} cap.
        </Alert>
      )}
      {project.status === "COMPLETED" && project.releaseSummary && (
        <Alert tone="info">
          <strong>Released.</strong> {project.releaseSummary}
        </Alert>
      )}

      <ApprovalPanel project={project} />

      <Card title="The office floor">
        {/* Keyed by project so moving between projects does not replay animations or confetti. */}
        <WorkflowFlow key={project.id} project={project} maxRetries={maxRetries} />
      </Card>

      <Card title="Task board">
        <KanbanBoard key={project.id} tasks={project.tasks ?? []} maxRetries={maxRetries} />
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[5fr_6fr]">
        <Card title="Live activity">
          <EventTimeline key={project.id} project={project} maxRetries={maxRetries} />
        </Card>
        <Card title="Agent runs">
          <AgentRunsTable runs={project.agentRuns ?? []} budgetCap={project.budgetCapUsd} />
        </Card>
      </div>

      <Card title="Plan and architecture">
        <PlanView version={project.versions?.[0]} />
      </Card>

      {(project.stagingUrl || project.productionUrl || project.workspacePath) && (
        <Card title="Deployments">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <Button variant="ghost" disabled={downloading} onClick={downloadSource}>
              {downloading ? "Preparing zip…" : "Download source code (.zip)"}
            </Button>
            {downloadError && <span className="text-xs text-rose-300">{downloadError}</span>}
          </div>
          <ul className="space-y-1 text-sm">
            {project.stagingUrl && (
              <li>
                Staging:{" "}
                <a href={project.stagingUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
                  {project.stagingUrl}
                </a>
              </li>
            )}
            {project.productionUrl && (
              <li>
                Production:{" "}
                <a href={project.productionUrl} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
                  {project.productionUrl}
                </a>
              </li>
            )}
          </ul>
          {project.workspacePath && (
            <p className="mt-2 font-mono text-xs text-slate-500">generated code: {project.workspacePath}</p>
          )}
        </Card>
      )}
    </div>
  );
}
