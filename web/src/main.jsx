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
