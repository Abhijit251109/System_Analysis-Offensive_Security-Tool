# M-1 V2 — React Dashboard Edition

The original M-1 safe defensive lab is preserved. A React/Vite dashboard has been added under `web/`, with a local FastAPI bridge under `api/`.

### Architecture

Browser (React/Vite) → local FastAPI SSE API → existing M-1 controller/defensive simulation layer.

The UI mirrors the Canva dashboard concept while making the key controls functional: scenario selection, test execution, live incident stream, defense pipeline status, containment metrics, and recovery/baseline result.

### Safety boundary

The browser cannot execute the offensive modules. The API only invokes the existing bounded `offensive.simulations` event generators and the existing controller/defensive components.
