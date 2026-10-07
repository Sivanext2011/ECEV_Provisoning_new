import React, { useState } from 'react'

const API = '/api/v1'

export function BatchPanel() {
  const [count, setCount] = useState(1)
  const [givenName, setGivenName] = useState('Batch')
  const [familyName, setFamilyName] = useState('Test')
  const [po, setPo] = useState('')
  const [doAdjust, setDoAdjust] = useState(true)
  const [adjAmount, setAdjAmount] = useState('1024')
  const [adjUnit, setAdjUnit] = useState('byte')
  const [bucketSpec, setBucketSpec] = useState('')

  const [preview, setPreview] = useState<any>(null)
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const buildBody = () => ({
    count: Number(count) || 1,
    givenName, familyName,
    productOfferingExternalId: po || undefined,
    adjustment: doAdjust,
    adjustmentAmount: Number(adjAmount) || 0,
    adjustmentUnit: adjUnit,
    bucketSpecExternalId: bucketSpec || undefined,
  })

  const doBuild = async () => {
    setErr(''); setMsg(''); setLoading(true)
    try {
      const r = await fetch(`${API}/batch/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setPreview(await r.json()); setMsg('Batch file built (preview below). Not submitted yet.')
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }

  const doSubmit = async () => {
    setErr(''); setMsg(''); setResult(null); setStatus(''); setLoading(true)
    try {
      const r = await fetch(`${API}/batch/jobs/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preview ? { batchFile: preview } : buildBody()) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      const jid = d.jobId || d.id || d.batchJobId || (d.job && d.job.jobId) || ''
      setJobId(jid)
      setMsg(`Job created: ${jid || JSON.stringify(d)}`)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }

  const doStart = async () => {
    if (!jobId) return
    setErr(''); setLoading(true)
    try {
      const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setMsg(`Job started: ${jobId}`)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }

  const doStatus = async () => {
    if (!jobId) return
    setErr(''); setLoading(true)
    try {
      const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/status`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setStatus(typeof d === 'string' ? d : (d.status || JSON.stringify(d)))
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }

  const doResult = async () => {
    if (!jobId) return
    setErr(''); setLoading(true)
    try {
      const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/result`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setResult(d)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 3 }
  const inp: React.CSSProperties = { width: '100%', padding: '5px 7px', fontSize: 12, marginBottom: 8 }
  const btn: React.CSSProperties = { fontSize: 12, padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' }

  return (
    <div>
      <h2>📦 CPM Batch Provisioning</h2>
      <p style={{ fontSize: 12, color: '#555' }}>Builds a CPM Batch v1.1 file (party → customer+BA → contract+product → adjustment) and submits it to eric-bss-cpm-batch.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, maxWidth: 760, marginTop: 12 }}>
        <div><label style={lbl}>Subscribers (count)</label><input type="number" min={1} style={inp} value={count} onChange={e => setCount(Number(e.target.value))} /></div>
        <div><label style={lbl}>Given Name</label><input style={inp} value={givenName} onChange={e => setGivenName(e.target.value)} /></div>
        <div><label style={lbl}>Family Name</label><input style={inp} value={familyName} onChange={e => setFamilyName(e.target.value)} /></div>
        <div style={{ gridColumn: '1 / 3' }}><label style={lbl}>Product Offering externalId (blank = default)</label><input style={inp} value={po} onChange={e => setPo(e.target.value)} placeholder="e.g. 145001" /></div>
      </div>

      <fieldset style={{ maxWidth: 760, border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 10 }}>
        <legend style={{ fontSize: 12, fontWeight: 600 }}>
          <label style={{ cursor: 'pointer' }}><input type="checkbox" checked={doAdjust} onChange={e => setDoAdjust(e.target.checked)} /> Include balance adjustment</label>
        </legend>
        {doAdjust && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={lbl}>Amount</label><input type="number" style={inp} value={adjAmount} onChange={e => setAdjAmount(e.target.value)} /></div>
            <div><label style={lbl}>Unit</label><input style={inp} value={adjUnit} onChange={e => setAdjUnit(e.target.value)} /></div>
            <div><label style={lbl}>Bucket Spec externalId</label><input style={inp} value={bucketSpec} onChange={e => setBucketSpec(e.target.value)} placeholder="optional" /></div>
          </div>
        )}
      </fieldset>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button onClick={doBuild} disabled={loading} style={{ ...btn, background: '#6b7280' }}>🔧 Build / Preview</button>
        <button onClick={doSubmit} disabled={loading} style={{ ...btn, background: '#2563eb' }}>⬆️ Submit Job</button>
        <button onClick={doStart} disabled={loading || !jobId} style={{ ...btn, background: '#16a34a' }}>▶️ Start</button>
        <button onClick={doStatus} disabled={loading || !jobId} style={{ ...btn, background: '#f59e0b' }}>🔄 Status</button>
        <button onClick={doResult} disabled={loading || !jobId} style={{ ...btn, background: '#7c3aed' }}>📄 Result</button>
      </div>

      {msg && <div style={{ fontSize: 12, color: '#059669', background: '#f0fdf4', padding: 8, borderRadius: 4, marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{err}</div>}
      {jobId && <div style={{ fontSize: 12, marginBottom: 8 }}><strong>Job ID:</strong> {jobId} {status && <span style={{ marginLeft: 10 }}><strong>Status:</strong> {status}</span>}</div>}

      {result && (<><h3 style={{ fontSize: 13, margin: '10px 0 4px' }}>Result</h3>
        <pre style={{ fontSize: 11, background: '#1a202c', color: '#e2e8f0', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre></>)}

      {preview && (<><h3 style={{ fontSize: 13, margin: '10px 0 4px' }}>Batch File Preview</h3>
        <pre style={{ fontSize: 11, background: '#f8fafc', border: '1px solid #e5e7eb', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }}>{JSON.stringify(preview, null, 2)}</pre></>)}
    </div>
  )
}

export default BatchPanel
