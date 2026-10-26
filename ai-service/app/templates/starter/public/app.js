const statusEl = document.getElementById("status");
const app = document.getElementById("app");

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  return res.json();
}

async function init() {
  try {
    const health = await api("/api/health");
    statusEl.textContent = health.ok ? "API online" : "API responded unexpectedly";
  } catch {
    statusEl.textContent = "API offline";
  }
  app.innerHTML = '<div class="card"><p>Frontend agent output appears here.</p></div>';
}

init();
