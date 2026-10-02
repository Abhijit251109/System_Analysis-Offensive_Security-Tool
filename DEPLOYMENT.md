# Production deployment

The recommended deployment is a **single Render web service**. The Docker image builds the React/Vite dashboard and then runs FastAPI, which serves both the dashboard and `/api/*` from the same origin.

## Render

- Runtime: Docker
- Dockerfile: `./Dockerfile`
- Docker context: `.`
- Health check: `/api/health`
- Auto deploy: enabled by `render.yaml`

No frontend API key is required for the same-origin deployment. The dashboard uses relative `/api/...` requests when `VITE_API_BASE_URL` is empty.

### Optional separate API

If the dashboard is deployed separately (for example GitHub Pages), set `VITE_API_BASE_URL` **at frontend build time** to the public FastAPI origin, for example:

```text
VITE_API_BASE_URL=https://your-api.example.com
```

The FastAPI service accepts cross-origin requests from the comma-separated `M1_ALLOWED_ORIGINS` environment variable. Leave it unset for the recommended same-origin Render deployment.

Do not put backend secrets, service-role credentials, or private API keys in the React/Vite environment. Anything prefixed with `VITE_` is bundled into browser JavaScript.
