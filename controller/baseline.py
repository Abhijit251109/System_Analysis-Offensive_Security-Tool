from dataclasses import dataclass, field
from pathlib import Path
import hashlib

@dataclass
class LabBaseline:
    root: Path
    files: dict[str, str] = field(default_factory=dict)

    @classmethod
    def capture(cls, root: Path):
        files = {}
        for p in sorted(root.rglob('*')):
            if p.is_file() and '.git' not in p.parts and '.m1-recovery' not in p.parts:
                files[str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
        return cls(root, files)

    def verify(self):
        current = LabBaseline.capture(self.root)
        return self.files == current.files
