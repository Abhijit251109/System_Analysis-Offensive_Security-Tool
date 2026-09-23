from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from controller.baseline import LabBaseline


@dataclass
class HealthMonitor:
    root: Path
    baseline: LabBaseline

    def healthy(self) -> bool:
        return self.baseline.verify()
