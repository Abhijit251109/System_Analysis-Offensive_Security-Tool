from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from controller.baseline import LabBaseline
from controller.health_monitor import HealthMonitor
from controller.offensive_executor import audit_log, run_in_disposable_workspace
from controller.managed_registry import list_managed_files
from controller.offensive_registry import get_tool, list_tools
from controller.recovery import RecoveryController
from defensive.detector import detect
from defensive.os_security import OSDefenseAdapter
from defensive.response import DefensiveResponder
from offensive.simulations.scenarios import SCENARIOS, run_scenario

app = FastAPI(title="M-1 Defense API", version="4.0.0")

allowed_origins = [item.strip() for item in os.getenv("M1_ALLOWED_ORIGINS", "*").split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

LAB_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = LAB_ROOT / "web"
DIST = WEB_ROOT / "dist"
RUNTIME_ROOT = LAB_ROOT / "runtime"

# Serve the production Vite bundle from the same FastAPI origin. This keeps the
# deployed dashboard and API on one origin, so the browser can call /api/*
# without a separately configured API key or backend hostname.
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


class TestRequest(BaseModel):
    scenario: str = Field(default="all", min_length=1, max_length=500)
    dry_run: bool = False


class OffensiveRunRequest(BaseModel):
    tool_id: str = Field(min_length=1, max_length=80)
    confirm: bool = False
    confirmation_text: str = Field(default="", max_length=100)



def _sse(event_type: str, data: dict) -> str:
    return "data: " + json.dumps({"type": event_type, "data": data}) + "\n\n"


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "lab_mode": True,
        "ui_built": (DIST / "index.html").exists(),
        "api_version": app.version,
        "offensive_tools": len(list_tools()),
        "managed_files": len(list_managed_files()),
    }


@app.get("/api/scenarios")
def scenarios():
    return {"scenarios": ["all", *SCENARIOS.keys()]}



@app.get("/api/status")
def status():
    tools = list_tools()
    return {
        "api": "online",
        "lab_mode": True,
        "root": str(LAB_ROOT),
        "ui_built": (DIST / "index.html").exists(),
        "offensive_tools": len(tools),
        "executable_offensive_tools": sum(tool["execution"] != "blocked" for tool in tools),
        "unblocked_offensive_tools": sum(tool["execution"] != "blocked" for tool in tools),
        "execution_note": "The console executes even the hostile tools. Execute with caution.",
        "managed_files": len(list_managed_files()),
    }


def project_extensions():
    return {"files": list_managed_files()}


@app.get("/api/project/extensions")
def project_extensions_api():
    return project_extensions()


async def event_stream(name: str, dry_run: bool = False) -> AsyncIterator[str]:
    requested = [part.strip() for part in name.split(",") if part.strip()]
    if not requested or (name != "all" and any(part not in SCENARIOS for part in requested)):
        raise HTTPException(status_code=400, detail="Unknown scenario")

    yield _sse("run_started", {"run_id": str(uuid.uuid4()), "mode": "simulation", "scenario": name, "dry_run": dry_run})
    await asyncio.sleep(0.05)

    if dry_run:
        yield _sse("stage", {"stage": "snapshot", "message": "DRY RUN: no snapshot or filesystem changes"})
        planned = list(run_scenario(name))
        for event in planned:
            yield _sse("stage", {"stage": "offensive", "message": f"DRY RUN: would generate {event.event_type}", "event": event.event_type})
            await asyncio.sleep(0.06)
            yield _sse("stage", {"stage": "os_defense", "message": "DRY RUN: would inspect event with OS security adapter"})
            yield _sse("stage", {"stage": "m1_defense", "message": "DRY RUN: would route uncovered event to M-1 defensive layer"})
        result = {
            "scenario": name,
            "dry_run": True,
            "planned_events": [e.event_type for e in planned],
            "incidents": [],
            "all_contained": True,
            "baseline_intact": True,
            "recovery_required": False,
            "snapshot_created": False,
            "external_recovery_required": False,
            "execution": "backend-dry-run",
        }
        yield _sse("complete", result)
        return

    baseline = LabBaseline.capture(LAB_ROOT)
    recovery = RecoveryController(LAB_ROOT, LAB_ROOT.parent / ".m1-recovery" / LAB_ROOT.name / "snapshot")
    snapshot = recovery.prepare()
    os_defense = OSDefenseAdapter()
    responder = DefensiveResponder()
    health_monitor = HealthMonitor(LAB_ROOT, baseline)
    incidents = []

    yield _sse("stage", {"stage": "snapshot", "message": "Disposable lab snapshot prepared"})
    await asyncio.sleep(0.10)

    for event in run_scenario(name):
        yield _sse("stage", {"stage": "offensive", "message": f"Simulated event: {event.event_type}", "event": event.event_type})
        await asyncio.sleep(0.10)
        yield _sse("stage", {"stage": "os_defense", "message": "OS security adapter inspecting event"})
        incident = os_defense.inspect(event)
        handled_by = "os_security_stack"
        if incident is None:
            yield _sse("stage", {"stage": "m1_defense", "message": "OS layer did not handle event; M-1 defensive layer engaged"})
            incident = detect(event)
            handled_by = "m1_defensive_layer"
        else:
            yield _sse("stage", {"stage": "m1_defense", "message": "OS security stack contained the event"})
        if incident:
            responder.contain(incident)
            item = {
                "event": event.event_type,
                "severity": incident.severity.value,
                "reason": incident.reason,
                "contained": incident.contained,
                "action": incident.action,
                "handled_by": handled_by,
            }
            incidents.append(item)
            yield _sse("incident", item)
        await asyncio.sleep(0.08)

    recovery_required = recovery.recover_if_needed(snapshot, baseline)
    result = {
        "scenario": name,
        "dry_run": False,
        "incidents": incidents,
        "all_contained": bool(incidents) and all(x["contained"] for x in incidents),
        "baseline_intact": health_monitor.healthy(),
        "recovery_required": recovery_required,
        "snapshot_created": True,
        "external_recovery_required": False,
        "execution": "backend-simulation",
    }
    yield _sse("complete", result)


