from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Literal, TypedDict

from langgraph.graph import END, StateGraph

from ..agents import architect as architect_agent
from ..agents import developer as developer_agent
from ..agents import devops as devops_agent
from ..agents import pm as pm_agent
from ..agents import qa as qa_agent
from ..agents import snapshot
from ..backend_client import backend
from ..config import settings

log = logging.getLogger("graph")


class WFState(TypedDict, total=False):
    project_id: str
    phase: Literal["plan", "build", "deploy_prod"]
    project: dict[str, Any]
    plan: dict[str, Any]
    architecture: dict[str, Any]
    api_contract: dict[str, Any]
    client_feedback: str | None
    tasks: list[dict[str, Any]]
    task_index: int
    workspace: str
    last_failure: str | None
    dev_error: bool
    blocked: bool
    error: str | None


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _run_agent(state: WFState, role: str, task_id: str | None, fn):
    """Wrap an LLM call in an agent_run row so every call is audited and costed."""
    project_id = state["project_id"]
    run_id = backend.start_agent_run(project_id, role, settings.OPENAI_MODEL, task_id)
    try:
        result = fn()
    except Exception as exc:
        backend.finish_agent_run(run_id, "FAILED", error=str(exc)[:2000])
        raise
    backend.finish_agent_run(
        run_id,
        "SUCCESS",
        prompt_tokens=result.prompt_tokens,
        completion_tokens=result.completion_tokens,
        cost_usd=result.cost_usd,
        summary=str(result.data.get("summary") or result.data.get("scope") or "")[:2000],
    )
    return result


