import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { transitionStatus } from "../lib/events";
import { aiClient } from "../lib/aiClient";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

const approvalSchema = z.object({
  stage: z.enum(["PLAN", "BUILD", "PRODUCTION"]),
  decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  feedback: z.string().max(20_000, "Feedback is too long (max 20,000 characters).").optional(),
});

/**
 * The client's approval gate.
 *
 * Revision budgets live here and ONLY here. `planRevisionCount` and
 * `buildRevisionCount` are incremented when the *client* asks for changes.
 * A failing QA run is a different thing entirely — it bumps `task.attempts`
 * (max 3) and never touches these numbers.
 */
/**
 * Undo a build approval that was clicked by mistake. Only possible while the
 * project waits for production sign-off, because nothing has run yet.
 */
approvalsRouter.post("/projects/:id/withdraw-approval", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (req.user!.role !== "ADMIN" && project.clientId !== req.user!.sub) {
      return res.status(403).json({ error: "Not your project" });
    }
    if (project.status !== "PRODUCTION_APPROVAL") {
      return res.status(409).json({
        error: `Project is ${project.status}; an approval can only be withdrawn while it waits for production sign-off.`,
      });
    }

    const updated = await transitionStatus(project.id, "STAGING_REVIEW", {
      message: "Build approval withdrawn. The build is back in staging review.",
      actor: req.user!.email,
    });
    res.json({ project: updated });
  } catch (e) {
    next(e);
  }
});

approvalsRouter.post("/projects/:id/approvals", async (req, res, next) => {
  try {
    const body = approvalSchema.parse(req.body);
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });

    const isAdmin = req.user!.role === "ADMIN";
    const isOwner = project.clientId === req.user!.sub;
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: "Not your project" });
    }
    if (body.stage === "PRODUCTION" && !isAdmin) {
      return res
        .status(403)
        .json({ error: "Only an admin can approve a production deploy" });
    }

    // The approval must point at an exact, immutable version snapshot.
    const version = project.versions[0] ?? null;

    const expectedStatus = {
      PLAN: "CLIENT_APPROVAL_PLAN",
      BUILD: "STAGING_REVIEW",
      PRODUCTION: "PRODUCTION_APPROVAL",
    }[body.stage];

    if (project.status !== expectedStatus) {
      return res.status(409).json({
        error: `Project is ${project.status}; a ${body.stage} decision needs ${expectedStatus}.`,
      });
    }

    if (body.decision === "CHANGES_REQUESTED" && !body.feedback?.trim()) {
      return res
        .status(400)
        .json({ error: "Tell the agents what to change — feedback is required." });
    }

    // ---- Revision budget check (client-initiated changes only) ----
    if (body.decision === "CHANGES_REQUESTED") {
      if (body.stage === "PLAN" && project.planRevisionCount >= project.maxPlanRevisions) {
        return res.status(409).json({
          error: `Plan revision limit reached (${project.planRevisionCount}/${project.maxPlanRevisions}). The project ships as planned, or needs a new paid round.`,
        });
      }
      if (body.stage === "BUILD" && project.buildRevisionCount >= project.maxBuildRevisions) {
        return res.status(409).json({
          error: `Build revision limit reached (${project.buildRevisionCount}/${project.maxBuildRevisions}). The project ships as built, or needs a new paid round.`,
        });
      }
      if (body.stage === "PRODUCTION") {
        return res
          .status(400)
          .json({ error: "Production is approve-or-cancel; there is no revision round." });
      }
    }

    await prisma.approval.create({
      data: {
        projectId: project.id,
        versionId: version?.id ?? null,
        stage: body.stage,
        decision: body.decision,
        feedback: body.feedback ?? null,
        decidedById: req.user!.sub,
      },
    });

    const actor = req.user!.email;

    // ---- Drive the state machine ----
    if (body.stage === "PLAN" && body.decision === "APPROVED") {
      await transitionStatus(project.id, "DEVELOPMENT", {
        message: "Client approved the plan. Developer agents are picking up tasks.",
        actor,
        data: { versionId: version?.id ?? null },
      });
      aiClient.resumeWorkflow(project.id, "APPROVE_PLAN").catch(console.error);
    } else if (body.stage === "PLAN") {
      await transitionStatus(project.id, "CHANGES_REQUESTED_PLAN", {
        message: `Client requested plan changes (${project.planRevisionCount + 1}/${project.maxPlanRevisions}).`,
        actor,
        data: { feedback: body.feedback ?? "" },
        patch: { planRevisionCount: { increment: 1 } },
      });
      await transitionStatus(project.id, "PLANNING", {
        message: "Project Manager agent is replanning with the client's feedback.",
        actor: "system",
      });
      aiClient.resumeWorkflow(project.id, "REVISE_PLAN", body.feedback).catch(console.error);
    } else if (body.stage === "BUILD" && body.decision === "APPROVED") {
      await transitionStatus(project.id, "PRODUCTION_APPROVAL", {
        message: "Client approved the staging build. Waiting on admin sign-off for production.",
        actor,
      });
    } else if (body.stage === "BUILD") {
      await transitionStatus(project.id, "CHANGES_REQUESTED_BUILD", {
        message: `Client requested build changes (${project.buildRevisionCount + 1}/${project.maxBuildRevisions}).`,
        actor,
        data: { feedback: body.feedback ?? "" },
        patch: { buildRevisionCount: { increment: 1 } },
      });
      await transitionStatus(project.id, "DEVELOPMENT", {
        message: "Developer agents are reworking the build.",
        actor: "system",
      });
      aiClient.resumeWorkflow(project.id, "REVISE_BUILD", body.feedback).catch(console.error);
    } else if (body.stage === "PRODUCTION") {
      await transitionStatus(project.id, "DEPLOYMENT", {
        message: "Admin approved production. DevOps agent is deploying.",
        actor,
      });
      aiClient.resumeWorkflow(project.id, "DEPLOY_PRODUCTION").catch(console.error);
    }

    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    res.status(201).json({ project: updated });
  } catch (e) {
    next(e);
  }
});
