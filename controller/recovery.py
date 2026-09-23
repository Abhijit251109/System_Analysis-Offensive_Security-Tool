from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from controller.baseline import LabBaseline
from controller.snapshot import LabSnapshot


@dataclass
class RecoveryController:
    root: Path
    snapshot_dir: Path

    def prepare(self) -> LabSnapshot:
        snapshot = LabSnapshot.create(self.root, self.snapshot_dir)
        return snapshot

    def recover_if_needed(self, snapshot: LabSnapshot, baseline: LabBaseline) -> bool:
        if baseline.verify():
            return False
        snapshot.restore()
        if not baseline.verify():
            raise RuntimeError('Recovery completed but baseline verification failed')
        return True
