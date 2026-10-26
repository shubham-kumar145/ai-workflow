import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../store";
import { fetchProjects } from "../store/projectsSlice";
import { Card, Empty, StatusBadge } from "../components/ui";

export default function ProjectList() {
  const dispatch = useAppDispatch();
  const { list, status } = useAppSelector((s) => s.projects);

  useEffect(() => { dispatch(fetchProjects()); }, [dispatch]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-100">Projects</h1>
        <Link to="/projects/new" className="rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400">
          New project
        </Link>
      </div>

      {status === "loading" && list.length === 0 && <Empty>Loading…</Empty>}
      {status !== "loading" && list.length === 0 && (
        <Empty>No projects yet. Submit one and the agents get to work.</Empty>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {list.map((project) => (
          <Link key={project.id} to={`/projects/${project.id}`}>
            <Card className="h-full transition hover:border-sky-600">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-slate-100">{project.title}</h2>
                <StatusBadge status={project.status} />
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-slate-400">{project.requirements}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                <span>{project._count?.tasks ?? project.tasks?.length ?? 0} tasks</span>
                <span>${(project.costUsd ?? 0).toFixed(4)} spent</span>
                <span>plan {project.planRevisionCount}/{project.maxPlanRevisions}</span>
                <span>build {project.buildRevisionCount}/{project.maxBuildRevisions}</span>
                {project.client && <span>{project.client.name}</span>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
