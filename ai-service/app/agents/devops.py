from __future__ import annotations

import logging
import socket
import subprocess
import threading
import time
import uuid
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from ..config import settings

log = logging.getLogger("devops")

# project_id -> running preview process
_RUNNING: dict[str, subprocess.Popen] = {}
# preview path key (project id, or "<id>-prod") -> local port, for the public /preview proxy
_PORTS: dict[str, int] = {}


def _path_key(key: str) -> str:
    return key.replace(":", "-")


def preview_port(path_key: str) -> int | None:
    """Local port of a running preview, by the key used in its /preview/<key>/ link."""
    port = _PORTS.get(path_key)
    if port is None:
        return None
    for key, proc in _RUNNING.items():
        if _path_key(key) == path_key:
            return port if proc.poll() is None else None
    return None


def public_url(key: str, port: int) -> str:
    if settings.PUBLIC_URL:
        return f"{settings.PUBLIC_URL}/preview/{_path_key(key)}/"
    return f"http://localhost:{port}"


# path key -> last time a visitor used that preview, to pick which one to stop
_LAST_USED: dict[str, float] = {}
_START_LOCKS: dict[str, threading.Lock] = {}
_LOCKS_GUARD = threading.Lock()


def touch(path_key: str) -> None:
    _LAST_USED[path_key] = time.monotonic()


def _make_room(starting_key: str) -> None:
    """Free hosts have little memory: stop the least recently used previews beyond the cap."""
    running = [k for k, p in _RUNNING.items() if p.poll() is None and _path_key(k) != _path_key(starting_key)]
    excess = len(running) - (settings.MAX_RUNNING_PREVIEWS - 1)
    if excess <= 0:
        return
    running.sort(key=lambda k: _LAST_USED.get(_path_key(k), 0.0))
    for key in running[:excess]:
        log.info("stopping idle preview %s to stay under %d running", key, settings.MAX_RUNNING_PREVIEWS)
        stop_preview(key)


def ensure_preview(path_key: str) -> int | None:
    """Port of the preview behind /preview/<path_key>/, starting it (and restoring its code) if needed."""
    port = preview_port(path_key)
    if port is not None:
        touch(path_key)
        return port

    prod = path_key.endswith("-prod")
    raw_id = path_key[: -len("-prod")] if prod else path_key
    try:
        project_id = str(uuid.UUID(raw_id))
    except ValueError:
        return None

    with _LOCKS_GUARD:
        lock = _START_LOCKS.setdefault(path_key, threading.Lock())
    # A page asks for its HTML, CSS and JS at once; only the first request starts the app.
    with lock:
        port = preview_port(path_key)
        if port is not None:
            touch(path_key)
            return port
        workspace = settings.WORKSPACE_ROOT / project_id
        if not (workspace / "server.js").exists():
            from . import snapshot

            if not snapshot.restore(project_id, workspace):
                return None
        result = deploy_preview(f"{project_id}:prod" if prod else project_id, workspace, port_offset=100 if prod else 0)
        if not result.ok:
            log.warning("could not start preview %s: %s", path_key, result.detail)
            return None
        return _PORTS.get(path_key)


@dataclass
class DeployResult:
    ok: bool
    url: str | None
    port: int | None
    status_code: int | None
    detail: str


def _port_in_use(port: int) -> bool:
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            continue
    return False


def _free_port(start: int, span: int = 100) -> int:
    # No SO_REUSEADDR: on Windows it lets bind() succeed on a port another
    # server is already listening on, so every project landed on the same port.
    for port in range(start, start + span):
        if _port_in_use(port):
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port in {start}-{start + span - 1}")


def _smoke_test(
    url: str, attempts: int = 25, delay: float = 0.4, proc: subprocess.Popen | None = None
) -> tuple[bool, int | None, str]:
    """
    A deploy is only a deploy if something answers. Poll until the server is up,
    then require a real HTTP 200 from /api/health.
    """
    last = "no response"
    for _ in range(attempts):
        if proc is not None and proc.poll() is not None:
            return False, None, f"the app exited with code {proc.returncode} before answering"
        try:
            with urllib.request.urlopen(f"{url}/api/health", timeout=3) as res:
                code = res.getcode()
                body = res.read(500).decode("utf-8", errors="replace")
                if code == 200:
                    return True, code, body
                last = f"HTTP {code}"
        except urllib.error.HTTPError as exc:
            last = f"HTTP {exc.code}"
        except Exception as exc:  # connection refused while it boots
            last = str(exc)
        time.sleep(delay)
    return False, None, last


