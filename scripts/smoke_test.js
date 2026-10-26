/**
 * Full-stack smoke test. Run it after all three services are up:
 *
 *     node scripts/smoke_test.js
 *
 * It drives a project the whole way through as a real client would —
 * signup, submit, approve the plan, wait for the build, approve staging,
 * sign off production — and asserts the staging app really serves traffic.
 * Zero dependencies.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const AI = process.env.AI_SERVICE_URL || "http://localhost:8000";
const ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL || "admin@aiworkflow.dev",
  password: process.env.SEED_ADMIN_PASSWORD || "admin1234",
};

let token = null;
const log = (...a) => console.log(...a);
const fail = (msg) => {
  console.error(`\n  FAILED: ${msg}\n`);
  process.exit(1);
};

async function call(path, { method = "GET", body, base = BACKEND } = {}) {
  const send = () =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  // Hosted proxies (Render) occasionally drop a connection. Retry reads only;
  // retrying a POST could approve or submit twice.
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await send();
      break;
    } catch (err) {
      if (method !== "GET" || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? text}`);
  return data;
}

async function waitForStatus(id, wanted, timeoutMs = 480_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const { project } = await call(`/api/projects/${id}`);
    if (project.status !== last) {
      last = project.status;
      log(`      status: ${project.status}`);
    }
    if (wanted.includes(project.status)) return project;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`timed out waiting for ${wanted.join(" or ")}; last status was ${last}`);
}

async function main() {
  log("\n== 1. services are up ==");
  const health = await call("/health");
  if (!health.ok) fail("backend /health is not ok");
  log(`   backend: db ${health.db}`);

  const aiHealth = await call("/health", { base: AI });
  log(`   ai-service: model ${aiHealth.model}, mock_mode=${aiHealth.mock_mode}, qa sandbox=${aiHealth.qa_sandbox}`);
  if (aiHealth.mock_mode) {
    log("   (no OPENAI_API_KEY: agents are simulated, but file writes, tests and deploys are real)");
  }

  const dbHealth = await call("/health/db", { base: AI });
  if (!dbHealth.ok) fail(`ai-service cannot reflect the database: ${dbHealth.error}`);
  log(`   ai-service reflected ${dbHealth.tables.length} tables`);

  log("\n== 2. sign in as a client ==");
  const email = `smoke+${Date.now()}@example.com`;
  const signup = await call("/api/auth/signup", {
    method: "POST",
    body: { name: "Smoke Test", email, password: "smoketest123" },
  });
  token = signup.token;
  log(`   signed up ${email}`);

  log("\n== 3. submit a project ==");
  const { project } = await call("/api/projects", {
    method: "POST",
    body: {
      title: "Task manager app",
      requirements:
        "Build a task manager where a user can add tasks, list them, open one task and delete a task. Keep it simple.",
      budget: 500,
      budgetCapUsd: 5,
    },
  });
  log(`   project ${project.id}`);

  log("\n== 4. agents plan it (PM then Architect) ==");
  const planned = await waitForStatus(project.id, ["CLIENT_APPROVAL_PLAN", "BLOCKED"]);
  if (planned.status === "BLOCKED") fail(`planning blocked: ${planned.blockedReason}`);
  if (!planned.tasks?.length) fail("the planner produced no tasks");
  if (!planned.versions?.length) fail("no version snapshot was created");
  log(`   ${planned.tasks.length} tasks, snapshot v${planned.versions[0].versionNumber}`);

  log("\n== 5. request one change, then approve (revision counter) ==");
  await call(`/api/projects/${project.id}/approvals`, {
    method: "POST",
    body: { stage: "PLAN", decision: "CHANGES_REQUESTED", feedback: "Please also allow marking a task as done." },
  });
  const replanned = await waitForStatus(project.id, ["CLIENT_APPROVAL_PLAN", "BLOCKED"]);
  if (replanned.status === "BLOCKED") fail(`replanning blocked: ${replanned.blockedReason}`);
  if (replanned.planRevisionCount !== 1) fail(`planRevisionCount should be 1, got ${replanned.planRevisionCount}`);
  log(`   plan revisions used: ${replanned.planRevisionCount}/${replanned.maxPlanRevisions}`);

  await call(`/api/projects/${project.id}/approvals`, {
    method: "POST",
    body: { stage: "PLAN", decision: "APPROVED" },
  });
  log("   plan approved");

  log("\n== 6. agents build it; QA runs real tests ==");
  const built = await waitForStatus(project.id, ["STAGING_REVIEW", "BLOCKED"], 420_000);
  if (built.status === "BLOCKED") fail(`build blocked: ${built.blockedReason}`);

  const testRuns = (built.events ?? []).filter((e) => e.type === "TEST_RUN");
  if (!testRuns.length) fail("QA never ran — no TEST_RUN events");
  log(`   ${testRuns.length} real test run(s); latest: ${testRuns[0].message}`);

  // Self-repair retries must never have consumed a client revision.
  if (built.planRevisionCount !== 1) fail("plan revision count changed during the build");
  if (built.buildRevisionCount !== 0) fail("a QA retry consumed a build revision — the counters are not separate");
  log("   revision counters still separate from agent retries");

  if (!built.stagingUrl) fail("no staging URL");
  const staging = await fetch(`${built.stagingUrl}/api/health`);
  if (staging.status !== 200) fail(`staging URL returned ${staging.status}`);
  log(`   staging live: ${built.stagingUrl} -> 200`);

  log("\n== 7. approve the build ==");
  await call(`/api/projects/${project.id}/approvals`, {
    method: "POST",
    body: { stage: "BUILD", decision: "APPROVED" },
  });
  await waitForStatus(project.id, ["PRODUCTION_APPROVAL"]);
  log("   awaiting admin sign-off");

  log("\n== 8. admin approves production ==");
  const adminLogin = await call("/api/auth/login", { method: "POST", body: ADMIN });
  token = adminLogin.token;
  if (adminLogin.user.role !== "ADMIN") fail("seeded admin does not have the ADMIN role — run `npm run seed`");

  await call(`/api/projects/${project.id}/approvals`, {
    method: "POST",
    body: { stage: "PRODUCTION", decision: "APPROVED" },
  });
  const done = await waitForStatus(project.id, ["COMPLETED", "BLOCKED"]);
  if (done.status !== "COMPLETED") fail(`expected COMPLETED, got ${done.status}: ${done.blockedReason}`);

  log(`   production: ${done.productionUrl}`);
  log(`   total agent spend: $${Number(done.costUsd).toFixed(4)}`);

  log("\n==================================================");
  log("  All good. The full workflow runs end to end.");
  log("==================================================\n");
}

main().catch((err) => fail(err.message));
