# M-1 React Dashboard

## Development

```bash
npm install
npm run dev
```

The Vite dev server expects the M-1 FastAPI service at `http://127.0.0.1:8000`.

## Production

```bash
npm install
npm run build
```

The FastAPI service serves `web/dist` automatically after a production build.


### Android / PWA
The dashboard is mobile responsive and installable as a PWA. When opened without the desktop API, it automatically uses the local safe simulator.
