"""
Generated code survives a host that wipes the disk on restart (Render's free
plan does on every deploy and every wake from sleep): after a deploy the
workspace is zipped into the database, and restored the next time a preview
or a download needs it.
"""
from __future__ import annotations

import base64
import io
import logging
import zipfile
from pathlib import Path, PurePosixPath

log = logging.getLogger("snapshot")

SKIP_DIRS = {"node_modules", ".git", "__pycache__"}
# Runtime state the app wrote (users, password hashes, sessions) is not code.
SKIP_FILES = {"data.json", "data.json.tmp"}
MAX_BYTES = 1_000_000


def pack(workspace: Path) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(workspace.rglob("*")):
            rel = path.relative_to(workspace)
            if not path.is_file() or SKIP_DIRS.intersection(rel.parts):
                continue
            if rel.name in SKIP_FILES or path.suffix == ".log":
                continue
            zf.write(path, rel.as_posix())
    return buf.getvalue()


def unpack(data: bytes, workspace: Path) -> None:
    """Extract, refusing any entry that would land outside the workspace."""
    root = workspace.resolve()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for info in zf.infolist():
            name = PurePosixPath(info.filename)
            if info.is_dir() or name.is_absolute() or ".." in name.parts:
                continue
            target = (root / Path(*name.parts)).resolve()
            if root not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(zf.read(info))


def save(project_id: str, workspace: Path) -> None:
    """Best effort: a failed snapshot must never fail the deploy that triggered it."""
    from ..backend_client import backend

    try:
        data = pack(workspace)
        if len(data) > MAX_BYTES:
            log.warning("workspace for %s is %d bytes; not saving a snapshot", project_id, len(data))
            return
        backend.save_workspace(project_id, base64.b64encode(data).decode("ascii"))
        log.info("saved workspace snapshot for %s (%d bytes)", project_id, len(data))
    except Exception:
        log.exception("could not save the workspace snapshot for %s", project_id)


def restore(project_id: str, workspace: Path) -> bool:
    """Bring back the saved code. True if the workspace now has a server.js."""
    from ..backend_client import backend

    try:
        b64 = backend.load_workspace(project_id)
    except Exception:
        log.exception("could not load the workspace snapshot for %s", project_id)
        return False
    if not b64:
        return False
    workspace.mkdir(parents=True, exist_ok=True)
    unpack(base64.b64decode(b64), workspace)
    log.info("restored workspace for %s from its snapshot", project_id)
    return (workspace / "server.js").exists()
