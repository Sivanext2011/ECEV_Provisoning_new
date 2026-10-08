import React, { useState, useRef, useEffect } from 'react'

const API = '/api/v1'

export function BatchPanel() {
  const [batchFile, setBatchFile] = useState<any>(null)      // parsed uploaded/loaded file
  const [fileName, setFileName] = useState('')
  const [recordCount, setRecordCount] = useState<number | null>(null)

  const [delayMin, setDelayMin] = useState('0')               // schedule delay in minutes
  const [autoStart, setAutoStart] = useState(true)

  const [scheduleId, setScheduleId] = useState('')
  const [scheduleInfo, setScheduleInfo] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<any>(null)

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
  const schedule = async () => {
    if (!batchFile) { setErr('Upload a batch file first'); return }
    setErr(''); setMsg(''); setLoading(true); setScheduleInfo(null)
    try {
      const body = { batchFile, delaySeconds: Math.round((Number(delayMin) || 0) * 60), autoStart }
      const r = await fetch(`${API}/batch/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setScheduleId(d.scheduleId)
      setMsg(`Scheduled (id=${d.scheduleId}, delay=${d.delaySeconds}s, autoStart=${d.autoStart}). Polling status...`)
    } catch (e: any) { setErr(`Schedule failed: ${e.message}`) }
    setLoading(false)
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

  // ---- List all jobs ----
  const listJobs = async () => {
    setErr('')
    try {
      const r = await fetch(`${API}/batch/jobs`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setJobs(Array.isArray(d) ? d : [])
      setMsg(`Fetched ${Array.isArray(d) ? d.length : 0} job(s) from CPM Batch`)
    } catch (e: any) { setErr(`List jobs failed: ${e.message}`) }
  }

  const btn: React.CSSProperties = { fontSize: 12, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' }
  const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14, background: '#fff' }

  return (
    <div>
      <h2>📦 CPM Batch</h2>
      <p style={{ fontSize: 12, color: '#555' }}>Download a template, edit it, upload your batch file, then schedule it (CPM Batch creates &amp; starts the job).</p>

      {/* Step 1: Template */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>1. Get a template</div>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>A ready-to-edit batch file (party → customer+BA → contract+product → adjustment). Edit the resource payloads / externalIds for your subscribers.</p>
        <button onClick={downloadTemplate} style={{ ...btn, background: '#6b7280' }}>⬇️ Download Template (JSON)</button>
      </div>

      {/* Step 2: Upload */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>2. Upload your batch file</div>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ fontSize: 12 }} />
        {fileName && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Selected: {fileName}{recordCount !== null ? ` — ${recordCount} record(s)` : ''}</div>}
      </div>

      {/* Step 3: Schedule */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>3. Schedule</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Delay (minutes)
            <input type="number" min={0} style={{ width: 80, marginLeft: 6, padding: '4px 6px', fontSize: 12 }} value={delayMin} onChange={e => setDelayMin(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} /> Auto-start job after create
          </label>
          <button onClick={schedule} disabled={loading || !batchFile} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule Batch</button>
        </div>
        <p style={{ fontSize: 11, color: '#888', margin: '6px 0 0' }}>Delay 0 = run immediately. The tool creates the job and (if checked) starts it, then polls status.</p>
      </div>

      {/* Messages */}
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
          <pre style={{ fontSize: 11, background: '#1a202c', color: '#e2e8f0', padding: 10, borderRadius: 6, maxHeight: 300, overflow: 'auto', marginTop: 8 }}>{JSON.stringify(scheduleInfo, null, 2)}</pre>
        </div>
      )}

      {/* Jobs list */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>All batch jobs</span>
          <button onClick={listJobs} style={{ ...btn, background: '#2563eb', padding: '3px 10px' }}>🔄 Refresh</button>
        </div>
        {jobs.length > 0 ? (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Job ID</th><th style={{ textAlign: 'left', padding: 6 }}>Name</th><th style={{ textAlign: 'left', padding: 6 }}>Status</th><th style={{ textAlign: 'left', padding: 6 }}>Created</th>
            </tr></thead>
            <tbody>{jobs.map((j, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{j.jobId}</td>
                <td style={{ padding: 6 }}>{j.batchName}</td>
                <td style={{ padding: 6, color: j.status === 'FAILED' ? '#dc2626' : j.status === 'COMPLETED' ? '#059669' : '#555' }}>{j.status}</td>
                <td style={{ padding: 6 }}>{j.creationDate}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div style={{ fontSize: 12, color: '#888' }}>No jobs loaded. Click Refresh.</div>}
      </div>
    </div>
  )
}

export default BatchPanel
