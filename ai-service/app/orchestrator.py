from __future__ import annotations

import logging
import traceback

from .backend_client import backend
from .config import settings
from .graph.build_graph import workflow_graph

log = logging.getLogger("orchestrator")

# LangGraph's default recursion limit is far too low once a project has several
# tasks that each get up to MAX_SELF_REPAIR_RETRIES attempts.
GRAPH_CONFIG = {"recursion_limit": 150}

RESUME_PHASES = {
    "APPROVE_PLAN": "build",
    "REVISE_PLAN": "plan",
    "APPROVE_BUILD": "build",
    "REVISE_BUILD": "build",
    "DEPLOY_PRODUCTION": "deploy_prod",
}


def _over_budget(project: dict) -> bool:
    return float(project.get("costUsd") or 0) > float(project.get("budgetCapUsd") or 0)


def run_workflow(project_id: str, action: str | None = None, feedback: str | None = None) -> None:
    """
    Run one segment of the workflow to its next human checkpoint.

    The graph deliberately does not stay resident across an approval: a client
    may take days. State is rebuilt from PostgreSQL on every entry, which is
    also what makes the service restartable mid-project.
    """
    try:
        project = backend.get_project(project_id)
    except Exception as exc:
        log.error("cannot load project %s: %s", project_id, exc)
        return

    if _over_budget(project):
        reason = (
            f"Budget cap reached: ${float(project['costUsd']):.4f} spent of "
            f"${float(project['budgetCapUsd']):.2f}. Workflow paused."
        )
        backend.set_status(project_id, "BLOCKED", reason, blockedReason=reason[:500])
        return

    phase = RESUME_PHASES.get(action or "", "plan")

    state = {
        "project_id": project_id,
        "phase": phase,
        "project": project,
        "client_feedback": feedback,
        "plan": (project.get("versions") or [{}])[0].get("planJson") or {},
        "architecture": (project.get("versions") or [{}])[0].get("architectureJson") or {},
        "tasks": [],
        "task_index": 0,
        "blocked": False,
    }

    try:
        workflow_graph.invoke(state, config=GRAPH_CONFIG)
    except Exception as exc:
        log.error("workflow failed for %s: %s", project_id, exc)
        detail = f"{exc}"[:400]
        try:
            backend.set_status(
                project_id,
                "BLOCKED",
                f"The workflow crashed and needs a human: {detail}",
                blockedReason=detail,
            )
            backend.log(
                project_id,
                "WORKFLOW_ERROR",
                "Unhandled error in the agent graph.",
                {"traceback": traceback.format_exc()[-4000:]},
            )
        except Exception:
            log.exception("could not report the failure to the backend")
