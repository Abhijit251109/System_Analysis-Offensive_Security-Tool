const DB_NAME = 'm1-local-project-staging'
const DB_VERSION = 1
const FILE_STORE = 'files'
const META_STORE = 'meta'

export const LOCAL_MAX_FILE_BYTES = 5 * 1024 * 1024
export const LOCAL_MAX_REQUEST_BYTES = 25 * 1024 * 1024

const BLOCKED_NAMES = new Set([
  '.git', '.gitmodules', '.env', '.env.local', '.env.production', '.npmrc',
  'id_rsa', 'id_ed25519', 'credentials.json', 'service-account.json',
])
const BLOCKED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', '.venv1', 'runtime', 'dist', 'build'])
const BLOCKED_SUFFIXES = ['.pem', '.key', '.p12', '.pfx', '.crt', '.cer']

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FILE_STORE)) db.createObjectStore(FILE_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local staging storage'))
  })
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'))
  })
}

export function normalizeRelativePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '')
  const parts = normalized.split('/').filter(Boolean)
  if (!parts.length || parts.some(part => part === '.' || part === '..' || part.includes('\0'))) {
    throw new Error(`Unsafe relative path: ${value}`)
  }
  if (parts.some(part => BLOCKED_DIRS.has(part.toLowerCase()))) {
    throw new Error(`Blocked project directory in path: ${value}`)
  }
  const leaf = parts[parts.length - 1]
  const lower = leaf.toLowerCase()
  if (BLOCKED_NAMES.has(lower) || lower.startsWith('.env.') || BLOCKED_SUFFIXES.some(suffix => lower.endsWith(suffix))) {
    throw new Error(`Potential secret or credential file is blocked: ${value}`)
  }
  return parts.join('/')
}

export function targetPathFor(kind, relativePath) {
  if (kind !== 'offensive' && kind !== 'defensive') throw new Error('Invalid project target')
  return `${kind}/extensions/${normalizeRelativePath(relativePath)}`
}

async function digestHex(blob) {
  const data = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function stageFiles(kind, files) {
  if (!files?.length) return { added: [], skipped: [] }
  const db = await openDb()
  const records = []
  const skipped = []
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name
    try {
      if (file.size > LOCAL_MAX_FILE_BYTES) throw new Error(`File exceeds ${Math.round(LOCAL_MAX_FILE_BYTES / 1024 / 1024)} MB: ${relativePath}`)
      const safePath = normalizeRelativePath(relativePath)
      const blob = file.slice(0, file.size, file.type || 'application/octet-stream')
      records.push({
        id: crypto.randomUUID(),
        kind,
        relativePath: safePath,
        targetPath: targetPathFor(kind, safePath),
        filename: safePath.split('/').at(-1),
        bytes: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified || Date.now(),
        sha256: await digestHex(blob),
        blob,
        createdAt: new Date().toISOString(),
      })
    } catch (error) {
      skipped.push({ name: relativePath, reason: error.message })
    }
  }
  const tx = db.transaction(FILE_STORE, 'readwrite')
  const store = tx.objectStore(FILE_STORE)
  for (const record of records) store.put(record)
  await txDone(tx)
  db.close()
  return { added: records, skipped }
}

export async function listStagedFiles() {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readonly')
  const request = tx.objectStore(FILE_STORE).getAll()
  const result = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error || new Error('Could not read local staging'))
  })
  await txDone(tx)
  db.close()
  return result
}

export async function removeStaged(ids) {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readwrite')
  const store = tx.objectStore(FILE_STORE)
  for (const id of ids) store.delete(id)
  await txDone(tx)
  db.close()
}

export async function clearStaged() {
  const db = await openDb()
  const tx = db.transaction(FILE_STORE, 'readwrite')
  tx.objectStore(FILE_STORE).clear()
  await txDone(tx)
  db.close()
}

export async function savePendingRequest(payload) {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).put({ key: 'pendingRequest', payload })
  await txDone(tx)
  db.close()
}

export async function getPendingRequest() {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readonly')
  const request = tx.objectStore(META_STORE).get('pendingRequest')
  const value = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result?.payload || null)
    request.onerror = () => reject(request.error || new Error('Could not read the local pending request'))
  })
  await txDone(tx)
  db.close()
  return value
}

export async function clearPendingRequest() {
  const db = await openDb()
  const tx = db.transaction(META_STORE, 'readwrite')
  tx.objectStore(META_STORE).delete('pendingRequest')
  await txDone(tx)
  db.close()
}

export async function recordsToRequest(records, title = 'M-1 project change request') {
  if (!records?.length) throw new Error('There are no locally staged files to request.')
  const files = []
  let total = 0
  for (const record of records) {
    total += record.bytes
    if (total > LOCAL_MAX_REQUEST_BYTES) throw new Error(`Request exceeds ${Math.round(LOCAL_MAX_REQUEST_BYTES / 1024 / 1024)} MB.`)
    const bytes = new Uint8Array(await record.blob.arrayBuffer())
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    files.push({
      kind: record.kind,
      relativePath: record.relativePath,
      targetPath: record.targetPath,
      filename: record.filename,
      bytes: record.bytes,
      sha256: record.sha256,
      content_base64: btoa(binary),
    })
  }
  return {
    format: 'm1-project-change-request',
    version: 1,
    request_id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    author_approval_required: true,
    commit_scope: 'offensive/extensions and defensive/extensions only',
    title: title.trim() || 'M-1 project change request',
    files,
  }
}

export function downloadRequest(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `m1-change-request-${payload.request_id.slice(0, 8)}.m1request`
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function validateRequestPayload(payload) {
  if (!payload || payload.format !== 'm1-project-change-request' || payload.version !== 1) {
    throw new Error('This is not a supported M-1 project change request.')
  }
  if (!Array.isArray(payload.files) || payload.files.length === 0) throw new Error('The request contains no files.')
  let total = 0
  const validated = []
  for (const file of payload.files) {
    const relativePath = normalizeRelativePath(file.relativePath)
    const kind = file.kind
    const expectedTarget = targetPathFor(kind, relativePath)
    if (file.targetPath !== expectedTarget) throw new Error(`Invalid target path for ${relativePath}`)
    const raw = String(file.content_base64 || '')
    if (!raw) throw new Error(`Missing content for ${relativePath}`)
    let binary
    try {
      binary = atob(raw)
    } catch {
      throw new Error(`Invalid base64 content for ${relativePath}`)
    }
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
    if (bytes.length !== Number(file.bytes)) throw new Error(`Size mismatch for ${relativePath}`)
    if (bytes.length > LOCAL_MAX_FILE_BYTES) throw new Error(`Request file is too large: ${relativePath}`)
    total += bytes.length
    if (total > LOCAL_MAX_REQUEST_BYTES) throw new Error('Request is too large for local review.')
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    if (sha256 !== file.sha256) throw new Error(`Integrity check failed for ${relativePath}`)
    validated.push({ ...file, relativePath, targetPath: expectedTarget, bytes: bytes.length })
  }
  return { ...payload, files: validated }
}
