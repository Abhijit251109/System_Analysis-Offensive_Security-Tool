import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import {
  clearPendingRequest,
  clearStaged,
  downloadRequest,
  getPendingRequest,
  listStagedFiles,
  recordsToRequest,
  removeStaged,
  savePendingRequest,
  stageFiles,
  validateRequestPayload,
} from './local_staging'
import { pushApprovedRequest, verifyAuthorAccess } from './github'

const API_BASE = (window.__M1_API_BASE_URL__ || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const apiUrl = (path) => `${API_BASE}${path}`
const CONFIRMATION_PHRASE = 'I UNDERSTAND'
const APPROVAL_PHRASE = 'APPROVE AND PUSH'

const SCENARIOS = [
  ['all', 'Full adversarial suite', '5 bounded simulations', 'ALL'],
  ['keylogging', 'Credential capture', 'OS + M-1 detection', 'KEY'],
  ['disk_fill', 'Resource exhaustion', 'M-1 detection', 'CPU'],
  ['persistence', 'Persistence attempt', 'OS + M-1 detection', 'BOOT'],
  ['privilege', 'Privilege escalation', 'M-1 detection', 'ROOT'],
  ['encryption', 'Mass file modification', 'M-1 detection', 'CRYPT'],
]

const NAV = [
  ['overview', 'Overview', '◈'],
  ['live', 'Live Test', '◉'],
  ['offensive', 'Offensive Tools', '⚠'],
  ['requests', 'Project Requests', '⇧'],
  ['incidents', 'Incidents', '▣'],
  ['recovery', 'Recovery', '↺'],
  ['reports', 'Reports', '▤'],
]

const EVENT_LABELS = {
  credential_capture_attempt: 'Credential capture attempt',
  resource_exhaustion_attempt: 'Resource exhaustion attempt',
  persistence_attempt: 'Persistence attempt',
  privilege_escalation_attempt: 'Privilege escalation attempt',
  mass_file_modification_attempt: 'Mass file modification attempt',
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function consumeSSE(res, onPayload) {
  if (!res.body) throw new Error('Backend did not provide an event stream')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find(x => x.startsWith('data: '))
      if (!line) continue
      const payload = JSON.parse(line.slice(6))
      onPayload(payload)
      if (payload.type === 'complete') completed = true
    }
  }
  return completed
}

