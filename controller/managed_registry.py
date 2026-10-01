from __future__ import annotations

import hashlib
import os
from pathlib import Path

BASE_ROOT = Path(__file__).resolve().parents[1]


def extension_root(kind: str) -> Path:
    if kind == "offensive":
        root = BASE_ROOT / "offensive" / "extensions"
    elif kind == "defensive":
        root = BASE_ROOT / "defensive" / "extensions"
    else:
        raise ValueError("kind must be offensive or defensive")
    root.mkdir(parents=True, exist_ok=True)
    return root


def list_managed_files() -> list[dict]:
    """List extensions that already exist in the checked-out project.

    This registry is intentionally read-only. Runtime browser staging is handled by
    IndexedDB in the React client and is never written through an API upload route.
    """
    records: list[dict] = []
    for kind in ("offensive", "defensive"):
        root = extension_root(kind)
        for path in sorted(root.rglob("*")):
            if not path.is_file() or any(part.startswith(".") for part in path.relative_to(root).parts):
                continue
            data = path.read_bytes()
            records.append(
                {
                    "kind": kind,
                    "filename": path.name,
                    "path": str(path.relative_to(BASE_ROOT)).replace(os.sep, "/"),
                    "bytes": path.stat().st_size,
                    "sha256": hashlib.sha256(data).hexdigest(),
                    "wired": True,
                    "execution": "blocked_by_default" if kind == "offensive" and path.suffix == ".py" else "registered",
                    "source": "committed_project",
                }
            )
    return records
