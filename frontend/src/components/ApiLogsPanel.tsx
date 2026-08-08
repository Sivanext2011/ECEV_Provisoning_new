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

  const downloadLog = (log: any, index: number) => {
    const content = {
      timestamp: log.timestamp,
      method: log.method,
      url: log.url,
      status: log.status,
      request: {
        headers: log.headers || { 'Content-Type': 'application/json', 'Authorization': 'Bearer ***' },
        body: log.request_body,
      },
      response: {
        status: log.status,
        headers: log.response_headers || null,
        body: (() => { try { return JSON.parse(log.response_body) } catch { return log.response_body } })(),
      }
    }
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `api_log_${log.method}_${log.status}_${log.timestamp?.split('T')[1]?.slice(0,8)?.replace(/:/g,'-') || index}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h2>API Request/Response Logs</h2>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={load}>🔄 Refresh</button>
        <button onClick={() => fetch(`${API}/logs/clear`, { method: 'DELETE' }).then(load)}>🗑 Clear</button>
        <button onClick={() => {
          const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `api_logs_all_${new Date().toISOString().slice(0,10)}.json`; a.click()
          URL.revokeObjectURL(url)
        }}>📥 Download All</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#eee', textAlign: 'left' }}>
            <th style={{ padding: 6 }}>Time</th>
            <th style={{ padding: 6 }}>Type</th>
            <th style={{ padding: 6 }}>Method</th>
            <th style={{ padding: 6 }}>URL</th>
            <th style={{ padding: 6 }}>Status</th>
            <th style={{ padding: 6 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l, i) => (
            <React.Fragment key={i}>
              <tr style={{ borderBottom: '1px solid #ddd', cursor: 'pointer', background: l.status >= 400 || l.status === 'ERROR' ? '#fff0f0' : undefined }} onClick={() => setExpanded(expanded === i ? null : i)}>
                <td style={{ padding: 6 }}>{l.timestamp?.split('T')[1]?.slice(0,8)}</td>
                <td style={{ padding: 6 }}>{l.type || 'RESPONSE'}</td>
                <td style={{ padding: 6, fontWeight: 600 }}>{l.method}</td>
                <td style={{ padding: 6, wordBreak: 'break-all', maxWidth: 400 }}>{l.url}</td>
                <td style={{ padding: 6, color: l.status >= 400 || l.status === 'ERROR' ? '#dc2626' : '#059669', fontWeight: 600 }}>{l.status}</td>
                <td style={{ padding: 6 }}>
                  <button onClick={e => { e.stopPropagation(); downloadLog(l, i) }}
                    style={{ fontSize: 10, padding: '2px 6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 3, cursor: 'pointer' }}>📥</button>
                </td>
              </tr>
              {expanded === i && (
                <tr><td colSpan={6} style={{ padding: 10, background: '#f9f9f9' }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <button onClick={() => downloadLog(l, i)} style={{ fontSize: 11, padding: '3px 10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>📥 Download This Log</button>
                    <button onClick={() => {
                      const text = `${l.method} ${l.url}\nStatus: ${l.status}\n\nRequest Body:\n${JSON.stringify(l.request_body, null, 2)}\n\nResponse Body:\n${(() => { try { return JSON.stringify(JSON.parse(l.response_body), null, 2) } catch { return l.response_body } })()}`
                      navigator.clipboard.writeText(text)
                    }} style={{ fontSize: 11, padding: '3px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>📋 Copy to Clipboard</button>
                  </div>
                  {l.request_body && <><div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Request Body:</div><pre style={{ fontSize: 11, margin: '0 0 8px', padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.request_body, null, 2)}</pre></>}
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Response Body:</div>
                  <pre style={{ fontSize: 11, margin: 0, padding: 8, background: l.status >= 400 || l.status === 'ERROR' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${l.status >= 400 || l.status === 'ERROR' ? '#fecaca' : '#bbf7d0'}`, borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{(() => { try { return JSON.stringify(JSON.parse(l.response_body), null, 2) } catch { return l.response_body } })()}</pre>
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