function App() {
  const [selected, setSelected] = useState('all')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [result, setResult] = useState(null)
  const [connected, setConnected] = useState(false)
  const [status, setStatus] = useState(null)
  const [tools, setTools] = useState([])
  const [page, setPage] = useState('overview')
  const [activeStage, setActiveStage] = useState('idle')
  const [error, setError] = useState('')
  const [warningTool, setWarningTool] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [stagedFiles, setStagedFiles] = useState([])
  const [addModal, setAddModal] = useState(null)
  const [adding, setAdding] = useState(false)
  const [pendingRequest, setPendingRequest] = useState(null)
  const [requestBusy, setRequestBusy] = useState(false)
  const [authorToken, setAuthorToken] = useState('')
  const [repoValue, setRepoValue] = useState('')
  const [branch, setBranch] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [authorAccess, setAuthorAccess] = useState(null)
  const [approvalText, setApprovalText] = useState('')
  const [requestMessage, setRequestMessage] = useState('')
  const [theme, setTheme] = useState(() => localStorage.getItem('m1-theme') || 'system')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('m1-theme', theme)
  }, [theme])

  async function refreshStatus() {
    try {
      const [healthRes, statusRes, toolsRes] = await Promise.all([
        fetchWithTimeout(apiUrl('/api/health')),
        fetchWithTimeout(apiUrl('/api/status')),
        fetchWithTimeout(apiUrl('/api/offensive/tools')),
      ])
      if (![healthRes, statusRes, toolsRes].every(r => r.ok)) throw new Error('API endpoint check failed')
      const health = await healthRes.json()
      const nextStatus = await statusRes.json()
      const toolPayload = await toolsRes.json()
      setConnected(Boolean(health.ok))
      setStatus(nextStatus)
      setTools(toolPayload.tools || [])
      return true
    } catch {
      setConnected(false)
      setStatus(null)
      setTools([])
      return false
    }
  }

  async function refreshLocal() {
    try {
      setStagedFiles(await listStagedFiles())
      setPendingRequest(await getPendingRequest())
    } catch (err) {
      setError(`Local staging is unavailable in this browser: ${err?.message || err}`)
    }
  }

  useEffect(() => {
    refreshStatus()
    refreshLocal()
    const timer = setInterval(refreshStatus, 8000)
    return () => clearInterval(timer)
  }, [])

  const incidents = useMemo(() => events.filter(e => e.type === 'incident').map(e => e.data), [events])
  const logs = useMemo(() => events.filter(e => ['stage', 'error', 'warning', 'blocked', 'result'].includes(e.type)), [events])
  const stats = useMemo(() => ({
    detected: incidents.length,
    contained: incidents.filter(i => i.contained).length,
    critical: incidents.filter(i => i.severity === 'critical').length,
    high: incidents.filter(i => i.severity === 'high').length,
  }), [incidents])
  const localCounts = useMemo(() => ({
    offensive: stagedFiles.filter(file => file.kind === 'offensive').length,
    defensive: stagedFiles.filter(file => file.kind === 'defensive').length,
  }), [stagedFiles])

  const append = payload => setEvents(current => [...current, payload])

  async function startSimulation(runScenario = selected, dryRun = false) {
    if (!dryRun && !connected) {
      setPage('live')
      setError('Live execution is disabled until the M-1 API is reachable. This prevents the dashboard from pretending a run happened.')
      return
    }
    setRunning(true); setEvents([]); setResult(null); setError(''); setActiveStage('snapshot'); setPage('live')
    try {
      const res = await fetchWithTimeout(apiUrl('/api/test/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ scenario: runScenario, dry_run: dryRun }),
      }, 8000)
      if (!res.ok) throw new Error(await res.text())
      setConnected(true)
      const completed = await consumeSSE(res, payload => {
        if (payload.type === 'complete') {
          setResult(payload.data)
          setActiveStage('complete')
        } else {
          append(payload)
          if (payload.type === 'stage') setActiveStage(payload.data.stage)
        }
      })
      if (!completed) throw new Error('API stream ended before a completion event was received')
    } catch (err) {
      setConnected(false)
      setError(err?.message || 'Unable to connect to the M-1 backend. No fake fallback run was created.')
    } finally {
      setRunning(false)
      refreshStatus()
    }
  }

  async function runOffensiveTool(tool, phrase) {
    setRunning(true); setEvents([]); setResult(null); setError(''); setActiveStage('validation'); setPage('offensive')
    try {
      const res = await fetchWithTimeout(apiUrl('/api/offensive/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ tool_id: tool.id, confirm: true, confirmation_text: phrase }),
      }, 15000)
      if (!res.ok) throw new Error(await res.text())
      setConnected(true)
      const completed = await consumeSSE(res, payload => {
        append(payload)
        if (payload.type === 'stage' || payload.type === 'warning') setActiveStage(payload.data.stage || payload.type)
        if (payload.type === 'complete') setResult(payload.data)
      })
      if (!completed) throw new Error('Tool stream ended before a completion event was received')
    } catch (err) {
      setError(err?.message || 'The offensive tool run could not be started')
    } finally {
      setRunning(false)
      refreshStatus()
    }
  }

  function requestToolRun(tool) {
    setWarningTool(tool)
    setConfirmationText('')
    setError('')
  }

  function confirmToolRun() {
    if (!warningTool || warningTool.execution === 'blocked') return
    if (confirmationText.trim() !== CONFIRMATION_PHRASE) return
    const tool = warningTool
    setWarningTool(null)
    runOffensiveTool(tool, confirmationText)
  }

  const runAll = () => startSimulation('all', false)
  const runSelected = () => startSimulation(selected, false)
  const dryRun = () => startSimulation(selected, true)

  async function addLocal(kind, files) {
    if (!files?.length) return
    setAdding(true); setError(''); setRequestMessage('')
    try {
      const result = await stageFiles(kind, Array.from(files))
      await refreshLocal()
      setAddModal(null)
      const skippedText = result.skipped.length ? ` ${result.skipped.length} file(s) were skipped.` : ''
      setRequestMessage(`${result.added.length} file(s) are now stored locally on this device.${skippedText} Nothing was uploaded to the M-1 server.`)
      setPage('requests')
    } catch (err) {
      setError(err?.message || `Unable to stage files locally for ${kind}`)
    } finally {
      setAdding(false)
    }
  }

  async function generateProjectRequest() {
    setRequestBusy(true); setRequestMessage('')
    try {
      const records = await listStagedFiles()
      const title = window.prompt('Request title', 'M-1 project change request')
      const request = await recordsToRequest(records, title || 'M-1 project change request')
      await savePendingRequest(request)
      downloadRequest(request)
      setPendingRequest(request)
      setRequestMessage(`Request ${request.request_id.slice(0, 8)} generated locally. Share the .m1request file with the repository author; it is not uploaded to M-1.`)
    } catch (err) {
      setError(err?.message || 'Unable to generate the project request')
    } finally {
      setRequestBusy(false)
    }
  }

  async function importProjectRequest(file) {
    if (!file) return
    setRequestBusy(true); setError(''); setRequestMessage('')
    try {
      const payload = JSON.parse(await file.text())
      const validated = await validateRequestPayload(payload)
      await savePendingRequest(validated)
      setPendingRequest(validated)
      setRequestMessage(`Request ${validated.request_id.slice(0, 8)} imported locally and integrity-checked.`)
    } catch (err) {
      setError(err?.message || 'Invalid M-1 change request')
    } finally {
      setRequestBusy(false)
    }
  }

  async function verifyAccess() {
    setRequestBusy(true); setError(''); setAuthorAccess(null)
    try {
      const info = await verifyAuthorAccess(authorToken, repoValue, branch)
      setAuthorAccess(info)
      setBranch(info.branch)
      setRequestMessage(`Verified push permission for ${info.ownerName} on ${repoValue.trim()}.`)
    } catch (err) {
      setError(err?.message || 'GitHub authorization failed')
    } finally {
      setRequestBusy(false)
    }
  }

  async function approveAndPush() {
    if (!pendingRequest || approvalText.trim() !== APPROVAL_PHRASE) return
    setRequestBusy(true); setError(''); setRequestMessage('')
    try {
      const result = await pushApprovedRequest(authorToken, repoValue, branch, commitMessage, pendingRequest)
      await clearPendingRequest()
      setPendingRequest(null)
      setApprovalText('')
      setRequestMessage(`Approved, committed and pushed ${result.files.length} file(s) to ${result.owner}/${result.repo}:${result.branch}. Commit ${result.commit_sha.slice(0, 12)}.`)
    } catch (err) {
      setError(err?.status === 409 ? 'The branch changed while approving the request. Refresh the author review and try again.' : (err?.message || 'GitHub push failed'))
    } finally {
      setRequestBusy(false)
    }
  }

  async function clearLocalStaging() {
    await clearStaged()
    await refreshLocal()
    setRequestMessage('Local staging cleared from this browser. Nothing was changed in GitHub.')
  }

  async function removeLocalFile(id) {
    await removeStaged([id])
    await refreshLocal()
  }

  function downloadReport() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `m1-${result.scenario || result.tool_id || 'run'}-report.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openFeedback() {
    setPage('feedback')
  }

  function submitFeedback(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const type = String(form.get('type') || 'feedback')
    const message = String(form.get('message') || '').trim()
    if (!message) return
    const blob = new Blob([
      `M-1 FEEDBACK\nType: ${type}\nCreated: ${new Date().toISOString()}\n\n${message}\n`,
    ], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `m1-${type}-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
    event.currentTarget.reset()
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">M</div><div><div className="brandName">M-1</div><div className="brandSub">DEFENSE CONSOLE</div></div></div>
      <div className="sideLabel">LAB CONTROL</div>
      {NAV.map(([id, label, icon]) => <button key={id} className={`nav ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><span>{icon}</span>{label}{id === 'offensive' && <em>{tools.length || '—'}</em>}{id === 'requests' && <em>{stagedFiles.length || '—'}</em>}</button>)}
      <div className="sideLabel">PROJECT</div>
      <button className={`nav ${page === 'contribute' ? 'active' : ''}`} onClick={() => setPage('contribute')}><span>＋</span>Contribute</button>
      <button className={`nav ${page === 'feedback' ? 'active' : ''}`} onClick={openFeedback}><span>✎</span>Feedback</button>
      <div className="sideLabel themeLabel">THEME</div>
      <div className="themeSwitch" role="group" aria-label="Theme">
        {['black', 'white', 'system'].map(value => <button key={value} className={`themeBtn ${theme === value ? 'active' : ''}`} onClick={() => setTheme(value)} aria-pressed={theme === value}>{value}</button>)}
      </div>
      <div className="sideLabel bottomLabel">BACKEND</div>
      <div className="systemCard"><span className="statusDot" style={{ opacity: connected ? 1 : .3 }}/><div><b>{connected ? 'CONNECTED' : 'DISCONNECTED'}</b><small>{API_BASE || 'same-origin /api'}</small></div></div>
      <p className="safety">Files added with the two project buttons stay in this browser only. They become shared project code only after an author reviews and explicitly pushes an approved request to GitHub.</p>
    </aside>

    <main className="main">
      <div className="topbar"><div><div className="eyebrow">SYSTEM SECURITY ANALYSIS / CONTROL PLANE</div><h1>{page === 'contribute' ? 'Contribute' : NAV.find(([id]) => id === page)?.[1] || 'Feedback'}</h1></div><div className="topStatus"><span className="statusDot" style={{ opacity: connected ? 1 : .35 }}/>{connected ? 'API ONLINE' : 'API OFFLINE'}<span className="divider"/>{status?.executable_offensive_tools ?? '—'} LAB TOOLS</div></div>

      {page === 'overview' && <Overview {...{ selected, setSelected, running, runAll, connected, result, incidents, stats, activeStage, setPage, status }}/>} 
      {page === 'live' && <LiveTest {...{ selected, setSelected, running, runAll, runSelected, dryRun, events, result, activeStage, error, connected }}/>} 
      {page === 'offensive' && <OffensivePage {...{ tools, connected, running, requestToolRun, logs, result, error, setPage, openAdd: setAddModal, localCounts }}/>} 
      {page === 'requests' && <RequestsPage {...{ stagedFiles, localCounts, pendingRequest, requestMessage, error, addLocal, removeLocalFile, clearLocalStaging, generateProjectRequest, importProjectRequest, requestBusy, adding, authorToken, setAuthorToken, repoValue, setRepoValue, branch, setBranch, commitMessage, setCommitMessage, authorAccess, verifyAccess, approvalText, setApprovalText, approveAndPush }}/>} 
      {page === 'contribute' && <ContributePage setPage={setPage}/>} 
      {page === 'feedback' && <FeedbackPage onSubmit={submitFeedback}/>} 
      {page === 'incidents' && <Incidents incidents={incidents} logs={logs}/>} 
      {page === 'recovery' && <Recovery result={result} running={running}/>} 
      {page === 'reports' && <Reports result={result} incidents={incidents} downloadReport={downloadReport}/>} 
    </main>

    {warningTool && <ToolWarningModal tool={warningTool} value={confirmationText} setValue={setConfirmationText} onClose={() => setWarningTool(null)} onConfirm={confirmToolRun}/>} 
    {addModal && <LocalAddModal kind={addModal} onClose={() => !adding && setAddModal(null)} onAdd={addLocal} adding={adding}/>} 
  </div>
}

function Overview({ selected, setSelected, running, runAll, connected, result, incidents, stats, activeStage, setPage, status }) {
  return <>
    <section className="hero"><div><div className="heroKicker">CONTROLLED SECURITY LAB</div><h2>{connected ? 'Execution status is visible.' : 'Connect the backend before live execution.'}</h2><p>{connected ? 'Runs now come from the FastAPI controller, with an explicit execution mode, run stream and completion event.' : 'GitHub Pages can display the console, but it cannot execute Python tools. Point VITE_API_BASE_URL at the API to enable real backend runs.'}</p></div><button className="runBtn" disabled={!connected || running} onClick={runAll}>{running ? <><span className="spinner"/> RUNNING</> : '▶ RUN ALL'}</button></section>
    <section className="stats"><Stat label="SYSTEM" value={connected ? 'READY' : 'OFFLINE'} sub={connected ? 'Backend reachable' : 'No live execution'} tone={connected ? 'good' : 'bad'}/><Stat label="EVENTS DETECTED" value={stats.detected} sub="Current session"/><Stat label="CONTAINED" value={stats.contained} sub={stats.detected ? `${Math.round(stats.contained / stats.detected * 100)}% containment rate` : 'No incidents yet'} tone="good"/><Stat label="LAB TOOLS" value={status?.executable_offensive_tools ?? '—'} sub={`${status?.blocked_offensive_tools ?? '—'} blocked host tools`}/></section>
    <div className="grid"><ScenarioPanel selected={selected} setSelected={setSelected} running={running}/><Pipeline activeStage={activeStage}/></div>
    <section className="panel incidents"><PanelHead title="Incident feed" sub="Only events actually delivered by the controller appear here" tag={running ? 'LIVE' : 'IDLE'} live={running}/><Feed incidents={incidents} empty="No incidents yet. Run a backend test to populate the feed."/><button className="panelLink" onClick={() => setPage('incidents')}>VIEW INCIDENT CENTER →</button></section>
  </>
}

function LiveTest({ selected, setSelected, running, runAll, runSelected, dryRun, events, result, activeStage, error, connected }) {
  return <>
    <section className="liveHero"><div><div className="heroKicker">CONTROL ROOM</div><h2>{running ? 'Test in progress' : result ? 'Run complete' : 'Ready for a live test'}</h2><p>{connected ? 'Watch real SSE events from the M-1 controller. A run is not considered complete until the API sends its completion event.' : 'Live execution is disabled while the API is unreachable.'}</p></div><div className="runControls"><button className="runBtn" disabled={running || !connected} onClick={runAll}>{running ? <><span className="spinner"/> RUNNING</> : '▶ RUN ALL'}</button><button className="secondaryBtn" disabled={running || !connected} onClick={runSelected}>RUN SELECTED</button><button className="secondaryBtn dryBtn" disabled={running} onClick={dryRun}>DRY RUN</button></div></section>
    {error && <div className="errorBanner">EXECUTION NOTICE: {error}</div>}
    <div className="liveGrid"><Pipeline activeStage={activeStage}/><section className="panel timeline"><PanelHead title="Event stream" sub={`${events.length} controller events received`} tag={running ? 'LIVE' : 'IDLE'} live={running}/><div className="stream">{events.length ? events.map((e, i) => e.type === 'incident' ? <Incident key={i} item={e.data}/> : <div className="streamRow" key={i}><span>{e.type === 'error' ? 'ERR' : e.type.toUpperCase()}</span><p>{e.data?.message || JSON.stringify(e.data)}</p></div>) : <div className="empty">Waiting for the first controller event…</div>}</div></section></div>
    <section className="panel"><PanelHead title="Scenario selector" sub={selected === 'all' ? 'Full suite — 5 bounded simulations' : `${selected.split(',').length} selected simulation${selected.split(',').length === 1 ? '' : 's'}`}/><div className="scenarioGrid">{SCENARIOS.map(([id, name, meta, icon]) => <button key={id} disabled={running} className={`scenarioCard ${(selected === 'all' ? id === 'all' : selected === id || (id !== 'all' && selected.split(',').includes(id))) ? 'selected' : ''}`} onClick={() => setSelected(id)}><span>{icon}</span><b>{name}</b><small>{meta}</small></button>)}</div></section>
  </>
}

function OffensivePage({ tools, connected, running, requestToolRun, logs, result, error, setPage, openAdd, localCounts }) {
  return <>
    <section className="hero"><div><div className="heroKicker">OFFENSIVE SOURCE INVENTORY</div><h2>Real source tree, controlled execution.</h2><p>The buttons below stage files locally in this browser. They are not uploaded to the M-1 backend. To change the real repository, generate a change request and let the author review and push it.</p></div><div className="heroActions"><button className="secondaryBtn" onClick={() => openAdd('offensive')}>＋ ADD TO OFFENSIVE</button><button className="secondaryBtn" onClick={() => openAdd('defensive')}>＋ ADD TO DEFENSIVE</button><button className="secondaryBtn" onClick={() => setPage('requests')}>OPEN REQUESTS →</button><span className={`liveTag ${connected ? 'live' : ''}`}>{connected ? 'API CONNECTED' : 'API OFFLINE'}</span></div></section>
    {error && <div className="errorBanner">TOOL NOTICE: {error}</div>}
    <section className="adminWire"><div><b>LOCAL STAGING → AUTHOR APPROVAL → GIT PUSH</b><p>OFFENSIVE staged: <strong>{localCounts.offensive}</strong> · DEFENSIVE staged: <strong>{localCounts.defensive}</strong>. Staged content never goes to the server. Accepted requests are committed under <code>offensive/extensions</code> or <code>defensive/extensions</code>.</p></div><div className="wireCounts"><span>LOCAL ONLY <strong>{localCounts.offensive + localCounts.defensive}</strong></span><span>SHARED <strong>AUTHOR APPROVAL</strong></span></div></section>
    <section className="toolGrid">{tools.length ? tools.map(tool => <article className="toolCard" key={tool.id}><div className="toolTop"><span className={`severity ${tool.risk}`}>{tool.risk}</span><span className="toolMode">{tool.execution.replaceAll('_', ' ')}</span></div><h3>{tool.name}</h3><code>{tool.source}</code><p>{tool.description}</p><div className="toolMeta"><span>{tool.capability}</span>{tool.execution === 'blocked' ? <button className="secondaryBtn" disabled>BLOCKED BY DESIGN</button> : <button className="runBtn smallBtn" disabled={!connected || running} onClick={() => requestToolRun(tool)}>{running ? 'RUNNING…' : 'RUN TOOL'}</button>}</div></article>) : <div className="panel empty large">Connect to the API to load the offensive module inventory.</div>}</section>
    {(logs.length || result) ? <section className="panel"><PanelHead title="Latest tool stream" sub="Evidence received from the backend" tag={running ? 'LIVE' : 'AUDIT'}/><div className="stream">{logs.map((event, i) => <div className="streamRow" key={i}><span>{event.type.toUpperCase()}</span><p>{event.data?.message || JSON.stringify(event.data)}</p></div>)}{result && <div className="streamRow"><span>RESULT</span><p>{JSON.stringify(result)}</p></div>}</div></section> : null}
  </>
}

function LocalAddModal({ kind, onClose, onAdd, adding }) {
  const [selectedFiles, setSelectedFiles] = useState([])
  const title = kind === 'offensive' ? 'Stage files for OFFENSIVE' : 'Stage files for DEFENSIVE'
  const root = kind === 'offensive' ? 'offensive/extensions' : 'defensive/extensions'
  function merge(files) { setSelectedFiles(Array.from(files || [])) }
  return <div className="modalBackdrop"><div className="modal"><div className="heroKicker">LOCAL ONLY</div><h2>{title}</h2><p className="warningText">Nothing in this dialog is uploaded to the M-1 server. Files are stored in this browser's private IndexedDB staging area until you generate a change request.</p><div className="warningBox"><b>Target after author approval</b><code>{root}/&lt;your paths&gt;</code><b>Per-file limit</b><span>5 MB</span><b>Folder support</b><span>Yes — nested paths are preserved</span></div><label className="confirmLabel">Select file(s)</label><input type="file" multiple onChange={e => merge(e.target.files)}/><label className="confirmLabel">Or select a folder</label><input type="file" webkitdirectory="true" directory="" multiple onChange={e => merge(e.target.files)}/><p className="modalNote">Blocked automatically: .git, node_modules, Python caches, virtual environments, runtime/build folders, and common credential/key files. Nothing is committed automatically.</p>{selectedFiles.length > 0 && <div className="stagedPreview">{selectedFiles.slice(0, 8).map((file, i) => <div key={`${file.name}-${i}`}><span>{file.webkitRelativePath || file.name}</span><small>{file.size.toLocaleString()} B</small></div>)}{selectedFiles.length > 8 && <div className="empty">+ {selectedFiles.length - 8} more</div>}</div>}<div className="modalActions"><button className="secondaryBtn" onClick={onClose} disabled={adding}>CANCEL</button><button className="runBtn" disabled={!selectedFiles.length || adding} onClick={() => onAdd(kind, selectedFiles)}>{adding ? 'STAGING…' : `STAGE ${selectedFiles.length || ''} FOR ${kind.toUpperCase()}`}</button></div></div></div>
}

function RequestsPage({ stagedFiles, localCounts, pendingRequest, requestMessage, error, addLocal, removeLocalFile, clearLocalStaging, generateProjectRequest, importProjectRequest, requestBusy, adding, authorToken, setAuthorToken, repoValue, setRepoValue, branch, setBranch, commitMessage, setCommitMessage, authorAccess, verifyAccess, approvalText, setApprovalText, approveAndPush }) {
  const [activeAdd, setActiveAdd] = useState(null)
  const totalBytes = stagedFiles.reduce((sum, file) => sum + file.bytes, 0)
  return <>
    <section className="hero"><div><div className="heroKicker">LOCAL PROJECT CHANGE CONTROL</div><h2>Stage locally. Request author approval. Push only after acceptance.</h2><p>There is deliberately no shared upload store. Your selected files live on this device. The repository author reviews a request bundle and only their GitHub credentials can perform the final commit and push.</p></div><div className="heroActions"><button className="secondaryBtn" onClick={() => setActiveAdd('offensive')}>＋ ADD TO OFFENSIVE</button><button className="secondaryBtn" onClick={() => setActiveAdd('defensive')}>＋ ADD TO DEFENSIVE</button></div></section>
    {requestMessage && <div className="successBanner">REQUEST STATUS: {requestMessage}</div>}
    {error && <div className="errorBanner">REQUEST NOTICE: {error}</div>}

    <section className="panel"><PanelHead title="1 / Local staging" sub="Private to this browser/device" tag="LOCAL ONLY"/><div className="stats"><Stat label="OFFENSIVE" value={localCounts.offensive} sub="Staged files"/><Stat label="DEFENSIVE" value={localCounts.defensive} sub="Staged files"/><Stat label="TOTAL SIZE" value={`${(totalBytes / 1024).toFixed(1)} KB`} sub="Local staging only"/></div><div className="managedGrid">{stagedFiles.length ? stagedFiles.map(file => <div className="managedRow" key={file.id}><span className={`managedBadge ${file.kind}`}>{file.kind}</span><code>{file.relativePath}</code><span>{file.bytes.toLocaleString()} B</span><button className="secondaryBtn tinyBtn" onClick={() => removeLocalFile(file.id)}>REMOVE</button></div>) : <div className="empty">Nothing staged on this device.</div>}</div><div className="modalActions"><button className="secondaryBtn" disabled={!stagedFiles.length} onClick={clearLocalStaging}>CLEAR LOCAL STAGING</button><button className="runBtn" disabled={!stagedFiles.length || requestBusy} onClick={generateProjectRequest}>{requestBusy ? 'WORKING…' : 'GENERATE CHANGE REQUEST'}</button></div></section>

    <section className="panel"><PanelHead title="2 / Change request" sub="A downloadable .m1request bundle for the author" tag={pendingRequest ? 'READY' : 'NONE'}/>{pendingRequest ? <div className="requestCard"><div><b>{pendingRequest.title}</b><small>Request {pendingRequest.request_id} · {pendingRequest.files.length} file(s) · created {new Date(pendingRequest.created_at).toLocaleString()}</small></div><button className="secondaryBtn" onClick={() => downloadRequest(pendingRequest)}>↓ DOWNLOAD AGAIN</button></div> : <div className="empty">Generate a request from your local staging, or import one sent by a contributor.</div>}<div className="requestImport"><label className="confirmLabel">Author: import a .m1request file received from a contributor</label><input type="file" accept=".m1request,application/json" onChange={e => importProjectRequest(e.target.files?.[0])}/></div></section>

    <section className="panel"><PanelHead title="3 / Author review & push" sub="GitHub permission is checked before any write" tag={authorAccess ? 'VERIFIED' : 'AUTHOR ONLY'}/><div className="warningBox"><b>Privacy boundary</b><span>The file bundle stays in this browser until the author pushes it. The GitHub token is used only in memory for the current operation and is not stored by this app.</span><b>Required GitHub permission</b><span>Fine-grained token with <code>Contents: read/write</code> on the target repository.</span></div><div className="formGrid"><div><label className="confirmLabel">Author GitHub token</label><input type="password" value={authorToken} onChange={e => setAuthorToken(e.target.value)} placeholder="Fine-grained token" autoComplete="off"/></div><div><label className="confirmLabel">Repository</label><input value={repoValue} onChange={e => setRepoValue(e.target.value)} placeholder="owner/repository"/></div><div><label className="confirmLabel">Branch</label><input value={branch} onChange={e => setBranch(e.target.value)} placeholder="Blank = default branch"/></div><div><label className="confirmLabel">Commit message</label><input value={commitMessage} onChange={e => setCommitMessage(e.target.value)} placeholder="Add approved M-1 extension"/></div></div><div className="modalActions"><button className="secondaryBtn" disabled={!pendingRequest || requestBusy} onClick={verifyAccess}>VERIFY AUTHOR ACCESS</button>{authorAccess && <span className="liveTag live">PUSH ACCESS VERIFIED: {authorAccess.ownerName}</span>}</div>{pendingRequest && <div className="approvalBox"><label className="confirmLabel">Review target files before approval</label><div className="managedGrid">{pendingRequest.files.map(file => <div className="managedRow" key={`${file.kind}:${file.targetPath}`}><span className={`managedBadge ${file.kind}`}>{file.kind}</span><code>{file.targetPath}</code><span>{file.bytes.toLocaleString()} B</span></div>)}</div><label className="confirmLabel">Type {APPROVAL_PHRASE} to commit and push this request</label><input value={approvalText} onChange={e => setApprovalText(e.target.value)} placeholder={APPROVAL_PHRASE}/><button className="runBtn fullBtn" disabled={!authorAccess || approvalText.trim() !== APPROVAL_PHRASE || requestBusy} onClick={approveAndPush}>{requestBusy ? 'PUSHING…' : 'AUTHOR APPROVES — COMMIT & PUSH'}</button></div>}</section>

    {activeAdd && <LocalAddModal kind={activeAdd} onClose={() => !adding && setActiveAdd(null)} onAdd={async (kind, files) => { await addLocal(kind, files); setActiveAdd(null) }} adding={adding}/>} 
  </>
}

function ContributePage({ setPage }) {
  return <>
    <section className="hero"><div><div className="heroKicker">COMMUNITY CONTRIBUTION</div><h2>Contribute without bypassing author control.</h2><p>Add files locally, review the generated request, and let the repository author decide what becomes shared project code.</p></div><button className="runBtn" onClick={() => setPage('requests')}>OPEN PROJECT REQUESTS →</button></section>
    <section className="grid"><section className="panel"><PanelHead title="Contributor flow" sub="Designed for local-first changes" tag="SAFE"/><div className="stepGrid"><Step n="01" title="Stage locally" text="Choose a file or folder. It stays in this browser's IndexedDB." done/><Step n="02" title="Generate request" text="Create a signed-by-content .m1request bundle that can move between devices." done/><Step n="03" title="Author review" text="The author checks paths, content hashes and GitHub push permission." done/><Step n="04" title="Explicit push" text="Only the author can type APPROVE AND PUSH and commit the accepted files." done/></div></section><section className="panel"><PanelHead title="What gets shared" sub="Only after approval" tag="AUTHOR GATED"/><div className="empty" style={{textAlign:'left'}}><p>Accepted files are committed under:</p><code>offensive/extensions/...</code><br/><code>defensive/extensions/...</code><p>New offensive Python files remain blocked until a bounded execution adapter has been reviewed.</p></div></section>
  </>
}

function FeedbackPage({ onSubmit }) {
  return <>
    <section className="hero"><div><div className="heroKicker">FEEDBACK</div><h2>Tell me what broke, confused you, or could be better.</h2><p>This page creates a plain-text feedback file on your device. It is not uploaded automatically.</p></div><a className="secondaryBtn" href="https://github.com/Abhijit251109/System_Analysis-Offensive_Security-Tool/issues" target="_blank" rel="noreferrer">OPEN GITHUB ISSUES ↗</a></section>
    <section className="panel feedbackPanel"><PanelHead title="Feedback form" sub="Local export only" tag="PRIVATE"/><form className="feedbackForm" onSubmit={onSubmit}><label className="confirmLabel">Type</label><select name="type" defaultValue="feedback"><option value="feedback">General feedback</option><option value="bug">Bug report</option><option value="feature">Feature request</option><option value="documentation">Documentation</option></select><label className="confirmLabel">Message</label><textarea name="message" required rows="9" placeholder="Describe what you saw and what you expected…"/><button className="runBtn" type="submit">EXPORT FEEDBACK .TXT</button></form></section>
  </>
}

function ToolWarningModal({ tool, value, setValue, onClose, onConfirm }) {
  const blocked = tool.execution === 'blocked'
  return <div className="modalBackdrop"><div className="modal"><div className="heroKicker">PRE-EXECUTION CHECK</div><h2>{blocked ? 'Tool blocked' : `Run ${tool.name}?`}</h2><p className="warningText">{tool.warning}</p><div className="warningBox"><b>Source</b><code>{tool.source}</code><b>Capability</b><span>{tool.capability}</span><b>Risk</b><span className={`severity ${tool.risk}`}>{tool.risk}</span><b>Execution mode</b><span>{tool.execution}</span></div>{blocked ? <><p className="modalNote">{tool.blocked_reason}</p><button className="secondaryBtn fullBtn" onClick={onClose}>CLOSE</button></> : <><label className="confirmLabel">Type {CONFIRMATION_PHRASE} to confirm</label><input value={value} onChange={e => setValue(e.target.value)} placeholder={CONFIRMATION_PHRASE} autoFocus/><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>CANCEL</button><button className="runBtn" disabled={value.trim() !== CONFIRMATION_PHRASE} onClick={onConfirm}>I UNDERSTAND — RUN</button></div></>}</div></div>
}

function Incidents({ incidents, logs }) { return <><section className="stats"><Stat label="INCIDENTS" value={incidents.length} sub="This session"/><Stat label="CONTAINED" value={incidents.filter(i => i.contained).length} sub="Successful responses" tone="good"/><Stat label="CRITICAL" value={incidents.filter(i => i.severity === 'critical').length} sub="Requires attention" tone={incidents.some(i => i.severity === 'critical') ? 'bad' : ''}/><Stat label="HIGH" value={incidents.filter(i => i.severity === 'high').length} sub="Elevated severity"/></section><section className="panel incidents"><PanelHead title="Incident center" sub="Detection, ownership and containment" tag="AUDIT"/><Feed incidents={incidents} empty="No incidents recorded in this session."/></section><section className="panel"><PanelHead title="System audit trail" sub="Controller stage messages"/>{logs.length ? logs.map((e, i) => <div className="log" key={i}><span>{e.type.toUpperCase()}</span><p>{e.data?.message || JSON.stringify(e.data)}</p></div>) : <div className="empty">No audit events yet.</div>}</section></> }
function Recovery({ result, running }) { const status = running ? 'Monitoring' : result ? (result.recovery_required ? 'Recovery executed' : 'Baseline intact') : 'Standby'; return <section className="recoveryWrap"><div className="recoveryCard"><div className="bigRing">{running ? '…' : result?.recovery_required ? '↺' : '✓'}</div><div><div className="heroKicker">RECOVERY CONTROLLER</div><h2>{status}</h2><p>{result ? `Snapshot created: ${result.snapshot_created ? 'yes' : 'no'}. Baseline intact: ${result.baseline_intact ? 'yes' : 'no'}.` : 'The controller prepares a disposable recovery point and verifies the lab baseline after simulation runs.'}</p></div></div><div className="recoverySteps"><Step n="01" title="Snapshot" text="Prepare a disposable recovery point before testing." done={!!result}/><Step n="02" title="Integrity check" text="Compare the lab against the captured baseline." done={!!result?.baseline_intact}/><Step n="03" title="Restore" text="Recover only when the controller detects a baseline change." done={!!result && !result.recovery_required}/></div></section> }
function Reports({ result, incidents, downloadReport }) { return <><section className="hero reportHero"><div><div className="heroKicker">EVIDENCE & REPORTING</div><h2>{result ? 'Latest run report' : 'No report generated yet'}</h2><p>Export the machine-readable result produced by the backend controller. Nothing is inferred from button clicks.</p></div><button className="runBtn" disabled={!result} onClick={downloadReport}>↓ EXPORT JSON</button></section>{result ? <div className="reportGrid"><ReportMetric title="Scenario / Tool" value={result.scenario || result.tool_id || '—'}/><ReportMetric title="Execution" value={result.execution || '—'}/><ReportMetric title="Baseline / Success" value={result.baseline_intact != null ? (result.baseline_intact ? 'INTACT' : 'CHANGED') : (result.success ? 'SUCCESS' : 'BLOCKED')}/><ReportMetric title="Recovery" value={result.recovery_required ? 'USED' : result.recovery_required === false ? 'NOT NEEDED' : 'N/A'}/><section className="panel raw"><PanelHead title="Raw controller result" sub={`${incidents.length} incidents in the current session`}/><pre>{JSON.stringify(result, null, 2)}</pre></section></div> : <div className="panel empty large">Run a backend test or confirmed lab tool first.</div>}</> }
function ScenarioPanel({ selected, setSelected, running }) { return <section className="panel scenarios"><PanelHead title="Test scenarios" sub={selected === 'all' ? 'Full suite — 5 bounded simulations' : `${selected.split(',').length} selected simulation${selected.split(',').length === 1 ? '' : 's'}`} tag="SAFE"/><div className="scenarioList">{SCENARIOS.map(([id, name, meta, icon]) => <button key={id} onClick={() => setSelected(id)} className={`scenario ${(selected === 'all' ? id === 'all' : selected === id || selected.split(',').includes(id)) ? 'selected' : ''}`} disabled={running}><span className="scenarioIcon">{icon}</span><span><b>{name}</b><small>{meta}</small></span><span className="chev">›</span></button>)}</div></section> }
function Pipeline({ activeStage }) { const stages = [['snapshot','SNAPSHOT','Disposable recovery point'],['offensive','OFFENSIVE SIM','Bounded event generation'],['os_defense','OS SECURITY','First-line inspection'],['m1_defense','M-1 DEFENDER','Detect + contain'],['complete','BASELINE','Integrity verification']]; return <section className="panel pipeline"><PanelHead title="Defense pipeline" sub="Current controller decision path"/>{stages.map(([id, title, text], i) => <React.Fragment key={id}><div className={`flowNode ${activeStage === id ? 'active' : ''} ${activeStage === 'complete' && id !== 'complete' ? 'done' : ''}`}><span className="flowIcon">{activeStage === id ? '●' : activeStage === 'complete' && id !== 'complete' ? '✓' : '○'}</span><div><b>{title}</b><small>{text}</small></div></div>{i < stages.length - 1 && <div className="arrow">↓</div>}</React.Fragment>)}</section> }
function Feed({ incidents, empty }) { return <div className="feed">{incidents.length === 0 ? <div className="empty">{empty}</div> : incidents.slice().reverse().map((item, i) => <Incident key={i} item={item}/>)}</div> }
function Incident({ item }) { return <div className="incident"><div className="incidentIcon">{item.event?.split('_')[0]?.toUpperCase() || 'EVT'}</div><div className="incidentMain"><b>{EVENT_LABELS[item.event] || item.event?.replaceAll('_', ' ')}</b><span>{item.reason}</span></div><span className={`severity ${item.severity}`}>{item.severity}</span><span className="handled">{item.handled_by === 'os_security_stack' ? 'OS SECURITY' : 'M-1 DEFENDER'}</span><span className="contained">{item.contained ? '✓ CONTAINED' : '⚠ OPEN'}</span></div> }
function PanelHead({ title, sub, tag, live }) { return <div className="panelHead"><div><h3>{title}</h3><p>{sub}</p></div>{tag && <span className={`liveTag ${live ? 'live' : ''}`}>{tag}</span>}</div> }
function Stat({ label, value, sub, tone='' }) { return <div className="stat"><span>{label}</span><strong className={tone}>{value}</strong><small>{sub}</small></div> }
function Step({ n, title, text, done }) { return <div className={`step ${done ? 'done' : ''}`}><span>{n}</span><div><b>{title}</b><p>{text}</p></div><i>{done ? '✓' : '○'}</i></div> }
function ReportMetric({ title, value }) { return <div className="reportMetric"><span>{title}</span><b>{value}</b></div> }

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register(new URL('./sw.js', window.location.href)).catch(() => {}))
createRoot(document.getElementById('root')).render(<App />)
