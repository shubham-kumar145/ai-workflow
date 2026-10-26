from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from ..config import settings
from ..llm import UNTRUSTED_GUARD, complete_json, fence

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "starter"

# Agents may only write inside these. Anything else is rejected.
ALLOWED_PREFIXES = ("src/", "public/", "tests/")
ALLOWED_ROOT_FILES = ("server.js", "README.md")
MAX_FILE_BYTES = 120_000

def _system_prompt(role: str) -> str:
    """Built by interpolation, never str.format: the prompt is full of JSON braces."""
    return SYSTEM_TEMPLATE.replace("__ROLE__", role)


SYSTEM_TEMPLATE = f"""You are a __ROLE__ at an AI software agency. You are implementing ONE task
in an existing dependency-free Node.js codebase.

{UNTRUSTED_GUARD}

House rules, which are not negotiable:
- ES modules only (`import`/`export`). The package has NO dependencies and you
  must not add any. Node built-ins only.
- Routes are pure: handler({{params, query, body, headers}}) -> {{status, body, headers?}}.
  headers are the lowercased request headers (read cookies from headers.cookie,
  tokens from headers.authorization). Return response headers such as
  "Set-Cookie" in the result's headers. src/router.js and server.js already pass
  both through; tests send them as handle(routes, {{method, path, body, headers}}).
  Never bind a port and never call process.exit.
- server.js already works; leave it alone unless the task needs it. If you do
  change it, it must still call server.listen(PORT) unconditionally at the top
  level. Never wrap listen in an "is this the main module" check: tests never
  import server.js, and such checks break on Windows paths.
- If src/store.js saves data to a file, it must not load, save or delete that
  file when process.env.NODE_TEST_CONTEXT is set (node --test sets it). Test
  files run in parallel and would otherwise clobber each other and wipe the
  running app's data; under test the store stays purely in memory.
- Every import of a project file is relative and starts with ./ or ../
  (server.js uses "./src/router.js", never "src/router.js"). A bare path is
  treated as an npm package and the server will not start. QA starts
  server.js after the tests and fails the task if /api/health does not answer.
- Extend `routes` in src/routes.js; keep the existing /api/health route.
- Tests use `node:test` and `node:assert/strict`, live in tests/, end in
  .test.js, and call handle(routes, ...) directly rather than over HTTP.
  Import each name from the file that exports it:
    import {{ handle }} from "../src/router.js";
    import {{ routes }} from "../src/routes.js";
    import {{ store }} from "../src/store.js";
  Call store.reset() in a beforeEach so tests do not leak state into each other.
- Change only the files YOUR_TASK is about. A tests task writes tests/ and
  does not rewrite public/ or the routes; a backend task does not restyle the UI.
- public/index.html and public/app.js must agree: every id that app.js looks
  up with getElementById must exist in index.html (or be created by app.js),
  and every function an inline onclick calls must be global (window.fn = ...).
  When you change one, read the other in CURRENT_CODEBASE and keep them in
  step. QA fails the task when app.js looks up an id that exists nowhere.
- You must return the COMPLETE new content of every file you touch, not a diff
  and not an excerpt. Files you do not return are left untouched.
- Paths are relative and may only be under src/, public/, tests/, or be
  server.js or README.md.

Return ONLY JSON:
{{
  "summary": "one or two sentences on what you changed",
  "files": [{{"path": "src/routes.js", "content": "<the entire file>"}}]
}}"""


class UnsafePathError(ValueError):
    pass


def ensure_workspace(project_id: str, reset: bool = False) -> Path:
    """Copy the starter template into this project's workspace."""
    workspace = settings.WORKSPACE_ROOT / project_id
    if reset and workspace.exists():
        shutil.rmtree(workspace)
    if not workspace.exists():
        shutil.copytree(TEMPLATE_DIR, workspace)
    return workspace


def _safe_target(workspace: Path, rel_path: str) -> Path:
    rel = rel_path.strip().lstrip("/").replace("\\", "/")
    if not rel:
        raise UnsafePathError("empty path")
    if ".." in rel.split("/"):
        raise UnsafePathError(f"path traversal: {rel_path}")
    if not (rel.startswith(ALLOWED_PREFIXES) or rel in ALLOWED_ROOT_FILES):
        raise UnsafePathError(f"path outside the allowed directories: {rel_path}")

    target = (workspace / rel).resolve()
    if not str(target).startswith(str(workspace.resolve())):
        raise UnsafePathError(f"escapes the workspace: {rel_path}")
    return target


