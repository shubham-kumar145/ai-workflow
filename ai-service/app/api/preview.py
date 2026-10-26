"""
Public access to the generated apps when this service runs on a host.

Each preview is a local `node server.js` on a private port. Visitors reach it at
/preview/<key>/... on this service. Generated apps use root-relative URLs
(fetch("/api/items"), href="/styles.css"), so requests outside /preview/ are
routed by the page they came from (Referer), falling back to the last preview
this browser opened (a cookie).
"""
from __future__ import annotations

from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.concurrency import run_in_threadpool

from ..agents import devops as devops_agent

router = APIRouter(tags=["preview"])

COOKIE = "aiwf_preview"
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
# Hop-by-hop headers, plus the ones httpx/Starlette recompute.
DROP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers",
    "transfer-encoding", "upgrade", "host", "content-length", "content-encoding",
}

NOT_RUNNING = """<!doctype html><meta charset="utf-8"><title>Preview not running</title>
<body style="font:15px system-ui;background:#0b1220;color:#e6ecf7;display:grid;place-items:center;min-height:90vh;margin:0">
<div style="max-width:440px;padding:24px"><h1 style="font-size:20px">This preview could not be started</h1>
<p style="color:#8a9ab8;line-height:1.6">Previews restart by themselves from the code saved when they were deployed.
This one has no saved code, usually because it was built before previews were saved, or its project was deleted.
To bring it back, the client can request a change, which rebuilds and saves it.</p></div>"""


def _referer_key(request: Request) -> str | None:
    ref = request.headers.get("referer")
    if not ref:
        return None
    parts = urlparse(ref).path.split("/")
    # "/preview/<key>/..." -> ["", "preview", "<key>", ...]
    return parts[2] if len(parts) > 2 and parts[1] == "preview" and parts[2] else None


async def _forward(request: Request, port: int, path: str) -> Response:
    url = f"http://127.0.0.1:{port}{path}"
    if request.url.query:
        url += "?" + request.url.query
    headers = {k: v for k, v in request.headers.items() if k.lower() not in DROP}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            upstream = await client.request(request.method, url, headers=headers, content=await request.body())
    except httpx.HTTPError:
        return HTMLResponse(NOT_RUNNING, status_code=502)
    resp = Response(content=upstream.content, status_code=upstream.status_code)
    for key, value in upstream.headers.multi_items():
        if key.lower() not in DROP:
            resp.headers.append(key, value)
    return resp


@router.get("/preview/{key}", include_in_schema=False)
def preview_root(key: str):
    # Without the trailing slash, relative links in the page would resolve one level up.
    return RedirectResponse(f"/preview/{key}/")


@router.api_route("/preview/{key}/{path:path}", methods=METHODS, include_in_schema=False)
async def preview(key: str, path: str, request: Request):
    # Starting a stopped preview (and restoring its code) blocks for a few
    # seconds, so it runs in a worker thread instead of the event loop.
    port = await run_in_threadpool(devops_agent.ensure_preview, key)
    if port is None:
        return HTMLResponse(NOT_RUNNING, status_code=404)
    # "/preview/<id>//api/x" (a link joined onto the trailing slash) means "/api/x".
    resp = await _forward(request, port, "/" + path.lstrip("/"))
    resp.set_cookie(COOKIE, key, httponly=True, samesite="lax", path="/")
    return resp


@router.api_route("/{path:path}", methods=METHODS, include_in_schema=False)
async def preview_assets(path: str, request: Request):
    """Root-relative requests made by a preview page. Registered last, so real routes win."""
    key = _referer_key(request) or request.cookies.get(COOKIE)
    port = await run_in_threadpool(devops_agent.ensure_preview, key) if key else None
    if port is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return await _forward(request, port, "/" + path)
