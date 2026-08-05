import React, { useState, useEffect } from 'react'

const API = '/api/v1'

export function ApiLogsPanel() {
  const [logs, setLogs] = useState<any[]>([])
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    const r = await fetch(`${API}/logs`)
    setLogs(await r.json())
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <h2>API Request/Response Logs</h2>
      <button onClick={load}>Refresh</button>
      <button onClick={() => fetch(`${API}/logs/clear`, { method: 'DELETE' }).then(load)} style={{ marginLeft: 8 }}>Clear</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Time</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Method</th>
            <th style={{ padding: 6 }}>URL</th>
            <th style={{ padding: 6 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <React.Fragment key={i}>
              <tr style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', background: l.status === 'ERROR' ? '#fff0f0' : undefined }} onClick={() => setExpanded(expanded === i ? null : i)}>
                <td style={{ padding: 6 }}>{l.timestamp?.split('T')[1]?.slice(0,8)}</td>
                <td style={{ padding: 6 }}>{l.type || 'RESPONSE'}</td>
                <td style={{ padding: 6 }}>{l.method}</td>
                <td style={{ padding: 6, wordBreak: 'break-all', maxWidth: 400 }}>{l.url}</td>
                <td style={{ padding: 6, color: l.status >= 400 || l.status === 'ERROR' ? 'red' : 'green' }}>{l.status}</td>
              </tr>
              {expanded === i && (
                <tr><td colSpan={5} style={{ padding: 10, background: '#f9f9f9' }}>
                  {l.ssl_verify && <><b>SSL Verify:</b> {l.ssl_verify} | <b>SOCKS5:</b> {l.socks5_proxy}<br/></>}
                  {l.headers && <><b>Request Headers:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.headers, null, 2)}</pre></>}
                  {l.request_body && <><b>Request Body:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.request_body, null, 2)}</pre></>}
                  {l.response_headers && <><b>Response Headers:</b><pre style={{ fontSize: 11, margin: '4px 0' }}>{JSON.stringify(l.response_headers, null, 2)}</pre></>}
                  {l.response_body && <><b>Response Body:</b><pre style={{ fontSize: 11, margin: '4px 0', maxHeight: 600, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{(() => { try { return JSON.stringify(JSON.parse(l.response_body), null, 2) } catch { return l.response_body } })()}</pre></>}
                </td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      {logs.length === 0 && <p>No API calls recorded yet.</p>}
    </div>
  )
}