def read_workspace(workspace: Path, role: str = "BACKEND_DEV", limit_bytes: int = 120_000) -> str:
    """A view of the current code, so the agent edits rather than invents.

    The files a role edits come first: a frontend agent that never saw
    index.html invents element ids that match nothing.
    """
    tests = sorted(
        str(p.relative_to(workspace)).replace("\\", "/")
        for p in (workspace / "tests").glob("*.test.js")
    )
    backend = ["src/routes.js", "src/store.js", "src/router.js", *tests]
    frontend = ["public/index.html", "public/app.js", "public/styles.css"]
    interesting = frontend + backend if role == "FRONTEND_DEV" else backend + frontend
    chunks: list[str] = []
    used = 0
    for rel in interesting:
        path = workspace / rel
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if used + len(text) > limit_bytes:
            text = text[: max(0, limit_bytes - used)] + "\n/* ...truncated... */"
        chunks.append(f"--- {rel} ---\n{text}")
        used += len(text)
        if used >= limit_bytes:
            break

    existing = sorted(
        str(p.relative_to(workspace)).replace("\\", "/")
        for p in workspace.rglob("*")
        if p.is_file() and "node_modules" not in p.parts
    )
    return f"FILES PRESENT: {', '.join(existing)}\n\n" + "\n\n".join(chunks)


def _mock_files(task: dict[str, Any], workspace: Path) -> dict[str, Any]:
    """
    Mock mode still produces real, working, test-passing code — it just does not
    call a language model to do it.
    """
    role = task.get("agentRole", "BACKEND_DEV")
    title = task.get("title", "task")

    if role == "FRONTEND_DEV":
        app_js = (
            'const statusEl = document.getElementById("status");\n'
            'const app = document.getElementById("app");\n\n'
            "async function api(path, options) {\n"
            '  const res = await fetch(path, {\n'
            '    headers: { "Content-Type": "application/json" },\n'
            "    ...options,\n"
            "    body: options?.body ? JSON.stringify(options.body) : undefined,\n"
            "  });\n"
            "  return res.status === 204 ? null : res.json();\n"
            "}\n\n"
            "async function render() {\n"
            '  const items = await api("/api/items");\n'
            "  app.innerHTML = `\n"
            '    <form class="card" id="form">\n'
            '      <label>New item<input name="title" placeholder="Something to do" required /></label>\n'
            "      <p><button type=\"submit\">Add item</button></p>\n"
            "    </form>\n"
            '    <div class="card">\n'
            "      <h2>Items (${items.length})</h2>\n"
            "      <ul>${items.map((i) => `<li>${i.title}</li>`).join('') || '<li>Nothing yet</li>'}</ul>\n"
            "    </div>`;\n\n"
            '  document.getElementById("form").addEventListener("submit", async (e) => {\n'
            "    e.preventDefault();\n"
            "    const title = new FormData(e.target).get('title');\n"
            '    await api("/api/items", { method: "POST", body: { title } });\n'
            "    render();\n"
            "  });\n"
            "}\n\n"
            "async function init() {\n"
            "  try {\n"
            '    const health = await api("/api/health");\n'
            '    statusEl.textContent = health.ok ? "API online" : "API error";\n'
            "    await render();\n"
            "  } catch {\n"
            '    statusEl.textContent = "API offline";\n'
            "  }\n"
            "}\n\ninit();\n"
        )
        return {
            "summary": f"Rendered the item list and an add-item form for: {title}",
            "files": [{"path": "public/app.js", "content": app_js}],
        }

    routes_path = workspace / "src" / "routes.js"
    already = routes_path.exists() and "/api/items" in routes_path.read_text(encoding="utf-8")

    if not already:
        routes_js = (
            'import { store } from "./store.js";\n\n'
            "export const routes = [\n"
            "  {\n"
            '    method: "GET",\n'
            '    path: "/api/health",\n'
            '    handler: () => ({ status: 200, body: { ok: true, service: "generated-app" } }),\n'
            "  },\n"
            "  {\n"
            '    method: "GET",\n'
            '    path: "/api/items",\n'
            '    handler: () => ({ status: 200, body: store.list("items") }),\n'
            "  },\n"
            "  {\n"
            '    method: "POST",\n'
            '    path: "/api/items",\n'
            "    handler: ({ body }) => {\n"
            '      const title = body && typeof body.title === "string" ? body.title.trim() : "";\n'
            '      if (!title) return { status: 400, body: { error: "title is required" } };\n'
            '      return { status: 201, body: store.create("items", { title, done: false }) };\n'
            "    },\n"
            "  },\n"
            "  {\n"
            '    method: "GET",\n'
            '    path: "/api/items/:id",\n'
            "    handler: ({ params }) => {\n"
            '      const item = store.get("items", params.id);\n'
            '      return item ? { status: 200, body: item } : { status: 404, body: { error: "Not found" } };\n'
            "    },\n"
            "  },\n"
            "  {\n"
            '    method: "DELETE",\n'
            '    path: "/api/items/:id",\n'
            "    handler: ({ params }) =>\n"
            '      store.remove("items", params.id)\n'
            "        ? { status: 204, body: null }\n"
            '        : { status: 404, body: { error: "Not found" } },\n'
            "  },\n"
            "];\n\n"
            "export { store };\n"
        )
        return {
            "summary": f"Implemented the items API: {title}",
            "files": [{"path": "src/routes.js", "content": routes_js}],
        }

    tests_js = (
        'import test, { beforeEach } from "node:test";\n'
        'import assert from "node:assert/strict";\n'
        'import { routes } from "../src/routes.js";\n'
        'import { store } from "../src/store.js";\n'
        'import { handle } from "../src/router.js";\n\n'
        "beforeEach(() => store.reset());\n\n"
        'test("creating an item returns 201 and the record", async () => {\n'
        '  const res = await handle(routes, { method: "POST", path: "/api/items", body: { title: "Write tests" } });\n'
        "  assert.equal(res.status, 201);\n"
        '  assert.equal(res.body.title, "Write tests");\n'
        "  assert.ok(res.body.id);\n"
        "});\n\n"
        'test("a blank title is rejected with 400", async () => {\n'
        '  const res = await handle(routes, { method: "POST", path: "/api/items", body: { title: "   " } });\n'
        "  assert.equal(res.status, 400);\n"
        "});\n\n"
        'test("listing returns created items", async () => {\n'
        '  await handle(routes, { method: "POST", path: "/api/items", body: { title: "One" } });\n'
        '  const res = await handle(routes, { method: "GET", path: "/api/items" });\n'
        "  assert.equal(res.status, 200);\n"
        "  assert.equal(res.body.length, 1);\n"
        "});\n\n"
        'test("fetching a missing item returns 404", async () => {\n'
        '  const res = await handle(routes, { method: "GET", path: "/api/items/999" });\n'
        "  assert.equal(res.status, 404);\n"
        "});\n\n"
        'test("deleting an item returns 204 then 404", async () => {\n'
        '  const created = await handle(routes, { method: "POST", path: "/api/items", body: { title: "Temp" } });\n'
        '  const del = await handle(routes, { method: "DELETE", path: `/api/items/${created.body.id}` });\n'
        "  assert.equal(del.status, 204);\n"
        '  const again = await handle(routes, { method: "DELETE", path: `/api/items/${created.body.id}` });\n'
        "  assert.equal(again.status, 404);\n"
        "});\n"
    )
    return {
        "summary": f"Added node:test coverage for the items API: {title}",
        "files": [{"path": "tests/items.test.js", "content": tests_js}],
    }


