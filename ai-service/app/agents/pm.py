from __future__ import annotations

import json
from typing import Any

from ..llm import UNTRUSTED_GUARD, complete_json, fence

SYSTEM = f"""You are the Project Manager at a software agency staffed entirely by AI.
Turn a client brief into a scope, milestones and a concrete task list.

{UNTRUSTED_GUARD}

The engineering team builds ONE dependency-free Node.js app with this shape:
  server.js            node:http server, serves public/ and mounts /api/*
  src/routes.js        array of routes; handler({{params, query, body, headers}}) -> {{status, body, headers?}}
  src/store.js         in-memory store: list/get/create/update/remove
  public/index.html    frontend markup
  public/app.js        vanilla JS frontend, talks to /api/*
  tests/*.test.js      node:test suites

Rules for the task list:
- Between 3 and 8 tasks. Every task must be completable by editing the files above.
- agentRole is exactly "BACKEND_DEV" (server, routes, data) or "FRONTEND_DEV" (public/).
- Give each task a stable key: t1, t2, t3...
- dependsOn lists keys of tasks that must finish first. Frontend work that
  consumes an API depends on the backend task that creates it. No cycles.
- Order tasks so dependencies come first.

Return ONLY JSON:
{{
  "scope": "2-4 sentences on what will be built and what is out of scope",
  "assumptions": ["..."],
  "milestones": [{{"name": "...", "deliverable": "..."}}],
  "tasks": [
    {{"key":"t1","title":"...","description":"what to build, concretely, including file paths",
      "agentRole":"BACKEND_DEV","dependsOn":[]}}
  ],
  "risks": ["..."]
}}"""


def _mock_plan(title: str) -> dict[str, Any]:
    return {
        "scope": (
            f"Build {title} as a small dependency-free Node app with a JSON API and a "
            "vanilla-JS frontend. Covers core CRUD and a simple UI. Out of scope: "
            "authentication, persistence beyond process memory, and deployment hardening."
        ),
        "assumptions": [
            "A single in-memory collection is enough for the demo",
            "No authentication is required",
        ],
        "milestones": [
            {"name": "API", "deliverable": "CRUD endpoints under /api"},
            {"name": "UI", "deliverable": "Frontend that lists and creates items"},
        ],
        "tasks": [
            {
                "key": "t1",
                "title": "Build the items API",
                "description": (
                    "In src/routes.js add GET /api/items, POST /api/items, "
                    "GET /api/items/:id and DELETE /api/items/:id backed by store.js. "
                    "POST validates that title is a non-empty string and returns 400 otherwise."
                ),
                "agentRole": "BACKEND_DEV",
                "dependsOn": [],
            },
            {
                "key": "t2",
                "title": "Add tests for the items API",
                "description": (
                    "Add tests/items.test.js covering create, list, fetch-by-id, "
                    "delete and the 400 validation path, calling handle() directly."
                ),
                "agentRole": "BACKEND_DEV",
                "dependsOn": ["t1"],
            },
            {
                "key": "t3",
                "title": "Build the frontend list and form",
                "description": (
                    "In public/app.js and public/index.html render the item list from "
                    "GET /api/items and add a form that POSTs a new item and refreshes."
                ),
                "agentRole": "FRONTEND_DEV",
                "dependsOn": ["t1"],
            },
        ],
        "risks": ["In-memory data is lost on restart"],
    }


def plan_project(
    *,
    title: str,
    requirements: str,
    budget: float,
    deadline: str | None,
    previous_plan: dict | None = None,
    client_feedback: str | None = None,
):
    """
    Produce (or revise) the plan.

    On a revision the model gets the original brief AND the previous plan AND
    the client's feedback — feedback alone loses the context that made the
    first plan reasonable.
    """
    parts = [
        fence("CLIENT_BRIEF", f"Title: {title}\nBudget: {budget}\nDeadline: {deadline or 'none'}\n\n{requirements}")
    ]

    if previous_plan and client_feedback:
        parts.append(fence("PREVIOUS_PLAN", json.dumps(previous_plan, indent=2)[:6000]))
        parts.append(fence("CLIENT_FEEDBACK", client_feedback))
        parts.append(
            "Revise the previous plan so it satisfies the feedback. Keep everything "
            "the client did not complain about. Explain nothing outside the JSON."
        )
    else:
        parts.append("Produce the initial plan.")

    return complete_json(
        system=SYSTEM,
        user="\n\n".join(parts),
        mock=lambda: _mock_plan(title),
    )
