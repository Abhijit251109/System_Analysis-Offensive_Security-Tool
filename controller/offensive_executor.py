from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from controller.offensive_registry import OffensiveTool, get_tool


class OffensiveToolBlocked(RuntimeError):
    pass


def _write_fixture(path: Path, text: str = "M-1 disposable offensive-tool fixture\n") -> str:
    path.write_text(text, encoding="utf-8")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _bounded_disk_fill(workspace: Path) -> dict:
    target = workspace / "disk-fill"
    target.mkdir(parents=True, exist_ok=True)
    files = []
    payload = b"M1-LAB-DISK-FILL\n" * 4096
    total = 0
    for index in range(4):
        path = target / f"sample_{index}.bin"
        path.write_bytes(payload)
        files.append(path.name)
        total += path.stat().st_size
    return {"files_created": files, "bytes_written": total, "bounded": True}


def _synthetic_key_capture(workspace: Path) -> dict:
    log_file = workspace / "synthetic-key-events.log"
    test_keys = ["LAB_USER", "TAB", "LAB_PASSWORD", "ENTER"]
    log_file.write_text("\n".join(test_keys) + "\n", encoding="utf-8")
    return {"keys_generated": test_keys, "output": str(log_file.relative_to(workspace))}


def _persistence_marker(workspace: Path) -> dict:
    marker = workspace / "persistence-probe.marker"
    marker.write_text("M1 LAB ONLY - no startup registration\n", encoding="utf-8")
    return {"marker": str(marker.relative_to(workspace)), "startup_modified": False}


def _privilege_probe(_: Path) -> dict:
    if os.name == "nt":
        import ctypes

        is_admin = bool(ctypes.windll.shell32.IsUserAnAdmin())
        return {"platform": platform.system(), "administrator": is_admin, "elevation_attempted": False}

    geteuid = getattr(os, "geteuid", None)
    uid = int(geteuid()) if geteuid else None
    return {"platform": platform.system(), "uid": uid, "root": uid == 0 if uid is not None else False, "elevation_attempted": False}


def _fixture_encryption(workspace: Path) -> dict:
    from cryptography.fernet import Fernet

    source = workspace / "fixture.txt"
    encrypted = workspace / "fixture.enc"
    restored = workspace / "fixture.restored.txt"
    original = _write_fixture(source, "M-1 disposable encryption fixture\n")

    key = Fernet.generate_key()
    cipher = Fernet(key)
    encrypted.write_bytes(cipher.encrypt(source.read_bytes()))
    restored.write_bytes(cipher.decrypt(encrypted.read_bytes()))

    restored_hash = hashlib.sha256(restored.read_bytes()).hexdigest()
    return {
        "encrypted_bytes": encrypted.stat().st_size,
        "original_hash": original,
        "restored_hash": restored_hash,
        "round_trip_ok": original == restored_hash,
    }


def _platform_probe(_: Path) -> dict:
    from offensive.platform_mod import platform_utils

    return {
        "reported_platform": platform_utils.get_os_type(),
        "python_platform": platform.system().lower(),
    }


ADAPTERS = {
    "bounded_disk_fill": _bounded_disk_fill,
    "synthetic_key_capture": _synthetic_key_capture,
    "persistence_marker": _persistence_marker,
    "privilege_probe": _privilege_probe,
    "fixture_encryption": _fixture_encryption,
    "platform_probe": _platform_probe,
}


def run_tool(tool_id: str, workspace: Path) -> dict:
    tool: OffensiveTool = get_tool(tool_id)
    if tool.execution == "blocked":
        raise OffensiveToolBlocked(tool.blocked_reason or "Tool execution is blocked")
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
        audit_log(
            audit_file,
            {
                "timestamp": time.time(),
                "run_id": run_id,
                "tool_id": tool.id,
                "source": tool.source,
                "execution": tool.execution,
                "result": result,
            },
        )
        # Make sure nothing accidentally escapes the temporary workspace.
        for candidate in workspace.rglob("*"):
            if candidate.is_symlink():
                candidate.unlink(missing_ok=True)
        return result
