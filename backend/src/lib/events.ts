import { ProjectStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getIO } from "../sockets";

/**
 * THE transition whitelist.
 *
 * Any status change that is not listed here is rejected. This is what stops a
 * buggy agent from, say, jumping a project straight from PLANNING to COMPLETED.
 */
export const ALLOWED_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  SUBMITTED: ["PLANNING", "CANCELLED"],
  PLANNING: ["CLIENT_APPROVAL_PLAN", "BLOCKED", "CANCELLED"],
  CLIENT_APPROVAL_PLAN: [
    "CHANGES_REQUESTED_PLAN",
    "DEVELOPMENT",
    "BLOCKED",
    "CANCELLED",
  ],
  CHANGES_REQUESTED_PLAN: ["PLANNING", "BLOCKED", "CANCELLED"],
  DEVELOPMENT: ["CODE_REVIEW", "QA", "BLOCKED", "CANCELLED"],
  CODE_REVIEW: ["QA", "DEVELOPMENT", "BLOCKED", "CANCELLED"],
  QA: ["TEST_FAILED", "STAGING_REVIEW", "DEVELOPMENT", "BLOCKED", "CANCELLED"],
  // A failed test sends work back to the developer. It does NOT touch the
  // client's revision counters.
  TEST_FAILED: ["DEVELOPMENT", "BLOCKED", "CANCELLED"],
  STAGING_REVIEW: [
    "CHANGES_REQUESTED_BUILD",
    "PRODUCTION_APPROVAL",
    "BLOCKED",
    "CANCELLED",
  ],
  CHANGES_REQUESTED_BUILD: ["DEVELOPMENT", "BLOCKED", "CANCELLED"],
  // STAGING_REVIEW: the build approval is withdrawn before production starts.
  PRODUCTION_APPROVAL: ["DEPLOYMENT", "STAGING_REVIEW", "BLOCKED", "CANCELLED"],
  DEPLOYMENT: ["COMPLETED", "BLOCKED", "CANCELLED"],
  COMPLETED: [],
  // Only a human admin can lift a block.
  BLOCKED: ["DEVELOPMENT", "PLANNING", "CANCELLED"],
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  public readonly status = 409;
  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`Invalid workflow transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

interface TransitionOptions {
  message: string;
  actor?: string;
  data?: Prisma.InputJsonValue;
  /** Extra project columns to write inside the same transaction. */
  patch?: Prisma.ProjectUncheckedUpdateInput;
}

/**
 * The ONE function every status change goes through.
 *
 * It validates against the whitelist, updates the project, appends an
 * immutable workflow_event, and broadcasts over Socket.io — atomically.
 * Nothing else in this codebase is allowed to write `project.status`.
 */
export async function transitionStatus(
  projectId: string,
  to: ProjectStatus,
  opts: TransitionOptions
) {
  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`Project not found: ${projectId}`);

    const from = project.status;

    // Re-entering the same state is a no-op, not an error: agents retry.
    if (from !== to && !canTransition(from, to)) {
      throw new InvalidTransitionError(from, to);
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: { ...(opts.patch ?? {}), status: to },
    });

    const event = await tx.workflowEvent.create({
      data: {
        projectId,
        type: "STATUS_CHANGE",
        fromStatus: from,
        toStatus: to,
        actor: opts.actor ?? "system",
        message: opts.message,
        dataJson: opts.data,
      },
    });

    return { project: updated, event, from };
  });

  const io = getIO();
  if (io) {
    io.to(`project:${projectId}`).emit("workflow:event", result.event);
    io.to(`project:${projectId}`).emit("project:updated", result.project);
    io.emit("projects:updated", {
      id: projectId,
      status: result.project.status,
    });
  }

  return result.project;
}

/**
 * Append a non-status event (agent started, task finished, test output...)
 * to the same audit log and broadcast it.
 */
export async function logEvent(
  projectId: string,
  type: string,
  message: string,
  data?: Prisma.InputJsonValue,
  actor = "system"
) {
  const event = await prisma.workflowEvent.create({
    data: { projectId, type, message, dataJson: data, actor },
  });

  const io = getIO();
  if (io) io.to(`project:${projectId}`).emit("workflow:event", event);

  return event;
}
