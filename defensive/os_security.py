from __future__ import annotations

from controller.models import Event, Incident
from defensive.detector import detect


class OSDefenseAdapter:
    """Safe stand-in for an OS security stack.

    The adapter models a first-line security product with limited coverage.
    Real integrations can replace it with Defender/EDR/AV telemetry without
    giving M-1 permission to disable or control the security product.
    """

    DEFAULT_COVERAGE = {
        'credential_capture_attempt',
        'persistence_attempt',
    }

    def __init__(self, coverage: set[str] | None = None):
        self.coverage = coverage if coverage is not None else self.DEFAULT_COVERAGE

    def inspect(self, event: Event) -> Incident | None:
        if event.event_type not in self.coverage:
            return None
        return detect(event)