@app.post("/api/test/stream")
async def test_stream(request: TestRequest | None = None, scenario: str | None = None, dry_run: bool = False):
    payload = request or TestRequest(scenario=scenario or "all", dry_run=dry_run)
    try:
        requested = [part.strip() for part in payload.scenario.split(",") if part.strip()]
        if not requested or (payload.scenario != "all" and any(part not in SCENARIOS for part in requested)):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="Unknown scenario")
    return StreamingResponse(
        event_stream(payload.scenario, payload.dry_run),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


async def offensive_event_stream(request: OffensiveRunRequest) -> AsyncIterator[str]:
    run_id = str(uuid.uuid4())
    tool = get_tool(request.tool_id)
    yield _sse("run_started", {"run_id": run_id, "mode": "offensive_tool", "tool_id": tool.id, "source": tool.source})
    yield _sse("warning", {"message": tool.warning, "risk": tool.risk, "execution": tool.execution})
    await asyncio.sleep(0.05)
    
    yield _sse("stage", {"stage": "validation", "message": "Confirmation accepted; preparing disposable workspace"})
    yield _sse("stage", {"stage": "offensive_tool", "message": f"Running bounded adapter for {tool.name}", "source": tool.source})
    await asyncio.sleep(0.05)
    try:
        result = await asyncio.to_thread(run_in_disposable_workspace, tool.id, run_id, RUNTIME_ROOT)
    except Exception as exc:
        audit_log(RUNTIME_ROOT / "logs" / "offensive-tools.jsonl", {"run_id": run_id, "tool_id": tool.id, "source": tool.source, "execution": tool.execution, "error": f"{exc.__class__.__name__}: {exc}"})
        yield _sse("error", {"stage": "offensive_tool", "message": f"Tool execution failed: {exc.__class__.__name__}: {exc}"})
        yield _sse("complete", {"run_id": run_id, "tool_id": tool.id, "execution": tool.execution, "success": False})
        return

    yield _sse("stage", {"stage": "defense", "message": "Adapter completed; host-level changes permitted"})
    yield _sse("result", result)
    yield _sse("complete", {"run_id": run_id, "tool_id": tool.id, "execution": tool.execution, "success": True, "result": result})


@app.post("/api/offensive/stream")
async def offensive_stream(request: OffensiveRunRequest):
    try:
        tool = get_tool(request.tool_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    if not request.confirm or request.confirmation_text.strip() != "I UNDERSTAND":
        raise HTTPException(status_code=428, detail="Explicit confirmation is required. Type I UNDERSTAND.")
    if tool.execution == "blocked":
        return StreamingResponse(offensive_event_stream(request), media_type="text/event-stream")
    return StreamingResponse(offensive_event_stream(request), media_type="text/event-stream")


@app.get("/", include_in_schema=False)
def index():
    index_file = DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse(
        """<!doctype html><html><body style='font-family:sans-serif;background:#09151e;color:#dce8ed;padding:40px'>
    <h1>M-1 API is running</h1><p>The React dashboard has not been built yet.</p>
    <p>Run <code>npm install</code> and <code>npm run build</code> inside <code>web/</code>, then refresh.</p></body></html>"""
    )
