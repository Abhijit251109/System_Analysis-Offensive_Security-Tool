from __future__ import annotations

import ast
from pathlib import Path

from controller.models import Severity

ROOT = Path(__file__).resolve().parent / "extensions"


def load_extension_rules() -> dict[str, tuple[Severity, str]]:
    """Read optional M1_RULES literals without importing uploaded code.

    A defensive extension may declare a literal like:

        M1_RULES = {"custom_event": ("HIGH", "Custom event detected")}

    The source is parsed statically with ast.literal_eval; no uploaded function or
    module code is executed.
    """
    rules: dict[str, tuple[Severity, str]] = {}
    if not ROOT.exists():
        return rules

    for path in ROOT.glob("*.py"):
        if path.name.startswith("_"):
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        except (OSError, SyntaxError, UnicodeDecodeError):
            continue
        value = None
        for node in tree.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id == "M1_RULES":
                        try:
                            value = ast.literal_eval(node.value)
                        except (ValueError, TypeError, SyntaxError):
                            value = None
        if not isinstance(value, dict):
            continue
        for event_type, definition in value.items():
            if not isinstance(event_type, str) or not isinstance(definition, (tuple, list)) or len(definition) != 2:
                continue
            severity_name, reason = definition
            if not isinstance(severity_name, str) or not isinstance(reason, str):
                continue
            try:
                severity = Severity[severity_name.upper()]
            except KeyError:
                continue
            rules[event_type] = (severity, reason)
    return rules
