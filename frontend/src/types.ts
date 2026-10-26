export type Role = "CLIENT" | "ADMIN";

export type ProjectStatus =
  | "SUBMITTED" | "PLANNING" | "CLIENT_APPROVAL_PLAN" | "CHANGES_REQUESTED_PLAN"
  | "DEVELOPMENT" | "CODE_REVIEW" | "QA" | "TEST_FAILED" | "STAGING_REVIEW"
  | "CHANGES_REQUESTED_BUILD" | "PRODUCTION_APPROVAL" | "DEPLOYMENT"
  | "COMPLETED" | "BLOCKED" | "CANCELLED";

export type TaskStatus =
  | "PENDING" | "IN_PROGRESS" | "CODE_REVIEW" | "QA" | "TEST_FAILED" | "DONE" | "BLOCKED";

export type AgentRole =
  | "PROJECT_MANAGER" | "ARCHITECT" | "FRONTEND_DEV" | "BACKEND_DEV" | "QA_ENGINEER" | "DEVOPS";

export interface User { id: string; name: string; email: string; role: Role }

export interface Task {
  id: string;
  title: string;
  description: string;
  agentRole: AgentRole;
  status: TaskStatus;
  orderIndex: number;
  attempts: number;
  lastTestOutput?: string | null;
  filesJson?: { files?: string[]; summary?: string } | null;
  dependencies?: { id: string; title?: string }[];
}

export interface ProjectVersion {
  id: string;
  versionNumber: number;
  label: string;
  planJson?: any;
  architectureJson?: any;
  apiContractJson?: any;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  agentRole: AgentRole;
  model: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  summary?: string | null;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface WorkflowEvent {
  id: string;
  type: string;
  fromStatus?: ProjectStatus | null;
  toStatus?: ProjectStatus | null;
  actor: string;
  message: string;
  dataJson?: any;
  createdAt: string;
}

export interface Approval {
  id: string;
  stage: "PLAN" | "BUILD" | "PRODUCTION";
  decision: "APPROVED" | "CHANGES_REQUESTED";
  feedback?: string | null;
  createdAt: string;
  decidedBy?: { id: string; name: string };
}

export interface Project {
  id: string;
  title: string;
  requirements: string;
  budget: number;
  deadline?: string | null;
  status: ProjectStatus;
  clientId: string;
  client?: { id: string; name: string; email: string };
  planRevisionCount: number;
  buildRevisionCount: number;
  maxPlanRevisions: number;
  maxBuildRevisions: number;
  costUsd: number;
  budgetCapUsd: number;
  stagingUrl?: string | null;
  productionUrl?: string | null;
  releaseSummary?: string | null;
  blockedReason?: string | null;
  workspacePath?: string | null;
  createdAt: string;
  tasks?: Task[];
  versions?: ProjectVersion[];
  approvals?: Approval[];
  agentRuns?: AgentRun[];
  events?: WorkflowEvent[];
  _count?: { tasks: number; events: number };
}
