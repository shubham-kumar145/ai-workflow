// Routes are pure functions, which is what makes the QA agent's job honest:
// a test can call a handler directly and assert on the result, with no
// network, no ports and no sleeping.
//
// A route looks like:
//   { method: 'GET', path: '/api/items/:id', handler: ({ params, query, body, headers }) => ({ status, body, headers? }) }
// headers holds the lowercased request headers (e.g. headers.cookie, headers.authorization).

export function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.path.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    if (routeParts.length !== pathParts.length) continue;

    const params = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(":")) {
        params[routeParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      } else if (routeParts[i] !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export async function handle(routes, { method, path, query = {}, body = null, headers = {} }) {
  const match = matchRoute(routes, method, path);
  if (!match) return { status: 404, body: { error: "Not found" } };
  try {
    return await match.route.handler({ params: match.params, query, body, headers });
  } catch (err) {
    return { status: 500, body: { error: String(err && err.message) || "Error" } };
  }
}
