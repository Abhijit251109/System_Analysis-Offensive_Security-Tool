from controller.models import Event, Incident, Severity

RULES = {
    'credential_capture_attempt': (Severity.CRITICAL, 'Credential capture simulation detected'),
    'resource_exhaustion_attempt': (Severity.HIGH, 'Resource exhaustion simulation detected'),
    'persistence_attempt': (Severity.HIGH, 'Persistence simulation detected'),
    'privilege_escalation_attempt': (Severity.HIGH, 'Privilege escalation simulation detected'),
    'mass_file_modification_attempt': (Severity.HIGH, 'Mass file modification simulation detected'),
}

def detect(event: Event) -> Incident | None:
    rule = RULES.get(event.event_type)
    if not rule:
        return None
    severity, reason = rule
    return Incident(event=event, severity=severity, reason=reason)
