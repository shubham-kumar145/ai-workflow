from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

from ..config import settings


@dataclass
class QAResult:
    """What actually happened when the tests ran. Nothing here is inferred."""

    passed: bool
    exit_code: int
    output: str
    tests_total: int = 0
    tests_passed: int = 0
    tests_failed: int = 0
    runner: str = "subprocess"
    timed_out: bool = False
    boot_failed: bool = False
    missing_ids: list[str] = field(default_factory=list)

    @property
    def failure_count(self) -> int:
        # A crash with no parseable TAP output is still a failure.
        if self.tests_failed:
            return self.tests_failed
        return 0 if self.passed else max(1, self.tests_total - self.tests_passed)

    def summary(self) -> str:
        if self.timed_out:
            return f"Tests timed out after {settings.QA_TIMEOUT_SECONDS}s"
        if self.boot_failed:
            return (
                f"{self.tests_passed}/{self.tests_total} tests passed, "
                f"but server.js failed to start ({self.runner})"
            )
        if self.missing_ids:
            return (
                f"{self.tests_passed}/{self.tests_total} tests passed, but app.js looks up "
                f"{len(self.missing_ids)} element id(s) missing from the page ({self.runner})"
            )
        return (
            f"{self.tests_passed}/{self.tests_total} tests passed "
            f"(exit code {self.exit_code}, {self.runner})"
        )


# TAP prints "# tests 3"; Node's newer spec reporter prints "ℹ tests 3".
_COUNT = {
    "tests": re.compile(r"^(?:#|ℹ)\s*tests\s+(\d+)", re.M),
    "pass": re.compile(r"^(?:#|ℹ)\s*pass\s+(\d+)", re.M),
    "fail": re.compile(r"^(?:#|ℹ)\s*fail\s+(\d+)", re.M),
}


def _parse_counts(output: str) -> tuple[int, int, int]:
    def grab(key: str) -> int:
        m = _COUNT[key].search(output)
        return int(m.group(1)) if m else 0

    return grab("tests"), grab("pass"), grab("fail")


def _run(cmd: list[str], cwd: Path) -> tuple[int, str, bool]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=settings.QA_TIMEOUT_SECONDS,
            check=False,
        )
        return proc.returncode, (proc.stdout or "") + (proc.stderr or ""), False
    except subprocess.TimeoutExpired as exc:
        partial = ""
        if exc.stdout:
            partial += exc.stdout if isinstance(exc.stdout, str) else exc.stdout.decode(errors="replace")
        if exc.stderr:
            partial += exc.stderr if isinstance(exc.stderr, str) else exc.stderr.decode(errors="replace")
        return 124, partial + f"\n[timed out after {settings.QA_TIMEOUT_SECONDS}s]", True
    except FileNotFoundError as exc:
        return 127, f"Test runner not found: {exc}", False


def run_real_tests(workspace: Path) -> QAResult:
    """
    Execute the generated test suite and report what the process actually did.

    The verdict is the process exit code. The agent's opinion of its own code is
    never consulted — a developer agent claiming "tests pass" has no effect here.
    """
    if not (workspace / "tests").exists():
        return QAResult(
            passed=False,
            exit_code=1,
            output="No tests/ directory in the workspace — nothing to verify.",
            runner="none",
        )

    use_docker = settings.QA_SANDBOX == "docker" and shutil.which("docker")
    if use_docker:
        # Generated code is untrusted: no network, no host filesystem beyond the
        # workspace, dropped privileges, hard memory cap.
        cmd = [
            "docker", "run", "--rm",
            "--network", "none",
            "--memory", "512m",
            "--cpus", "1",
            "--pids-limit", "256",
            "-v", f"{workspace.resolve()}:/app:rw",
            "-w", "/app",
            "node:22-alpine",
            "npm", "test",
        ]
        runner = "docker"
    else:
        # On Windows npm is npm.cmd, which subprocess can't find by bare name.
        cmd = [shutil.which("npm") or "npm", "test"]
        runner = "subprocess"

    exit_code, output, timed_out = _run(cmd, workspace)
    total, passed_n, failed_n = _parse_counts(output)

    boot_failed = False
    if exit_code == 0 and not timed_out and runner == "subprocess":
        booted, boot_output = _boot_check(workspace)
        output += f"\n\n--- boot check: node server.js ---\n{boot_output}"
        if not booted:
            boot_failed, exit_code = True, 1

    missing_ids: list[str] = []
    if exit_code == 0 and not timed_out:
        missing_ids = _missing_element_ids(workspace)
        if missing_ids:
            exit_code = 1
            output += (
                "\n\n--- frontend check: public/*.js vs public/*.html ---\n"
                "app.js calls getElementById for ids that no HTML file (and no element "
                "app.js creates) defines, so those lookups return null and the page breaks:\n  "
                + ", ".join(missing_ids)
                + "\nAdd these ids to public/index.html, or change app.js to use the ids index.html has."
            )

    return QAResult(
        # Exit code is authoritative; the parsed counts are only for reporting.
        passed=(exit_code == 0 and not timed_out),
        exit_code=exit_code,
        output=output[-12_000:],
        tests_total=total,
        tests_passed=passed_n,
        tests_failed=failed_n,
        runner=runner,
        timed_out=timed_out,
        boot_failed=boot_failed,
        missing_ids=missing_ids,
    )


_ID_DEFINED = re.compile(r"""(?<![\w-])id\s*=\s*["'`]([\w-]+)["'`]""")
_ID_ASSIGNED = re.compile(r"""\.id\s*=\s*["'`]([\w-]+)["'`]""")
_ID_LOOKUP = re.compile(r"""getElementById\(\s*["'`]([\w-]+)["'`]\s*\)""")


def _missing_element_ids(workspace: Path) -> list[str]:
    """Ids app.js looks up that exist in no HTML file and are never created by JS.

    The tests never load the browser code, so an app.js written against a
    different index.html passes QA while the real page is dead.
    """
    public = workspace / "public"
    if not public.is_dir():
        return []
    read = lambda p: p.read_text(encoding="utf-8", errors="replace")
    html = "\n".join(read(p) for p in public.glob("*.html"))
    js = "\n".join(read(p) for p in public.glob("*.js"))
    defined = set(_ID_DEFINED.findall(html + js)) | set(_ID_ASSIGNED.findall(js))
    return sorted({i for i in _ID_LOOKUP.findall(js) if i not in defined})


def _boot_check(workspace: Path) -> tuple[bool, str]:
    """Tests never load server.js, so start it for real and require /api/health to answer."""
    from .devops import _free_port, _smoke_test

    if not (workspace / "server.js").exists():
        return False, "server.js is missing."

    # A port block of its own so a check never lands on a running preview.
    port = _free_port(settings.STAGING_PORT_START + 300)
    proc = subprocess.Popen(
        [shutil.which("node") or "node", "server.js"],
        cwd=str(workspace),
        env={**os.environ, "PORT": str(port)},
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        ok, _, detail = _smoke_test(f"http://localhost:{port}", attempts=15, proc=proc)
        alive = proc.poll() is None
    finally:
        if proc.poll() is None:
            proc.kill()
        stderr = proc.communicate(timeout=10)[1] or ""

    if ok and alive:
        return True, "server.js started and GET /api/health answered 200."
    return False, (
        "server.js did not start and serve GET /api/health. "
        f"Smoke test: {detail}\nserver.js stderr:\n{stderr[-3000:]}"
    )


def sandbox_mode() -> str:
    if settings.QA_SANDBOX == "docker" and not shutil.which("docker"):
        return "subprocess (docker requested but not installed)"
    return settings.QA_SANDBOX
