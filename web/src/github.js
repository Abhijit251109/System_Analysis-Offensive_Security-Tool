const GITHUB_API = 'https://api.github.com'
const GITHUB_API_VERSION = '2026-03-10'

async function githubRequest(path, token, options = {}) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  let payload = null
  try { payload = await response.json() } catch { payload = null }
  if (!response.ok) {
    const message = payload?.message || `${response.status} ${response.statusText}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}

function parseRepo(value) {
  const cleaned = String(value || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
  const parts = cleaned.split('/').filter(Boolean)
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_.-]+$/.test(part))) throw new Error('Repository must look like owner/repository.')
  return { owner: parts[0], repo: parts[1] }
}

export async function verifyAuthorAccess(token, repoValue, requestedBranch = '') {
  if (!token?.trim()) throw new Error('Enter the author GitHub token for this approval.')
  const { owner, repo } = parseRepo(repoValue)
  const info = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token.trim())
  if (!info.permissions?.push) throw new Error(`GitHub account ${info.owner?.login || 'the token owner'} does not have push permission for ${owner}/${repo}.`)
  const branch = requestedBranch.trim() || info.default_branch
  await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`, token.trim())
  return { ...info, ownerName: info.owner?.login || owner, branch }
}

export async function pushApprovedRequest(token, repoValue, branch, commitMessage, request) {
  if (!token?.trim()) throw new Error('Author GitHub token is required.')
  const { owner, repo } = parseRepo(repoValue)
  const info = await verifyAuthorAccess(token, repoValue, branch)
  const targetBranch = info.branch
  if (!request?.files?.length) throw new Error('The request contains no files.')

  const ref = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(targetBranch)}`, token.trim())
  const parentSha = ref.object.sha
  const parentCommit = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${parentSha}`, token.trim())
  const baseTree = parentCommit.tree.sha

  const treeEntries = []
  for (const file of request.files) {
    const blob = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs`, token.trim(), {
      method: 'POST',
      body: JSON.stringify({ content: file.content_base64, encoding: 'base64' }),
    })
    treeEntries.push({ path: file.targetPath, mode: '100644', type: 'blob', sha: blob.sha })
  }

  const tree = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`, token.trim(), {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseTree, tree: treeEntries }),
  })

  const message = `${commitMessage?.trim() || request.title || 'M-1 approved project change'} [${request.request_id.slice(0, 8)}]`
  const commit = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`, token.trim(), {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  })

  const updatedRef = await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeURIComponent(targetBranch)}`, token.trim(), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  })

  return {
    owner,
    repo,
    branch: targetBranch,
    commit_sha: commit.sha,
    tree_sha: tree.sha,
    ref: updatedRef.ref,
    commit_url: commit.html_url || `https://github.com/${owner}/${repo}/commit/${commit.sha}`,
    files: request.files.map(file => file.targetPath),
  }
}

export { parseRepo }
