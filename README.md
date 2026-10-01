# M-1 — System Security Analysis Lab

M-1 is a controlled cybersecurity lab console for learning how offensive-looking behaviors can be surfaced, detected, contained, audited and recovered in a disposable environment.

## What changed in this version

The React dashboard no longer pretends that a run happened when the Python API is offline. Live buttons are disabled until the API is reachable, and every stream must end with a controller completion event.

The dashboard also has an **Offensive Tools** page. It inventories the actual `offensive/` source tree and shows the source module, capability, risk and execution mode for each entry.

Some original modules are deliberately marked **blocked** because they can:

- capture real keyboard input;
- modify protected OS paths;
- request administrator/root privileges;
- execute arbitrary shell commands;
- register persistence or change ownership/permissions; or
- run without a meaningful resource bound.

Those sources remain in the repository for code review and research context. The web console never launches them directly.

For the executable entries, the console uses bounded **lab adapters** that run only inside a temporary disposable workspace. The user must first open the warning dialog and type `I UNDERSTAND`.

## Execution modes

### Safe simulations

```bash
python -m controller.test_runner --scenario all --lab-root .
```

These exercise the detection, containment, snapshot and recovery pipeline with synthetic events.

### Dashboard API

```bash
python -m pip install -r api/requirements.txt
python run_dashboard.py
```

The API listens on `http://127.0.0.1:8000` by default.

### React dashboard

```bash
cd web
npm install
npm run dev
```

For local development Vite proxies `/api` to `http://127.0.0.1:8000`.

## GitHub Pages

GitHub Pages can host the frontend, but it cannot execute Python. Set the repository variable `M1_API_BASE_URL` to the public URL of your separately hosted FastAPI service before deploying Pages.

The workflow builds with:

```text
VITE_API_BASE_URL=${{ vars.M1_API_BASE_URL }}
```

When the API is unavailable, the UI stays in **offline** mode instead of silently switching to a fake live run.

## Render deployment

The repository includes a `Dockerfile` and `render.yaml` for a single-service Render deployment. The container builds the React dashboard and serves it through FastAPI. Render should deploy it as a Docker Web Service; the container binds to `0.0.0.0:$PORT` and exposes `/api/health` for the health check.

The dashboard also has **ADD TO OFFENSIVE** and **ADD TO DEFENSIVE** buttons. These are browser-local staging controls: selected files and folders are kept in the current user's IndexedDB and are not uploaded to the M-1 service. A contributor can generate a `.m1request` bundle; the repository author imports it, reviews the exact paths, verifies GitHub push permission, and explicitly approves the commit/push. Approved files are written under `offensive/extensions` or `defensive/extensions`.

See [RENDER.md](RENDER.md) for the deployment and persistence details.

## Tests

```bash
python -m pytest -q
```

The tests cover the simulation pipeline, OS-defense handoff, recovery and the offensive-tool safety boundary.

### Defensive extension contract

A `.py` file uploaded to `defensive/extensions` can become an active detection rule without importing or executing the file. Put a literal named `M1_RULES` in the file:

```python
M1_RULES = {
    "custom_event": ("HIGH", "Custom defensive rule matched")
}
```

The controller reads that literal with `ast.literal_eval()` and merges the resulting rules into the defensive detector. Arbitrary functions in uploaded files are not executed automatically.

## Local project contribution workflow

The two project buttons are deliberately **local-only**. Adding a file does not upload it to the server or make it visible to other users.

Use **Project Requests** to generate a `.m1request` bundle. The repository author imports that request, reviews its paths and contents, verifies GitHub push permission, and explicitly types `APPROVE AND PUSH`. Only then does the app commit and push the approved files to `offensive/extensions` or `defensive/extensions`.

New offensive Python files are inventoried but remain blocked from direct dashboard execution until a bounded lab adapter is reviewed and added.
