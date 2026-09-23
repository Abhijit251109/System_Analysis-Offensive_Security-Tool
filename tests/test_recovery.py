from controller.baseline import LabBaseline
from controller.recovery import RecoveryController


def test_snapshot_restores_lab(tmp_path):
    root = tmp_path / 'lab'
    root.mkdir()
    original = root / 'important.txt'
    original.write_text('original')

    baseline = LabBaseline.capture(root)
    recovery = RecoveryController(root, tmp_path / 'snapshot')
    snapshot = recovery.prepare()

    original.write_text('changed')
    assert baseline.verify() is False

    assert recovery.recover_if_needed(snapshot, baseline) is True
    assert original.read_text() == 'original'
    assert baseline.verify() is True
