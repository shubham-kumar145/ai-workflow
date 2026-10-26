import { store } from "./store.js";

// Backend agents append their routes to this array.
export const routes = [
  {
    method: "GET",
    path: "/api/health",
    handler: () => ({ status: 200, body: { ok: true, service: "generated-app" } }),
  },
];

export { store };
