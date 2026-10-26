import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireInternalSecret } from "../middleware/internal";
import { transitionStatus, logEvent } from "../lib/events";

export const internalRouter = Router();
internalRouter.use(requireInternalSecret);

const AGENT_ROLES = [
  "PROJECT_MANAGER",
  "ARCHITECT",
  "FRONTEND_DEV",
  "BACKEND_DEV",
  "QA_ENGINEER",
  "DEVOPS",
] as const;

const TASK_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "CODE_REVIEW",
  "QA",
  "TEST_FAILED",
  "DONE",
  "BLOCKED",
] as const;

const PROJECT_STATUSES = [
  "SUBMITTED", "PLANNING", "CLIENT_APPROVAL_PLAN", "CHANGES_REQUESTED_PLAN",
  "DEVELOPMENT", "CODE_REVIEW", "QA", "TEST_FAILED", "STAGING_REVIEW",
  "CHANGES_REQUESTED_BUILD", "PRODUCTION_APPROVAL", "DEPLOYMENT",
  "COMPLETED", "BLOCKED", "CANCELLED",
] as const;

/** Everything the AI service needs to rebuild graph state after a pause. */
internalRouter.get("/projects/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { dependencies: { select: { id: true } } },
        },
        versions: { orderBy: { versionNumber: "desc" } },
        approvals: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project });
  } catch (e) {
    next(e);
  }
});

/** Immutable snapshot. Approvals point at one of these. */
internalRouter.post("/projects/:id/versions", async (req, res, next) => {
  try {
    const body = z
      .object({
        label: z.string().min(1),
        planJson: z.any().optional(),
        architectureJson: z.any().optional(),
        apiContractJson: z.any().optional(),
      })
      .parse(req.body);

    const last = await prisma.projectVersion.findFirst({
      where: { projectId: req.params.id },
      orderBy: { versionNumber: "desc" },
    });

    const version = await prisma.projectVersion.create({
      data: {
        projectId: req.params.id,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        label: body.label,
        planJson: body.planJson ?? undefined,
        architectureJson: body.architectureJson ?? undefined,
        apiContractJson: body.apiContractJson ?? undefined,
      },
    });

    await prisma.project.update({
      where: { id: req.params.id },
      data: { currentVersionId: version.id },
    });

    await logEvent(
      req.params.id,
      "VERSION_CREATED",
      `Snapshot v${version.versionNumber} — ${version.label}`,
      { versionId: version.id }
    );

    res.status(201).json({ version });
  } catch (e) {
    next(e);
  }
});

/** Replace the task list (used after planning / replanning). */
internalRouter.post("/projects/:id/tasks", async (req, res, next) => {
  try {
    const body = z
      .object({
        replace: z.boolean().default(true),
        tasks: z
          .array(
            z.object({
              key: z.string(),
              title: z.string().min(1),
              description: z.string().default(""),
              agentRole: z.enum(AGENT_ROLES),
              orderIndex: z.number().int().default(0),
              dependsOn: z.array(z.string()).default([]),
            })
          )
          .max(40),
      })
      .parse(req.body);

    if (body.replace) {
      await prisma.task.deleteMany({ where: { projectId: req.params.id } });
    }

    const keyToId = new Map<string, string>();
    for (const t of body.tasks) {
      const created = await prisma.task.create({
        data: {
          projectId: req.params.id,
          title: t.title,
          description: t.description,
          agentRole: t.agentRole,
          orderIndex: t.orderIndex,
        },
      });
      keyToId.set(t.key, created.id);
    }

    // Second pass: wire up the dependency graph now that every id exists.
    for (const t of body.tasks) {
      const ids = t.dependsOn
        .map((k) => keyToId.get(k))
        .filter((v): v is string => Boolean(v));
      if (ids.length) {
        await prisma.task.update({
          where: { id: keyToId.get(t.key)! },
          data: { dependencies: { connect: ids.map((id) => ({ id })) } },
        });
      }
    }

    await logEvent(
      req.params.id,
      "TASKS_CREATED",
      `Project Manager created ${body.tasks.length} tasks.`
    );

    const tasks = await prisma.task.findMany({
      where: { projectId: req.params.id },
      orderBy: { orderIndex: "asc" },
      include: { dependencies: { select: { id: true } } },
    });
    res.status(201).json({ tasks });
  } catch (e) {
    next(e);
  }
});

internalRouter.patch("/tasks/:taskId", async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(TASK_STATUSES).optional(),
        attempts: z.number().int().min(0).optional(),
        incrementAttempts: z.boolean().optional(),
        lastTestOutput: z.string().max(20000).optional(),
        lastFailureCount: z.number().int().optional(),
        filesJson: z.any().optional(),
        branchName: z.string().optional(),
        pullRequestUrl: z.string().optional(),
      })
      .parse(req.body);

    const task = await prisma.task.update({
      where: { id: req.params.taskId },
      data: {
        status: body.status,
        attempts: body.incrementAttempts ? { increment: 1 } : body.attempts,
        lastTestOutput: body.lastTestOutput,
        lastFailureCount: body.lastFailureCount,
        filesJson: body.filesJson ?? undefined,
        branchName: body.branchName,
        pullRequestUrl: body.pullRequestUrl,
      },
    });

    await logEvent(
      task.projectId,
      "TASK_UPDATED",
      `${task.title} → ${task.status}${task.attempts ? ` (attempt ${task.attempts})` : ""}`,
      { taskId: task.id, status: task.status, attempts: task.attempts }
    );

    res.json({ task });
  } catch (e) {
    next(e);
  }
});

