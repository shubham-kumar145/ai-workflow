import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { transitionStatus, logEvent } from "../lib/events";
import { aiClient, dispatch } from "../lib/aiClient";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

const createSchema = z.object({
  title: z.string().min(3).max(120),
  requirements: z.string().min(20).max(8000),
  budget: z.number().min(0).max(1_000_000).default(0),
  deadline: z.string().datetime().optional().nullable(),
  budgetCapUsd: z.number().min(0.1).max(100).default(5),
});

/**
 * Client requirements are injected into LLM prompts, so strip the obvious
 * prompt-injection shapes before they ever reach an agent.
 */
function sanitizeRequirements(input: string): string {
  return input
    .replace(/```/g, "'''")
    .replace(/^\s*(system|assistant|developer)\s*:/gim, "note:")
    .replace(/ignore (all )?(previous|prior|above) instructions/gi, "[removed]")
    .trim();
}

projectsRouter.get("/", async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === "ADMIN";
    const projects = await prisma.project.findMany({
      where: isAdmin ? {} : { clientId: req.user!.sub },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true, events: true } },
      },
    });
    res.json({ projects });
  } catch (e) {
    next(e);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        client: { select: { id: true, name: true, email: true } },
        tasks: {
          orderBy: { orderIndex: "asc" },
          include: { dependencies: { select: { id: true, title: true } } },
        },
        versions: { orderBy: { versionNumber: "desc" } },
        approvals: {
          orderBy: { createdAt: "desc" },
          include: { decidedBy: { select: { id: true, name: true } } },
        },
        agentRuns: { orderBy: { startedAt: "desc" }, take: 100 },
        events: { orderBy: { createdAt: "desc" }, take: 200 },
      },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });
    if (req.user!.role !== "ADMIN" && project.clientId !== req.user!.sub) {
      return res.status(403).json({ error: "Not your project" });
    }

    res.json({ project });
  } catch (e) {
    next(e);
  }
});

projectsRouter.get("/:id/download", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) return res.status(404).json({ error: "Project not found" });
    if (req.user!.role !== "ADMIN" && project.clientId !== req.user!.sub) {
      return res.status(403).json({ error: "Not your project" });
    }

    const zip = await aiClient.getArchive(project.id);
    if (!zip) return res.status(404).json({ error: "No generated code for this project yet" });

    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}-source.zip"`);
    res.send(zip);
  } catch (e) {
    next(e);
  }
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const body = createSchema.parse(req.body);

    const project = await prisma.project.create({
      data: {
        title: body.title,
        requirements: sanitizeRequirements(body.requirements),
        budget: body.budget,
        budgetCapUsd: body.budgetCapUsd,
        deadline: body.deadline ? new Date(body.deadline) : null,
        clientId: req.user!.sub,
        status: "SUBMITTED",
      },
    });

    await logEvent(
      project.id,
      "PROJECT_SUBMITTED",
      `Project "${project.title}" submitted by the client.`,
      undefined,
      req.user!.email
    );

    await transitionStatus(project.id, "PLANNING", {
      message: "Handing the brief to the Project Manager agent.",
      actor: "system",
    });

    // Fire and forget: FastAPI returns immediately and works in the background.
    dispatch(project.id, () => aiClient.startWorkflow(project.id));

    res.status(201).json({ project });
  } catch (e) {
    next(e);
  }
});

projectsRouter.get("/:id/events", async (req, res, next) => {
  try {
    const events = await prisma.workflowEvent.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ events });
  } catch (e) {
    next(e);
  }
});
