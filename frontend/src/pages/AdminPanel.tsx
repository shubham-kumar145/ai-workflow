import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAppDispatch, useAppSelector } from "../store";
import { fetchProjects, unblockProject } from "../store/projectsSlice";
import { LongText } from "../components/ui";
import { Icon, type IconName } from "../components/agentMeta";
import { StatusPill, progressOf } from "../components/projectStage";

interface Stats {
  projects: number; blocked: number; completed: number;
  agentRuns: number; totalCostUsd: number; totalTokens: number;
}

/** Delete asks inside the row first: deleting stops servers and removes the generated code. */
function DeleteButton({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (busy) return <span className="ap-confirm">Deleting…</span>;
  if (!asking) return <button className="ap-del" onClick={() => setAsking(true)}>Delete</button>;
  return (
    <span className="ap-confirm" role="group" aria-label="Confirm delete">
      Delete for good?
      <button className="ap-del yes" onClick={() => { setAsking(false); onConfirm(); }}>Yes</button>
      <button className="ap-del" onClick={() => setAsking(false)} autoFocus>No</button>
    </span>
  );
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
  const clients = new Set(list.map((p) => p.clientId)).size;

  async function unblock(id: string) {
    setBusy(id);
    await dispatch(unblockProject({ projectId: id, note: "Unblocked by admin." }));
    await dispatch(fetchProjects());
    api.get<Stats>("/api/admin/stats").then(setStats).catch(() => undefined);
    setBusy(null);
  }

  async function remove(id: string, title: string) {
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

  const tiles: { label: string; icon: IconName; tone: string; value: string | number; note: string }[] = stats ? [
    { label: "Projects", icon: "pm", tone: "sky", value: stats.projects, note: `across ${clients} client${clients === 1 ? "" : "s"}` },
    { label: "Completed", icon: "ok", tone: "green", value: stats.completed,
      note: stats.projects ? `${Math.round((stats.completed / stats.projects) * 100)}% done` : "none yet" },
    { label: "Blocked", icon: "warn", tone: "red", value: stats.blocked, note: stats.blocked ? "need a human" : "all clear" },
    { label: "Agent runs", icon: "code", tone: "violet", value: stats.agentRuns, note: "all time" },
    { label: "Total spend", icon: "flag", tone: "teal", value: `$${stats.totalCostUsd.toFixed(4)}`,
      note: `${stats.totalTokens.toLocaleString()} tokens` },
  ] : [];

  return (
    <div>
      <div className="ap-head">
        <div>
          <div className="ap-eyebrow">Control room</div>
          <h1 className="ap-h1">Agency <span className="ap-grad-text">admin</span></h1>
          <p className="ap-sub">Every project, every agent run, and anything that needs a human.</p>
        </div>
      </div>

      {error && (
        <div className="ap-banner" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {stats && (
        <div className="ap-stats">
          {tiles.map((t) => (
            <div key={t.label} className="ap-card ap-stat">
              <div className="k"><i className={t.tone}><Icon name={t.icon} /></i>{t.label}</div>
              <div className={`v${t.label === "Blocked" && stats.blocked ? " bad" : ""}`}>{t.value}</div>
              <div className="t">{t.note}</div>
            </div>
          ))}
        </div>
      )}

      <section className="ap-card ap-panel">
        <header><h2>Escalations needing a human <span className="ap-badge">{blocked.length}</span></h2></header>
        {blocked.length === 0 ? (
          <div className="ap-allclear">
            <span className="ic"><Icon name="ok" /></span>
            <b>Nothing is blocked</b>
            When an agent gets stuck, it shows up here with an Unblock and retry button.
          </div>
        ) : (
          <ul className="ap-escalations">
            {blocked.map((p) => (
              <li key={p.id}>
                <div className="min-w-0">
                  <Link to={`/projects/${p.id}`} className="ap-pname">{p.title}</Link>
                  <div className="ap-reason"><LongText text={p.blockedReason ?? "Blocked"} max={180} /></div>
                </div>
                <div className="ap-actions">
                  <button className="ap-btn sm" disabled={busy === p.id} onClick={() => unblock(p.id)}>
                    {busy === p.id ? "Working…" : "Unblock and retry"}
                  </button>
                  <DeleteButton busy={busy === p.id} onConfirm={() => remove(p.id, p.title)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ap-card ap-panel">
        <header><h2>All projects <span className="ap-badge">{list.length}</span></h2></header>
        {list.length === 0 ? (
          <p className="ap-allclear">No projects yet.</p>
        ) : (
          <div className="ap-table">
            <table>
              <thead><tr><th>Project</th><th>Progress</th><th>Spend</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/projects/${p.id}`} className="ap-pname">{p.title}</Link>
                      <div className="ap-pmail">{p.client?.email}</div>
                    </td>
                    <td><div className="ap-bar"><i style={{ width: `${Math.round(progressOf(p.status) * 100)}%` }} /></div></td>
                    <td>${(p.costUsd ?? 0).toFixed(4)}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="text-right"><DeleteButton busy={busy === p.id} onConfirm={() => remove(p.id, p.title)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
