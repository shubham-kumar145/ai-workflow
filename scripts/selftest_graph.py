"""
End-to-end exercise of the agent graph with an in-memory stand-in for Express.

Proves the parts that matter without needing the Node backend running:
  * PM -> Architect produce a plan, tasks and a version snapshot
  * the developer agent writes real files into a real workspace
  * the QA agent actually executes the test suite and reports the real exit code
  * a deliberately broken task is retried and then escalated to BLOCKED
  * DevOps boots the generated app and smoke-tests it over real HTTP

Run from ai-service/:  .venv/bin/python ../scripts/selftest_graph.py
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ai-service"))

from app.agents import devops as devops_agent  # noqa: E402
from app.config import settings  # noqa: E402
from app.graph import build_graph as G  # noqa: E402


class FakeBackend:
    """Mirrors BackendClient's interface, backed by dictionaries."""

    def __init__(self, project: dict):
        self.project = project
        self.tasks: list[dict] = []
        self.versions: list[dict] = []
        self.runs: dict[str, dict] = {}
        self.events: list[tuple[str, str]] = []
        self.statuses: list[str] = []

    def get_project(self, project_id):
        return {**self.project, "tasks": self.tasks, "versions": list(reversed(self.versions))}

    def create_version(self, project_id, label, plan=None, architecture=None, api_contract=None):
        version = {
            "id": str(uuid.uuid4()),
            "versionNumber": len(self.versions) + 1,
            "label": label,
            "planJson": plan,
            "architectureJson": architecture,
            "apiContractJson": api_contract,
        }
        self.versions.append(version)
        return version

    def replace_tasks(self, project_id, tasks):
        key_to_id = {}
        self.tasks = []
        for t in tasks:
            tid = str(uuid.uuid4())
            key_to_id[t["key"]] = tid
            self.tasks.append(
                {
                    "id": tid,
                    "title": t["title"],
                    "description": t["description"],
                    "agentRole": t["agentRole"],
                    "orderIndex": t["orderIndex"],
                    "status": "PENDING",
                    "attempts": 0,
                    "_dependsOn": t["dependsOn"],
                }
            )
        for task, spec in zip(self.tasks, tasks):
            task["dependencies"] = [
                {"id": key_to_id[k]} for k in spec["dependsOn"] if k in key_to_id
            ]
        return self.tasks

    def update_task(self, task_id, **fields):
        for task in self.tasks:
            if task["id"] == task_id:
                if fields.pop("incrementAttempts", False):
                    task["attempts"] = task.get("attempts", 0) + 1
                task.update({k: v for k, v in fields.items() if v is not None})
                return task
        raise KeyError(task_id)

    def start_agent_run(self, project_id, agent_role, model, task_id=None):
        run_id = str(uuid.uuid4())
        self.runs[run_id] = {"agentRole": agent_role, "model": model}
        return run_id

    def finish_agent_run(self, run_id, status, **kw):
        self.runs[run_id].update(status=status, **kw)
        self.project["costUsd"] = self.project.get("costUsd", 0) + kw.get("cost_usd", 0)
        return {"projectCostUsd": self.project["costUsd"]}

    def set_status(self, project_id, to, message, **patch):
        self.project["status"] = to
        self.project.update({k: v for k, v in patch.items() if k != "data" and v is not None})
        self.statuses.append(to)
        print(f"   [status] -> {to}: {message[:95]}")
        return self.project

    def log(self, project_id, type_, message, data=None):
        self.events.append((type_, message))
        print(f"   [event ] {type_}: {message[:95]}")
        return {"id": "evt"}


def make_project(title="Task Manager App"):
    return {
        "id": str(uuid.uuid4()),
        "title": title,
        "requirements": (
            "Build a task manager where a user can add tasks, see the list of tasks, "
            "open a single task and delete a task. Keep it simple and dependency-free."
        ),
        "budget": 500,
        "deadline": None,
        "status": "PLANNING",
        "costUsd": 0,
        "budgetCapUsd": 5,
    }


def section(title):
    print(f"\n{'=' * 72}\n{title}\n{'=' * 72}")


