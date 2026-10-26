from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .agents import devops as devops_agent
from .agents.qa import sandbox_mode
from .api.workflow import router as workflow_router
from .config import settings
from .db import models as db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("ai-service")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("model=%s mock_mode=%s", settings.OPENAI_MODEL, settings.mock_mode)
    log.info("qa sandbox=%s  workspaces=%s", sandbox_mode(), settings.WORKSPACE_ROOT)
    if settings.mock_mode:
        log.warning(
            "OPENAI_API_KEY is not set - running in MOCK mode. "
            "Agents, file writes, real test runs and deploys all still happen; "
            "only the language model is simulated."
        )
    threading.Thread(target=devops_agent.relaunch_previews, daemon=True).start()
    yield
    devops_agent.shutdown_all()


app = FastAPI(title="AI Work Flow - AI Service", version="1.0.0", lifespan=lifespan)
app.include_router(workflow_router)


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "ai-service",
        "model": settings.OPENAI_MODEL,
        "mock_mode": settings.mock_mode,
        "qa_sandbox": sandbox_mode(),
        "max_self_repair_retries": settings.MAX_SELF_REPAIR_RETRIES,
    }


@app.get("/health/db")
def health_db():
    """Proves the SQLAlchemy reflection path works against Prisma's tables."""
    return db.healthcheck()


# Last: its catch-all route forwards a preview page's /api/... and asset requests,
# so every real route above must be registered first.
from .api.preview import router as preview_router  # noqa: E402

app.include_router(preview_router)
