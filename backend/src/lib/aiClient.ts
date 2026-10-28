import { env } from "./env";
import { transitionStatus } from "./events";

/**
 * Thin client for the Python AI service. Express is the front door; it never
 * blocks on the LLM — FastAPI accepts the job and runs it in a background task,
 * calling back into /internal/* as it goes.
 */

// A free host puts an idle AI service to sleep. While it wakes (it can take
// two minutes or more) the host's proxy answers 502/503/504 or drops the
// connection; those are worth waiting out rather than failing the project.
const RETRY_STATUS = new Set([502, 503, 504]);
const WAKE_WINDOW_MS = 180_000;
const ATTEMPT_TIMEOUT_MS = 100_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One readable sentence, never a whole HTML error page. */
function describe(status: number, text: string): string {
  const body = text.trim();
  if (body.startsWith("<")) {
    return `the AI service was unavailable (HTTP ${status}). On a free host it may still have been waking up.`;
  }
  return `the AI service answered HTTP ${status}: ${body.slice(0, 300)}`;
}

async function attempt(method: "POST" | "DELETE", path: string, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    return await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function call(method: "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
  const deadline = Date.now() + WAKE_WINDOW_MS;
  for (let n = 1; ; n++) {
    let res: Response | null = null;
    let networkError: Error | null = null;
    try {
      res = await attempt(method, path, body);
    } catch (e) {
      networkError = e as Error;
    }

    if (res?.ok) return await res.json();

    const retryable = networkError !== null || RETRY_STATUS.has(res!.status);
    const wait = Math.min(5_000 * n, 20_000);
    if (retryable && Date.now() + wait < deadline) {
      await sleep(wait);
      continue;
    }
    if (networkError) throw new Error(`could not reach the AI service (${networkError.message})`);
    throw new Error(describe(res!.status, await res!.text()));
  }
}

let lastWake = 0;

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
    if (!res.ok) throw new Error(describe(res.status, await res.text()));
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
  /**
   * Nudge a sleeping AI service awake in the background (at most once a
   * minute), so it is usually ready by the time someone submits a brief.
   */
  wake() {
    if (Date.now() - lastWake < 60_000) return;
    lastWake = Date.now();
    fetch(`${env.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS) }).catch(() => undefined);
  },
};

/**
 * Start or resume a workflow without making the caller wait. If the AI service
 * still cannot be reached after its wake-up window, block the project with a
 * short reason instead of leaving it silently stuck.
 */
export function dispatch(projectId: string, run: () => Promise<unknown>): void {
  run().catch(async (err: Error) => {
    console.error("[aiClient]", projectId, err.message);
    const reason = `Could not start the agents: ${err.message} An admin can use Unblock and retry.`;
    await transitionStatus(projectId, "BLOCKED", {
      message: reason,
      patch: { blockedReason: reason.slice(0, 500) },
    }).catch(() => undefined);
  });
}
