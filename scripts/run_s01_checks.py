from __future__ import annotations

import os
import pathlib
import subprocess
import sys
import time
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Check:
    name: str
    command: list[str]
    cwd: pathlib.Path = ROOT


def main() -> int:
    checks = [
        Check("backend auth/project/chat/audit tests", [sys.executable, "-m", "pytest", "tests/test_auth_project_chat.py", "tests/test_health_and_audit.py"], ROOT / "backend"),
        Check("CLI shared-auth project chat tests", [sys.executable, "-m", "pytest", "tests/test_cli_auth_project_chat.py"], ROOT / "cli"),
        Check("Web client tests", ["npm", "test", "--", "--run"], ROOT / "web"),
        Check("Web production build", ["npm", "run", "build"], ROOT / "web"),
        Check("Integrated S01 smoke", [sys.executable, "scripts/smoke_s01.py"], ROOT),
    ]
    print("Running S01 checks in dependency order. No external LLM/API secrets are required.")
    for check in checks:
        start = time.monotonic()
        print(f"\n==> {check.name}")
        print(f"$ {' '.join(check.command)}  (cwd: {check.cwd.relative_to(ROOT) if check.cwd != ROOT else '.'})")
        env = os.environ.copy()
        if check.cwd in (ROOT / "backend", ROOT / "cli"):
            env["PYTHONPATH"] = f"{check.cwd}{os.pathsep}{env.get('PYTHONPATH', '')}".rstrip(os.pathsep)
        result = subprocess.run(check.command, cwd=check.cwd, env=env, text=True)
        duration = time.monotonic() - start
        if result.returncode != 0:
            print(f"<== {check.name} FAILED in {duration:.1f}s with exit code {result.returncode}", file=sys.stderr)
            return result.returncode
        print(f"<== {check.name} passed in {duration:.1f}s")
    print("\nAll S01 checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
