import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAppDispatch, useAppSelector } from "../store";
import { fetchProjects, unblockProject } from "../store/projectsSlice";
import { Button, Card, Empty, LongText, StatusBadge } from "../components/ui";

interface Stats {
  projects: number; blocked: number; completed: number;
  agentRuns: number; totalCostUsd: number; totalTokens: number;
}

export default function AdminPanel() {
  const dispatch = useAppDispatch();
  const list = useAppSelector((s) => s.projects.list);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchProjects());
    api.get<Stats>("/api/admin/stats").then(setStats).catch(() => setStats(null));
  }, [dispatch]);

  const blocked = list.filter((p) => p.status === "BLOCKED");

  async function unblock(id: string) {
    setBusy(id);
    await dispatch(unblockProject({ projectId: id, note: "Unblocked by admin." }));
    await dispatch(fetchProjects());
    api.get<Stats>("/api/admin/stats").then(setStats).catch(() => undefined);
    setBusy(null);
  }

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete "${title}"? This removes its history, stops its staging and production servers, and deletes its generated code. This cannot be undone.`)) return;
    setBusy(id);
    setError(null);
    try {
      const res = await api.delete<{ deleted: boolean; cleanupWarning: string | null }>(`/api/admin/projects/${id}`);
      if (res.cleanupWarning) setError(res.cleanupWarning);
    } catch (e) {
      setError(`Could not delete "${title}": ${(e as Error).message}`);
    }
    await dispatch(fetchProjects());
    api.get<Stats>("/api/admin/stats").then(setStats).catch(() => undefined);
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-100">Agency admin</h1>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-900 bg-rose-950/50 p-3 text-sm text-rose-200">
          <span>{error}</span>
          <button className="text-rose-400 hover:text-rose-200" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            { label: "Projects", value: stats.projects },
            { label: "Completed", value: stats.completed },
            { label: "Blocked", value: stats.blocked },
            { label: "Agent runs", value: stats.agentRuns },
            { label: "Total spend", value: `$${stats.totalCostUsd.toFixed(4)}` },
          ].map((s) => (
            <Card key={s.label}>
              <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-100">{s.value}</p>
            </Card>
          ))}
        </div>
      )}

      <Card title="Escalations needing a human">
        {blocked.length === 0 ? (
          <Empty>Nothing is blocked.</Empty>
        ) : (
          <ul className="space-y-2">
            {blocked.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/60 p-3">
                <div className="min-w-0">
                  <Link to={`/projects/${p.id}`} className="font-medium text-slate-100 hover:text-sky-400">{p.title}</Link>
                  <div className="text-xs text-rose-300"><LongText text={p.blockedReason ?? "Blocked"} max={180} /></div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" disabled={busy === p.id} onClick={() => unblock(p.id)}>
                    {busy === p.id ? "Working…" : "Unblock and retry"}
                  </Button>
                  <Button variant="danger" disabled={busy === p.id} onClick={() => remove(p.id, p.title)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="All projects">
        <ul className="space-y-1.5">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-b border-slate-800/60 py-1.5 last:border-0">
              <Link to={`/projects/${p.id}`} className="truncate text-sm text-slate-200 hover:text-sky-400">
                {p.title} <span className="text-slate-500">· {p.client?.email}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={p.status} />
                <button
                  className="rounded px-2 py-0.5 text-xs text-rose-400 hover:bg-rose-950/60 hover:text-rose-200 disabled:opacity-50"
                  disabled={busy === p.id}
                  onClick={() => remove(p.id, p.title)}
                >
                  {busy === p.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
