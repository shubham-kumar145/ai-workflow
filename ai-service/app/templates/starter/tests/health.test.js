import test from "node:test";
import assert from "node:assert/strict";
import { routes } from "../src/routes.js";
import { handle } from "../src/router.js";

test("health route returns 200", async () => {
  const res = await handle(routes, { method: "GET", path: "/api/health" });
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test("unknown route returns 404", async () => {
  const res = await handle(routes, { method: "GET", path: "/api/nope" });
  assert.equal(res.status, 404);
});