def main() -> int:
    failures: list[str] = []
    project = make_project()
    fake = FakeBackend(project)
    G.backend = fake
    for module in (G.developer_agent, G.qa_agent, G.devops_agent):
        if hasattr(module, "backend"):
            module.backend = fake

    pid = project["id"]
    graph = G.build_workflow_graph()

    # ---------------------------------------------------------------- plan
    section("PHASE 1  plan  (PM -> Architect -> client approval gate)")
    graph.invoke(
        {"project_id": pid, "phase": "plan", "project": project, "task_index": 0, "tasks": []},
        config={"recursion_limit": 150},
    )

    if project["status"] != "CLIENT_APPROVAL_PLAN":
        failures.append(f"expected CLIENT_APPROVAL_PLAN, got {project['status']}")
    if not fake.tasks:
        failures.append("planner produced no tasks")
    if not fake.versions or not fake.versions[-1].get("apiContractJson"):
        failures.append("no API contract in the version snapshot")
    print(f"\n   tasks planned: {len(fake.tasks)}")
    for t in fake.tasks:
        deps = [d['id'][:8] for d in t.get('dependencies', [])]
        print(f"     - [{t['agentRole']:12}] {t['title']}  deps={deps}")

    # --------------------------------------------------------------- build
    section("PHASE 2  build  (developer -> REAL test execution -> DevOps)")
    graph.invoke(
        {
            "project_id": pid,
            "phase": "build",
            "project": fake.get_project(pid),
            "task_index": 0,
            "tasks": [],
        },
        config={"recursion_limit": 150},
    )

    workspace = settings.WORKSPACE_ROOT / pid
    print(f"\n   workspace: {workspace}")
    generated = sorted(
        str(p.relative_to(workspace)) for p in workspace.rglob("*") if p.is_file()
    )
    print(f"   files on disk ({len(generated)}): {', '.join(generated)}")

    if project["status"] != "STAGING_REVIEW":
        failures.append(f"expected STAGING_REVIEW, got {project['status']}")
    if not project.get("stagingUrl"):
        failures.append("no staging URL was produced")
    if not any(e[0] == "TEST_RUN" for e in fake.events):
        failures.append("QA never ran")
    if not (workspace / "tests" / "items.test.js").exists():
        failures.append("the developer agent did not write the test file")

    # The staging URL must be a server that really answers.
    import urllib.request

    try:
        with urllib.request.urlopen(f"{project['stagingUrl']}/api/items", timeout=5) as res:
            print(f"   live check: GET {project['stagingUrl']}/api/items -> {res.getcode()}")
            if res.getcode() != 200:
                failures.append("staging /api/items did not return 200")
    except Exception as exc:
        failures.append(f"staging URL not reachable: {exc}")

    # ---------------------------------------------- production + self-repair
    section("PHASE 3  production deploy")
    graph.invoke(
        {"project_id": pid, "phase": "deploy_prod", "project": fake.get_project(pid), "tasks": [], "task_index": 0},
        config={"recursion_limit": 150},
    )
    if project["status"] != "COMPLETED":
        failures.append(f"expected COMPLETED, got {project['status']}")
    print(f"\n   production URL: {project.get('productionUrl')}")

    section("PHASE 4  self-repair budget  (a task that can never pass)")
    broken_project = make_project("Broken On Purpose")
    broken = FakeBackend(broken_project)
    G.backend = broken
    bpid = broken_project["id"]

    broken_ws = G.developer_agent.ensure_workspace(bpid, reset=True)
    (broken_ws / "tests" / "always_fails.test.js").write_text(
        'import test from "node:test";\n'
        'import assert from "node:assert/strict";\n'
        'test("this can never pass", () => assert.equal(1, 2));\n',
        encoding="utf-8",
    )
    broken.tasks = [
        {
            "id": str(uuid.uuid4()),
            "title": "Fix the impossible test",
            "description": "Make the failing suite pass.",
            "agentRole": "BACKEND_DEV",
            "orderIndex": 0,
            "status": "PENDING",
            "attempts": 0,
            "dependencies": [],
        }
    ]
    graph.invoke(
        {
            "project_id": bpid,
            "phase": "build",
            "project": broken.get_project(bpid),
            "task_index": 0,
            "tasks": [],
        },
        config={"recursion_limit": 150},
    )

    attempts = broken.tasks[0]["attempts"]
    print(f"\n   attempts used: {attempts} (limit {settings.MAX_SELF_REPAIR_RETRIES})")
    print(f"   final status : {broken_project['status']}")
    if broken_project["status"] != "BLOCKED":
        failures.append(f"a permanently failing task should end BLOCKED, got {broken_project['status']}")
    if attempts > settings.MAX_SELF_REPAIR_RETRIES:
        failures.append(f"self-repair exceeded its budget: {attempts}")
    if broken_project.get("planRevisionCount", 0) or broken_project.get("buildRevisionCount", 0):
        failures.append("self-repair consumed a client revision - the counters are not separate")

    devops_agent.shutdown_all()

    section("RESULT")
    if failures:
        for f in failures:
            print(f"   FAIL  {f}")
        return 1
    print("   All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