def implement_task(
    *,
    task: dict[str, Any],
    architecture: dict,
    workspace: Path,
    failure_output: str | None = None,
    client_feedback: str | None = None,
):
    """One developer attempt. On a retry the real test output is fed back in."""
    role = "Frontend Developer" if task.get("agentRole") == "FRONTEND_DEV" else "Backend Developer"

    parts = [
        fence("ARCHITECTURE", json.dumps(architecture, indent=2)[:5000]),
        fence("CURRENT_CODEBASE", read_workspace(workspace, task.get("agentRole", "BACKEND_DEV"))),
        fence(
            "YOUR_TASK",
            f"{task.get('title')}\n\n{task.get('description', '')}",
        ),
    ]

    if failure_output:
        parts.append(fence("FAILING_TEST_OUTPUT", failure_output[:6000]))
        parts.append(
            "Your previous attempt failed the tests above. Read the actual error, "
            "fix the cause, and return the complete corrected files. Do not weaken "
            "or delete a test to make it pass."
        )
    if client_feedback:
        parts.append(fence("CLIENT_FEEDBACK", client_feedback))
        parts.append(
            "The client asked for the changes above. Apply the parts that belong to "
            "YOUR_TASK. If an existing test asserts behaviour the client has now asked "
            "to change, update that test to the new behaviour and return the whole "
            "test file. That is not weakening a test; keep every other assertion."
        )

    return complete_json(
        system=_system_prompt(role),
        user="\n\n".join(parts),
        mock=lambda: _mock_files(task, workspace),
        # Whole files come back inside JSON; 6000 cut real frontends off mid-string.
        max_tokens=16000,
    )


def write_files(workspace: Path, files: list[dict[str, Any]]) -> list[str]:
    """Write the agent's output to disk, rejecting anything outside the sandbox."""
    written: list[str] = []
    for entry in files or []:
        path = str(entry.get("path", ""))
        content = entry.get("content", "")
        if not isinstance(content, str) or not path:
            continue
        if len(content.encode("utf-8")) > MAX_FILE_BYTES:
            raise UnsafePathError(f"{path} is too large ({len(content)} chars)")

        target = _safe_target(workspace, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        written.append(str(target.relative_to(workspace)).replace("\\", "/"))
    return written
