-- Equivalent DDL for backend/prisma/schema.prisma, used only to sanity-check
-- the design against a real PostgreSQL server. On your machine Prisma owns
-- this: run `npx prisma migrate dev --name init` instead of this file.

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

CREATE TYPE "Role" AS ENUM ('CLIENT','ADMIN');
CREATE TYPE "ProjectStatus" AS ENUM (
  'SUBMITTED','PLANNING','CLIENT_APPROVAL_PLAN','CHANGES_REQUESTED_PLAN',
  'DEVELOPMENT','CODE_REVIEW','QA','TEST_FAILED','STAGING_REVIEW',
  'CHANGES_REQUESTED_BUILD','PRODUCTION_APPROVAL','DEPLOYMENT',
  'COMPLETED','BLOCKED','CANCELLED');
CREATE TYPE "TaskStatus" AS ENUM ('PENDING','IN_PROGRESS','CODE_REVIEW','QA','TEST_FAILED','DONE','BLOCKED');
CREATE TYPE "AgentRole" AS ENUM ('PROJECT_MANAGER','ARCHITECT','FRONTEND_DEV','BACKEND_DEV','QA_ENGINEER','DEVOPS');
CREATE TYPE "ApprovalStage" AS ENUM ('PLAN','BUILD','PRODUCTION');
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED','CHANGES_REQUESTED');
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING','SUCCESS','FAILED');

CREATE TABLE users (
  id        TEXT PRIMARY KEY,
  email     TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  password  TEXT NOT NULL,
  role      "Role" NOT NULL DEFAULT 'CLIENT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  requirements TEXT NOT NULL,
  budget       DOUBLE PRECISION NOT NULL DEFAULT 0,
  deadline     TIMESTAMP(3),
  status       "ProjectStatus" NOT NULL DEFAULT 'SUBMITTED',
  "clientId"   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "planRevisionCount"  INTEGER NOT NULL DEFAULT 0,
  "buildRevisionCount" INTEGER NOT NULL DEFAULT 0,
  "maxPlanRevisions"   INTEGER NOT NULL DEFAULT 2,
  "maxBuildRevisions"  INTEGER NOT NULL DEFAULT 3,
  "costUsd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "budgetCapUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
  "currentVersionId" TEXT,
  "workspacePath"    TEXT,
  "stagingUrl"       TEXT,
  "productionUrl"    TEXT,
  "releaseSummary"   TEXT,
  "blockedReason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON projects("clientId");
CREATE INDEX ON projects(status);

CREATE TABLE project_versions (
  id        TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "versionNumber" INTEGER NOT NULL,
  label     TEXT NOT NULL,
  "planJson"         JSONB,
  "architectureJson" JSONB,
  "apiContractJson"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("projectId","versionNumber")
);

CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  "agentRole" "AgentRole" NOT NULL,
  status      "TaskStatus" NOT NULL DEFAULT 'PENDING',
  "orderIndex" INTEGER NOT NULL DEFAULT 0,
  attempts     INTEGER NOT NULL DEFAULT 0,
  "lastTestOutput"   TEXT,
  "lastFailureCount" INTEGER,
  "filesJson"        JSONB,
  "branchName"       TEXT,
  "pullRequestUrl"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON tasks("projectId");

-- Prisma's implicit self-referencing many-to-many join table.
CREATE TABLE "_TaskDependencies" (
  "A" TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  "B" TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX "_TaskDependencies_AB_unique" ON "_TaskDependencies"("A","B");
CREATE INDEX ON "_TaskDependencies"("B");

CREATE TABLE approvals (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "versionId" TEXT REFERENCES project_versions(id),
  stage       "ApprovalStage" NOT NULL,
  decision    "ApprovalDecision" NOT NULL,
  feedback    TEXT,
  "decidedById" TEXT NOT NULL REFERENCES users(id),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON approvals("projectId");

CREATE TABLE agent_runs (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "taskId"    TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  "agentRole" "AgentRole" NOT NULL,
  model       TEXT NOT NULL,
  status      "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
  "promptTokens"     INTEGER NOT NULL DEFAULT 0,
  "completionTokens" INTEGER NOT NULL DEFAULT 0,
  "costUsd"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  summary TEXT,
  error   TEXT,
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3)
);
CREATE INDEX ON agent_runs("projectId");

CREATE TABLE workflow_events (
  id          TEXT PRIMARY KEY,
  "projectId" TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  "fromStatus" "ProjectStatus",
  "toStatus"   "ProjectStatus",
  actor        TEXT NOT NULL DEFAULT 'system',
  message      TEXT NOT NULL,
  "dataJson"   JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ON workflow_events("projectId");
