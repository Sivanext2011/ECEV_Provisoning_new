import React, { useState, useEffect } from 'react'

const API = '/api/v1'

export function CatalogPanel() {
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [specs, setSpecs] = useState<any>(null)
  const [error, setError] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<any>(null)

  const loadSpecs = () => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }

  useEffect(() => { loadSpecs() }, [])

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(''); setUploadResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const r = await fetch(`${API}/specs/upload`, { method: 'POST', body: formData })
      if (!r.ok) throw new Error((await r.json()).detail)
      setUploadResult(await r.json())
      loadSpecs()
    } catch (err: any) { setError(err.message) }
    setUploading(false)
  }

  const fetchFromBSSF = async () => {
    setFetching(true); setError(''); setFetchResult(null)
    try {
      const r = await fetch(`${API}/specs/fetch`, { method: 'POST' })
      if (!r.ok) throw new Error((await r.json()).detail)
      const data = await r.json()
      setFetchResult(data)
      loadSpecs()
    } catch (err: any) { setError(err.message) }
    setFetching(false)
  }

  return (
    <div>
      <h2>📦 Catalog - RMCA Specs</h2>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>Fetch from Live BSSF</b></legend>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>Fetch all specifications directly from the connected BSSF system via Specification Enquiry API</p>
        <button onClick={fetchFromBSSF} disabled={fetching}>{fetching ? '⏳ Fetching...' : '🔄 Fetch from BSSF'}</button>
        {fetchResult && (
          <div style={{ marginTop: 8, fontSize: 13 }}>
            <p style={{ color: 'green', margin: '0 0 4px' }}>✓ Fetched from live BSSF:</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {fetchResult.counts
                ? Object.entries(fetchResult.counts).map(([k, v]) => <li key={k}>{k}: {v as number}</li>)
                : <>
                    <li>Party specs: {fetchResult.partySpecs}</li>
                    <li>Customer specs: {fetchResult.customerSpecs}</li>
                    <li>Contract specs: {fetchResult.contractSpecs}</li>
                    <li>Billing Account specs: {fetchResult.billingAccountSpecs}</li>
                    <li>Product specs: {fetchResult.productSpecs}</li>
                    <li>Product Offerings: {fetchResult.productOfferings}</li>
                    <li>Contact Medium specs: {fetchResult.contactMediumSpecs}</li>
                  </>}
            </ul>
            {fetchResult.errors && Object.keys(fetchResult.errors).length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ fontSize: 12, color: '#c60', cursor: 'pointer' }}>⚠ {Object.keys(fetchResult.errors).length} endpoints failed</summary>
                <pre style={{ fontSize: 11, background: '#fff8e1', padding: 8, marginTop: 4 }}>{JSON.stringify(fetchResult.errors, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend><b>Upload BusinessConfig (Offline)</b></legend>
        <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>Export from RMCA and upload the BusinessConfig .zip file</p>
        <input type="file" accept=".zip" onChange={upload} disabled={uploading} />
        {uploading && <p>Parsing...</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        {uploadResult && <p style={{ color: 'green' }}>✓ Parsed: {uploadResult.partySpecs} party specs, {uploadResult.customerSpecs} customer specs, {uploadResult.contractSpecs} contract specs, {uploadResult.productOfferings} product offerings</p>}
      </fieldset>


      {specs && (
        <div>
          <h3>Loaded Specifications</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#eee', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Type</th><th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>External ID</th>
            </tr></thead>
            <tbody>
              {(specs.partySpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Party</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.customerSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Customer</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.contractSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Contract</td><td style={{ padding: 6 }}>{s.name} ({s.paymentContext})</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.billingAccountSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Billing Account</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.communicationIdentifierSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Comm ID</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.contactMediumSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Contact Medium</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.agreementSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Agreement</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.partyRoleSpecifications || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Party Role</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
              {(specs.bucketTags || []).map((s: any) => (
                <tr key={s.id} style={{ borderBottom: '1px solid #ddd' }}><td style={{ padding: 6 }}>Bucket</td><td style={{ padding: 6 }}>{s.name}</td><td style={{ padding: 6 }}>{s.externalId}</td></tr>
              ))}
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Product Offerings ({(specs.productOfferings || []).length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#eee', textAlign: 'left' }}>
              <th style={{ padding: 6 }}>Name</th><th style={{ padding: 6 }}>External ID</th><th style={{ padding: 6 }}>Types</th>
            </tr></thead>
            <tbody>
              {(specs.productOfferings || []).map((p: any) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 6 }}>{p.name}</td><td style={{ padding: 6 }}>{p.externalId}</td><td style={{ padding: 6 }}>{(p.offeringTypes || []).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