def _log_path(key: str) -> Path:
    # Outside the workspace so it never ships in the download; ':' is not allowed in Windows names.
    logs = settings.WORKSPACE_ROOT / ".logs"
    logs.mkdir(parents=True, exist_ok=True)
    return logs / (key.replace(":", "-") + ".log")


def stop_preview(project_id: str) -> None:
    _PORTS.pop(_path_key(project_id), None)
    _LAST_USED.pop(_path_key(project_id), None)
    proc = _RUNNING.pop(project_id, None)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def deploy_preview(project_id: str, workspace: Path, port_offset: int = 0) -> DeployResult:
    """
    Really start the generated app and really check it serves traffic.

    This is a local preview rather than a cloud deploy: it boots `node server.js`
    on a free port and smoke-tests it. Swapping in a Render/Vercel/GitHub Actions
    call later only changes how `url` is produced — the smoke test stays.
    """
    if not (workspace / "server.js").exists():
        return DeployResult(False, None, None, None, "No server.js in the workspace")

    stop_preview(project_id)
    _make_room(project_id)

    port = _free_port(settings.STAGING_PORT_START + port_offset)
    env_port = {"PORT": str(port)}

    import os

    # Send the app's output to a log file, not a pipe: nobody reads a pipe from a
    # long-running preview, and once its buffer fills the app freezes mid-write.
    log_path = _log_path(project_id)
    log_file = open(log_path, "w", encoding="utf-8", errors="replace")
    try:
        proc = subprocess.Popen(
            ["node", "server.js"],
            cwd=str(workspace),
            env={**os.environ, **env_port},
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )
    finally:
        log_file.close()  # the child holds its own handle
    _RUNNING[project_id] = proc

    url = f"http://localhost:{port}"
    ok, code, detail = _smoke_test(url, proc=proc)
    if ok and proc.poll() is not None:
        ok, detail = False, "the app exited, so something else answered on its port"

    if not ok:
        stop_preview(project_id)
        output = log_path.read_text(encoding="utf-8", errors="replace")[-1000:] if log_path.exists() else ""
        return DeployResult(False, None, port, code, f"Smoke test failed: {detail} {output}".strip())

    _PORTS[_path_key(project_id)] = port
    touch(_path_key(project_id))
    link = public_url(project_id, port)
    return DeployResult(True, link, port, code, f"Smoke test passed: GET {url}/api/health -> 200")


def deploy_staging(project_id: str, workspace: Path) -> DeployResult:
    return deploy_preview(project_id, workspace, port_offset=0)


def deploy_production(project_id: str, workspace: Path) -> DeployResult:
    # Production gets its own port block so staging keeps running beside it.
    return deploy_preview(f"{project_id}:prod", workspace, port_offset=100)


def stop_project(project_id: str) -> None:
    stop_preview(project_id)
    stop_preview(f"{project_id}:prod")


def relaunch_previews() -> None:
    """Preview servers die with this service; restart the ones the dashboard still links to."""
    from ..backend_client import BackendClient
    from ..db import models as db

    backend = BackendClient()
    live = ["STAGING_REVIEW", "PRODUCTION_APPROVAL", "DEPLOYMENT", "COMPLETED"]
    for project in db.fetch_projects_with_status(live):
        project_id = project["id"]
        workspace = settings.WORKSPACE_ROOT / project_id
        if not (workspace / "server.js").exists():
            continue
        try:
            urls: dict[str, str] = {}
            for field, deploy in (("stagingUrl", deploy_staging), ("productionUrl", deploy_production)):
                if not project.get(field):
                    continue
                result = deploy(project_id, workspace)
                if result.ok and result.url:
                    urls[field] = result.url
                else:
                    log.warning("could not relaunch %s for %s: %s", field, project_id, result.detail)
            if urls:
                backend.set_status(
                    project_id,
                    str(project["status"]),
                    "Preview servers restarted after the AI service started.",
                    **urls,
                )
                log.info("relaunched %s: %s", project["title"], urls)
        except Exception:
            log.exception("relaunching previews for %s failed", project_id)


def shutdown_all() -> None:
    for project_id in list(_RUNNING):
        stop_preview(project_id)
