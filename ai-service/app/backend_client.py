from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("backend_client")


class BackendError(RuntimeError):
    pass


class BackendClient:
    """
    Every write the AI service makes goes through Express /internal/*.

    That keeps Prisma the only writer of the database, keeps the state machine
    and its audit log in one place, and means every change is broadcast over
    Socket.io without the Python side knowing anything about sockets.
    """

    def __init__(self, base_url: str | None = None, secret: str | None = None) -> None:
        self.base_url = (base_url or settings.BACKEND_URL).rstrip("/")
        self.secret = secret or settings.INTERNAL_SERVICE_SECRET
        self._client = httpx.Client(
            timeout=30.0,
            headers={
                "x-internal-secret": self.secret,
                "Content-Type": "application/json",
            },
        )

    def _request(self, method: str, path: str, json: dict | None = None) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        try:
            res = self._client.request(method, url, json=json)
        except httpx.HTTPError as exc:
            raise BackendError(f"{method} {path} failed: {exc}") from exc
        if res.status_code >= 400:
            raise BackendError(f"{method} {path} -> {res.status_code}: {res.text[:400]}")
        return res.json()

    # ---- reads -------------------------------------------------------
    def get_project(self, project_id: str) -> dict[str, Any]:
        return self._request("GET", f"/internal/projects/{project_id}")["project"]

    # ---- versions / tasks --------------------------------------------
    def create_version(
        self,
        project_id: str,
        label: str,
        plan: dict | None = None,
        architecture: dict | None = None,
        api_contract: dict | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/internal/projects/{project_id}/versions",
            {
                "label": label,
                "planJson": plan,
                "architectureJson": architecture,
                "apiContractJson": api_contract,
            },
        )["version"]

    def replace_tasks(self, project_id: str, tasks: list[dict]) -> list[dict]:
        return self._request(
            "POST",
            f"/internal/projects/{project_id}/tasks",
            {"replace": True, "tasks": tasks},
        )["tasks"]

    def update_task(self, task_id: str, **fields: Any) -> dict[str, Any]:
        return self._request("PATCH", f"/internal/tasks/{task_id}", fields)["task"]

    # ---- agent runs ---------------------------------------------------
    def start_agent_run(
        self, project_id: str, agent_role: str, model: str, task_id: str | None = None
    ) -> str:
        run = self._request(
            "POST",
            "/internal/agent-runs",
            {
                "projectId": project_id,
                "taskId": task_id,
                "agentRole": agent_role,
                "model": model,
            },
        )["run"]
        return run["id"]

    def finish_agent_run(
        self,
        run_id: str,
        status: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        cost_usd: float = 0.0,
        summary: str | None = None,
        error: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "status": status,
            "promptTokens": prompt_tokens,
            "completionTokens": completion_tokens,
            "costUsd": cost_usd,
            "summary": summary,
            "error": error,
        }
        payload = {k: v for k, v in payload.items() if v is not None}
        return self._request("PATCH", f"/internal/agent-runs/{run_id}", payload)

    # ---- state machine -------------------------------------------------
    def set_status(self, project_id: str, to: str, message: str, **patch: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {"to": to, "message": message, "actor": "ai-service"}
        payload.update({k: v for k, v in patch.items() if v is not None})
        return self._request("POST", f"/internal/projects/{project_id}/status", payload)["project"]

    def log(
        self, project_id: str, type_: str, message: str, data: dict | None = None
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/internal/projects/{project_id}/events",
            {"type": type_, "message": message, "data": data},
        )["event"]

    def close(self) -> None:
        self._client.close()


backend = BackendClient()
