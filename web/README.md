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

The production output is written to `web/dist/`. The FastAPI service serves this build when you run the M-1 dashboard locally.

## GitHub Pages

The repository workflow builds the React/Vite app first and deploys `web/dist/` to GitHub Pages. The Vite base path is relative, so the site works both at the repository Pages path and at a root URL.

When the backend is unavailable (including on ordinary static GitHub Pages hosting), the dashboard automatically uses its built-in bounded local safe simulator. When the M-1 FastAPI backend is available, the dashboard uses the backend event stream instead.

For a separately hosted API, copy `.env.example` to `.env` and set `VITE_API_BASE_URL` before building. Cross-origin API hosting also needs the backend to permit the dashboard origin.


### GitHub Pages setting

In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**. The workflow in `.github/workflows/static.yml` then builds and deploys the dashboard on pushes to `main` or `master`, or from the Actions tab manually.
