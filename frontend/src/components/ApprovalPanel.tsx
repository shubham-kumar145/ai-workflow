import { useEffect, useState } from "react";
import type { Project } from "../types";
import { useAppDispatch, useAppSelector } from "../store";
import { submitApproval, withdrawApproval } from "../store/projectsSlice";
import { Alert, Button, Card, inputClass } from "./ui";

type Stage = "PLAN" | "BUILD" | "PRODUCTION";

const MAX_FEEDBACK = 20_000;

/**
 * The client's gate. Revision budgets are displayed here and enforced on the
 * server — a QA retry never shows up in these numbers.
 */
export function ApprovalPanel({ project }: { project: Project }) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const actionError = useAppSelector((s) => s.projects.actionError);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // A confirmation belongs to one stage; drop it if the status moves on.
  useEffect(() => setConfirming(false), [project.status]);

  const stage: Stage | null =
    project.status === "CLIENT_APPROVAL_PLAN" ? "PLAN"
    : project.status === "STAGING_REVIEW" ? "BUILD"
    : project.status === "PRODUCTION_APPROVAL" ? "PRODUCTION"
    : null;

  if (!stage) return null;

  const used = stage === "PLAN" ? project.planRevisionCount : project.buildRevisionCount;
  const max = stage === "PLAN" ? project.maxPlanRevisions : project.maxBuildRevisions;
  const exhausted = stage !== "PRODUCTION" && used >= max;
  const isAdmin = user?.role === "ADMIN";

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED") {
    setBusy(true);
    const result = await dispatch(submitApproval({ projectId: project.id, stage: stage!, decision, feedback }));
    // Keep the text on failure so a long change request is not lost.
    if (submitApproval.fulfilled.match(result)) setFeedback("");
    setConfirming(false);
    setBusy(false);
  }

  async function goBack() {
    setBusy(true);
    await dispatch(withdrawApproval(project.id));
    setConfirming(false);
    setBusy(false);
  }

  const confirmText = {
    PLAN: "Approve this plan? The developer agents start building straight away, and the plan can't be changed after that.",
    BUILD: "Approve this build? It goes to an admin for production sign-off. You can still go back until the admin deploys it.",
    PRODUCTION: "Deploy this build to production? This can't be undone.",
  }[stage];

  const heading = {
    PLAN: "Review A — the plan",
    BUILD: "Review B — the working build",
    PRODUCTION: "Production sign-off",
  }[stage];

  return (
    <Card title={heading} className="border-amber-500/40 bg-amber-500/5">
      {stage === "PRODUCTION" && !isAdmin && (
        <Alert tone="info">Waiting on an admin to approve the production deploy.</Alert>
      )}

      {stage === "BUILD" && project.stagingUrl && (
        <p className="mb-3 text-sm text-slate-300">
          Staging preview:{" "}
          <a href={project.stagingUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
            {project.stagingUrl}
          </a>
        </p>
      )}

      {stage !== "PRODUCTION" && (
        <p className="mb-3 text-xs text-slate-400">
          Change requests used:{" "}
          <span className={exhausted ? "font-semibold text-rose-400" : "font-semibold text-slate-200"}>
            {used}/{max}
          </span>
          {exhausted && " — the limit is reached, so this stage ships as-is or needs a new paid round."}
        </p>
      )}

      {actionError && <div className="mb-3"><Alert>{actionError}</Alert></div>}

      {stage !== "PRODUCTION" && !exhausted && (
        <div className="mb-3">
          <textarea
            className={`${inputClass} h-32 resize-y`}
            placeholder="What should the agents change? (required if you request changes)"
            value={feedback}
            maxLength={MAX_FEEDBACK}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <p className={`mt-1 text-right text-xs ${feedback.length >= MAX_FEEDBACK ? "text-rose-400" : "text-slate-500"}`}>
            {feedback.length.toLocaleString()} / {MAX_FEEDBACK.toLocaleString()} characters
          </p>
        </div>
      )}

      {confirming ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="mb-3 text-sm text-amber-100">{confirmText}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => decide("APPROVED")} disabled={busy}>
              {busy ? "Working…" : stage === "PRODUCTION" ? "Yes, deploy to production" : "Yes, approve"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setConfirming(true)} disabled={busy || (stage === "PRODUCTION" && !isAdmin)}>
            {stage === "PRODUCTION" ? "Approve and deploy to production" : "Approve"}
          </Button>
          {stage !== "PRODUCTION" && (
            <Button variant="ghost" onClick={() => decide("CHANGES_REQUESTED")} disabled={busy || exhausted || !feedback.trim()}>
              Request changes
            </Button>
          )}
          {stage === "PRODUCTION" && (
            <Button variant="ghost" onClick={goBack} disabled={busy}>
              ← Back to staging review
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
