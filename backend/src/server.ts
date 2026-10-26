import express from "express";
import cors from "cors";
import { createServer } from "http";
import { env } from "./lib/env";
import { prisma } from "./lib/prisma";
import { initSockets } from "./sockets";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { approvalsRouter } from "./routes/approvals";
import { internalRouter } from "./routes/internal";
import { adminRouter } from "./routes/admin";
import { notFound, errorHandler } from "./middleware/error";
import { ALLOWED_TRANSITIONS } from "./lib/events";

const app = express();

// Behind a hosting proxy (Render) the client's IP arrives in X-Forwarded-For;
// without this every visitor shares one IP and one login rate limit.
if (env.NODE_ENV === "production") app.set("trust proxy", 1);
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "backend", db: "up" });
  } catch (e) {
    res.status(503).json({ ok: false, db: "down", error: String(e) });
  }
});

app.get("/api/meta/transitions", (_req, res) => {
  res.json({ transitions: ALLOWED_TRANSITIONS });
});

// The self-repair budget is the AI service's setting; read it there so the UI never drifts.
app.get("/api/meta/limits", async (_req, res) => {
  try {
    const r = await fetch(`${env.AI_SERVICE_URL}/health`);
    const body = (await r.json()) as { max_self_repair_retries?: number };
    res.json({ maxSelfRepairRetries: body.max_self_repair_retries ?? null });
  } catch {
    res.json({ maxSelfRepairRetries: null });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api", approvalsRouter);
app.use("/api/admin", adminRouter);
app.use("/internal", internalRouter);

app.use(notFound);
app.use(errorHandler);

const httpServer = createServer(app);
initSockets(httpServer);

httpServer.listen(env.PORT, () => {
  console.log(`[backend] http://localhost:${env.PORT}`);
  console.log(`[backend] AI service at ${env.AI_SERVICE_URL}`);
});

async function shutdown() {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
