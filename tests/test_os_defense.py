from controller.models import Event
from defensive.os_security import OSDefenseAdapter


def test_os_security_stack_gets_first_chance():
    incident = OSDefenseAdapter().inspect(Event('credential_capture_attempt', 'simulation'))
    assert incident is not None
    assert incident.severity.value == 'critical'
