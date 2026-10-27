# AI Work Flow

A software agency where every employee is an AI agent. A client submits a brief;
AI agents plan it, design it, build it, test it and deploy it, pausing at fixed
checkpoints for human approval. The dashboard shows the whole office working, live.

**To run it: [START-HERE.md](START-HERE.md).** To put it online for free
(Vercel + Render + Neon): [DEPLOY.md](DEPLOY.md).

---

## The loop

```
client submits
      ↓
 Project Manager agent  →  Technical Architect agent
      ↓
 ╔═══ CLIENT REVIEW A — the plan ═══╗   max 2 change requests
      ↓
 Developer agents  ⇄  QA agent        max 6 self-repair retries per task
      ↓                    ↓ still failing
 DevOps agent          BLOCKED → human
      ↓
 ╔═══ CLIENT REVIEW B — the build ══╗   max 3 change requests
      ↓
 admin approves production  →  deploy  →  COMPLETED
```

### The two budgets are deliberately separate

| | Counter | Limit | Who spends it |
|---|---|---|---|
| Client change requests, plan stage | `projects.planRevisionCount` | 2 | the client |
| Client change requests, build stage | `projects.buildRevisionCount` | 3 | the client |
| Agent self-repair after a failed test | `tasks.attempts` | 6 per task (`MAX_SELF_REPAIR_RETRIES`) | the QA loop |

A test failure costs the client nothing. Those counters never touch each other,
and the smoke test asserts it.

---

## Architecture

```
React (5173)  ⇄  Express (4000)  ⇄  FastAPI (8000)
                      ↘  PostgreSQL (5432)  ↙
```

- **Express is the front door.** Auth, client APIs, approvals, Socket.io.
- **Express calls FastAPI** at `POST /workflow/start` and `POST /workflow/{id}/resume`.
  FastAPI accepts the job and returns immediately; the agents run in a background
  task, because an LLM chain outlives any sane HTTP timeout.
- **FastAPI calls back into Express** `/internal/*` with an `x-internal-secret`
  header to log agent runs, create tasks, save version snapshots and change status.
- **Prisma owns the schema and every migration.** Python reads the same tables
  read-only through SQLAlchemy reflection and never migrates. Every write from the
  Python side goes through the Express internal API, so Prisma stays the only writer.

### One door for state changes

Every status change in the system goes through `transitionStatus()` in
`backend/src/lib/events.ts`. In one transaction it validates the move against a
whitelist, updates the project, appends an immutable `workflow_events` row, and
broadcasts over Socket.io. Nothing else writes `project.status`. An agent cannot
jump a project from `PLANNING` straight to `COMPLETED` — the whitelist rejects it.

---

## The agents are real, not stubs

This is the part worth demonstrating.

**Developer agents write real files.** The LLM returns `{file_path, content}[]`,
which is validated against a path allowlist (no traversal, no writing outside
`src/`, `public/`, `tests/`) and written into `ai-service/workspaces/<project-id>/`.
Tasks are processed in dependency order via a topological sort, and each agent sees
the current contents of the codebase, so later tasks build on earlier ones.

**The QA agent really runs the tests.** It shells out to `npm test`, which runs
`node --test`, and the **process exit code is the verdict**. The agent's own opinion
of its code is never consulted. On a failure the real test output is fed back into
the developer agent's next attempt. The retry budget is bounded at 3, and if the
failure count stops dropping between attempts it escalates early rather than burning
tokens on the same error.

**The DevOps agent really deploys.** It starts the generated app on a free port and
polls `GET /api/health` until it gets a genuine HTTP 200. No 200, no deploy — the
project goes to `BLOCKED` instead of reporting a success that did not happen.

Generated apps are built from the starter template in
`ai-service/app/templates/starter/`: a dependency-free Node app whose route handlers
are pure functions (`handler({params, query, body}) -> {status, body}`). That design
is what makes QA honest and fast — a test calls a handler directly and asserts on the
real return value, with nothing to `npm install` and no ports to bind.

---

## Mock mode

With no `OPENAI_API_KEY`, every agent still runs, files are still written, tests are
still really executed and deploys are still really smoke-tested — only the model call
is simulated. The point is that you can demo the whole system, offline, for free, and
the parts being demonstrated are the real ones. Set the key to let the agents actually
think.

---

## Layout

```
ai-workflow/
  backend/           Express + TypeScript + Prisma + Socket.io
    prisma/schema.prisma      the 8 tables; Prisma owns them
    src/lib/events.ts         transition whitelist + THE status function
    src/routes/approvals.ts   client gates and the revision budgets
    src/routes/internal.ts    the API the Python service calls back into
  ai-service/        FastAPI + LangGraph + OpenAI
    app/graph/build_graph.py  dev → QA → retry → escalate
    app/agents/developer.py   writes real files, path-sandboxed
    app/agents/qa.py          real execution; exit code is the verdict
    app/agents/devops.py      real boot + real HTTP smoke test
    app/db/models.py          read-only SQLAlchemy reflection
    app/templates/starter/    what the agents generate into
  frontend/          React + Vite + Tailwind + Redux Toolkit + React Flow
  scripts/
    smoke_test.js             drives a whole project end to end
    selftest_graph.py         exercises the agent graph without the backend
  docker-compose.yml          PostgreSQL, if you would rather not install it
```

---

## Security notes

- Client requirements are stripped of obvious prompt-injection shapes before
  reaching a model, and are fenced as untrusted data in every prompt.
- Agent file writes are restricted to an allowlist of paths inside the workspace.
- Auth endpoints are rate-limited; passwords are bcrypt-hashed.
- `/internal/*` is guarded by a shared secret that must match in both `.env` files.
- Generated code is untrusted. Set `QA_SANDBOX=docker` to run it in a throwaway
  container with no network, a memory cap and a PID limit, instead of on the host.

---

## Where this goes next

The deliberate shortcuts, in the order worth fixing:

1. **Git/GitHub.** Developer agents write to a workspace directory. The next step is
   committing to `ai/<taskId>`, opening a PR, and storing `branchName` and
   `pullRequestUrl` — the columns already exist on `tasks`.
2. **Cloud deploys.** `devops.py` boots the app locally. Swapping in a Render, Vercel
   or GitHub Actions call changes only how the URL is produced; the smoke test stays.
3. **Docker by default for QA.** The container path is implemented and one env var
   away; it should be the default once the image is pre-pulled.
4. **Richer generated apps.** The starter template is intentionally dependency-free so
   QA is instant. A React + Express template with a pre-warmed `node_modules` would
   let the agents build more, at the cost of slower test runs.
