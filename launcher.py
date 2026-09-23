"""Cross-platform M-1 launcher.

The launcher manages local dependencies with explicit user consent and starts
only the M-1 application. Offensive research modules remain separate; the
launcher exposes the bounded simulation scenarios through the dashboard/API.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
VENV = ROOT / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
NPM = shutil.which("npm")


def ask(prompt: str) -> bool:
    if os.environ.get("M1_AUTO_INSTALL") == "1":
        return True
    try:
        return input(prompt + " [y/N] ").strip().lower() in {"y", "yes"}
    except EOFError:
        return False


def run(cmd, *, cwd: Path = ROOT, env=None):
    print("$", " ".join(map(str, cmd)))
    return subprocess.run(cmd, cwd=cwd, env=env, check=True)


def ensure_python() -> None:
    if not PYTHON.exists():
        if not ask("M-1 needs a local Python environment. Create it and install dependencies?"):
            raise SystemExit("Cancelled. No Python environment was created.")
        run([sys.executable, "-m", "venv", str(VENV)])

    # Install only when an import is missing, so repeat launches stay fast.
    check = subprocess.run(
        [str(PYTHON), "-c", "import fastapi, uvicorn"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if check.returncode == 0:
        return
    if not ask("M-1 Python dependencies are missing. Install them now?"):
        raise SystemExit("Cancelled. Python dependencies are required to start the API.")
    run([str(PYTHON), "-m", "pip", "install", "-r", "api/requirements.txt"])


def ensure_frontend() -> bool:
    dist = WEB / "dist"
    if dist.exists() and (dist / "index.html").exists():
        return True
    if not NPM:
        print("Node/npm was not found. The API can still run, but the React dashboard cannot be built here.")
        return False
    node_modules = WEB / "node_modules"
    if not node_modules.exists():
        if not ask("M-1 needs React packages. Install them now?"):
            return False
        run([NPM, "install"], cwd=WEB)
    if not ask("The React dashboard is not built. Build it now?"):
        return False
    run([NPM, "run", "build"], cwd=WEB)
    return True


def parse_args():
    parser = argparse.ArgumentParser(description="M-1 cross-platform launcher")
    parser.add_argument("--scenario", default="all", help="all, one bounded simulation, or comma-separated simulations")
    parser.add_argument("--dry-run", action="store_true", help="Start in bounded simulation mode (the default test model)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open the dashboard automatically")
    parser.add_argument("--api-only", action="store_true", help="Start only the API; do not require a built React dashboard")
    return parser.parse_args()


def main():
    args = parse_args()
    ensure_python()
    built = True if args.api_only else ensure_frontend()

    env = os.environ.copy()
    env["M1_LAUNCHER"] = "1"
    env["M1_SCENARIO"] = args.scenario
    env["M1_DRY_RUN"] = "1" if args.dry_run else "1"  # current launcher path is bounded by design

    print("\nM-1 is starting in bounded lab mode.")
    print(f"Scenario: {args.scenario}")
    print(f"Dashboard built: {'yes' if built else 'no'}")
    print("URL: http://127.0.0.1:8000\n")

    proc = subprocess.Popen([str(PYTHON), "run_dashboard.py"], cwd=ROOT, env=env)
    try:
        for _ in range(80):
            time.sleep(0.1)
            try:
                import urllib.request
                with urllib.request.urlopen("http://127.0.0.1:8000/api/health", timeout=0.4) as response:
                    if response.status == 200:
                        break
            except Exception:
                pass
        if not args.no_browser:
            webbrowser.open("http://127.0.0.1:8000")
        print("Dashboard/API is running. Press Ctrl+C to stop M-1.")
        proc.wait()
    except KeyboardInterrupt:
        print("Stopping M-1…")
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
