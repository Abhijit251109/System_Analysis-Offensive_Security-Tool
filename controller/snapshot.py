from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path


@dataclass
class LabSnapshot:
    source: Path
    destination: Path

    @classmethod
    def create(cls, source: Path, destination: Path) -> 'LabSnapshot':
        source = source.resolve()
        destination = destination.resolve()
        if destination == source or source in destination.parents:
            raise ValueError('Snapshot destination must be outside the lab root')
        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, destination, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns('.git', '.pytest_cache', '.m1-recovery'))
        return cls(source, destination)

    def restore(self) -> None:
        if not self.destination.exists():
            raise FileNotFoundError(f'Snapshot not found: {self.destination}')
        for child in self.source.iterdir():
            if child.name in {'.git', '.pytest_cache', 'recovery'}:
                continue
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()
        for child in self.destination.iterdir():
            target = self.source / child.name
            if child.is_dir():
                shutil.copytree(child, target, dirs_exist_ok=True)
            else:
                shutil.copy2(child, target)


class ExternalSnapshotProvider:
    """Boundary for a real VM/hypervisor snapshot provider.

    M-1 deliberately does not manipulate host disks or hypervisor state itself.
    An integration can implement this interface outside the guest VM.
    """

    def create(self, label: str) -> str:
        raise NotImplementedError

    def restore(self, snapshot_id: str) -> None:
        raise NotImplementedError
