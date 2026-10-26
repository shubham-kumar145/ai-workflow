import { env } from "./env";

/**
 * Thin client for the Python AI service. Express is the front door; it never
 * blocks on the LLM — FastAPI accepts the job and runs it in a background task,
 * calling back into /internal/* as it goes.
 */
async function call(method: "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const url = `${env.AI_SERVICE_URL}${path}`;
  const controller = new AbortController();
  // Free hosts put an idle AI service to sleep; waking it can take about a
  // minute, and the request is held until it answers.
  const timeout = setTimeout(() => controller.abort(), 100_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI service ${res.status}: ${text}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const aiClient = {
  startWorkflow(projectId: string) {
    return call("POST", "/workflow/start", { project_id: projectId });
  },
  deleteProject(projectId: string) {
    return call("DELETE", `/workflow/${projectId}`);
  },
  async getArchive(projectId: string): Promise<Buffer | null> {
    const res = await fetch(`${env.AI_SERVICE_URL}/workflow/${projectId}/archive`, {
      headers: { "x-internal-secret": env.INTERNAL_SERVICE_SECRET },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`AI service ${res.status}: ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  },
  resumeWorkflow(
    projectId: string,
    action: "APPROVE_PLAN" | "REVISE_PLAN" | "APPROVE_BUILD" | "REVISE_BUILD" | "DEPLOY_PRODUCTION",
    feedback?: string
  ) {
    return call("POST", `/workflow/${projectId}/resume`, { action, feedback: feedback ?? null });
  },
  health() {
    return fetch(`${env.AI_SERVICE_URL}/health`).then((r) => r.ok).catch(() => false);
  },
};
