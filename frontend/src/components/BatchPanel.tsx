import React, { useState, useRef, useEffect } from 'react'
import { CharInput, splitCharValues } from './CharInput'

const API = '/api/v1'

type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'status_asc' | 'status_desc'

export function BatchPanel() {
  const [batchFile, setBatchFile] = useState<any>(null)      // parsed uploaded/loaded file
  const [fileName, setFileName] = useState('')
  const [recordCount, setRecordCount] = useState<number | null>(null)

  const [delayMin, setDelayMin] = useState('0')               // schedule delay in minutes
  const [autoStart, setAutoStart] = useState(true)

  const [scheduleId, setScheduleId] = useState('')
  const [scheduleInfo, setScheduleInfo] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('created_desc')

  // per-job expanded failure details: { [jobId]: {loading, data, error} }
  const [failDetails, setFailDetails] = useState<Record<string, any>>({})
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<any>(null)

  // ---- spec-driven build wizard ----
  const [specs, setSpecs] = useState<any>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [wCount, setWCount] = useState('1')
  const [wGiven, setWGiven] = useState('Batch')
  const [wFamily, setWFamily] = useState('Test')
  const [wPartySpec, setWPartySpec] = useState('')
  const [wCustSpec, setWCustSpec] = useState('')
  const [wBASpec, setWBASpec] = useState('')
  const [wBCSpec, setWBCSpec] = useState('')
  const [wContractSpec, setWContractSpec] = useState('')
  const [wPO, setWPO] = useState('')
  const [wAdjust, setWAdjust] = useState(false)
  const [wPartyChars, setWPartyChars] = useState<Record<string, string>>({})
  const [wCustChars, setWCustChars] = useState<Record<string, string>>({})
  const [wContractChars, setWContractChars] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
    fetch(`${API}/settings`).then(r => r.ok ? r.json() : null).then(cfg => {
      const d = cfg?.defaults || {}
      setWPartySpec(d.partySpecExternalId || '')
      setWCustSpec(d.customerSpecExternalId || '')
      setWBASpec(d.billingAccountSpecExternalId || '')
      setWBCSpec(d.billCycleSpecExternalId || '')
      setWContractSpec(d.contractSpecExternalId || '')
      setWPO(d.basePlanProductOfferingExternalId || '')
    }).catch(() => {})
  }, [])

  // ---- Download template ----
  const downloadTemplate = async () => {
    setErr(''); setMsg('')
    try {
      const r = await fetch(`${API}/batch/template?count=1&adjustment=true`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const tpl = await r.json()
      const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'cpm_batch_template.json'; a.click()
      URL.revokeObjectURL(url)
      setMsg('Template downloaded. Edit the resource payloads / externalIds, then upload it below.')
    } catch (e: any) { setErr(`Template download failed: ${e.message}`) }
  }

  // ---- Upload / validate batch file ----
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setMsg(''); setFileName(f.name); setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch(`${API}/batch/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setBatchFile(d.batchFile)
      setRecordCount(d.recordCount)
      setMsg(`Loaded "${f.name}": ${d.recordCount} record(s), batchJobId=${d.batchJobId || '(auto)'}`)
    } catch (e: any) { setErr(`Upload failed: ${e.message}`); setBatchFile(null); setRecordCount(null) }
    setLoading(false)
  }

  // ---- Schedule (create + optionally start, with optional delay) ----
  const schedule = async (bodyOverride?: any) => {
    const body = bodyOverride || (batchFile ? { batchFile } : null)
    if (!body) { setErr('Upload a batch file or use the wizard first'); return }
    setErr(''); setMsg(''); setLoading(true); setScheduleInfo(null)
    try {
      body.delaySeconds = Math.round((Number(delayMin) || 0) * 60)
      body.autoStart = autoStart
      const r = await fetch(`${API}/batch/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setScheduleId(d.scheduleId)
      setMsg(`Scheduled (id=${d.scheduleId}, delay=${d.delaySeconds}s, autoStart=${d.autoStart}). Polling status...`)
    } catch (e: any) { setErr(`Schedule failed: ${e.message}`) }
    setLoading(false)
  }

  // ---- Build a batch body from the spec-driven wizard ----
  const buildCharsPayload = (map: Record<string, string>) =>
    Object.entries(map)
      .filter(([, v]) => v !== undefined && v !== null && splitCharValues(v).length > 0)
      .map(([k, v]) => ({ charSpecExternalId: k, value: splitCharValues(v).map(sv => ({ value: sv })) }))

  const wizardBody = () => ({
    count: Number(wCount) || 1,
    givenName: wGiven,
    familyName: wFamily,
    adjustment: wAdjust,
    partySpecExternalId: wPartySpec || undefined,
    customerSpecExternalId: wCustSpec || undefined,
    billingAccountSpecExternalId: wBASpec || undefined,
    billCycleSpecExternalId: wBCSpec || undefined,
    contractSpecExternalId: wContractSpec || undefined,
    productOfferingExternalId: wPO || undefined,
    partyCharacteristics: buildCharsPayload(wPartyChars),
    customerCharacteristics: buildCharsPayload(wCustChars),
    contractCharacteristics: buildCharsPayload(wContractChars),
  })

  const scheduleFromWizard = () => schedule(wizardBody())

  const previewWizard = async () => {
    setErr(''); setMsg('')
    try {
      const r = await fetch(`${API}/batch/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardBody()) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'cpm_batch_wizard.json'; a.click()
      URL.revokeObjectURL(url)
      setMsg('Wizard batch file built & downloaded for review.')
    } catch (e: any) { setErr(`Build failed: ${e.message}`) }
  }

  // ---- Poll schedule status ----
  useEffect(() => {
    if (!scheduleId) return
    const poll = async () => {
      try {
        const r = await fetch(`${API}/batch/schedule/${scheduleId}`)
        if (r.ok) setScheduleInfo(await r.json())
      } catch {}
    }
    poll()
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [scheduleId])

  // ---- List all jobs (server-side sorted) ----
  const listJobs = async (key: SortKey = sortKey) => {
    setErr('')
    try {
      const r = await fetch(`${API}/batch/jobs?sort=${key}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setJobs(Array.isArray(d) ? d : [])
      setMsg(`Fetched ${Array.isArray(d) ? d.length : 0} job(s) from CPM Batch`)
    } catch (e: any) { setErr(`List jobs failed: ${e.message}`) }
  }

  const onSortChange = (k: SortKey) => { setSortKey(k); listJobs(k) }

  // ---- Fetch failure reasons for a job (on row click) ----
  const toggleJob = async (jobId: string) => {
    if (expandedJob === jobId) { setExpandedJob(null); return }
    setExpandedJob(jobId)
    if (failDetails[jobId]) return
    setFailDetails(prev => ({ ...prev, [jobId]: { loading: true } }))
    try {
      const r = await fetch(`${API}/batch/jobs/${jobId}/failures`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setFailDetails(prev => ({ ...prev, [jobId]: { loading: false, data: d } }))
    } catch (e: any) {
      setFailDetails(prev => ({ ...prev, [jobId]: { loading: false, error: e.message } }))
    }
  }

  const btn: React.CSSProperties = { fontSize: 12, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' }
  const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14, background: '#fff' }
  const sel: React.CSSProperties = { fontSize: 12, padding: '4px 6px', marginLeft: 6 }

  // spec lists
  const partySpecs = specs?.partySpecifications || []
  const custSpecs = specs?.customerSpecifications || []
  const baSpecs = specs?.billingAccountSpecifications || []
  const bcSpecs = specs?.billingCycleSpecifications || []
  const contractSpecs = specs?.contractSpecifications || []
  const poList = specs?.productOfferings || []

  const findSpec = (list: any[], ext: string) => list.find((s: any) => s.externalId === ext)
  const personalizable = (chars: any[]) => (chars || []).filter((c: any) => (c.externalId || '').trim() !== '' && c.valueRegulator !== 'fixed')

  const renderCharSet = (specList: any[], ext: string, vals: Record<string, string>, setVals: (v: Record<string, string>) => void, label: string) => {
    const spec = findSpec(specList, ext)
    const chars = personalizable(spec?.characteristics || [])
    if (!spec || chars.length === 0) return <div style={{ fontSize: 11, color: '#999' }}>No personalizable characteristics for {label}.</div>
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {chars.map((c: any) => {
          const key = c.externalId || c.id
          return (
            <div key={key}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{c.name || key}{c.valueRegulator === 'mustBePersonalized' && <span style={{ color: '#dc2626' }}> *</span>}</div>
              <CharInput char={c} value={vals[key] || ''} onChange={(v) => setVals({ ...vals, [key]: v })} />
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <h2>📦 CPM Batch</h2>
      <p style={{ fontSize: 12, color: '#555' }}>Build a batch with spec-driven assistance (or upload your own file), then schedule it. CPM Batch creates &amp; starts the job.</p>

      {/* Spec-driven wizard */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>🧭 Spec-driven batch builder</span>
          <button onClick={() => setShowWizard(s => !s)} style={{ ...btn, background: '#7c3aed', padding: '3px 10px' }}>{showWizard ? 'Hide' : 'Open'}</button>
        </div>
        {showWizard && (!specs ? (
          <p style={{ color: '#c00', fontSize: 12 }}>No specs loaded. Go to the <b>📦 Catalog</b> tab and upload a BusinessConfig zip first.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12 }}>Records<input type="number" min={1} style={{ width: 70, ...sel }} value={wCount} onChange={e => setWCount(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Given name<input style={sel} value={wGiven} onChange={e => setWGiven(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Family name<input style={sel} value={wFamily} onChange={e => setWFamily(e.target.value)} /></label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={wAdjust} onChange={e => setWAdjust(e.target.checked)} /> Add balance adjustment</label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12 }}>Party spec
                <select style={{ ...sel, width: '100%' }} value={wPartySpec} onChange={e => { setWPartySpec(e.target.value); setWPartyChars({}) }}>
                  <option value="">(default)</option>
                  {partySpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Customer spec
                <select style={{ ...sel, width: '100%' }} value={wCustSpec} onChange={e => { setWCustSpec(e.target.value); setWCustChars({}) }}>
                  <option value="">(default)</option>
                  {custSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Billing account spec
                <select style={{ ...sel, width: '100%' }} value={wBASpec} onChange={e => setWBASpec(e.target.value)}>
                  <option value="">(default)</option>
                  {baSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Bill cycle spec
                <select style={{ ...sel, width: '100%' }} value={wBCSpec} onChange={e => setWBCSpec(e.target.value)}>
                  <option value="">(default)</option>
                  {bcSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Contract spec
                <select style={{ ...sel, width: '100%' }} value={wContractSpec} onChange={e => { setWContractSpec(e.target.value); setWContractChars({}) }}>
                  <option value="">(default)</option>
                  {contractSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Product offering
                <select style={{ ...sel, width: '100%' }} value={wPO} onChange={e => setWPO(e.target.value)}>
                  <option value="">(default)</option>
                  {poList.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
            </div>

            {wPartySpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Party characteristics</div>{renderCharSet(partySpecs, wPartySpec, wPartyChars, setWPartyChars, 'party')}</div>}
            {wCustSpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Customer characteristics</div>{renderCharSet(custSpecs, wCustSpec, wCustChars, setWCustChars, 'customer')}</div>}
            {wContractSpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Contract characteristics</div>{renderCharSet(contractSpecs, wContractSpec, wContractChars, setWContractChars, 'contract')}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={previewWizard} style={{ ...btn, background: '#6b7280' }}>⬇️ Build &amp; Download (preview)</button>
              <button onClick={scheduleFromWizard} disabled={loading} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule this batch</button>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Mandatory spec characteristics are auto-filled from the catalog if left blank. * = must be personalized.</p>
          </div>
        ))}
      </div>

      {/* Template + upload (manual path) */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Manual: template &amp; upload</div>
        <button onClick={downloadTemplate} style={{ ...btn, background: '#6b7280', marginRight: 10 }}>⬇️ Download Template (JSON)</button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ fontSize: 12 }} />
        {fileName && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Selected: {fileName}{recordCount !== null ? ` — ${recordCount} record(s)` : ''}</div>}
      </div>

      {/* Schedule controls */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Schedule</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Delay (minutes)
            <input type="number" min={0} style={{ width: 80, marginLeft: 6, padding: '4px 6px', fontSize: 12 }} value={delayMin} onChange={e => setDelayMin(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} /> Auto-start job after create
          </label>
          <button onClick={() => schedule()} disabled={loading || !batchFile} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule uploaded file</button>
        </div>
      </div>

      {msg && <div style={{ fontSize: 12, color: '#059669', background: '#f0fdf4', padding: 8, borderRadius: 4, marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{err}</div>}

      {/* Schedule status */}
      {scheduleInfo && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Schedule status</div>
          <div style={{ fontSize: 12 }}>
            <div><strong>State:</strong> <span style={{ color: scheduleInfo.state === 'ERROR' ? '#dc2626' : '#2563eb' }}>{scheduleInfo.state}</span></div>
            {scheduleInfo.jobId && <div><strong>Job ID:</strong> {scheduleInfo.jobId}</div>}
            {scheduleInfo.error && <div style={{ color: '#dc2626' }}><strong>Error:</strong> {scheduleInfo.error}</div>}
            {scheduleInfo.jobStatus && <div><strong>Job status:</strong> {typeof scheduleInfo.jobStatus === 'string' ? scheduleInfo.jobStatus : (scheduleInfo.jobStatus.status || JSON.stringify(scheduleInfo.jobStatus))}</div>}
          </div>
        </div>
      )}

      {/* Jobs list */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>All batch jobs</span>
          <button onClick={() => listJobs()} style={{ ...btn, background: '#2563eb', padding: '3px 10px' }}>🔄 Refresh</button>
          <label style={{ fontSize: 12 }}>Sort by
            <select style={sel} value={sortKey} onChange={e => onSortChange(e.target.value as SortKey)}>
              <option value="created_desc">Created (newest first)</option>
              <option value="created_asc">Created (oldest first)</option>
              <option value="name_asc">Name (A→Z)</option>
              <option value="name_desc">Name (Z→A)</option>
              <option value="status_asc">Status (A→Z)</option>
              <option value="status_desc">Status (Z→A)</option>
            </select>
          </label>
          <span style={{ fontSize: 11, color: '#888' }}>Click a row to see failure reasons.</span>
        </div>
        {jobs.length > 0 ? (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Job ID</th><th style={{ textAlign: 'left', padding: 6 }}>Name</th><th style={{ textAlign: 'left', padding: 6 }}>Status</th><th style={{ textAlign: 'left', padding: 6 }}>Created</th>
            </tr></thead>
            <tbody>{jobs.map((j, i) => (
              <React.Fragment key={j.jobId || i}>
                <tr style={{ borderBottom: '1px solid #eee', cursor: 'pointer', background: expandedJob === j.jobId ? '#f8fafc' : undefined }} onClick={() => toggleJob(j.jobId)}>
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{j.jobId}</td>
                  <td style={{ padding: 6 }}>{j.batchName}</td>
                  <td style={{ padding: 6, color: j.status === 'FAILED' ? '#dc2626' : j.status === 'COMPLETED' ? '#059669' : '#555' }}>{j.status}</td>
                  <td style={{ padding: 6 }}>{j.creationDate}</td>
                </tr>
                {expandedJob === j.jobId && (
                  <tr><td colSpan={4} style={{ padding: 10, background: '#f9fafb' }}>
                    {failDetails[j.jobId]?.loading && <div style={{ fontSize: 12, color: '#666' }}>Loading failure details…</div>}
                    {failDetails[j.jobId]?.error && <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {failDetails[j.jobId].error}</div>}
                    {failDetails[j.jobId]?.data && (() => {
                      const d = failDetails[j.jobId].data
                      return (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ marginBottom: 6 }}>
                            <strong>{d.success}</strong> succeeded, <strong style={{ color: d.failed ? '#dc2626' : '#059669' }}>{d.failed}</strong> failed (of {d.total}).
                          </div>
                          {d.failures?.length > 0 ? (
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead><tr style={{ background: '#fee2e2' }}>
                                <th style={{ textAlign: 'left', padding: 4 }}>Rec</th><th style={{ textAlign: 'left', padding: 4 }}>Entity</th><th style={{ textAlign: 'left', padding: 4 }}>Code</th><th style={{ textAlign: 'left', padding: 4 }}>Reason</th>
                              </tr></thead>
                              <tbody>{d.failures.map((f: any, k: number) => (
                                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: 4 }}>{f.recordNumber}</td>
                                  <td style={{ padding: 4 }}>{f.entity}</td>
                                  <td style={{ padding: 4 }}>{f.responseCode}</td>
                                  <td style={{ padding: 4, color: '#b91c1c' }}>{f.reason}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          ) : <div style={{ color: '#059669' }}>No failures — all entities succeeded.</div>}
                        </div>
                      )
                    })()}
                  </td></tr>
                )}
              </React.Fragment>
            ))}</tbody>
          </table>
        ) : <div style={{ fontSize: 12, color: '#888' }}>No jobs loaded. Click Refresh.</div>}
      </div>
    </div>
  )
}

export default BatchPanel
