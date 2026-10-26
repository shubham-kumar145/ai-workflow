from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _db_url(raw: str) -> str:
    # Hosts like Neon hand out postgresql:// (or postgres://); SQLAlchemy needs the
    # psycopg driver named, so the same string works in both services.
    for prefix in ("postgresql://", "postgres://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    return raw


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


class Settings:
    # OpenAI
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()

    # Express backend
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:4000").rstrip("/")
    INTERNAL_SERVICE_SECRET: str = os.getenv(
        "INTERNAL_SERVICE_SECRET", "dev-internal-secret-change-me"
    )

    # Read-only reflection. Prisma owns the schema.
    DATABASE_URL: str = _db_url(os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://aiworkflow:aiworkflow@localhost:5432/aiworkflow",
    ))

    # Where this service is reachable from the internet (Render sets
    # RENDER_EXTERNAL_URL). When set, preview links go through /preview/... here
    # instead of pointing at localhost ports nobody else can open.
    PUBLIC_URL: str = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")

    # The agent self-repair budget. Deliberately separate from the client's
    # revision budget, which lives in the projects table.
    MAX_SELF_REPAIR_RETRIES: int = _int("MAX_SELF_REPAIR_RETRIES", 3)

    WORKSPACE_ROOT: Path = (BASE_DIR / os.getenv("WORKSPACE_ROOT", "./workspaces")).resolve()
    QA_SANDBOX: str = os.getenv("QA_SANDBOX", "subprocess").lower()
    QA_TIMEOUT_SECONDS: int = _int("QA_TIMEOUT_SECONDS", 120)
    STAGING_PORT_START: int = _int("STAGING_PORT_START", 7100)
    # Each running preview is a Node process (~50 MB). Render's free plan has
    # 512 MB, so keep only a few there; beyond the cap the least recently used
    # one stops, and starts again on its next visit.
    MAX_RUNNING_PREVIEWS: int = _int("MAX_RUNNING_PREVIEWS", 3 if os.getenv("RENDER") else 50)

    @property
    def mock_mode(self) -> bool:
        """No API key -> every agent still runs, but the LLM is simulated."""
        return not self.OPENAI_API_KEY


settings = Settings()
settings.WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)

# The default secret is in a public repo; anyone could drive the agents with it.
if os.getenv("RENDER") and settings.INTERNAL_SERVICE_SECRET == "dev-internal-secret-change-me":
    raise RuntimeError("INTERNAL_SERVICE_SECRET must be set to a private value in production.")

# Price per 1M tokens, USD. Used for cost accounting in agent_runs.
MODEL_PRICING: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "o4-mini": (1.10, 4.40),
}


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    inp, out = MODEL_PRICING.get(model, (0.15, 0.60))
    return round(prompt_tokens / 1_000_000 * inp + completion_tokens / 1_000_000 * out, 6)
