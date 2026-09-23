from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

class Severity(str, Enum):
    LOW = 'low'
    MEDIUM = 'medium'
    HIGH = 'high'
    CRITICAL = 'critical'

@dataclass(frozen=True)
class Event:
    event_type: str
    source: str
    payload: dict[str, Any] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

@dataclass
class Incident:
    event: Event
    severity: Severity
    reason: str
    contained: bool = False
    action: str = 'none'
