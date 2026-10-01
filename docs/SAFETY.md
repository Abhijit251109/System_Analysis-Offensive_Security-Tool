# Safety boundary

The original repository contains modules capable of destructive filesystem changes, persistence-like behavior, unbounded resource exhaustion, privileged execution, shell launch and real keyboard capture.

Those modules remain in the `offensive/` tree for source review and research context. The dashboard now inventories them explicitly, but it does not expose the dangerous originals as one-click web actions.

## Dashboard execution boundary

The **Offensive Tools** page has three execution classes:

- `direct_safe` — read-only inspection such as platform detection.
- `lab_adapter` — a bounded equivalent executed inside a disposable temporary workspace.
- `blocked` — source modules that can affect the host, request elevation, capture real input, launch arbitrary commands, establish persistence or run without a meaningful bound.

Every executable offensive-tool action requires an explicit warning acknowledgement and the confirmation phrase `I UNDERSTAND`.

## Reliability boundary

The frontend does not synthesize a fake success when the API is offline. Live execution controls are disabled until `/api/health`, `/api/status` and `/api/offensive/tools` respond successfully.

Every live stream must emit a completion event. Failures and blocked attempts are written to `runtime/logs/offensive-tools.jsonl`.

## Recovery boundary

A whole-system rollback should be performed by an external disposable-VM controller or hypervisor snapshot, not by code running inside a potentially compromised guest. M-1's in-project snapshot remains limited to the controlled lab directory.
