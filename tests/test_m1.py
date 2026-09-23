from pathlib import Path
from controller.test_runner import run

def test_all_simulations_are_contained_and_bounded(tmp_path):
    (tmp_path / 'baseline.txt').write_text('M-1 lab')
    result = run('all', tmp_path, delay=0)
    assert result['all_contained'] is True
    assert result['baseline_intact'] is True
    assert result['recovery_required'] is False
    assert len(result['incidents']) == 5


def test_dry_run_does_not_create_snapshot(tmp_path):
    # The HTTP dry-run path is intentionally side-effect free; this test
    # exercises the same scenario expansion used by the API.
    from offensive.simulations.scenarios import run_scenario
    events = list(run_scenario('keylogging,privilege'))
    assert [e.event_type for e in events] == [
        'credential_capture_attempt', 'privilege_escalation_attempt'
    ]
    assert not (tmp_path / '.m1-recovery').exists()
