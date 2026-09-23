# Safety boundary

The original repository contains modules capable of destructive filesystem changes, persistence, resource exhaustion, privilege handling, and key capture. Those modules remain in the source tree for research/audit context but are **not part of the M-1 test runner**.

New M-1 scenarios emit synthetic events only. Any future integration with a real OS security stack must be performed inside an isolated disposable VM with an externally managed snapshot and an explicit allowlist of test actions.
