# Project change requests

M-1 uses a local-first contribution workflow for the **ADD TO OFFENSIVE** and **ADD TO DEFENSIVE** buttons.

## Contributor flow

1. Select one or more files, or a folder.
2. The browser stores the selected content in IndexedDB on the current device.
3. Nothing is posted to the M-1 FastAPI server.
4. Open **Project Requests** and choose **GENERATE CHANGE REQUEST**.
5. M-1 creates a portable `.m1request` bundle containing the requested file paths, SHA-256 checksums, and file content.
6. Send that bundle privately to the repository author.

The request bundle is the portable copy. Clearing the browser's site data removes local staging.

## Author flow

1. Open **Project Requests**.
2. Import the contributor's `.m1request` bundle.
3. Review every proposed target path and file size.
4. Enter the repository as `owner/repository` and an optional branch.
5. Enter a GitHub fine-grained token restricted to the target repository with **Contents: read/write** permission.
6. Click **VERIFY AUTHOR ACCESS**. M-1 checks the repository and confirms the token has push permission.
7. Review the exact target list again.
8. Type `APPROVE AND PUSH`.
9. The browser creates Git blobs, one Git tree, one commit, and updates the selected branch without force-pushing.

Approved paths are limited to:

- `offensive/extensions/...`
- `defensive/extensions/...`

No request can use an arbitrary repository path through this UI.

## Execution boundary

Accepted offensive Python is inventoried but is **not dynamically imported or automatically executed**. The existing offensive registry continues to require a reviewed, bounded adapter for dashboard execution. This prevents repository contribution approval from becoming an automatic code-execution switch.

## GitHub API model

The author approval flow uses GitHub's Git database APIs rather than repeatedly replacing files one-by-one. This lets a multi-file request become a single commit. The token remains in browser memory for the current session only and is never saved to localStorage, IndexedDB, the request bundle, or the Render service.