/** Open an agent run row; the LLM call is about to happen. */
internalRouter.post("/agent-runs", async (req, res, next) => {
  try {
    const body = z
      .object({
        projectId: z.string(),
        taskId: z.string().nullable().optional(),
        agentRole: z.enum(AGENT_ROLES),
        model: z.string(),
      })
      .parse(req.body);

    const run = await prisma.agentRun.create({
      data: {
        projectId: body.projectId,
        taskId: body.taskId ?? null,
        agentRole: body.agentRole,
        model: body.model,
        status: "RUNNING",
      },
    });

    await logEvent(
      body.projectId,
      "AGENT_STARTED",
      `${body.agentRole.replace(/_/g, " ")} agent started working.`,
      { agentRunId: run.id, agentRole: body.agentRole }
    );

    res.status(201).json({ run });
  } catch (e) {
    next(e);
  }
});

/** Close an agent run and roll its cost up onto the project. */
internalRouter.patch("/agent-runs/:runId", async (req, res, next) => {
  try {
    const body = z
      .object({
        status: z.enum(["SUCCESS", "FAILED"]),
        promptTokens: z.number().int().min(0).default(0),
        completionTokens: z.number().int().min(0).default(0),
        costUsd: z.number().min(0).default(0),
        summary: z.string().max(4000).optional(),
        error: z.string().max(4000).optional(),
      })
      .parse(req.body);

    const run = await prisma.agentRun.update({
      where: { id: req.params.runId },
      data: { ...body, finishedAt: new Date() },
    });

    const project = await prisma.project.update({
      where: { id: run.projectId },
      data: { costUsd: { increment: body.costUsd } },
    });

    await logEvent(
      run.projectId,
      "AGENT_FINISHED",
      `${run.agentRole.replace(/_/g, " ")} agent finished (${body.status}) — $${body.costUsd.toFixed(4)}`,
      { agentRunId: run.id, costUsd: body.costUsd, summary: body.summary ?? null }
    );

    // Budget cap: pause rather than burn through the client's money.
    const overBudget = project.costUsd > project.budgetCapUsd;
    res.json({ run, projectCostUsd: project.costUsd, overBudget });
  } catch (e) {
    next(e);
  }
});

/** The AI service's only way to move the state machine. */
internalRouter.post("/projects/:id/status", async (req, res, next) => {
  try {
    const body = z
      .object({
        to: z.enum(PROJECT_STATUSES),
        message: z.string().min(1),
        actor: z.string().default("ai-service"),
        data: z.any().optional(),
        stagingUrl: z.string().optional(),
        productionUrl: z.string().optional(),
        workspacePath: z.string().optional(),
        releaseSummary: z.string().optional(),
        blockedReason: z.string().optional(),
      })
      .parse(req.body);

    const project = await transitionStatus(req.params.id, body.to, {
      message: body.message,
      actor: body.actor,
      data: body.data ?? undefined,
      patch: {
        stagingUrl: body.stagingUrl,
        productionUrl: body.productionUrl,
        workspacePath: body.workspacePath,
        releaseSummary: body.releaseSummary,
        blockedReason: body.blockedReason,
      },
    });

    res.json({ project });
  } catch (e) {
    next(e);
  }
});

/** Save a zip of the generated code, so a preview can be restored after the AI service's disk is wiped. */
internalRouter.put("/projects/:id/workspace", async (req, res, next) => {
  try {
    const body = z.object({ archiveBase64: z.string().min(1).max(1_400_000) }).parse(req.body);
    const archive = Buffer.from(body.archiveBase64, "base64");
    await prisma.workspaceSnapshot.upsert({
      where: { projectId: req.params.id },
      create: { projectId: req.params.id, archive, sizeBytes: archive.length },
      update: { archive, sizeBytes: archive.length },
    });
    res.json({ saved: true, sizeBytes: archive.length });
  } catch (e) {
    next(e);
  }
});

internalRouter.get("/projects/:id/workspace", async (req, res, next) => {
  try {
    const snap = await prisma.workspaceSnapshot.findUnique({ where: { projectId: req.params.id } });
    if (!snap) return res.status(404).json({ error: "No saved workspace for this project" });
    res.json({ archiveBase64: Buffer.from(snap.archive).toString("base64"), savedAt: snap.savedAt });
  } catch (e) {
    next(e);
  }
});

internalRouter.post("/projects/:id/events", async (req, res, next) => {
  try {
    const body = z
      .object({
        type: z.string().min(1),
        message: z.string().min(1),
        data: z.any().optional(),
        actor: z.string().default("ai-service"),
      })
      .parse(req.body);

    const event = await logEvent(
      req.params.id,
      body.type,
      body.message,
      body.data ?? undefined,
      body.actor
    );
    res.status(201).json({ event });
  } catch (e) {
    next(e);
  }
});
