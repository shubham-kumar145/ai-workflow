<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:6366F1,50:8B5CF6,100:06B6D4&height=200&section=header&text=AI%20Work%20Flow%20🤖&fontSize=48&fontColor=ffffff&fontAlignY=35&desc=A%20Software%20Agency%20Where%20Every%20Employee%20is%20an%20AI%20Agent&descAlignY=58&descSize=16&animation=fadeIn" width="100%"/>

<br/>

<img src="https://readme-typing-svg.demolab.com?font=Poppins&size=22&duration=3000&pause=1000&color=8B5CF6&center=true&vCenter=true&width=700&lines=Client+submits+a+brief.+AI+agents+do+the+rest.;Plan+it.+Build+it.+Test+it.+Deploy+it.;Real+agents.+Real+files.+Real+tests.;Live+dashboard+—+watch+the+office+work." alt="Typing SVG" />

<br/><br/>

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Visit_Now-6366F1?style=for-the-badge)](https://ai-workflow-rosy-omega.vercel.app/login)
[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github)](https://github.com/shubham-kumar145/ai-workflow)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)

<br/>

![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-FF6B6B?style=for-the-badge)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio)

<br/><br/>

<img src="https://skillicons.dev/icons?i=react,nodejs,express,python,fastapi,postgres,tailwind,redux&theme=dark" />

</div>

---

## 🧠 About the Project

🎓 **Final-Year Project** by **Shubham Kumar** — B.Tech, BIT Mesra
🤖 **AI-powered Software Agency** | Fully autonomous agent pipeline with human-in-the-loop checkpoints

**AI Work Flow** is a platform where a client submits a project brief and a team of specialized AI agents takes it from idea to deployed application — planning, designing, building, testing, and deploying it automatically. A live dashboard shows every agent working in real time.

> This isn't a demo with stub agents. Every agent does **real work** — writes real files, runs real tests, and performs a real deploy with an HTTP smoke test.

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
| Agent self-repair retries | `tasks.attempts` | **6 per task** | The QA loop |

> ⚡ A failed test costs the client **nothing**. These counters never touch each other — and the smoke test asserts it.

---

## 🤖 The Agents Are Real, Not Stubs

This is the part worth demonstrating.

<table>
<tr>
<td width="50%" valign="top">

### 🧠 Project Manager & Architect
Breaks the client brief into a structured plan with tasks in dependency order. The Technical Architect designs the system before a single line of code is written.

</td>
<td width="50%" valign="top">

### 💻 Developer Agents
Write **real files** into `ai-service/workspaces/<project-id>/`. The LLM returns `{file_path, content}[]`, validated against a path allowlist — no traversal, no writes outside `src/`, `public/`, `tests/`.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🧪 QA Agent
Shells out to `npm test`, which runs `node --test`. The **process exit code is the verdict** — the agent's opinion of its own code is never consulted. Real test output feeds back into the next retry attempt.

</td>
<td width="50%" valign="top">

### 🚀 DevOps Agent
Boots the generated app on a free port and polls `GET /api/health` until it gets a genuine HTTP 200. **No 200 = no deploy.** The project goes to `BLOCKED` instead of reporting a success that didn't happen.

</td>
</tr>
</table>

---

## 🏛️ Architecture

```
React (5173)  ⇄  Express (4000)  ⇄  FastAPI (8000)
                       ↘  PostgreSQL (5432)  ↙
```

- **Express** is the front door — Auth, client APIs, approvals, Socket.io
- **FastAPI** accepts jobs, returns immediately, and runs agent chains in a background task (LLM chains outlive HTTP timeouts)
- **FastAPI → Express** via `/internal/*` with a shared `x-internal-secret` header — logs runs, creates tasks, saves version snapshots, changes status
- **Prisma** owns the schema and every migration. Python reads the same tables via SQLAlchemy (read-only). Every write from Python goes through the Express internal API

### 🚪 One Door for State Changes

> Every status transition goes through `transitionStatus()` in `backend/src/lib/events.ts`.
> In one transaction: validates against a whitelist → updates the project → appends an immutable `workflow_events` row → broadcasts via Socket.io.
> **An agent cannot jump from `PLANNING` to `COMPLETED`. The whitelist rejects it.**

---

## 📂 Project Structure

