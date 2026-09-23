"""Safe, bounded attack simulations. These never touch real system resources."""
from controller.models import Event

SCENARIOS = {
    'keylogging': [
        Event('credential_capture_attempt', 'simulated_keylogger', {'keys': ['USER', 'PASSWORD']}),
    ],
    'disk_fill': [
        Event('resource_exhaustion_attempt', 'simulated_disk_filler', {'requested_mb': 1024}),
    ],
    'persistence': [
        Event('persistence_attempt', 'simulated_persistence', {'location': 'lab-startup'}),
    ],
    'privilege': [
        Event('privilege_escalation_attempt', 'simulated_privilege_module', {'target': 'lab-resource'}),
    ],
    'encryption': [
        Event('mass_file_modification_attempt', 'simulated_encryptor', {'files': 50}),
    ],
}

def run_scenario(name: str):
    if name == 'all':
        for scenario in ('keylogging', 'disk_fill', 'persistence', 'privilege', 'encryption'):
            yield from SCENARIOS[scenario]
        return
    if ',' in name:
        requested = [part.strip() for part in name.split(',') if part.strip()]
        unknown = [part for part in requested if part not in SCENARIOS]
        if unknown or not requested:
            raise ValueError(f'Unknown scenario: {unknown[0] if unknown else name}')
        for scenario in requested:
            yield from SCENARIOS[scenario]
        return
    if name not in SCENARIOS:
        raise ValueError(f'Unknown scenario: {name}')
    yield from SCENARIOS[name]
