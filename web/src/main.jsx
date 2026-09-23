import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

const LOCAL_EVENTS = {
  keylogging: [{event_type:'credential_capture_attempt', source:'simulated_keylogger', details:{keys:['USER','PASSWORD']}}],
  disk_fill: [{event_type:'resource_exhaustion_attempt', source:'simulated_disk_filler', details:{requested_mb:1024}}],
  persistence: [{event_type:'persistence_attempt', source:'simulated_persistence', details:{location:'lab-startup'}}],
  privilege: [{event_type:'privilege_escalation_attempt', source:'simulated_privilege_module', details:{target:'lab-resource'}}],
  encryption: [{event_type:'mass_file_modification_attempt', source:'simulated_encryptor', details:{files:50}}],
}
const LOCAL_RULES = {
  credential_capture_attempt:['high','Credential capture behavior matched the lab credential-access rule.','M-1 defender'],
  resource_exhaustion_attempt:['high','Resource exhaustion pattern exceeded the lab threshold.','M-1 defender'],
  persistence_attempt:['high','Startup persistence pattern matched the lab policy.','OS security stack'],
  privilege_escalation_attempt:['critical','Privilege escalation pattern matched the lab policy.','M-1 defender'],
  mass_file_modification_attempt:['critical','Mass file modification pattern matched the lab ransomware rule.','M-1 defender'],
}
function localScenario(name) {
  const names = name === 'all' ? Object.keys(LOCAL_EVENTS) : name.split(',').filter(Boolean)
  return names.flatMap(n => LOCAL_EVENTS[n] || [])
}
async function runLocalSimulation(name, push, setStage) {
  const incidents=[]
  push({type:'stage',data:{stage:'snapshot',message:'Local disposable lab snapshot prepared'}}); setStage('snapshot'); await new Promise(r=>setTimeout(r,250))
  for (const event of localScenario(name)) {
    setStage('offensive'); push({type:'stage',data:{stage:'offensive',message:`Simulated event: ${event.event_type}`}}); await new Promise(r=>setTimeout(r,300))
    setStage('os_defense'); push({type:'stage',data:{stage:'os_defense',message:'OS security adapter inspecting event'}}); await new Promise(r=>setTimeout(r,220))
    const rule=LOCAL_RULES[event.event_type]; const osHandled=rule[2]==='OS security stack'
    if (osHandled) push({type:'stage',data:{stage:'m1_defense',message:'OS security stack contained the event'}})
    else { setStage('m1_defense'); push({type:'stage',data:{stage:'m1_defense',message:'OS layer did not handle event; M-1 defensive layer engaged'}}) }
    await new Promise(r=>setTimeout(r,220))
    const item={event:event.event_type,severity:rule[0],reason:rule[1],contained:true,action:'Block and record simulated event',handled_by:osHandled?'os_security_stack':'m1_defensive_layer'}
    incidents.push(item); push({type:'incident',data:item}); await new Promise(r=>setTimeout(r,300))
  }
  setStage('complete'); const result={scenario:name,incidents,all_contained:true,baseline_intact:true,recovery_required:false,snapshot_created:true,external_recovery_required:false,execution:'android-local-safe-simulator'}
  push({type:'complete',data:result}); return result
}

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

