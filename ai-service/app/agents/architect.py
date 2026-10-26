from __future__ import annotations

import json
from typing import Any

from ..llm import UNTRUSTED_GUARD, complete_json, fence

SYSTEM = f"""You are the Technical Architect at an AI software agency.
Given a client brief and the Project Manager's plan, produce the system design,
the data model and an OpenAPI-style contract the developer agents must honour.

{UNTRUSTED_GUARD}

The stack is fixed: one dependency-free Node.js app. Routes are pure functions
handler({{params, query, body, headers}}) -> {{status, body, headers?}}. Data lives in an in-memory
store exposing list/get/create/update/remove. Do not propose other libraries,
databases or frameworks.

Return ONLY JSON:
{{
  "overview": "3-5 sentences on the design",
  "components": [{{"name":"...","responsibility":"...","files":["src/routes.js"]}}],
  "dataModel": [{{"collection":"items","fields":[{{"name":"id","type":"string","notes":"assigned by the store"}}]}}],
  "apiContract": {{
    "openapi": "3.0.0",
    "info": {{"title":"...","version":"1.0.0"}},
    "paths": {{
      "/api/items": {{
        "get": {{"summary":"...","responses":{{"200":{{"description":"..."}}}}}}
      }}
    }}
  }},
  "decisions": [{{"decision":"...","reason":"..."}}]
}}"""


def _mock_architecture(title: str) -> dict[str, Any]:
    return {
        "overview": (
            f"{title} is a single Node process. node:http handles transport, "
            "src/router.js matches a path to a pure handler, and src/store.js keeps "
            "records in memory. Handlers return plain objects, so tests call them "
            "directly without binding a port."
        ),
        "components": [
            {"name": "HTTP server", "responsibility": "Transport and static files", "files": ["server.js"]},
            {"name": "Router", "responsibility": "Path matching and error trapping", "files": ["src/router.js"]},
            {"name": "Routes", "responsibility": "Business logic per endpoint", "files": ["src/routes.js"]},
            {"name": "Store", "responsibility": "In-memory persistence", "files": ["src/store.js"]},
            {"name": "Frontend", "responsibility": "Rendering and API calls", "files": ["public/app.js", "public/index.html"]},
        ],
        "dataModel": [
            {
                "collection": "items",
                "fields": [
                    {"name": "id", "type": "string", "notes": "assigned by the store"},
                    {"name": "title", "type": "string", "notes": "required, non-empty"},
                    {"name": "done", "type": "boolean", "notes": "defaults to false"},
                    {"name": "createdAt", "type": "string", "notes": "ISO timestamp"},
                ],
            }
        ],
        "apiContract": {
            "openapi": "3.0.0",
            "info": {"title": title, "version": "1.0.0"},
            "paths": {
                "/api/health": {"get": {"summary": "Liveness", "responses": {"200": {"description": "ok"}}}},
                "/api/items": {
                    "get": {"summary": "List items", "responses": {"200": {"description": "array of items"}}},
                    "post": {"summary": "Create an item", "responses": {"201": {"description": "created"}, "400": {"description": "title missing"}}},
                },
                "/api/items/{id}": {
                    "get": {"summary": "Fetch one item", "responses": {"200": {"description": "item"}, "404": {"description": "missing"}}},
                    "delete": {"summary": "Delete an item", "responses": {"204": {"description": "deleted"}, "404": {"description": "missing"}}},
                },
            },
        },
        "decisions": [
            {"decision": "Pure-function handlers", "reason": "Tests assert on real return values without a live port"},
            {"decision": "No dependencies", "reason": "QA runs immediately; nothing to install or audit"},
        ],
    }


def design_system(*, title: str, requirements: str, plan: dict):
    user = "\n\n".join(
        [
            fence("CLIENT_BRIEF", f"Title: {title}\n\n{requirements}"),
            fence("PROJECT_PLAN", json.dumps(plan, indent=2)[:6000]),
            "Produce the architecture and the API contract.",
        ]
    )
    return complete_json(system=SYSTEM, user=user, mock=lambda: _mock_architecture(title))
