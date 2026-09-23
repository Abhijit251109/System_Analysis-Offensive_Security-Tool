from controller.models import Incident

class DefensiveResponder:
    """Contain simulations; never kill arbitrary processes or modify the host."""
    def contain(self, incident: Incident) -> Incident:
        incident.contained = True
        incident.action = 'blocked_simulation'
        return incident