function App() {
  const [selected, setSelected] = useState('all')
  const toggleScenario = (id) => {
    if (id === 'all') return setSelected('all')
    const current = selected === 'all' ? [] : selected.split(',').filter(Boolean)
    const next = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    setSelected(next.length ? next.join(',') : 'all')
  }
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState([])
  const [result, setResult] = useState(null)
  const [connected, setConnected] = useState(false)
  const [page, setPage] = useState('overview')
  const [activeStage, setActiveStage] = useState('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/health').then(r => r.ok ? r.json() : Promise.reject()).then(() => setConnected(true)).catch(() => setConnected(false))
  }, [running])

  const incidents = useMemo(() => events.filter(e => e.type === 'incident').map(e => e.data), [events])
  const logs = useMemo(() => events.filter(e => e.type === 'stage' || e.type === 'error'), [events])
  const stats = useMemo(() => ({
    detected: incidents.length,
    contained: incidents.filter(i => i.contained).length,
    critical: incidents.filter(i => i.severity === 'critical').length,
    high: incidents.filter(i => i.severity === 'high').length,
  }), [incidents])

  async function start(runScenario = selected, dryRun = false) {
    setRunning(true); setEvents([]); setResult(null); setError(''); setActiveStage('snapshot'); setPage('live')
    try {
      const res = await fetch('/api/test/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ scenario: runScenario, dry_run: dryRun })
      })
      if (!res.ok) throw new Error(await res.text())
      setConnected(true)
      if (!res.body) throw new Error('Backend did not provide an event stream')
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = ''
      while (true) {
        const { value, done } = await reader.read(); if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n'); buffer = chunks.pop() || ''
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(x => x.startsWith('data: ')); if (!line) continue
          const payload = JSON.parse(line.slice(6))
          if (payload.type === 'complete') { setResult(payload.data); setActiveStage('complete') }
          else if (payload.type === 'run_started') {
            setEvents(x => [...x, payload])
          } else {
            setEvents(x => [...x, payload]); if (payload.type === 'stage') setActiveStage(payload.data.stage)
          }
        }
      }
    } catch (err) {
      setConnected(false)
      setError(err?.message || 'Unable to connect to the M-1 backend')
    } finally { setRunning(false) }
  }

  const runAll = () => start('all', false)
  const runSelected = () => start(selected === 'all' ? 'all' : selected, false)
  const dryRun = () => start(selected === 'all' ? 'all' : selected, true)

  function downloadReport() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `m1-${result.scenario}-report.json`; a.click(); URL.revokeObjectURL(url)
  }

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">M</div><div><div className="brandName">M-1</div><div className="brandSub">DEFENSE CONSOLE</div></div></div>
      <div className="sideLabel">LAB CONTROL</div>
      {NAV.map(([id, label, icon]) => <button key={id} className={`nav ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><span>{icon}</span>{label}{id === 'incidents' && incidents.length > 0 && <em>{incidents.length}</em>}</button>)}
      <div className="sideLabel bottomLabel">SYSTEM</div>
      <div className="systemCard"><div className="pulse"/><div><b>{connected ? 'API ONLINE' : 'API OFFLINE'}</b><small>Local safe-lab boundary</small></div></div>
      <div className="safety">⚠ Bounded simulations only. M-1 does not intentionally perform destructive host actions.</div>
    </aside>

    <main className="main">
      <header className="topbar"><div><div className="eyebrow">CYBERSECURITY DEFENSIVE LAB</div><h1>{page === 'overview' ? 'Defense Dashboard' : NAV.find(x => x[0] === page)?.[1]}</h1></div><div className="topStatus"><span className="statusDot"/> LAB MODE <span className="divider"/> v2.0</div></header>

      {page === 'overview' && <Overview {...{selected, setSelected: toggleScenario, running, runAll, runSelected, dryRun, stats, result, activeStage, incidents, setPage, error}} />}
      {page === 'live' && <LiveTest {...{selected, setSelected: toggleScenario, running, runAll, runSelected, dryRun, events, incidents, result, activeStage, error}} />}
      {page === 'incidents' && <Incidents incidents={incidents} logs={logs} />}
      {page === 'recovery' && <Recovery result={result} running={running} />}
      {page === 'reports' && <Reports result={result} incidents={incidents} downloadReport={downloadReport} />}
    </main>
  </div>
}

function Overview({ selected, setSelected, running, runAll, runSelected, dryRun, stats, result, activeStage, incidents, setPage, error }) {
  return <>
    <section className="hero"><div><div className="heroKicker">REAL-TIME TEST CONTROL</div><h2>Run the attack. Watch the defense.</h2><p>M-1 orchestrates bounded simulations, lets the OS security adapter inspect first, then routes uncovered events to the M-1 defensive layer and verifies the lab baseline.</p></div><div className="runControls"><button className="runBtn" disabled={running} onClick={runAll}>{running ? <><span className="spinner"/> RUNNING</> : <>▶ RUN ALL</>}</button><button className="secondaryBtn" disabled={running || selected === 'all'} onClick={runSelected}>RUN SELECTED</button><button className="secondaryBtn dryBtn" disabled={running} onClick={dryRun}>DRY RUN</button></div></section>
    {error && <div className="errorBanner">BACKEND ERROR: {error}</div>}
    <section className="stats"><Stat label="DEFENSE STATUS" value={result ? (result.all_contained ? 'SECURE' : 'REVIEW') : 'READY'} sub={result ? (result.all_contained ? 'All observed incidents contained' : 'Review run outcome') : 'Awaiting test run'} tone={result?.all_contained ? 'good' : ''}/><Stat label="EVENTS DETECTED" value={stats.detected} sub="Current run"/><Stat label="CONTAINED" value={stats.contained} sub={stats.detected ? `${Math.round(stats.contained / stats.detected * 100)}% containment rate` : 'No incidents yet'} tone="good"/><Stat label="CRITICAL / HIGH" value={`${stats.critical} / ${stats.high}`} sub="Highest severities" tone={stats.critical ? 'bad' : ''}/></section>
    <div className="grid"><ScenarioPanel {...{selected, setSelected, running}}/><Pipeline activeStage={activeStage}/></div>
    <section className="panel incidents"><PanelHead title="Live incident feed" sub="Latest events from the active test stream" tag={running ? 'LIVE' : 'IDLE'} live={running}/><Feed incidents={incidents} empty="No incidents yet. Start a bounded test to populate the feed."/><button className="panelLink" onClick={() => setPage('incidents')}>VIEW INCIDENT CENTER →</button></section>
  </>
}

function LiveTest({ selected, setSelected, running, runAll, runSelected, dryRun, events, incidents, result, activeStage, error }) {
  return <>
    <section className="liveHero"><div><div className="heroKicker">CONTROL ROOM</div><h2>{running ? 'Defensive test in progress' : result ? 'Test run complete' : 'Ready for a live test'}</h2><p>Watch each stage transition as the bounded simulator moves through snapshot, offensive event generation, OS inspection, M-1 response and baseline verification.</p></div><div className="runControls"><button className="runBtn" disabled={running} onClick={runAll}>{running ? <><span className="spinner"/> RUNNING</> : <>▶ RUN ALL</>}</button><button className="secondaryBtn" disabled={running || selected === 'all'} onClick={runSelected}>RUN SELECTED</button><button className="secondaryBtn dryBtn" disabled={running} onClick={dryRun}>DRY RUN</button></div></section>
    {error && <div className="errorBanner">BACKEND ERROR: {error}</div>}
    <div className="liveGrid"><Pipeline activeStage={activeStage}/><section className="panel timeline"><PanelHead title="Event stream" sub={`${events.length} stream events`} tag={running ? 'LIVE' : 'IDLE'} live={running}/><div className="stream">{events.length ? events.map((e, i) => e.type === 'incident' ? <Incident key={i} item={e.data}/> : <div className="streamRow" key={i}><span>{e.type === 'error' ? 'ERR' : e.data.stage?.toUpperCase()}</span><p>{e.data.message || 'System event'}</p></div>) : <div className="empty">Waiting for the first event…</div>}</div></section></div>
    <section className="panel"><PanelHead title="Scenario selector" sub={selected === 'all' ? 'Full suite — 5 bounded simulations' : `${selected.split(',').length} selected simulation${selected.split(',').length === 1 ? '' : 's'}`}/><div className="scenarioGrid">{SCENARIOS.map(([id, name, meta, icon]) => <button key={id} disabled={running} className={`scenarioCard ${(selected === 'all' ? id === 'all' : selected.split(',').includes(id)) ? 'selected' : ''}`} onClick={() => setSelected(id)}><span>{icon}</span><b>{name}</b><small>{meta}</small></button>)}</div></section>
  </>
}

function Incidents({ incidents, logs }) { return <><section className="stats"><Stat label="INCIDENTS" value={incidents.length} sub="This session"/><Stat label="CONTAINED" value={incidents.filter(i => i.contained).length} sub="Successful responses" tone="good"/><Stat label="CRITICAL" value={incidents.filter(i => i.severity === 'critical').length} sub="Requires attention" tone={incidents.some(i => i.severity === 'critical') ? 'bad' : ''}/><Stat label="HIGH" value={incidents.filter(i => i.severity === 'high').length} sub="Elevated severity"/></section><section className="panel incidents"><PanelHead title="Incident center" sub="Detection, ownership and containment" tag="AUDIT"/><Feed incidents={incidents} empty="No incidents recorded in this session."/></section><section className="panel"><PanelHead title="System audit trail" sub="Non-incident stage messages"/>{logs.length ? logs.map((e, i) => <div className="log" key={i}><span>{e.data.stage?.toUpperCase()}</span><p>{e.data.message}</p></div>) : <div className="empty">No audit events yet.</div>}</section></> }

function Recovery({ result, running }) { const status = running ? 'Monitoring' : result ? (result.recovery_required ? 'Recovery executed' : 'Baseline intact') : 'Standby'; return <section className="recoveryWrap"><div className="recoveryCard"><div className="bigRing">{running ? '…' : result?.recovery_required ? '↺' : '✓'}</div><div><div className="heroKicker">RECOVERY CONTROLLER</div><h2>{status}</h2><p>{result ? `Snapshot created: ${result.snapshot_created ? 'yes' : 'no'}. Baseline intact: ${result.baseline_intact ? 'yes' : 'no'}.` : 'M-1 prepares a disposable lab snapshot before each run and verifies integrity after the simulation.'}</p></div></div><div className="recoverySteps"><Step n="01" title="Snapshot" text="Prepare a disposable recovery point before testing." done={!!result}/><Step n="02" title="Integrity check" text="Compare the lab against the captured baseline." done={!!result?.baseline_intact}/><Step n="03" title="Restore" text="Recover only when the controller detects a baseline change." done={!!result && !result.recovery_required}/></div></section> }

function Reports({ result, incidents, downloadReport }) { return <><section className="hero reportHero"><div><div className="heroKicker">EVIDENCE & REPORTING</div><h2>{result ? 'Latest M-1 test report' : 'No report generated yet'}</h2><p>Export the machine-readable result of the most recent bounded defensive test. The report is generated from the controller result, not from the dashboard UI.</p></div><button className="runBtn" disabled={!result} onClick={downloadReport}>↓ EXPORT JSON</button></section>{result ? <div className="reportGrid"><ReportMetric title="Scenario" value={result.scenario}/><ReportMetric title="Defense outcome" value={result.all_contained ? 'PASSED' : 'REVIEW'}/><ReportMetric title="Baseline" value={result.baseline_intact ? 'INTACT' : 'CHANGED'}/><ReportMetric title="Recovery" value={result.recovery_required ? 'USED' : 'NOT NEEDED'}/><section className="panel raw"><PanelHead title="Report summary" sub={`${incidents.length} incidents in latest run`}/><pre>{JSON.stringify(result, null, 2)}</pre></section></div> : <div className="panel empty large">Run a test first. The complete controller result will appear here.</div>}</> }

function ScenarioPanel({ selected, setSelected, running }) { return <section className="panel scenarios"><PanelHead title="Test scenarios" sub={selected === 'all' ? 'Full suite — 5 bounded simulations' : `${selected.split(',').length} selected simulation${selected.split(',').length === 1 ? '' : 's'}`} tag="SAFE"/><div className="scenarioList">{SCENARIOS.map(([id, name, meta, icon]) => <button key={id} onClick={() => setSelected(id)} className={`scenario ${(selected === 'all' ? id === 'all' : selected.split(',').includes(id)) ? 'selected' : ''}`} disabled={running}><span className="scenarioIcon">{icon}</span><span><b>{name}</b><small>{meta}</small></span><span className="chev">›</span></button>)}</div></section> }

function Pipeline({ activeStage }) { const stages = [['snapshot','SNAPSHOT','Disposable recovery point'],['offensive','OFFENSIVE SIM','Bounded event generation'],['os_defense','OS SECURITY','First-line inspection'],['m1_defense','M-1 DEFENDER','Detect + contain'],['complete','BASELINE','Integrity verification']]; return <section className="panel pipeline"><PanelHead title="Defense pipeline" sub="Current decision path"/>{stages.map(([id, title, text], i) => <React.Fragment key={id}><div className={`flowNode ${activeStage === id ? 'active' : ''} ${activeStage === 'complete' && id !== 'complete' ? 'done' : ''}`}><span className="flowIcon">{activeStage === id ? '●' : activeStage === 'complete' && id !== 'complete' ? '✓' : '○'}</span><div><b>{title}</b><small>{text}</small></div></div>{i < stages.length - 1 && <div className="arrow">↓</div>}</React.Fragment>)}</section> }

function Feed({ incidents, empty }) { return <div className="feed">{incidents.length === 0 ? <div className="empty">{empty}</div> : incidents.slice().reverse().map((item, i) => <Incident key={i} item={item}/>)}</div> }
function Incident({ item }) { return <div className="incident"><div className="incidentIcon">{item.event?.split('_')[0]?.toUpperCase() || 'EVT'}</div><div className="incidentMain"><b>{EVENT_LABELS[item.event] || item.event?.replaceAll('_', ' ')}</b><span>{item.reason}</span></div><span className={`severity ${item.severity}`}>{item.severity}</span><span className="handled">{item.handled_by === 'os_security_stack' ? 'OS SECURITY' : 'M-1 DEFENDER'}</span><span className="contained">{item.contained ? '✓ CONTAINED' : '⚠ OPEN'}</span></div> }
function PanelHead({ title, sub, tag, live }) { return <div className="panelHead"><div><h3>{title}</h3><p>{sub}</p></div>{tag && <span className={`liveTag ${live ? 'live' : ''}`}>{tag}</span>}</div> }
function Stat({ label, value, sub, tone='' }) { return <div className="stat"><span>{label}</span><strong className={tone}>{value}</strong><small>{sub}</small></div> }
function Step({ n, title, text, done }) { return <div className={`step ${done ? 'done' : ''}`}><span>{n}</span><div><b>{title}</b><p>{text}</p></div><i>{done ? '✓' : '○'}</i></div> }
function ReportMetric({ title, value }) { return <div className="reportMetric"><span>{title}</span><b>{value}</b></div> }

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
createRoot(document.getElementById('root')).render(<App />)
