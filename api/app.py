from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import AsyncIterator

from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from controller.baseline import LabBaseline
from controller.health_monitor import HealthMonitor
from controller.recovery import RecoveryController
from defensive.detector import detect
from defensive.os_security import OSDefenseAdapter
from defensive.response import DefensiveResponder
from offensive.simulations.scenarios import SCENARIOS, run_scenario

app = FastAPI(title="M-1 Defense API", version="3.0.0")

class TestRequest(BaseModel):
    scenario: str = Field(default="all", min_length=1, max_length=500)
    dry_run: bool = False
LAB_ROOT = Path(__file__).resolve().parents[1]
WEB_ROOT = LAB_ROOT / "web"
DIST = WEB_ROOT / "dist"

@app.get("/api/health")
def health():
    return {"ok": True, "lab_mode": True, "ui_built": (DIST / "index.html").exists()}

@app.get("/api/scenarios")
def scenarios():
    return {"scenarios": ["all", *SCENARIOS.keys()]}

@app.get("/api/status")
def status():
    return {"api": "online", "lab_mode": True, "root": str(LAB_ROOT), "ui_built": (DIST / "index.html").exists()}

async def event_stream(name: str, dry_run: bool = False) -> AsyncIterator[str]:
    requested = [part.strip() for part in name.split(',') if part.strip()]
    if not requested or (name != 'all' and any(part not in SCENARIOS for part in requested)):
        raise HTTPException(status_code=400, detail="Unknown scenario")

    def emit(event_type: str, data: dict) -> str:
        return "data: " + json.dumps({"type": event_type, "data": data}) + "\n\n"

    yield emit("run_started", {"scenario": name, "dry_run": dry_run})
    await asyncio.sleep(0.05)

    if dry_run:
        yield emit("stage", {"stage": "snapshot", "message": "DRY RUN: snapshot/recovery changes skipped"})
        await asyncio.sleep(0.08)
        planned = list(run_scenario(name))
        for event in planned:
            yield emit("stage", {"stage": "offensive", "message": f"DRY RUN: would generate {event.event_type}", "event": event.event_type})
            await asyncio.sleep(0.08)
            yield emit("stage", {"stage": "os_defense", "message": "DRY RUN: would inspect event with OS security adapter"})
            await asyncio.sleep(0.05)
            yield emit("stage", {"stage": "m1_defense", "message": "DRY RUN: would route uncovered events to M-1 defensive layer"})
            await asyncio.sleep(0.05)
        result = {
            "scenario": name, "dry_run": True, "planned_events": [e.event_type for e in planned],
            "incidents": [], "all_contained": True, "baseline_intact": True,
            "recovery_required": False, "snapshot_created": False,
            "external_recovery_required": False, "execution": "backend-dry-run"
        }
        yield emit("complete", result)
        return

    baseline = LabBaseline.capture(LAB_ROOT)
    recovery = RecoveryController(LAB_ROOT, LAB_ROOT.parent / ".m1-recovery" / LAB_ROOT.name / "snapshot")
    snapshot = recovery.prepare()
    os_defense = OSDefenseAdapter()
    responder = DefensiveResponder()
    health_monitor = HealthMonitor(LAB_ROOT, baseline)
    incidents = []

    yield emit("stage", {"stage": "snapshot", "message": "Disposable lab snapshot prepared"})
    await asyncio.sleep(0.15)

    for event in run_scenario(name):
        yield emit("stage", {"stage": "offensive", "message": f"Simulated event: {event.event_type}", "event": event.event_type})
        await asyncio.sleep(0.25)
        yield emit("stage", {"stage": "os_defense", "message": "OS security adapter inspecting event"})
        await asyncio.sleep(0.10)
        incident = os_defense.inspect(event)
        handled_by = "os_security_stack"
        if incident is None:
            yield emit("stage", {"stage": "m1_defense", "message": "OS layer did not handle event; M-1 defensive layer engaged"})
            await asyncio.sleep(0.10)
            incident = detect(event)
            handled_by = "m1_defensive_layer"
        else:
            yield emit("stage", {"stage": "m1_defense", "message": "OS security stack contained the event"})
        if incident:
            responder.contain(incident)
            item = {"event": event.event_type, "severity": incident.severity.value, "reason": incident.reason,
                    "contained": incident.contained, "action": incident.action, "handled_by": handled_by}
            incidents.append(item)
            yield emit("incident", item)
        await asyncio.sleep(0.25)

    recovery_required = recovery.recover_if_needed(snapshot, baseline)
    result = {"scenario": name, "dry_run": False, "incidents": incidents,
              "all_contained": bool(incidents) and all(x["contained"] for x in incidents),
              "baseline_intact": health_monitor.healthy(), "recovery_required": recovery_required,
              "snapshot_created": True, "external_recovery_required": False, "execution": "backend"}
    yield emit("complete", result)

@app.post("/api/test/stream")
async def test_stream(request: TestRequest | None = None, scenario: str | None = None, dry_run: bool = False):
    # JSON body is preferred; query parameters remain supported for backwards compatibility.
    payload = request or TestRequest(scenario=scenario or "all", dry_run=dry_run)
    try:
        requested = [part.strip() for part in payload.scenario.split(',') if part.strip()]
        if not requested or (payload.scenario != 'all' and any(part not in SCENARIOS for part in requested)):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=400, detail="Unknown scenario")
    return StreamingResponse(event_stream(payload.scenario, payload.dry_run), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","Connection":"keep-alive","X-Accel-Buffering":"no"})

@app.get("/", include_in_schema=False)
def index():
    index_file = DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return HTMLResponse("""<!doctype html><html><body style='font-family:sans-serif;background:#09151e;color:#dce8ed;padding:40px'>
    <h1>M-1 API is running</h1><p>The React dashboard has not been built yet.</p>
    <p>Run <code>npm install</code> and <code>npm run build</code> inside <code>web/</code>, then refresh.</p></body></html>""")
