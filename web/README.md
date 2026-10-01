# M-1 React Dashboard

## Development

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8000`.

## Production

```bash
npm install
npm run build
```

The production output is written to `web/dist/`. FastAPI serves this build when the dashboard is run locally.

## GitHub Pages

The GitHub Actions workflow builds and deploys `web/dist/` to GitHub Pages. GitHub Pages only hosts the React frontend; it cannot run Python or the offensive controller.

Set the repository variable `M1_API_BASE_URL` to the public FastAPI URL, then rerun the Pages workflow. The build injects it as `VITE_API_BASE_URL`.

When the API is unavailable, live execution buttons are disabled. The dashboard does **not** pretend a backend run happened or silently replace it with a fake live result.

## Offensive Tools page

The dashboard queries `/api/offensive/tools` and displays the actual offensive source inventory with:

- source module;
- capability;
- risk level;
- execution mode; and
- whether the entry is blocked or available through a bounded lab adapter.

Every executable lab adapter requires an explicit warning acknowledgement and the confirmation phrase `I UNDERSTAND`.

Original host-destructive modules remain source-auditable but are not directly launchable from the web application.

### GitHub Pages setting

In **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow in `.github/workflows/static.yml` deploys the dashboard on pushes to `main` or `master`, or from the Actions tab manually.
