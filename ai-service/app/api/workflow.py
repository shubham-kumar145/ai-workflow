from __future__ import annotations

import io
import shutil
import uuid
import zipfile

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Response
from pydantic import BaseModel

from ..agents import devops as devops_agent
from ..config import settings
from ..orchestrator import run_workflow

router = APIRouter(prefix="/workflow", tags=["workflow"])


class StartRequest(BaseModel):
    project_id: str


class ResumeRequest(BaseModel):
    action: str
    feedback: str | None = None


def _check_secret(secret: str | None) -> None:
    if secret != settings.INTERNAL_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Bad internal service secret")


@router.post("/start")
def start_workflow(
    body: StartRequest,
    background: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
):
    """Accept the job and return immediately — LLM calls take far longer than
    any sane HTTP timeout, so the work happens in a background task."""
    _check_secret(x_internal_secret)
    background.add_task(run_workflow, body.project_id, None, None)
    return {"accepted": True, "project_id": body.project_id, "phase": "plan"}


@router.post("/{project_id}/resume")
def resume_workflow(
    project_id: str,
    body: ResumeRequest,
    background: BackgroundTasks,
    x_internal_secret: str | None = Header(default=None),
):
    _check_secret(x_internal_secret)
    valid = {"APPROVE_PLAN", "REVISE_PLAN", "APPROVE_BUILD", "REVISE_BUILD", "DEPLOY_PRODUCTION"}
    if body.action not in valid:
        raise HTTPException(status_code=400, detail=f"action must be one of {sorted(valid)}")
    background.add_task(run_workflow, project_id, body.action, body.feedback)
    return {"accepted": True, "project_id": project_id, "action": body.action}


@router.delete("/{project_id}")
def delete_project(project_id: str, x_internal_secret: str | None = Header(default=None)):
    """Stop the project's preview servers and remove its generated code."""
    _check_secret(x_internal_secret)
    try:
        project_id = str(uuid.UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="project_id must be a UUID")

    devops_agent.stop_project(project_id)

    workspace = settings.WORKSPACE_ROOT / project_id
    errors: list[str] = []
    if workspace.exists():
        shutil.rmtree(workspace, onexc=lambda _f, path, exc: errors.append(f"{path}: {exc}"))
    return {"deleted": True, "workspace_removed": not workspace.exists(), "errors": errors[:5]}


_ARCHIVE_SKIP = {"node_modules", ".git", "__pycache__"}
# Runtime state the running app wrote (users, password hashes, sessions), not source code.
_ARCHIVE_SKIP_FILES = {"data.json", "data.json.tmp"}


@router.get("/{project_id}/archive")
def project_archive(project_id: str, x_internal_secret: str | None = Header(default=None)):
    """Zip the project's generated code for download."""
    _check_secret(x_internal_secret)
    try:
        project_id = str(uuid.UUID(project_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="project_id must be a UUID")

    workspace = settings.WORKSPACE_ROOT / project_id
    if not workspace.is_dir():
        raise HTTPException(status_code=404, detail="No generated code for this project")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(workspace.rglob("*")):
            rel = path.relative_to(workspace)
            if path.is_file() and not _ARCHIVE_SKIP.intersection(rel.parts) and rel.name not in _ARCHIVE_SKIP_FILES and path.suffix != ".log":
                zf.write(path, rel.as_posix())
    return Response(content=buf.getvalue(), media_type="application/zip")
