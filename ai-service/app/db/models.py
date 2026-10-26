"""
READ-ONLY access to the database Prisma owns.

Tables are reflected at runtime rather than declared, so this file can never
drift from schema.prisma and this service can never create or alter a table.
Writes go through the Express /internal/* API.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import MetaData, create_engine, select
from sqlalchemy.engine import Engine

from ..config import settings

log = logging.getLogger("db")

_engine: Engine | None = None
_metadata: MetaData | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True, future=True)
    return _engine


def get_metadata() -> MetaData:
    global _metadata
    if _metadata is None:
        md = MetaData()
        md.reflect(bind=get_engine())
        _metadata = md
        log.info("reflected %d tables", len(md.tables))
    return _metadata


def table(name: str):
    md = get_metadata()
    if name not in md.tables:
        raise KeyError(f"Table '{name}' not found. Run `npx prisma migrate dev` in backend/ first.")
    return md.tables[name]


def _rows(result) -> list[dict[str, Any]]:
    return [dict(row._mapping) for row in result]


def fetch_project(project_id: str) -> dict[str, Any] | None:
    projects = table("projects")
    with get_engine().connect() as conn:
        row = conn.execute(select(projects).where(projects.c.id == project_id)).first()
    return dict(row._mapping) if row else None


def fetch_projects_with_status(statuses: list[str]) -> list[dict[str, Any]]:
    projects = table("projects")
    with get_engine().connect() as conn:
        result = conn.execute(
            select(projects).where(projects.c.status.in_(statuses)).order_by(projects.c.createdAt)
        )
    return _rows(result)


def fetch_tasks(project_id: str) -> list[dict[str, Any]]:
    tasks = table("tasks")
    with get_engine().connect() as conn:
        result = conn.execute(
            select(tasks).where(tasks.c.projectId == project_id).order_by(tasks.c.orderIndex)
        )
    return _rows(result)


def fetch_recent_events(project_id: str, limit: int = 50) -> list[dict[str, Any]]:
    events = table("workflow_events")
    with get_engine().connect() as conn:
        result = conn.execute(
            select(events)
            .where(events.c.projectId == project_id)
            .order_by(events.c.createdAt.desc())
            .limit(limit)
        )
    return _rows(result)


def project_cost(project_id: str) -> dict[str, Any]:
    from sqlalchemy import func

    runs = table("agent_runs")
    with get_engine().connect() as conn:
        row = conn.execute(
            select(
                func.coalesce(func.sum(runs.c.costUsd), 0).label("cost_usd"),
                func.coalesce(func.sum(runs.c.promptTokens), 0).label("prompt_tokens"),
                func.coalesce(func.sum(runs.c.completionTokens), 0).label("completion_tokens"),
                func.count().label("runs"),
            ).where(runs.c.projectId == project_id)
        ).first()
    return dict(row._mapping) if row else {}


def healthcheck() -> dict[str, Any]:
    try:
        md = get_metadata()
        return {"ok": True, "tables": sorted(md.tables.keys())}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