```
ai-workflow/
├── backend/                       # Express + TypeScript + Prisma + Socket.io
│   ├── prisma/schema.prisma       # 8 tables — Prisma owns them
│   ├── src/lib/events.ts          # Transition whitelist + THE status function
│   ├── src/routes/approvals.ts    # Client gates and revision budgets
│   └── src/routes/internal.ts     # API the Python service calls back into
│
├── ai-service/                    # FastAPI + LangGraph + OpenAI
│   ├── app/graph/build_graph.py   # dev → QA → retry → escalate
│   ├── app/agents/developer.py    # Writes real files, path-sandboxed
│   ├── app/agents/qa.py           # Real execution; exit code = verdict
│   ├── app/agents/devops.py       # Real boot + real HTTP smoke test
│   ├── app/db/models.py           # Read-only SQLAlchemy reflection
│   └── app/templates/starter/     # What the agents generate into
│
├── frontend/                      # React + Vite + Tailwind + Redux + React Flow
│
├── scripts/
│   ├── smoke_test.js              # Drives a whole project end to end
│   └── selftest_graph.py          # Exercises agent graph without backend
│
└── docker-compose.yml             # PostgreSQL (if you prefer not to install it)
```

---

## 🚀 Getting Started

> See **[START-HERE.md](START-HERE.md)** for the full local setup guide.
> See **[DEPLOY.md](DEPLOY.md)** to go live free on **Vercel + Render + Neon**.

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/shubham-kumar145/ai-workflow.git
cd ai-workflow

# 2. Start PostgreSQL
docker-compose up -d

# 3. Backend setup
cd backend
cp .env.example .env        # Fill in DB URL + secrets
npx prisma migrate dev
npm install && npm run dev

# 4. AI Service setup
cd ../ai-service
cp .env.example .env        # Add OPENAI_API_KEY (optional — mock mode works without it)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 5. Frontend
cd ../frontend
npm install && npm run dev
```

Open **http://localhost:5173** 🎉

### 🎭 Mock Mode

> No `OPENAI_API_KEY`? Every agent still runs, files are still written, tests are still executed, deploys are still smoke-tested — **only the LLM call is simulated**. Demo the whole system, offline, for free. Set the key to let agents actually think.

---

## 🔒 Security

| Area | Implementation |
|:--|:--|
| **Prompt Injection** | Client requirements stripped of injection shapes; fenced as untrusted data in every prompt |
| **File Sandbox** | Agent writes restricted to an allowlist — no path traversal, no writes outside `src/`, `public/`, `tests/` |
| **Auth** | Rate-limited endpoints, bcrypt-hashed passwords, JWT |
| **Internal API** | `/internal/*` guarded by a shared secret matching both `.env` files |
| **QA Sandbox** | Set `QA_SANDBOX=docker` to run generated code in a throwaway container — no network, memory cap, PID limit |

---

## 🛣️ Roadmap

- [ ] **Git/GitHub integration** — Commit to `ai/<taskId>`, open a PR, store `branchName` and `pullRequestUrl` *(columns already exist on tasks)*
- [ ] **Cloud deploys** — Swap `devops.py` local boot for Render / Vercel / GitHub Actions; smoke test stays the same
- [ ] **Docker QA by default** — Container path implemented; one env var away from being the default
- [ ] **Richer generated apps** — React + Express starter template with pre-warmed `node_modules`

---

## 💻 Tech Stack

### Frontend

<div align="center">

<img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react" />
<img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite" />
<img src="https://img.shields.io/badge/Redux_Toolkit-764ABC?style=for-the-badge&logo=redux" />
<img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css" />
<img src="https://img.shields.io/badge/React_Flow-FF4154?style=for-the-badge" />
<img src="https://img.shields.io/badge/Socket.io_Client-010101?style=for-the-badge&logo=socketdotio" />

</div>

### Backend

<div align="center">

<img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js" />
<img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express" />
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript" />
<img src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma" />
<img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio" />
<img src="https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens" />

</div>

### AI Service

<div align="center">

<img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python" />
<img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/LangGraph-FF6B6B?style=for-the-badge" />
<img src="https://img.shields.io/badge/OpenAI_API-412991?style=for-the-badge&logo=openai&logoColor=white" />
<img src="https://img.shields.io/badge/SQLAlchemy-D71F00?style=for-the-badge" />

</div>

### Database & DevOps

<div align="center">

<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
<img src="https://img.shields.io/badge/Neon-00E5A0?style=for-the-badge" />
<img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker" />
<img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel" />
<img src="https://img.shields.io/badge/Render-46E3B7?style=for-the-badge&logo=render" />
<img src="https://img.shields.io/badge/Git-F05032?style=for-the-badge&logo=git" />

</div>

---

## 🌐 Links

<div align="center">

<a href="https://ai-workflow-rosy-omega.vercel.app/login">
<img src="https://img.shields.io/badge/🌐_Live_Demo-6366F1?style=for-the-badge" />
</a>
<a href="https://github.com/shubham-kumar145/ai-workflow">
<img src="https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white" />
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
