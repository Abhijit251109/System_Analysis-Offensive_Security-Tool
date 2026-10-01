# Render deployment

This repository is packaged as a single Docker web service. Render builds the React dashboard inside the image, then serves it from FastAPI.

## Render settings

The included `render.yaml` is the recommended path: connect the GitHub repository to Render and use **New → Blueprint**.

Equivalent manual settings are:

| Setting | Value |
|---|---|
| Runtime | Docker |
| Dockerfile | `./Dockerfile` |
| Docker context | `.` |
| Health check | `/api/health` |

The container listens on `0.0.0.0:$PORT`.

## Local project files and author approval

The **ADD TO OFFENSIVE** and **ADD TO DEFENSIVE** buttons do **not** upload files to Render. Selected files/folders are staged in the current browser's IndexedDB storage.

The flow is:

1. Contributor stages files locally.
2. Contributor generates a `.m1request` bundle.
3. The request is manually given to the repository author.
4. The author imports the request into the app and reviews every target path and file size.
5. The author enters a GitHub fine-grained token with repository **Contents: read/write** permission and verifies push access.
6. The author types `APPROVE AND PUSH`.
7. The browser uses GitHub's Git database API to create blobs, one tree, one commit, and a non-forced branch update.

The GitHub token is held in memory for the current page session and is not written to Render, localStorage, IndexedDB, or the request bundle.

Accepted files are committed under:

- `offensive/extensions/...`
- `defensive/extensions/...`

The project never imports newly accepted Python files merely because they were committed. Offensive source is inventoried and untrusted/new modules remain blocked unless a bounded adapter explicitly exists.

## Important persistence note

Because staging is browser-local, clearing site data or switching browser/device removes the contributor's local staged files. The `.m1request` file is the portable copy. Once accepted and pushed, the Git repository is the durable source of truth.

## GitHub token recommendation

Use a GitHub fine-grained token restricted to the target repository with **Contents: read/write**. Do not paste a classic token with broad access when a repository-scoped fine-grained token is sufficient.
