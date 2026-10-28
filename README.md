<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366F1,50:8B5CF6,100:06B6D4&height=200&section=header&text=AI%20Work%20Flow%20🤖&fontSize=48&fontColor=ffffff&fontAlignY=35&desc=A%20Software%20Agency%20Where%20Every%20Employee%20is%20an%20AI%20Agent&descAlignY=58&descSize=16&animation=fadeIn" width="100%"/>

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Poppins&size=22&duration=3000&pause=1000&color=8B5CF6&center=true&vCenter=true&width=700&lines=Client+submits+a+brief.+AI+agents+do+the+rest.;Plan+it.+Build+it.+Test+it.+Deploy+it.;Real+agents.+Real+files.+Real+tests.;Live+dashboard+—+watch+the+office+work." alt="Typing SVG" />

<br/><br/>

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Visit_Now-6366F1?style=for-the-badge)](https://ai-workflow-rosy-omega.vercel.app/login)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/shubham-kumar145/ai-workflow)
[![Docker Hub](https://img.shields.io/badge/Docker_Hub-ai--workflow--service-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/shubhamkumar145/ai-workflow-service)

<br/>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-FF6B6B?style=for-the-badge)
![Gemini](https://img.shields.io/badge/Gemini_/_OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

<br/><br/>

<img src="https://skillicons.dev/icons?i=react,ts,nodejs,express,python,fastapi,postgres,tailwind,redux,docker&theme=dark" />

</div>

---

## 📑 Table of Contents

[About](#-about-the-project) · [Features](#-features) · [Workflow](#-the-workflow-loop) · [Agents](#-the-agents-are-real-not-stubs) · [Architecture](#-architecture) · [**Install with Docker**](#-install-with-docker-one-command) · [**Install manually**](#-install-manually) · [LLM setup](#-connect-an-llm) · [Configuration](#-configuration) · [Docker Hub image](#-docker-hub-image) · [Deploy free](#-deploy-it-free) · [Security](#-security) · [Troubleshooting](#-troubleshooting) · [Structure](#-project-structure) · [Roadmap](#-roadmap)

---

## 🧠 About the Project

🎓 **Final-Year Project** by **Shubham Kumar** — B.Tech, BIT Mesra
🤖 **AI-powered Software Agency** | Autonomous agent pipeline with human-in-the-loop checkpoints

**AI Work Flow** is a platform where a client submits a project brief and a team of specialized AI agents takes it from idea to a running application — planning, designing, building, testing, and starting a live preview. The client approves at fixed checkpoints, and a live dashboard shows every agent working in real time.

> This isn't a demo with stub agents. Every agent does **real work** — the developers write real files, QA runs a real test suite, and DevOps boots the generated app and checks that it answers over HTTP.

---

## ✨ Features

| | |
|:--|:--|
| 📝 **Brief in, app out** | Describe what you want. A project manager, an architect and two developers turn it into tasks and code. |
| ✅ **Real verification** | QA runs `node --test` and the exit code is the verdict. DevOps needs a genuine HTTP 200 before anything counts as deployed. |
| 🔁 **Self-repair** | A failing task goes back to the developer with the real test output, up to **6 times** by default, at no cost to the client. |
| 🙋 **Human checkpoints** | The client approves the plan, then the staging build. An admin handles anything an agent can't fix. |
| 📡 **Live dashboard** | Animated office floor, task board, live activity feed and agent runs, updated over Socket.io. |
| 🔗 **Unique preview URLs** | Every project gets its own preview. Online, previews are served through the AI service at `/preview/<id>/`. |
| 📦 **Source download** | Download the generated code of any project as a `.zip`. |
| 💰 **Spend cap** | Each project has an LLM budget. The workflow pauses if agent costs pass it. |
| 🛡️ **Admin control room** | Stats, escalations with **Unblock and retry**, and delete with an in-row confirm. |
| 🆓 **Free to run** | Works with Google Gemini's free tier, or with no key at all in mock mode. |

---

## 🔄 The Workflow Loop

```
  Client submits brief
          │
          ▼
  🧠 Project Manager ──► 🏗️ Technical Architect
          │
          ▼
  ╔══════════════════════════════════════╗
  ║   CLIENT REVIEW A — The Plan  ✅    ║  (max 2 change requests)
  ╚══════════════════════════════════════╝
          │
          ▼
  💻 Developer Agents ⇄ 🧪 QA Agent       (max 6 self-repair retries / task)
          │                     │
          │               still failing
          ▼                     ▼
  🚀 DevOps Agent          BLOCKED → 🙋 Human Escalation
          │
          ▼
  ╔══════════════════════════════════════╗
  ║   CLIENT REVIEW B — The Build ✅    ║  (max 3 change requests)
  ╚══════════════════════════════════════╝
          │
          ▼
  Admin Approves → Deploy → ✅ COMPLETED
```

### 📊 Budget Counters

| Counter | Stored In | Limit | Who Spends It |
|:--|:--|:--|:--|
| Plan change requests | `projects.planRevisionCount` | **2** | The client |
| Build change requests | `projects.buildRevisionCount` | **3** | The client |
| Agent self-repair retries | `tasks.attempts` | **6 per task** (`MAX_SELF_REPAIR_RETRIES`) | The QA loop |

> ⚡ A failed test costs the client **nothing**. These counters never touch each other — and the smoke test asserts it.

**15 project statuses:** `SUBMITTED` · `PLANNING` · `CLIENT_APPROVAL_PLAN` · `CHANGES_REQUESTED_PLAN` · `DEVELOPMENT` · `CODE_REVIEW` · `QA` · `TEST_FAILED` · `STAGING_REVIEW` · `CHANGES_REQUESTED_BUILD` · `PRODUCTION_APPROVAL` · `DEPLOYMENT` · `COMPLETED` · `BLOCKED` · `CANCELLED`

---

## 🤖 The Agents Are Real, Not Stubs

Four agents use the LLM. Two run real processes.

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Project Manager & Architect &nbsp;`LLM`
Breaks the client brief into a structured plan with tasks in dependency order. The Architect designs the structure and plans the files before a single line of code is written.

</td>
<td width="50%" valign="top">

### 💻 Developer Agents &nbsp;`LLM`
Backend and frontend developers write **real files** into `ai-service/workspaces/<project-id>/`. The LLM returns `{file_path, content}[]`, validated against a path allowlist — no traversal, nothing outside the project workspace.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🧪 QA Agent &nbsp;`real process`
Runs `npm test` (`node --test`), a boot check and a missing-element-ID check. The **process exit code is the verdict** — the agent's opinion of its own code is never consulted. Real test output feeds the next retry.

</td>
<td width="50%" valign="top">

### 🚀 DevOps Agent &nbsp;`real process`
Starts `node server.js` on a free port and polls `GET /api/health` until it gets a genuine HTTP 200. **No 200 = no deploy.** The project goes to `BLOCKED` instead of reporting a success that didn't happen.

</td>
</tr>
</table>

---

## 🏛️ Architecture

```
React (5173)  ⇄  Express (4000)  ⇄  FastAPI (8000)
                       ↘  PostgreSQL (5432)  ↙
```

- **Express** is the front door — auth, client APIs, approvals, admin, Socket.io
- **FastAPI + LangGraph** accepts jobs, returns immediately, and runs agent chains in a background task (LLM chains outlive HTTP timeouts)
- **FastAPI → Express** via `/internal/*` with a shared `x-internal-secret` header — logs runs, creates tasks, saves snapshots, changes status
- **Prisma** owns the schema and every migration (8 tables). Python reads the same tables read-only through SQLAlchemy. Every write from Python goes through the Express internal API

### 🚪 One Door for State Changes

> Every status transition goes through `transitionStatus()` in `backend/src/lib/events.ts`.
> In one transaction: validates against a whitelist → updates the project → appends an immutable `workflow_events` row → broadcasts via Socket.io.
> **An agent cannot jump from `PLANNING` to `COMPLETED`. The whitelist rejects it.**

---

# 🚀 Getting Started

Pick **one** of the two ways to run it. Both give you the same app at **http://localhost:5173**.

| | 🐳 Docker | 🛠️ Manual |
|:--|:--|:--|
| You install | Docker Desktop | Node.js, Python, PostgreSQL |
| Commands | 1 | about 15, in 3 terminals |
| Best for | Trying it, demos | Developing and changing the code |

You do **not** need an LLM key to try it. Without one it runs in [mock mode](#-mock-mode).

---

## 🐳 Install with Docker (one command)

Nothing to install except **Docker**. The database, backend, AI service and website all run in containers.

### Step 1 — Install Docker

Install **Docker Desktop** (Windows / macOS) or Docker Engine with the Compose plugin (Linux), then make sure it is running.

```bash
docker --version
docker compose version
```

### Step 2 — Get the code

```bash
git clone https://github.com/shubham-kumar145/ai-workflow.git
cd ai-workflow
```

### Step 3 — (Optional) add an LLM key

Skip this to run in mock mode. To let the agents really think, copy the settings file and put your key in it (see [Connect an LLM](#-connect-an-llm)):

```bash
cp .env.example .env          # Windows CMD: copy .env.example .env
```

### Step 4 — Build and start everything

```bash
docker compose --profile app up --build
```

The first build takes several minutes (it downloads Python, Node and the packages). When the logs show `[backend] http://localhost:4000` and `Uvicorn running on http://0.0.0.0:8000`, it's ready. Add `-d` to run it in the background.

### Step 5 — Open it

| What | Address |
|:--|:--|
| 🌐 Website | http://localhost:5173 |
| 🔌 Backend API | http://localhost:4000/health |
| 🤖 AI service | http://localhost:8000/health |

Sign in with the demo accounts:

| Role | Email | Password |
|:--|:--|:--|
| Client | `client@aiworkflow.dev` | `client1234` |
| Admin | `admin@aiworkflow.dev` | `admin1234` |

> These are local demo accounts for Docker and development only. The backend refuses to seed them when `NODE_ENV=production`.

### Everyday Docker commands

```bash
docker compose --profile app up -d             # start in the background
docker compose --profile app logs -f           # follow all logs
docker compose --profile app logs -f backend   # follow one service
docker compose --profile app stop              # stop (keeps your data)
docker compose --profile app up --build -d     # rebuild after changing code
docker compose --profile app down -v           # stop AND delete the database + generated code
```

> ⚠️ `down -v` deletes your projects. Use plain `down` or `stop` to keep them.

**Ports:** 5173 (site), 4000 (backend), 8000 (AI service), 5432 (database). If one is taken, stop whatever uses it. A PostgreSQL you installed natively on port 5432 is the usual culprit.

**Generated projects and previews** live in a Docker volume (`workspaces`), and previews open at `http://localhost:8000/preview/<id>/`.

---

## 🛠️ Install manually

Use this to work on the code. You open **three terminals**, one per service, and leave them running.

### Step 0 — What you need

| Tool | Version | Check with |
|:--|:--|:--|
| Node.js | 20 or newer (22 recommended) | `node -v` |
| Python | 3.10 or newer | `python --version` |
| PostgreSQL | 16 — native, **or** use Docker for just the database | `psql --version` |
| Git | any | `git --version` |

### Step 1 — Get the code

```bash
git clone https://github.com/shubham-kumar145/ai-workflow.git
cd ai-workflow
```

### Step 2 — Start PostgreSQL (pick one)

**Option A — Docker, database only (easiest):**

```bash
docker compose up -d
```

This starts only PostgreSQL, with the user, password and database already created.

**Option B — native install:** install PostgreSQL 16 on port 5432, then in `psql` or pgAdmin run:

```sql
CREATE USER aiworkflow WITH PASSWORD 'aiworkflow';
CREATE DATABASE aiworkflow OWNER aiworkflow;
```

### Step 3 — Terminal 1: backend (port 4000)

```bash
cd backend
cp .env.example .env              # Windows CMD: copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed                      # creates the demo client and admin accounts
npm run dev
```

You should see `[backend] http://localhost:4000`.

### Step 4 — Terminal 2: AI service (port 8000)

```bash
cd ai-service
cp .env.example .env              # Windows CMD: copy .env.example .env
python -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000`. If `uvicorn` isn't recognised, the virtual environment isn't active — your prompt should start with `(.venv)`.

### Step 5 — Terminal 3: frontend (port 5173)

```bash
cd frontend
cp .env.example .env              # Windows CMD: copy .env.example .env
npm install
npm run dev
```

Open **http://localhost:5173** and sign in with the [demo accounts](#step-5--open-it).

### Starting it again later

No reinstalling — one command per terminal:

```bash
cd backend    && npm run dev
cd ai-service && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000   # Windows: .venv\Scripts\activate
cd frontend   && npm run dev
```

> `tsx watch` and `uvicorn` don't reload `.env`. After editing a `.env` file, stop that service and start it again.

---

## 🎬 Take it for a spin

1. Sign in as the **client**, click **New project → Use the demo brief → Submit to the agency**.
2. On the dashboard the office floor lights up at **Planning** and the activity feed fills in.
3. At **Client approval plan**, read the plan and click **Approve**.
4. Tasks move across the board on their own. Each test run in the feed has the real `node --test` output.
5. At **Staging review**, open the staging link — a real server the DevOps agent started. Approve again.
6. Sign in as the **admin** to approve the production deploy. The project ends at **Completed**, and you can download its source as a `.zip`.

### ✅ Prove it all works in one command

With the app running (Docker or manual), from the project folder:

```bash
node scripts/smoke_test.js
```

It drives a whole project through the workflow as a client would, including a plan change, and asserts that a QA retry never used up a client revision. It ends with `All good. The full workflow runs end to end.`

---

## 🎭 Mock Mode

> No `OPENAI_API_KEY`? Every agent still runs, files are still written, tests are still executed, deploys are still smoke-tested — **only the LLM call is simulated**. Demo the whole system, offline, for free.

## 🔑 Connect an LLM

Any OpenAI-compatible provider works. **Google Gemini has a free tier:** get a key from Google AI Studio, then set:

```env
OPENAI_API_KEY=your-gemini-key
OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
OPENAI_MODEL=gemini-flash-lite-latest
```

- **Docker:** put these three lines in the `.env` file at the project root, then `docker compose --profile app up -d` again.
- **Manual:** put them in `ai-service/.env` and restart the AI service.

For OpenAI itself, set just `OPENAI_API_KEY` and, if you like, `OPENAI_MODEL`.

---

## ⚙️ Configuration

**`backend/.env`**

| Variable | Purpose |
|:--|:--|
| `DATABASE_URL` | PostgreSQL connection string (Prisma) |
| `PORT` | Backend port, default 4000 |
| `CORS_ORIGIN` / `CORS_ORIGINS` | Allowed website origins, comma separated |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing — use a long random secret in production |
| `AI_SERVICE_URL` | Where the AI service is, default `http://localhost:8000` |
| `INTERNAL_SERVICE_SECRET` | Shared with the AI service — must be **identical** in both |
| `SEED_*` | Demo account emails and passwords for `npm run seed` |

**`ai-service/.env`**

| Variable | Purpose |
|:--|:--|
| `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` | The LLM. Empty key = mock mode |
| `BACKEND_URL` | Where the Express backend is |
| `INTERNAL_SERVICE_SECRET` | Must match `backend/.env` |
| `DATABASE_URL` | Same database as `postgresql+psycopg://…`, read-only |
| `MAX_SELF_REPAIR_RETRIES` | Self-repair attempts per task (6 in the example file) |
| `QA_SANDBOX` | `subprocess` (fast, local) or `docker` (throwaway container for untrusted code) |
| `QA_TIMEOUT_SECONDS`, `STAGING_PORT_START` | Test time limit and first preview port |
| `PUBLIC_URL`, `MAX_RUNNING_PREVIEWS` | When hosted: preview link base and how many previews run at once |

**`frontend/.env`** — `VITE_API_URL`, the backend address as the browser sees it.

**Root `.env`** (Docker only) — `OPENAI_*`, and optionally `JWT_SECRET` and `INTERNAL_SERVICE_SECRET`. See `.env.example`.

---

## 🐋 Docker Hub image

The AI service is also published on Docker Hub, with Python 3.12 and Node 22 inside (the agents run generated Node apps):

```bash
docker pull shubhamkumar145/ai-workflow-service
```

Run it with your own settings — no secrets are baked into the image:

```bash
docker run -p 8000:8000 \
  -e BACKEND_URL=http://host.docker.internal:4000 \
  -e INTERNAL_SERVICE_SECRET=your-shared-secret \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  -e OPENAI_API_KEY=your-key \
  -e OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/ \
  -e OPENAI_MODEL=gemini-flash-lite-latest \
  shubhamkumar145/ai-workflow-service
```

`INTERNAL_SERVICE_SECRET` must match the backend's. The container listens on `$PORT` (default 8000).

---

## 🌍 Deploy it free

Full guide: **[DEPLOY.md](DEPLOY.md)**

| Part | Where | Notes |
|:--|:--|:--|
| 🌐 Website | **Vercel** | Root `frontend`, with a rewrite so routes like `/login` work |
| ⚙️ Backend + AI service | **Render** | Both defined in `render.yaml`; the AI service uses its Dockerfile |
| 🗄️ Database | **Neon** | Use the direct (non-pooler) connection string |

What behaves differently online:
- Free Render services **sleep** when idle and take a minute or two to wake. The backend waits for a sleeping AI service and retries instead of failing the project.
- Generated code is saved in the database and restored when a preview is opened, so previews survive restarts.
- Only a few previews run at once (`MAX_RUNNING_PREVIEWS`); the least recently used stops first.

---

## 🔒 Security

| Area | Implementation |
|:--|:--|
| **Prompt Injection** | Client requirements stripped of injection shapes; fenced as untrusted data in every prompt |
| **File Sandbox** | Agent writes go through an allowlist — no path traversal. Restored snapshots are protected against zip-slip |
| **Auth** | Rate-limited endpoints, bcrypt-hashed passwords, JWT |
| **Internal API** | `/internal/*` needs the shared secret. In production the services refuse to start with default or public secrets |
| **QA Sandbox** | `QA_SANDBOX=docker` runs generated code in a throwaway container — no network, memory cap, PID limit |
| **Secrets** | `.env` files are git-ignored and excluded from Docker images |

---

## 🩺 Troubleshooting

| Problem | Fix |
|:--|:--|
| `Could not reach the AI service` | The AI service isn't running, or `INTERNAL_SERVICE_SECRET` differs between backend and AI service |
| A project goes straight to `BLOCKED` | Read the red banner on the dashboard. As admin, use **Unblock and retry** on the Admin page |
| Docker: `port is already allocated` | Something else uses 4000, 5173, 8000 or 5432. Stop it, or stop a natively installed PostgreSQL |
| Docker: site loads but sign-in fails | The backend is still starting. Wait for `[backend] http://localhost:4000` in `docker compose --profile app logs backend` |
| Docker: code changes don't show | Rebuild: `docker compose --profile app up --build -d` |
| `'uvicorn' is not recognized` | Activate the virtual environment first |
| Prisma can't download its engine | It needs the internet on first run. Check your connection or proxy and rerun |
| Port already in use (manual) | Change `PORT`, `--port` or the Vite port, then update `VITE_API_URL` and `BACKEND_URL` to match |
| `.env` changes ignored | Restart the service — `tsx watch` and `uvicorn` don't reload `.env` |
| Windows: `uvicorn --reload` hangs | Stop it and start it again by hand |
| Online, first request is very slow | The free Render services are waking up — wait a minute or two |

Windows users can also follow **[START-HERE.md](START-HERE.md)**.

---

## 📂 Project Structure

```
ai-workflow/
├── backend/                       # Express + TypeScript + Prisma + Socket.io
│   ├── prisma/schema.prisma       # 8 tables — Prisma owns them
│   ├── src/lib/events.ts          # Transition whitelist + THE status function
│   ├── src/lib/aiClient.ts        # Calls the AI service; wakes and retries it
│   ├── src/routes/                # projects, approvals, admin, auth, internal
│   ├── src/sockets/               # Live events to the dashboard
│   └── Dockerfile
│
├── ai-service/                    # FastAPI + LangGraph
│   ├── app/graph/                 # dev → QA → retry → escalate
│   ├── app/agents/                # pm, architect, developer, qa, devops, snapshot
│   ├── app/api/                   # workflow jobs + the /preview proxy
│   ├── app/templates/starter/     # What the agents generate into
│   └── Dockerfile                 # Python 3.12 + Node 22
│
├── frontend/                      # React 18 + Vite + Tailwind v4 + Redux Toolkit
│   ├── src/pages/                 # AuthPage, ProjectList, NewProject, ProjectDashboard, AdminPanel
│   ├── Dockerfile + nginx.conf    # Built once, served by nginx
│   └── vercel.json
│
├── scripts/
│   ├── smoke_test.js              # Drives a whole project end to end
│   └── selftest_graph.py          # Exercises the agent graph without the backend
│
├── docker-compose.yml             # Database only, or the whole app (--profile app)
├── .env.example                   # Optional settings for the Docker setup
├── render.yaml                    # Render blueprint
├── START-HERE.md                  # Windows setup walkthrough
└── DEPLOY.md                      # Free deployment guide
```

---

## 💻 Tech Stack

| Layer | Technologies |
|:--|:--|
| **Frontend** | React 18 · Vite · TypeScript · Tailwind CSS v4 · Redux Toolkit · React Flow · Socket.io client |
| **Backend** | Node.js · Express · TypeScript · Prisma · Socket.io · JWT · Zod |
| **AI service** | Python 3.12 · FastAPI · LangGraph · OpenAI SDK (works with Gemini) · SQLAlchemy |
| **Data & hosting** | PostgreSQL (Neon) · Docker · Vercel · Render |

---

## 🛣️ Roadmap

- [ ] **Git/GitHub integration** — commit each task to `ai/<taskId>` and open a PR *(`branchName` and `pullRequestUrl` columns already exist on tasks)*
- [ ] **Docker QA by default** — the container path is built; one setting away from being the default
- [ ] **Richer generated apps** — a React + Express starter with pre-warmed `node_modules`
- [ ] **Persistent previews** — keep generated apps running on a paid host instead of restoring them on demand

---

## 🌐 Links

<div align="center">

<a href="https://ai-workflow-rosy-omega.vercel.app/login">
<img src="https://img.shields.io/badge/🌐_Live_Demo-6366F1?style=for-the-badge" />
</a>
<a href="https://github.com/shubham-kumar145/ai-workflow">
<img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
</a>
<a href="https://hub.docker.com/r/shubhamkumar145/ai-workflow-service">
<img src="https://img.shields.io/badge/Docker_Hub-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
</a>
<a href="https://www.linkedin.com/in/shubham-kumar145">
<img src="https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" />
</a>

</div>

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:06B6D4,50:8B5CF6,100:6366F1&height=100&section=footer" width="100%"/>

*Built with ❤️ by [Shubham Kumar](https://github.com/shubham-kumar145) — where AI agents do the actual work*

</div>
