# syntax=docker/dockerfile:1

FROM node:20.20.2-bookworm-slim AS web-build
WORKDIR /app/web
COPY web/package.json ./
RUN npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV NODE_VERSION=20.20.2 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY api/requirements.txt ./api/requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r api/requirements.txt

COPY . ./
COPY --from=web-build /app/web/dist ./web/dist

RUN mkdir -p /app/runtime/logs /app/offensive/extensions /app/defensive/extensions

EXPOSE 10000
CMD ["sh", "-c", "uvicorn api.app:app --host 0.0.0.0 --port ${PORT:-10000}"]
