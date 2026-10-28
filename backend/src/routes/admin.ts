import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { transitionStatus } from "../lib/events";
import { aiClient, dispatch } from "../lib/aiClient";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/projects", async (_req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
    });
    res.json({ projects });
  } catch (e) {
    next(e);
  }
});

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [projects, blocked, completed, agg] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: "BLOCKED" } }),
      prisma.project.count({ where: { status: "COMPLETED" } }),
      prisma.agentRun.aggregate({
        _sum: { costUsd: true, promptTokens: true, completionTokens: true },
        _count: true,
      }),
    ]);
    res.json({
      projects,
      blocked,
      completed,
      agentRuns: agg._count,
      totalCostUsd: agg._sum.costUsd ?? 0,
      totalTokens: (agg._sum.promptTokens ?? 0) + (agg._sum.completionTokens ?? 0),
    });
  } catch (e) {
    next(e);
  }
});

/** Human escalation: lift a BLOCKED project and let the agents try again. */
adminRouter.post("/projects/:id/unblock", async (req, res, next) => {
  try {
    const body = z
      .object({
        note: z.string().max(2000).optional(),
        resetAttempts: z.boolean().default(true),
      })
      .parse(req.body);

    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (project.status !== "BLOCKED") {
      return res.status(409).json({ error: "Project is not BLOCKED" });
    }

    if (body.resetAttempts) {
      await prisma.task.updateMany({
        where: { projectId: project.id, status: { in: ["BLOCKED", "TEST_FAILED"] } },
        data: { status: "PENDING", attempts: 0 },
      });
    }

    const hasPlan = await prisma.projectVersion.count({ where: { projectId: project.id } });
    const target = hasPlan > 0 ? "DEVELOPMENT" : "PLANNING";

    await transitionStatus(project.id, target, {
      message: `Admin unblocked the project. ${body.note ?? ""}`.trim(),
      actor: req.user!.email,
      patch: { blockedReason: null },
    });

    // The note is for the audit log only. Passed as feedback, the agents would treat
    // it as a client change request and rebuild every task, including finished ones.
    dispatch(project.id, () => aiClient.resumeWorkflow(project.id, hasPlan > 0 ? "APPROVE_PLAN" : "REVISE_PLAN"));

    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    res.json({ project: updated });
  } catch (e) {
    next(e);
  }
});

/** Remove a project, its history, its running previews and its generated code. */
adminRouter.delete("/projects/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found" });

    // Still delete the record if the AI service is down; only the cleanup is lost.
    let cleanupWarning: string | null = null;
    try {
      const cleanup = (await aiClient.deleteProject(project.id)) as { workspace_removed?: boolean; errors?: string[] };
      if (cleanup.workspace_removed === false) {
        cleanupWarning = `The project was deleted, but some generated files could not be removed: ${(cleanup.errors ?? []).join("; ") || "a file is still in use"}`;
      }
    } catch (e) {
      cleanupWarning = `Previews and generated code were not cleaned up: ${(e as Error).message}`;
      console.error("[admin.delete]", e);
    }

    await prisma.project.delete({ where: { id: project.id } });
    res.json({ deleted: true, cleanupWarning });
  } catch (e) {
    next(e);
  }
});

adminRouter.post("/projects/:id/cancel", async (req, res, next) => {
  try {
    await transitionStatus(req.params.id, "CANCELLED", {
      message: "Admin cancelled the project.",
      actor: req.user!.email,
    });
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    res.json({ project });
  } catch (e) {
    next(e);
  }
});
