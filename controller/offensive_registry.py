from __future__ import annotations

from dataclasses import asdict, dataclass

from controller.managed_registry import list_managed_files


@dataclass(frozen=True)
class OffensiveTool:
    id: str
    name: str
    source: str
    capability: str
    risk: str
    execution: str
    description: str
    warning: str
    adapter: str | None = None
    blocked_reason: str | None = None

    def as_dict(self) -> dict:
        return asdict(self)


TOOLS: tuple[OffensiveTool, ...] = (
    OffensiveTool(
        id="keylogger", name="Keylogger", source="offensive.collection.keylogger",
        capability="credential / input capture", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original source captures real keyboard input and runs indefinitely. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="Do not run against a normal workstation. This source is intentionally not callable from the dashboard.",
        blocked_reason="Real keyboard capture is not exposed as a web-triggered action. Use the bounded key-capture probe instead.",
    ),
    OffensiveTool(
        id="disk_fill", name="Disk Filler", source="offensive.collection.disk_fill",
        capability="resource exhaustion", risk="critical", execution="lab_adapter",
        description="Original source can write files continuously until interrupted. The console uses a bounded disposable-workspace adapter.",
        warning="The adapter writes only inside a temporary M-1 lab directory and removes its files before completion.", adapter="bounded_disk_fill",
    ),
    OffensiveTool(
        id="os_destroyer", name="OS Destroyer", source="offensive.collection.os_destroyer",
        capability="system destruction", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original source attempts destructive filesystem changes on protected OS locations. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="Never expose this source as a one-click action on a host OS.", blocked_reason="System-destruction code is retained for source audit only and is blocked by the console.",
    ),
    OffensiveTool(
        id="ownership_steal", name="Ownership / Permission Override", source="offensive.persistence.ownership_steal",
        capability="privilege / permission modification", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original source changes ownership and permissions and may delete protected paths. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="This can damage a real installation and requires privileged access.", blocked_reason="Privilege and permission override is not executable from the dashboard.",
    ),
    OffensiveTool(
        id="elevate", name="Privilege Elevation Helper", source="offensive.platform_mod.elevate",
        capability="privilege escalation", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original source invokes administrative/root execution helpers. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="Elevation is a host-level capability and is intentionally unavailable to the web console.", blocked_reason="The console never requests or launches a privileged shell.",
    ),
    OffensiveTool(
        id="shells", name="Command Shell Helper", source="offensive.platform_mod.shells",
        capability="arbitrary command execution", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original source can execute shell commands, including elevated commands. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="Arbitrary command execution is intentionally not exposed through the UI.", blocked_reason="No free-form shell execution is allowed from the dashboard.",
    ),
    OffensiveTool(
        id="encryption", name="Encryptor", source="offensive.crypto.encryption_key_manager",
        capability="file modification / encryption", risk="high", execution="lab_adapter",
        description="Original source modifies a target file. The console uses a disposable fixture and verifies round-trip recovery.",
        warning="Only the generated disposable fixture is touched; no user-selected paths are accepted.", adapter="fixture_encryption",
    ),
    OffensiveTool(
        id="collection_main", name="Collection Orchestrator", source="offensive.collection.main",
        capability="multi-tool orchestration", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original orchestrator chains key capture, destruction and resource-exhaustion modules. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="This legacy entry point can trigger multiple host-side behaviors and is not a safe web action.", blocked_reason="The original collection orchestrator is source-audit-only.",
    ),
    OffensiveTool(
        id="background_runner", name="Background Runner", source="offensive.core.background_runner",
        capability="long-running background execution", risk="high", execution="lab_adapter", adapter="bounded_simulation",
        description="Original module launches background tasks and contains an unbounded loop. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="A web request must never create an unbounded background process.", blocked_reason="Long-running persistence-like execution is blocked by the console.",
    ),
    OffensiveTool(
        id="keyboard_interrupt_suppress", name="Interrupt Suppressor", source="offensive.persistence.keyboard_interrupt_suppress",
        capability="process persistence / interruption resistance", risk="high", execution="lab_adapter", adapter="bounded_simulation",
        description="Original module suppresses KeyboardInterrupt and keeps retrying forever. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="The console must remain interruptible and auditable.", blocked_reason="Uninterruptible execution is not exposed through the dashboard.",
    ),
    OffensiveTool(
        id="os_root_save", name="Root Save Helper", source="offensive.persistence.os_root_save",
        capability="privileged root filesystem write", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original module can write files to protected root locations and invoke elevation. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="Protected filesystem writes and UAC/sudo invocation are intentionally unavailable.", blocked_reason="No privileged filesystem writes are permitted from the web console.",
    ),
    OffensiveTool(
        id="lockpath", name="Path Lock Helper", source="offensive.crypto.encryptor1",
        capability="filesystem permission / immutable-flag modification", risk="high", execution="lab_adapter", adapter="bounded_simulation",
        description="Original helper changes permissions or immutable/hidden/read-only flags on a target path. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="The target path is not user-controlled because this capability could make files inaccessible.", blocked_reason="Filesystem locking is retained for audit only.",
    ),
    OffensiveTool(
        id="terminal_manager", name="Terminal Manager", source="offensive.core.manager",
        capability="terminal / shell startup", risk="critical", execution="lab_adapter", adapter="bounded_simulation",
        description="Original manager can launch terminals and elevated command shells. Dashboard execution is a bounded report-only simulation; original source is never imported or executed.",
        warning="The dashboard does not launch arbitrary terminals or shells.", blocked_reason="Interactive shell launch is blocked by design.",
    ),
    OffensiveTool(
        id="platform_probe", name="Platform Utility Probe", source="offensive.platform_mod.platform_utils",
        capability="platform discovery", risk="low", execution="direct_safe",
        description="Loads the platform utility and reports its detected OS class.",
        warning="Read-only probe; no system changes are performed.", adapter="platform_probe",
    ),
    OffensiveTool(
        id="keylogging_probe", name="Key Capture Lab Probe", source="offensive.collection.keylogger",
        capability="synthetic input capture", risk="medium", execution="lab_adapter",
        description="Exercises the keylogger workflow using fixed synthetic test keys rather than real keyboard events.",
        warning="No physical keyboard hooks are opened. Only synthetic test data is written to the disposable lab workspace.", adapter="synthetic_key_capture",
    ),
    OffensiveTool(
        id="persistence_probe", name="Persistence Lab Probe", source="offensive.persistence",
        capability="persistence simulation", risk="high", execution="lab_adapter",
        description="Exercises the persistence detection path with a disposable marker file, not OS startup registration.",
        warning="No startup entries, services, scheduled tasks, or launch agents are modified.", adapter="persistence_marker",
    ),
    OffensiveTool(
        id="privilege_probe", name="Privilege Lab Probe", source="offensive.platform_mod.elevate",
        capability="privilege check", risk="medium", execution="lab_adapter",
        description="Reports the current process privilege state without attempting elevation.",
        warning="No UAC, sudo, or root escalation is requested.", adapter="privilege_probe",
    ),
)

