#!/usr/bin/env python3
"""Restricted test executor facade. Install behind authenticated Vendi MCP action; never expose as public HTTP."""
import fcntl
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path("/home/vendorai/vendorai-test-executor")
EVIDENCE = ROOT / ".test-evidence"
LOCK = Path("/tmp/vendorai-test-executor.lock")
EXE = ROOT / "scripts/infra/test-sha.sh"
SHA = re.compile(r"^[0-9a-fA-F]{40}$")
BRANCH = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,180}$")
SUITES = {"crm", "api", "frontend", "full"}
MIN_FREE = 8 * 1024**3
MAX_EVIDENCE_BYTES = 3 * 1024**3

def validated(pr, branch, sha, suite):
    if not isinstance(pr, int) or isinstance(pr, bool) or not 1 <= pr <= 9999999:
        raise ValueError("INVALID_PR")
    if not isinstance(branch, str) or not BRANCH.fullmatch(branch) or ".." in branch or "//" in branch or branch.endswith("/"):
        raise ValueError("INVALID_BRANCH")
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        raise ValueError("INVALID_SHA")
    if suite not in SUITES:
        raise ValueError("INVALID_SUITE")
    return str(pr), branch, sha.lower(), suite

def status(run):
    if not re.fullmatch(r"pr-[1-9][0-9]*-[A-Za-z0-9_-]{8}", run):
        raise ValueError("INVALID_RUN")
    folder = EVIDENCE / run
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError("RUN_NOT_FOUND")
    out = {}
    for name in ("manifest.txt", "results.txt"):
        f = folder / name
        if f.is_file() and not f.is_symlink():
            out[name] = f.read_text(errors="replace")[:8192]
    logs = folder / "logs"
    out["logs"] = sorted(p.name for p in logs.glob("*.log") if p.is_file() and not p.is_symlink()) if logs.is_dir() else []
    return out

def run(pr, branch, sha, suite):
    args = validated(pr, branch, sha, suite)
    if os.geteuid() == 0:
        raise ValueError("MUST_RUN_UNPRIVILEGED")
    if not EXE.is_file():
        raise ValueError("EXECUTOR_NOT_INSTALLED")
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with LOCK.open("w") as f:
        try:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("TEST_EXECUTOR_BUSY")
        if shutil.disk_usage(EVIDENCE).free < MIN_FREE:
            raise ValueError("INSUFFICIENT_DISK_SPACE")
        total = sum(f.stat().st_size for f in EVIDENCE.glob("pr-*/logs/*.log") if f.is_file() and not f.is_symlink())
        if total > MAX_EVIDENCE_BYTES:
            raise ValueError("EVIDENCE_QUOTA_EXCEEDED")
        before = {p.name for p in EVIDENCE.glob("pr-*") if p.is_dir()}
        # Fixed executable and arguments only. No command injection, no shell or production secrets.
        env = {
            "PATH": "/usr/local/bin:/usr/bin:/bin",
            "HOME": str(ROOT),
            "VENDORAI_OFFLINE_STORE": "/home/vendorai/.local/share/pnpm/store/v10",
            "VENDORAI_PREPARE_OFFLINE": "0",
            "CI": "true",
        }
        proc = subprocess.Popen(["bash", str(EXE), *args], cwd=ROOT, env=env,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        try:
            rc = proc.wait(timeout=1800)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
            rc = 124
        after = {p.name for p in EVIDENCE.glob("pr-*") if p.is_dir()}
        new = sorted(after - before)
        return {"exitCode": rc, "runIds": new, "sha": args[2], "suite": suite,
                "status": "completed" if rc != 124 else "timeout"}

def main():
    # Authentication/roles must be enforced by the private connector before invoking this tool.
    try:
        action, *rest = sys.argv[1:]
        if action == "request" and len(rest) == 4:
            result = run(int(rest[0]), *rest[1:])
        elif action == "result" and len(rest) == 1:
            result = status(rest[0])
        else:
            raise ValueError("INVALID_ACTION")
        print(json.dumps({"ok": True, "result": result}))
    except (ValueError, OSError) as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
