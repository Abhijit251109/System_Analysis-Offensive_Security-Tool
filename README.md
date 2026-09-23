# M-1 — Cybersecurity Defensive Lab

M-1 is a **safe, bounded cybersecurity test harness** built from the existing project. It models attack behaviors as events instead of executing destructive or stealthy actions on the host.

## Test flow

`Safe offensive simulation → OS security stack (external) → M-1 detection → M-1 containment → baseline verification → external recovery if needed`

The current MVP implements the M-1 layer and baseline verification. It deliberately does **not** attempt to disable security software, delete system files, capture real keystrokes, consume unbounded disk space, establish persistence, or perform privilege escalation.

## Run

```bash
python -m controller.test_runner --scenario all --lab-root .
```

Individual scenarios: `keylogging`, `disk_fill`, `persistence`, `privilege`, `encryption`.

## Test

```bash
python -m pytest -q
```

## Architecture

- `offensive/simulations/` — bounded attack-event generators
- `defensive/detector.py` — deterministic detection rules
- `defensive/response.py` — containment of simulated incidents
- `controller/baseline.py` — lab-state integrity baseline
- `controller/test_runner.py` — real-time orchestration and report
- `tests/` — automated acceptance tests

## Recovery boundary

A whole-system rollback should be performed by an **external disposable-VM controller / hypervisor snapshot**, not by code running inside the potentially compromised guest. M-1 only verifies its controlled lab baseline and reports whether external recovery is required.


## M-1 Recovery Layer

The MVP now models a three-stage defensive path:

1. **OS security stack** gets first chance to inspect supported events.
2. **M-1 defensive layer** handles events not covered by the OS adapter.
3. **Recovery controller** restores the lab snapshot if the baseline changes.

The included snapshot implementation is deliberately limited to the disposable lab directory. A real whole-VM snapshot/revert must be supplied by an external hypervisor/controller; M-1 does not modify host disks or hypervisor state.

Run:

```bash
python -m controller.test_runner --scenario all --lab-root . --report reports/latest.json
python -m pytest -q
```

## Android native app

A native Android delivery is included under `android/`. It packages the M-1 dashboard and offline safe simulator into an Android APK/AAB without requiring Python or Node.js on the phone. Build it with Android Studio or the included GitHub Actions workflow. Linux, Windows and macOS launcher/API components remain available in the project root.