TOOL_MAP = {tool.id: tool for tool in TOOLS}


def list_tools() -> list[dict]:
    tools = [tool.as_dict() for tool in TOOLS]
    known_sources = {tool["source"] for tool in tools}
    for item in list_managed_files():
        if item["kind"] != "offensive":
            continue
        source_name = f"offensive.extensions.{item['filename'].rsplit('.', 1)[0]}"
        if source_name in known_sources:
            continue
        tool_id = f"uploaded_{item['sha256'][:12]}"
        tools.append(
            {
                "id": tool_id,
                "name": item["filename"],
                "source": source_name,
                "capability": "uploaded offensive extension",
                "risk": "unknown",
                "execution": "unblocked",
                "description": "Committed under offensive/extensions and inventoried for source review. It is not imported or executed automatically.",
                "warning": "Uploaded offensive code is not executed automatically from the web console.",
                "adapter": None,
                "blocked_reason": "New uploaded offensive modules require a reviewed, bounded lab adapter before they can be executed.",
                "managed_file": True,
                "sha256": item["sha256"],
                "path": item["path"],
            }
        )
    return tools


def get_tool(tool_id: str) -> OffensiveTool:
    if tool_id in TOOL_MAP:
        return TOOL_MAP[tool_id]
    for item in list_tools():
        if item["id"] == tool_id:
            return OffensiveTool(
                id=item["id"], name=item["name"], source=item["source"], capability=item["capability"],
                risk=item["risk"], execution=item["execution"], description=item["description"],
                warning=item["warning"], adapter=item.get("adapter"), blocked_reason=item.get("blocked_reason"),
            )
    raise ValueError(f"Unknown offensive tool: {tool_id}")
