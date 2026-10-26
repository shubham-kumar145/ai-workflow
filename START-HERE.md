# Running AI Work Flow on Windows

Every command below is Windows CMD. You will end up with **three terminals open**,
one per service. Keep all three running.

> **You do not need an OpenAI key to get this working.** Without one the service
> starts in *mock mode*: the agents still run, still write real files, QA still
> really executes the test suite and DevOps still really deploys and smoke-tests
> the app. Only the language model is simulated. Add the key when you want the
> agents to actually think. Everything below works either way.

---

## Step 0 — Check what you have

Open CMD and run:

```cmd
node -v
python --version
```

You want Node 20 or newer and Python 3.10 or newer. If both print a version, continue.

---

## Step 1 — Get PostgreSQL running

**Pick ONE of these two options.**

### Option A — Docker (easier, nothing to configure)

```cmd
cd ai-workflow
docker compose up -d
```

That is it. The database, user and password are all created for you. Skip to Step 2.

### Option B — Install PostgreSQL 16 natively

1. Install PostgreSQL 16 from the EDB installer, leaving the port as **5432**.
2. Open **pgAdmin** (or `psql`) and run:

```sql
CREATE USER aiworkflow WITH PASSWORD 'aiworkflow';
CREATE DATABASE aiworkflow OWNER aiworkflow;
```

---

## Step 2 — Terminal 1: the backend (port 4000)

```cmd
cd ai-workflow\backend
copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev
```

You should see:

```
[backend] http://localhost:4000
```

`npm run seed` prints two logins — note them down:

| Role | Email | Password |
|---|---|---|
| Client | `client@aiworkflow.dev` | `client1234` |
| Admin | `admin@aiworkflow.dev` | `admin1234` |

**Leave this terminal running.**

---

## Step 3 — Terminal 2: the AI service (port 8000)

Open a **new** CMD window:

```cmd
cd ai-workflow\ai-service
copy .env.example .env
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

You should see `Uvicorn running on http://127.0.0.1:8000`.

**Optional — turn on the real LLM.** Open `ai-service\.env` in Notepad and put your
key on the `OPENAI_API_KEY=` line, then restart this terminal (Ctrl+C, then the
`uvicorn` command again).

**Leave this terminal running.**

---

## Step 4 — Terminal 3: the frontend (port 5173)

Open a **third** CMD window:

```cmd
cd ai-workflow\frontend
copy .env.example .env
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Step 5 — Watch it work

1. Sign in as `client@aiworkflow.dev` / `client1234`.
2. Click **New project** → **Use the demo brief** → **Submit to the agency**.
3. You land on the dashboard. Without touching anything you will see:
   - the office floor diagram light up at **Planning**
   - the live activity feed fill in as the PM and Architect agents run
   - the status reach **CLIENT APPROVAL PLAN**
4. Read the plan, then click **Approve**.
5. Now the interesting part: tasks move across the Kanban board on their own, and
   each **TEST RUN** entry in the activity feed has an expandable *real test output*
   section showing the actual `node --test` results and exit code.
6. When it reaches **STAGING REVIEW**, click the staging link — that is a real
   server the DevOps agent started and smoke-tested. The generated code is on disk
   in `ai-service\workspaces\<project-id>\`.
7. Click **Approve** again, then sign out and sign in as the **admin** to approve
   the production deploy. The project ends at **COMPLETED**.

---

## Step 6 — Prove it all works in one command

With all three terminals still running, open a fourth and run:

```cmd
cd ai-workflow
node scripts\smoke_test.js
```

This drives an entire project through the workflow as a client would — submit,
request one plan change, approve, wait for the build, check the staging server
really answers, approve, then sign off production as admin. It also asserts that
a QA retry never consumed a client revision. It finishes with:

```
  All good. The full workflow runs end to end.
```

---

## If something goes wrong

**`npx prisma migrate dev` fails to download an engine**
Prisma fetches its engine binaries from the internet on first run. Check your
connection or proxy and run it again.

**`Could not reach the AI service` on the dashboard**
Terminal 2 is not running, or it is on the wrong port. The AI service must be on
8000, and `INTERNAL_SERVICE_SECRET` must be **identical** in `backend\.env` and
`ai-service\.env`. Out of the box they already match — if you change one, change both.

**`'uvicorn' is not recognized`**
The virtual environment is not active. Run `.venv\Scripts\activate` first; your
prompt should start with `(.venv)`.

**Python 3.13 via Anaconda and `python -m venv` picks the wrong Python**
Use the full path instead, for example:
`C:\Users\<you>\anaconda3\python.exe -m venv .venv`

**The project goes straight to BLOCKED**
Open the dashboard and read the red banner — it says exactly which agent failed and
why. Sign in as admin and use **Unblock and retry** on the Admin page.

**Port already in use**
Change `PORT` in `backend\.env`, `--port` for uvicorn, or `server.port` in
`frontend\vite.config.ts`. If you change the backend port, also update
`VITE_API_URL` in `frontend\.env` and `BACKEND_URL` in `ai-service\.env`.

**Tests in Docker instead of on your machine**
Generated code is untrusted. To run it in a throwaway container instead, set
`QA_SANDBOX=docker` in `ai-service\.env` (Docker Desktop must be running).

---

## Starting it again tomorrow

Three terminals, one command each — no reinstalling:

```cmd
cd ai-workflow\backend     &&  npm run dev
cd ai-workflow\ai-service  &&  .venv\Scripts\activate  &&  uvicorn app.main:app --reload --port 8000
cd ai-workflow\frontend    &&  npm run dev
```
