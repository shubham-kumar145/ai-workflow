# Generated App

Written by the AI agents of AI Work Flow. Dependency-free on purpose: the QA
agent can run `npm test` with no install step, so test results are real.

    npm start   # http://localhost:3000
    npm test    # node --test

- `server.js` — node:http server; serves `public/` and mounts `/api/*`
- `src/router.js` — matches routes; handlers are pure functions
- `src/routes.js` — the route table the backend agent extends
- `src/store.js` — in-memory data store
- `public/` — the frontend agent's output
- `tests/` — node:test suites
