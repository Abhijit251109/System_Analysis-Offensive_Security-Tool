# Project request workflow

The contribution workflow is intentionally local-first.

## Contributor side

Files selected from **Contribute** or **Project Requests** are placed in browser-local IndexedDB storage. They are not uploaded to the FastAPI service. The browser applies path and credential-file checks, hashes every staged file, and limits each file to 5 MB and each request to 25 MB.

Use **Generate Change Request** to create a portable `.m1request` file.

## Author side

The repository author imports the `.m1request`, reviews every file and target path, then verifies push permission for the selected repository and branch.

The final action requires the exact phrase:

`APPROVE AND PUSH`

Only after that confirmation does the frontend use the author's GitHub token to create the Git objects and update the branch without force-pushing.

## Target paths

Approved files are restricted to:

- `offensive/extensions/...`
- `defensive/extensions/...`

New offensive Python files are inventoried but remain blocked from direct dashboard execution until a reviewed bounded adapter exists.
