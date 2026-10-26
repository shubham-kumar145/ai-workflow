import type { AgentRole } from "../types";

export type IconName = "pm" | "arch" | "code" | "qa" | "ops" | "flag" | "ok" | "bad" | "warn";

export const AGENT: Record<AgentRole, { label: string; color: string; icon: IconName; tool: boolean }> = {
  PROJECT_MANAGER: { label: "Project manager", color: "var(--wf-plan)", icon: "pm", tool: false },
  ARCHITECT: { label: "Architect", color: "var(--wf-plan)", icon: "arch", tool: false },
  BACKEND_DEV: { label: "Backend dev", color: "var(--wf-build)", icon: "code", tool: false },
  FRONTEND_DEV: { label: "Frontend dev", color: "var(--wf-build)", icon: "code", tool: false },
  QA_ENGINEER: { label: "QA engineer", color: "var(--wf-qa)", icon: "qa", tool: true },
  DEVOPS: { label: "DevOps", color: "var(--wf-ship)", icon: "ops", tool: true },
};

/** Static, trusted SVG path data (Feather-style outlines). */
const PATHS: Record<IconName, string> = {
  pm: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  arch: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  qa: '<path d="M9 2h6M10 2v6L4 20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2l-6-12V2"/>',
  ops: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  ok: '<polyline points="20 6 9 17 4 12"/>',
  bad: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  warn: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const money = (n: number) => "$" + n.toFixed(4);
export const secs = (ms: number) => (ms / 1000).toFixed(1) + "s";
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export function runMs(run: { startedAt: string; finishedAt?: string | null }): number | null {
  if (!run.finishedAt) return null;
  return Math.max(0, new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime());
}
