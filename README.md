# M-1 — System Security Analysis Lab

M-1 is a controlled cybersecurity learning lab for observing bounded security scenarios, detecting them, containing them, and verifying that the lab baseline remains intact. The original offensive-looking source tree remains available for audit, while the dashboard only exposes finite, disposable lab adapters.

## Current dashboard

The React dashboard includes:

- Overview, Live Test, Offensive Tools, Project Requests, Incidents, Recovery and Reports.
- Sidebar themes: **Black**, **White**, and **System**. The selection is stored locally in the browser.
- **Contribute** workflow: stage files locally, generate a `.m1request`, and let the repository author review and explicitly approve the GitHub commit.
- **Feedback** workflow: export feedback as a local `.txt` file or open the GitHub Issues page.
- Local-only browser staging. Selected files are not uploaded to the M-1 backend merely by being added.
- Explicit `I UNDERSTAND` confirmation for executable lab adapters.

## Safety boundary

The dashboard does not directly execute the destructive or privileged source modules in `offensive/`. Host-level keyboard capture, arbitrary shell execution, protected-path modification, persistence registration, and privilege escalation are blocked. Finite adapters run only in a disposable workspace.

## Run locally

### Backend

```bash
python -m pip install -r api/requirements.txt
python run_dashboard.py
```

The FastAPI service listens on `http://127.0.0.1:8000` by default.

### Frontend

```bash
cd web
npm install
npm run dev
```

Vite proxies `/api` to `http://127.0.0.1:8000` during local development.

## Test

```bash
python -m pytest -q
```

The acceptance tests cover the simulation pipeline, OS-defense handoff, recovery, and the offensive-tool safety boundary.

## GitHub Pages

GitHub Pages can host the React frontend, but it cannot run Python. The Pages workflow reads the repository variable `M1_API_BASE_URL` and injects it as `VITE_API_BASE_URL` at build time.

The workflow uses Node.js 22 and the current GitHub Pages artifact/deploy actions.

## Render

The repository includes `Dockerfile` and `render.yaml` for a single Docker web service. The container builds the frontend and serves it from FastAPI. The health check is `/api/health`, and the service binds to `0.0.0.0:$PORT`.

## Contribution approval model

1. A contributor selects files or a folder from the **Contribute** or **Project Requests** UI.
2. Files are stored in the current browser's IndexedDB staging area.
3. A `.m1request` bundle can be generated and shared with the repository author.
4. The author imports the request, reviews the exact target paths, and verifies GitHub push permission.
5. The author explicitly types `APPROVE AND PUSH` before the app creates blobs, a tree, a commit, and a non-forced branch update.

Accepted files are written under `offensive/extensions/...` or `defensive/extensions/...`.

## Recovery boundary

The project can create and verify a disposable lab snapshot. Whole-system rollback should remain the responsibility of an external VM/hypervisor snapshot system; the application does not attempt to modify host or hypervisor state.
