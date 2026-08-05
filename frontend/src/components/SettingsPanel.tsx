import React, { useState, useEffect } from 'react'

const API = '/api/v1'

function CertUpload({ value, onChange, name }: { value: string; onChange: (v: string) => void; name: string }) {
  const [uploading, setUploading] = useState(false)
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', name)
    try {
      const r = await fetch(`${API}/certs/upload`, { method: 'POST', body: formData })
      if (!r.ok) throw new Error('Upload failed')
      const data = await r.json()
      onChange(data.path)
    } catch (err) { alert('Failed to upload cert file') }
    setUploading(false)
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
      <input style={{ flex: 1 }} placeholder="Path to cert/key file" value={value} onChange={e => onChange(e.target.value)} />
      <label style={{ cursor: 'pointer', padding: '4px 8px', background: '#eee', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
        {uploading ? '...' : '📁 Browse'}
        <input type="file" accept=".crt,.pem,.key,.cer" style={{ display: 'none' }} onChange={upload} />
      </label>
    </div>
  )
}

function FqdnRow({ label, fqdn, onFqdn, tls, onTls, certNames }: {
  label: string; fqdn: string; onFqdn: (v: string) => void
  tls?: { ssl_verify: boolean; ca_cert_path: string; client_cert_path: string; client_key_path: string }
  onTls?: (k: string, v: any) => void
  certNames?: { ca: string; cert: string; key: string }
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ borderBottom: '1px solid #eee', paddingBottom: 8 }}>
      <label style={{ fontSize: 13 }}>{label}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input style={{ flex: 1 }} value={fqdn} onChange={e => onFqdn(e.target.value)} placeholder={`https://...`} />
          {tls && onTls && (
            <button type="button" style={{ fontSize: 11, padding: '3px 8px', background: open ? '#dbeafe' : '#eee', borderRadius: 4, whiteSpace: 'nowrap' }}
              onClick={() => setOpen(o => !o)}>🔒 TLS</button>
          )}
        </div>
      </label>
      {tls && onTls && open && (
        <div style={{ marginTop: 6, paddingLeft: 8, display: 'grid', gap: 6, borderLeft: '3px solid #93c5fd' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={tls.ssl_verify} onChange={e => onTls('ssl_verify', e.target.checked)} />Verify SSL
          </label>
          <label style={{ fontSize: 12 }}>CA Cert<CertUpload value={tls.ca_cert_path} onChange={v => onTls('ca_cert_path', v)} name={certNames?.ca || 'ca'} /></label>
          <label style={{ fontSize: 12 }}>Client Cert<CertUpload value={tls.client_cert_path} onChange={v => onTls('client_cert_path', v)} name={certNames?.cert || 'client_cert'} /></label>
          <label style={{ fontSize: 12 }}>Client Key<CertUpload value={tls.client_key_path} onChange={v => onTls('client_key_path', v)} name={certNames?.key || 'client_key'} /></label>
        </div>
      )}
    </div>
  )
}


export function SettingsPanel() {
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [loadError, setLoadError] = useState('')

  const load = async () => {
    setLoadError('')
    try {
      const r = await fetch(`${API}/settings`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setConfig(await r.json())
    } catch (e: any) { setLoadError(`Failed to load settings: ${e.message}`) }
  }

  const save = async () => {
    setLoading(true); setMsg('')
    try {
      const r = await fetch(`${API}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
      if (!r.ok) throw new Error((await r.json()).detail)
      setMsg('Saved!')
    } catch (e: any) { setMsg(`Error: ${e.message}`) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  if (loadError) return <p style={{ color: 'red' }}>{loadError}</p>
  if (!config) return <p>Loading config...</p>

  const updateEnv = (k: string, v: string) => setConfig({ ...config, environment: { ...config.environment, [k]: v } })
  const updateAuth = (k: string, v: any) => setConfig({ ...config, auth: { ...config.auth, [k]: v } })
  const updateTls = (k: string, v: any) => setConfig({ ...config, tls: { ...config.tls, [k]: v } })
  const updateCatalogTls = (k: string, v: any) => setConfig({ ...config, rmca_catalog_tls: { ...config.rmca_catalog_tls, [k]: v } })
  const updateNet = (k: string, v: any) => setConfig({ ...config, network: { ...config.network, [k]: v } })

  const mainTlsFqdns = ['ROOT_BAE', 'ROOT_RMCA', 'ROOT_CPM', 'ROOT_CPM_INTERNAL', 'ROOT_CPM_BATCH']
  const otherEnvKeys = Object.keys(config.environment || {}).filter(k => !mainTlsFqdns.includes(k) && k !== 'ROOT_RMCA_CATALOG' && k !== 'ROOT_SEC')

  return (
    <div>
      <h2>Settings</h2>
      <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>
        <fieldset>
          <legend><b>Token FQDN (Keycloak)</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <FqdnRow label="Token FQDN (ROOT_SEC)" fqdn={config.environment?.ROOT_SEC || ''} onFqdn={v => updateEnv('ROOT_SEC', v)} />
            <label style={{ fontSize: 13 }}>Token Endpoint Path
              <input style={{ width: '100%' }} value={config.auth?.token_endpoint || ''} onChange={e => updateAuth('token_endpoint', e.target.value)}
                placeholder="https://<ROOT_SEC>/auth/realms/master/protocol/openid-connect/token" />
            </label>
            <label style={{ fontSize: 13 }}>Username<input style={{ width: '100%' }} value={config.auth?.username || ''} onChange={e => updateAuth('username', e.target.value)} /></label>
            <label style={{ fontSize: 13 }}>Password<input style={{ width: '100%' }} type="password" value={config.auth?.password || ''} onChange={e => updateAuth('password', e.target.value)} /></label>
            <label style={{ fontSize: 13 }}>Client ID<input style={{ width: '100%' }} value={config.auth?.client_id || ''} onChange={e => updateAuth('client_id', e.target.value)} /></label>
          </div>
        </fieldset>

        <fieldset>
          <legend><b>BAE / RMCA FQDNs</b></legend>
          <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Click 🔒 TLS to configure certificates per endpoint.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {mainTlsFqdns.map(k => (
              <FqdnRow key={k} label={k}
                fqdn={config.environment?.[k] || ''} onFqdn={v => updateEnv(k, v)}
                tls={config.tls} onTls={updateTls}
                certNames={{ ca: 'ca', cert: 'client_cert', key: 'client_key' }} />
            ))}
            <FqdnRow label="ROOT_RMCA_CATALOG"
              fqdn={config.environment?.ROOT_RMCA_CATALOG || ''} onFqdn={v => updateEnv('ROOT_RMCA_CATALOG', v)}
              tls={config.rmca_catalog_tls} onTls={updateCatalogTls}
              certNames={{ ca: 'rmca_ca', cert: 'rmca_cert', key: 'rmca_key' }} />
            {otherEnvKeys.map(k => (
              <FqdnRow key={k} label={k} fqdn={config.environment?.[k] || ''} onFqdn={v => updateEnv(k, v)} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend><b>Network</b></legend>
          <div style={{ display: 'grid', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={config.network?.socks5_enabled || false} onChange={e => updateNet('socks5_enabled', e.target.checked)} />Enable SOCKS5 Proxy</label>
            <label style={{ fontSize: 13 }}>SOCKS5 Proxy<input style={{ width: '100%' }} placeholder="socks5://127.0.0.1:1080" value={config.network?.socks5_proxy || ''} onChange={e => updateNet('socks5_proxy', e.target.value)} disabled={!config.network?.socks5_enabled} /></label>
            <label style={{ fontSize: 13 }}>Timeout (s)<input style={{ width: '100%' }} type="number" value={config.network?.timeout_seconds || 30} onChange={e => updateNet('timeout_seconds', Number(e.target.value))} /></label>
          </div>
        </fieldset>

        <button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save Configuration'}</button>
        {msg && <p style={{ color: msg.startsWith('Error') ? 'red' : 'green' }}>{msg}</p>}
      </div>
    </div>
  )
}