def topological_order(tasks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Dependencies first. A cycle degrades to the planner's original order."""
    by_id = {t["id"]: t for t in tasks}
    resolved: list[dict[str, Any]] = []
    seen: set[str] = set()
    visiting: set[str] = set()

    def visit(task: dict[str, Any]) -> None:
        tid = task["id"]
        if tid in seen or tid in visiting:
            return
        visiting.add(tid)
        for dep in task.get("dependencies") or []:
            dep_task = by_id.get(dep.get("id") if isinstance(dep, dict) else dep)
            if dep_task:
                visit(dep_task)
        visiting.discard(tid)
        seen.add(tid)
        resolved.append(task)

    for task in sorted(tasks, key=lambda t: t.get("orderIndex", 0)):
        visit(task)
    return resolved


def _latest_version(project: dict[str, Any]) -> dict[str, Any]:
    versions = project.get("versions") or []
    return versions[0] if versions else {}


# --------------------------------------------------------------------------
# nodes
# --------------------------------------------------------------------------

def pm_node(state: WFState) -> WFState:
    project = state["project"]
    project_id = state["project_id"]

    backend.set_status(project_id, "PLANNING", "Project Manager agent is drafting the plan.")

    previous = _latest_version(project).get("planJson") if state.get("client_feedback") else None

    result = _run_agent(
        state,
        "PROJECT_MANAGER",
        None,
        lambda: pm_agent.plan_project(
            title=project["title"],
            requirements=project["requirements"],
            budget=project.get("budget", 0),
            deadline=project.get("deadline"),
            previous_plan=previous,
            client_feedback=state.get("client_feedback"),
        ),
    )

    plan = result.data
    tasks = plan.get("tasks") or []

    backend.replace_tasks(
        project_id,
        [
            {
                "key": str(t.get("key") or f"t{i+1}"),
                "title": str(t.get("title") or f"Task {i+1}")[:200],
                "description": str(t.get("description") or ""),
                "agentRole": t.get("agentRole") if t.get("agentRole") in ("FRONTEND_DEV", "BACKEND_DEV") else "BACKEND_DEV",
                "orderIndex": i,
                "dependsOn": [str(d) for d in (t.get("dependsOn") or [])],
            }
            for i, t in enumerate(tasks)
        ],
    )

    return {**state, "plan": plan}


def architect_node(state: WFState) -> WFState:
    project = state["project"]
    project_id = state["project_id"]

    result = _run_agent(
        state,
        "ARCHITECT",
        None,
        lambda: architect_agent.design_system(
            title=project["title"],
            requirements=project["requirements"],
            plan=state["plan"],
        ),
    )

    architecture = result.data
    api_contract = architecture.get("apiContract")

    version = backend.create_version(
        project_id,
        label=f"Plan + architecture ({len(state['plan'].get('tasks') or [])} tasks)",
        plan=state["plan"],
        architecture=architecture,
        api_contract=api_contract,
    )

    backend.set_status(
        project_id,
        "CLIENT_APPROVAL_PLAN",
        "Plan and architecture are ready for the client to review.",
        data={"versionId": version["id"]},
    )

    return {**state, "architecture": architecture, "api_contract": api_contract or {}}


def _open_build_revision(project: dict) -> str | None:
    """The client's change request, if the build is still being reworked for it."""
    for approval in project.get("approvals") or []:  # newest first
        if approval.get("stage") == "BUILD":
            if approval.get("decision") == "CHANGES_REQUESTED":
                return approval.get("feedback")
            return None
    return None


def prepare_build_node(state: WFState) -> WFState:
    project_id = state["project_id"]
    project = backend.get_project(project_id)

    workspace = developer_agent.ensure_workspace(project_id)
    backend.set_status(
        project_id,
        "DEVELOPMENT",
        "Workspace prepared from the starter template; developer agents are starting.",
        workspacePath=str(workspace),
    )

    tasks = topological_order([t for t in project.get("tasks") or []])
    architecture = _latest_version(project).get("architectureJson") or state.get("architecture") or {}

    feedback = state.get("client_feedback")
    if feedback:
        # A new client build revision: every task is reworked with a fresh
        # self-repair budget. Persist that, so an unblock mid-rework resumes the
        # remaining tasks instead of treating last round's DONE as current.
        for t in tasks:
            backend.update_task(t["id"], status="PENDING", attempts=0)
        pending = [{**t, "status": "PENDING", "attempts": 0, "lastFailureCount": None} for t in tasks]
    else:
        pending = [t for t in tasks if t.get("status") != "DONE"]
        if pending:
            feedback = _open_build_revision(project)

    return {
        **state,
        "project": project,
        "client_feedback": feedback,
        "tasks": pending,
        "task_index": 0,
        "workspace": str(workspace),
        "architecture": architecture,
        "last_failure": None,
    }


def developer_node(state: WFState) -> WFState:
    tasks = state["tasks"]
    index = state["task_index"]
    task = tasks[index]
    project_id = state["project_id"]
    workspace = Path(state["workspace"])

    # Count the attempt BEFORE doing the work: if the agent throws, the counter
    # must still advance, or a crashing agent retries forever instead of
    # escalating. The row the backend returns is the single source of truth for
    # this counter — never increment it a second time in graph state, and never
    # confuse it with the client's revision budget.
    updated = backend.update_task(task["id"], status="IN_PROGRESS", incrementAttempts=True)
    task = {**task, "attempts": updated.get("attempts", task.get("attempts", 0) + 1)}
    tasks[index] = task

    role = "FRONTEND_DEV" if task.get("agentRole") == "FRONTEND_DEV" else "BACKEND_DEV"

    try:
        result = _run_agent(
            state,
            role,
            task["id"],
            lambda: developer_agent.implement_task(
                task=task,
                architecture=state.get("architecture") or {},
                workspace=workspace,
                failure_output=state.get("last_failure"),
                client_feedback=state.get("client_feedback"),
            ),
        )
        written = developer_agent.write_files(workspace, result.data.get("files") or [])
    except Exception as exc:
        log.exception("developer agent failed")
        backend.update_task(task["id"], status="TEST_FAILED", lastTestOutput=str(exc)[:4000])
        tasks[index] = {**task, "status": "TEST_FAILED"}
        return {**state, "tasks": tasks, "last_failure": f"Developer agent error: {exc}", "dev_error": True}

    backend.update_task(
        task["id"],
        status="CODE_REVIEW",
        filesJson={"files": written, "summary": result.data.get("summary", "")},
    )
    backend.log(
        project_id,
        "CODE_WRITTEN",
        f"{task['title']}: wrote {len(written)} file(s) — {', '.join(written) or 'none'}",
        {"taskId": task["id"], "files": written},
    )

    return {**state, "tasks": tasks, "dev_error": False}


def qa_node(state: WFState) -> WFState:
    tasks = state["tasks"]
    index = state["task_index"]
    task = tasks[index]
    project_id = state["project_id"]
    workspace = Path(state["workspace"])

    backend.set_status(project_id, "QA", f"QA agent is running the test suite for: {task['title']}")
    backend.update_task(task["id"], status="QA")

    run_id = backend.start_agent_run(project_id, "QA_ENGINEER", f"node --test ({qa_agent.sandbox_mode()})", task["id"])
    result = qa_agent.run_real_tests(workspace)
    backend.finish_agent_run(
        run_id,
        "SUCCESS" if result.passed else "FAILED",
        summary=result.summary(),
        error=None if result.passed else result.output[-1500:],
    )

    backend.log(
        project_id,
        "TEST_RUN",
        f"{task['title']}: {result.summary()}",
        {
            "taskId": task["id"],
            "passed": result.passed,
            "exitCode": result.exit_code,
            "testsPassed": result.tests_passed,
            "testsTotal": result.tests_total,
            "output": result.output[-4000:],
        },
    )

    previous_failures = task.get("lastFailureCount")
    backend.update_task(
        task["id"],
        status="DONE" if result.passed else "TEST_FAILED",
        lastTestOutput=result.output[-8000:],
        lastFailureCount=result.failure_count,
    )

    tasks[index] = {
        **task,
        "status": "DONE" if result.passed else "TEST_FAILED",
        "lastFailureCount": result.failure_count,
        "_previousFailureCount": previous_failures,
    }

    return {
        **state,
        "tasks": tasks,
        "last_failure": None if result.passed else result.output[-6000:],
    }


def devops_node(state: WFState) -> WFState:
    project_id = state["project_id"]
    workspace = Path(state["workspace"])

    backend.set_status(project_id, "QA", "All tasks passed QA. Handing over to DevOps.")

    run_id = backend.start_agent_run(project_id, "DEVOPS", "node server.js + smoke test")
    deploy = devops_agent.deploy_staging(project_id, workspace)
    backend.finish_agent_run(
        run_id,
        "SUCCESS" if deploy.ok else "FAILED",
        summary=deploy.detail,
        error=None if deploy.ok else deploy.detail,
    )

    if not deploy.ok:
        backend.set_status(
            project_id,
            "BLOCKED",
            f"Staging deploy failed its smoke test: {deploy.detail}",
            blockedReason=deploy.detail[:500],
        )
        return {**state, "blocked": True}

    snapshot.save(project_id, workspace)
    backend.set_status(
        project_id,
        "STAGING_REVIEW",
        f"Staging preview is live at {deploy.url} and answered the smoke test.",
        stagingUrl=deploy.url,
        data={"port": deploy.port, "statusCode": deploy.status_code},
    )
    return state


def production_node(state: WFState) -> WFState:
    project_id = state["project_id"]
    project = backend.get_project(project_id)
    workspace = settings.WORKSPACE_ROOT / project_id
    # Approval can come days after staging; on a host that wiped its disk in
    # between, the code comes back from the snapshot saved at staging.
    if not (workspace / "server.js").exists():
        snapshot.restore(project_id, workspace)

    run_id = backend.start_agent_run(project_id, "DEVOPS", "production deploy + smoke test")
    deploy = devops_agent.deploy_production(project_id, workspace)
    backend.finish_agent_run(
        run_id,
        "SUCCESS" if deploy.ok else "FAILED",
        summary=deploy.detail,
        error=None if deploy.ok else deploy.detail,
    )

    if not deploy.ok:
        backend.set_status(
            project_id,
            "BLOCKED",
            f"Production deploy failed its smoke test: {deploy.detail}",
            blockedReason=deploy.detail[:500],
        )
        return {**state, "blocked": True}

    done = len([t for t in project.get("tasks") or [] if t.get("status") == "DONE"])
    summary = (
        f"Released {project['title']}. {done} task(s) built and verified by real test runs. "
        f"Production URL: {deploy.url}"
    )

    backend.set_status(
        project_id,
        "COMPLETED",
        summary,
        productionUrl=deploy.url,
        releaseSummary=summary,
    )
    return state


# --------------------------------------------------------------------------
# routing
# --------------------------------------------------------------------------

def entry_router(state: WFState) -> str:
    return {"plan": "pm", "build": "prepare_build", "deploy_prod": "production"}[state["phase"]]


def after_prepare(state: WFState) -> str:
    return "developer" if state.get("tasks") else "devops"


def after_developer(state: WFState) -> str:
    # A crashed developer wrote nothing, so the existing tests would still pass
    # and QA would wrongly mark the task DONE. Retry it instead.
    if not state.get("dev_error"):
        return "qa"
    task = state["tasks"][state["task_index"]]
    return "escalate" if task.get("attempts", 0) >= settings.MAX_SELF_REPAIR_RETRIES else "retry"


def after_qa(state: WFState) -> str:
    """
    dev -> QA -> retry (bounded) -> escalate.

    The retry budget is per task and separate from the client's revision budget.
    A retry that does not reduce the failure count is escalated early; grinding
    the same error through three identical attempts just burns tokens.
    """
    tasks = state["tasks"]
    index = state["task_index"]
    task = tasks[index]

    if task.get("status") == "DONE":
        return "next_task"

    attempts = task.get("attempts", 0)
    if attempts >= settings.MAX_SELF_REPAIR_RETRIES:
        return "escalate"

    previous = task.get("_previousFailureCount")
    current = task.get("lastFailureCount") or 0
    if previous is not None and attempts >= 2 and current >= previous:
        return "escalate"

    return "retry"


def advance_node(state: WFState) -> WFState:
    return {**state, "task_index": state["task_index"] + 1, "last_failure": None}


def after_advance(state: WFState) -> str:
    return "developer" if state["task_index"] < len(state["tasks"]) else "devops"


def escalate_node(state: WFState) -> WFState:
    tasks = state["tasks"]
    task = tasks[state["task_index"]]
    project_id = state["project_id"]

    backend.update_task(task["id"], status="BLOCKED")

    attempts = task.get("attempts", 0)
    if state.get("dev_error"):
        why = (
            f"could not produce usable code in {attempts} attempts "
            f"(last error: {(state.get('last_failure') or '')[:200]})"
        )
    elif attempts >= settings.MAX_SELF_REPAIR_RETRIES:
        why = (
            f"exhausted all {settings.MAX_SELF_REPAIR_RETRIES} self-repair attempts"
        )
    else:
        why = (
            f"stopped making progress after {attempts} of "
            f"{settings.MAX_SELF_REPAIR_RETRIES} self-repair attempts "
            f"(the failure count did not drop), so it was escalated early"
        )

    problem = "is blocked" if state.get("dev_error") else "still fails QA"
    reason = (
        f"'{task['title']}' {problem}: the developer agent {why}. "
        "A human needs to look at it. No client revision was used."
    )
    backend.set_status(project_id, "BLOCKED", reason, blockedReason=reason[:500])
    return {**state, "blocked": True}


def build_workflow_graph():
    graph = StateGraph(WFState)

    graph.add_node("pm", pm_node)
    graph.add_node("architect", architect_node)
    graph.add_node("prepare_build", prepare_build_node)
    graph.add_node("developer", developer_node)
    graph.add_node("qa", qa_node)
    graph.add_node("advance", advance_node)
    graph.add_node("escalate", escalate_node)
    graph.add_node("devops", devops_node)
    graph.add_node("production", production_node)

    graph.set_conditional_entry_point(
        entry_router,
        {"pm": "pm", "prepare_build": "prepare_build", "production": "production"},
    )

    graph.add_edge("pm", "architect")
    graph.add_edge("architect", END)

    graph.add_conditional_edges(
        "prepare_build", after_prepare, {"developer": "developer", "devops": "devops"}
    )
    graph.add_conditional_edges(
        "developer",
        after_developer,
        {"qa": "qa", "retry": "developer", "escalate": "escalate"},
    )
    graph.add_conditional_edges(
        "qa",
        after_qa,
        {"retry": "developer", "next_task": "advance", "escalate": "escalate"},
    )
    graph.add_conditional_edges(
        "advance", after_advance, {"developer": "developer", "devops": "devops"}
    )
    graph.add_edge("escalate", END)
    graph.add_edge("devops", END)
    graph.add_edge("production", END)

    return graph.compile()


workflow_graph = build_workflow_graph()
