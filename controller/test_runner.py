import argparse
import json
import time
from pathlib import Path

from offensive.simulations.scenarios import run_scenario
from defensive.os_security import OSDefenseAdapter
from defensive.detector import detect
from defensive.response import DefensiveResponder
from controller.baseline import LabBaseline
from controller.health_monitor import HealthMonitor
from controller.recovery import RecoveryController
from controller.report import write_report


def run(name: str, root: Path, delay: float = 0.15, recovery_dir: Path | None = None):
    root = root.resolve()
    baseline = LabBaseline.capture(root)
    recovery = RecoveryController(root, recovery_dir or (root.parent / '.m1-recovery' / root.name / 'snapshot'))
    snapshot = recovery.prepare()
    os_defense = OSDefenseAdapter()
    responder = DefensiveResponder()
    health = HealthMonitor(root, baseline)
    results = []

    for event in run_scenario(name):
        time.sleep(max(0.0, delay))
        incident = os_defense.inspect(event)
        first_line = 'os_security_stack'
        if incident is None:
            incident = detect(event)
            first_line = 'm1_defensive_layer'
        if incident:
            responder.contain(incident)
            results.append({
                'event': event.event_type,
                'severity': incident.severity.value,
                'reason': incident.reason,
                'contained': incident.contained,
                'action': incident.action,
                'handled_by': first_line,
            })

    recovered = recovery.recover_if_needed(snapshot, baseline)
    return {
        'scenario': name,
        'incidents': results,
        'all_contained': bool(results) and all(x['contained'] for x in results),
        'baseline_intact': health.healthy(),
        'recovery_required': recovered,
        'snapshot_created': True,
        'external_recovery_required': False,
    }


def main():
    parser = argparse.ArgumentParser(description='M-1 safe real-time defensive lab')
    parser.add_argument('--scenario', default='all', help='all, one scenario, or a comma-separated set of scenarios')
    parser.add_argument('--dry-run', action='store_true', help='Execute only synthetic bounded events (default behavior)')
    parser.add_argument('--lab-root', default='.')
    parser.add_argument('--delay', type=float, default=0.15)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = run(args.scenario, Path(args.lab_root), args.delay)
    if args.report:
        write_report(result, args.report)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result['all_contained'] and result['baseline_intact'] else 2)


if __name__ == '__main__':
    main()
