import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { fetchProjects } from "../store/projectsSlice";
import { Empty } from "../components/ui";
import { Icon } from "../components/agentMeta";
import { StageTrack, StatusPill, initials, phaseOf } from "../components/projectStage";
import type { Project } from "../types";

const FILTERS = [
  { key: "all", label: "All", test: () => true },
  { key: "active", label: "In progress", test: (p: Project) => phaseOf(p.status) === "active" },
  { key: "attention", label: "Needs attention", test: (p: Project) => ["review", "blocked"].includes(phaseOf(p.status)) },
  { key: "done", label: "Completed", test: (p: Project) => p.status === "COMPLETED" },
] as const;

export default function ProjectList() {
  const dispatch = useAppDispatch();
  const { list, status } = useAppSelector((s) => s.projects);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  useEffect(() => { dispatch(fetchProjects()); }, [dispatch]);

  const shown = list.filter(FILTERS.find((f) => f.key === filter)!.test);

  return (
    <div>
      <div className="ap-head">
        <div>
          <div className="ap-eyebrow">Your agency</div>
          <h1 className="ap-h1">Projects</h1>
          <p className="ap-sub">Every brief you submit, and where the agents are with it.</p>
        </div>
        <Link to="/projects/new" className="ap-btn">+ New project</Link>
      </div>

      {list.length > 0 && (
        <div className="ap-chips" role="group" aria-label="Filter projects">
          {FILTERS.map((f) => (
            <button key={f.key} className={`ap-chip${filter === f.key ? " on" : ""}`} aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}>
              {f.label} <b>{list.filter(f.test).length}</b>
            </button>
          ))}
        </div>
      )}

      {status === "loading" && list.length === 0 && <Empty>Loading…</Empty>}
      {list.length > 0 && shown.length === 0 && <Empty>No projects here.</Empty>}

      <div className="ap-grid">
        {shown.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`} className="ap-card ap-proj">
            <div className="ap-proj-top">
              <h2>{project.title}</h2>
              <StatusPill status={project.status} />
            </div>
            <p>{project.requirements}</p>
            <StageTrack status={project.status} />
            <div className="ap-meta">
              <span><Icon name="ok" />{project._count?.tasks ?? project.tasks?.length ?? 0} tasks</span>
              <span>${(project.costUsd ?? 0).toFixed(4)} spent</span>
              <span title="Revisions used">plan {project.planRevisionCount}/{project.maxPlanRevisions} · build {project.buildRevisionCount}/{project.maxBuildRevisions}</span>
              {project.client && (
                <span className="ap-owner"><span className="ap-mini-av">{initials(project.client.name)}</span>{project.client.name}</span>
              )}
            </div>
          </Link>
        ))}

        {status !== "loading" && filter === "all" && (
          <Link to="/projects/new" className="ap-newcard">
            <span className="ap-plus" aria-hidden="true">+</span>
            <b>{list.length === 0 ? "Submit your first project" : "Start a new project"}</b>
            <span>Write a brief, the agents do the rest</span>
          </Link>
        )}
      </div>
    </div>
  );
}
