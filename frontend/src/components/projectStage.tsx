import type { ProjectStatus } from "../types";

export const STAGES = ["Plan", "Build", "QA", "Deploy"] as const;

/** Index of the stage a status belongs to; null when the status says nothing about progress. */
const STAGE_OF: Partial<Record<ProjectStatus, number>> = {
  SUBMITTED: 0, PLANNING: 0, CLIENT_APPROVAL_PLAN: 0, CHANGES_REQUESTED_PLAN: 0,
  DEVELOPMENT: 1, CODE_REVIEW: 1, CHANGES_REQUESTED_BUILD: 1,
  QA: 2, TEST_FAILED: 2, STAGING_REVIEW: 2,
  PRODUCTION_APPROVAL: 3, DEPLOYMENT: 3,
};

/** Statuses that wait on the client's decision. */
export const NEEDS_CLIENT: ProjectStatus[] = ["CLIENT_APPROVAL_PLAN", "STAGING_REVIEW", "PRODUCTION_APPROVAL"];

export type Phase = "active" | "review" | "done" | "blocked" | "idle";

export function phaseOf(status: ProjectStatus): Phase {
  if (status === "COMPLETED") return "done";
  if (status === "BLOCKED") return "blocked";
  if (status === "CANCELLED") return "idle";
  if (NEEDS_CLIENT.includes(status)) return "review";
  return "active";
}

/** Share of the four stages finished, 0 to 1. */
export function progressOf(status: ProjectStatus) {
  if (status === "COMPLETED") return 1;
  const i = STAGE_OF[status];
  return i === undefined ? 0 : i / STAGES.length;
}

const LABEL: Partial<Record<ProjectStatus, string>> = {
  SUBMITTED: "Submitted", PLANNING: "Planning", CLIENT_APPROVAL_PLAN: "Needs your review",
  CHANGES_REQUESTED_PLAN: "Replanning", DEVELOPMENT: "Building", CODE_REVIEW: "Code review",
  QA: "Testing", TEST_FAILED: "Fixing tests", STAGING_REVIEW: "Needs your review",
  CHANGES_REQUESTED_BUILD: "Rebuilding", PRODUCTION_APPROVAL: "Needs your approval",
  DEPLOYMENT: "Deploying", COMPLETED: "Completed", BLOCKED: "Blocked", CANCELLED: "Cancelled",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return <span className={`ap-pill ${phaseOf(status)}`}>{LABEL[status] ?? status}</span>;
}

/** Four segments, the current one animated while the agents work on it. */
export function StageTrack({ status }: { status: ProjectStatus }) {
  const current = status === "COMPLETED" ? STAGES.length : STAGE_OF[status];
  const phase = phaseOf(status);
  return (
    <div className={`ap-track ${phase}`} aria-label={current === undefined ? "Progress unknown" : `Stage ${Math.min(current + 1, 4)} of 4`}>
      <div className="ap-segs">
        {STAGES.map((s, i) => (
          <span key={s} className={
            current === undefined ? "ap-seg" : i < current ? "ap-seg done" : i === current ? `ap-seg now${phase === "active" ? " live" : ""}` : "ap-seg"
          } />
        ))}
      </div>
      <div className="ap-seg-labels">{STAGES.map((s) => <span key={s}>{s}</span>)}</div>
    </div>
  );
}

export const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
