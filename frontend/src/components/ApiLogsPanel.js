import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect } from 'react';
const API = '/api/v1';
export function ApiLogsPanel() {
    const [logs, setLogs] = useState([]);
    const [expanded, setExpanded] = useState(null);
    const load = async () => {
        const r = await fetch(`${API}/logs`);
        setLogs(await r.json());
    };
    useEffect(() => { load(); }, []);
    const downloadLog = (log, index) => {
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
                body: (() => { try {
                    return JSON.parse(log.response_body);
                }
                catch {
                    return log.response_body;
                } })(),
            }
        };
        const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `api_log_${log.method}_${log.status}_${log.timestamp?.split('T')[1]?.slice(0, 8)?.replace(/:/g, '-') || index}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    return (_jsxs("div", { children: [_jsx("h2", { children: "API Request/Response Logs" }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 12 }, children: [_jsx("button", { onClick: load, children: "\uD83D\uDD04 Refresh" }), _jsx("button", { onClick: () => fetch(`${API}/logs/clear`, { method: 'DELETE' }).then(load), children: "\uD83D\uDDD1 Clear" }), _jsx("button", { onClick: () => {
                            const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `api_logs_all_${new Date().toISOString().slice(0, 10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                        }, children: "\uD83D\uDCE5 Download All" })] }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#eee', textAlign: 'left' }, children: [_jsx("th", { style: { padding: 6 }, children: "Time" }), _jsx("th", { style: { padding: 6 }, children: "Type" }), _jsx("th", { style: { padding: 6 }, children: "Method" }), _jsx("th", { style: { padding: 6 }, children: "URL" }), _jsx("th", { style: { padding: 6 }, children: "Status" }), _jsx("th", { style: { padding: 6 }, children: "Actions" })] }) }), _jsx("tbody", { children: logs.map((l, i) => (_jsxs(React.Fragment, { children: [_jsxs("tr", { style: { borderBottom: '1px solid #ddd', cursor: 'pointer', background: l.status >= 400 || l.status === 'ERROR' ? '#fff0f0' : undefined }, onClick: () => setExpanded(expanded === i ? null : i), children: [_jsx("td", { style: { padding: 6 }, children: l.timestamp?.split('T')[1]?.slice(0, 8) }), _jsx("td", { style: { padding: 6 }, children: l.type || 'RESPONSE' }), _jsx("td", { style: { padding: 6, fontWeight: 600 }, children: l.method }), _jsx("td", { style: { padding: 6, wordBreak: 'break-all', maxWidth: 400 }, children: l.url }), _jsx("td", { style: { padding: 6, color: l.status >= 400 || l.status === 'ERROR' ? '#dc2626' : '#059669', fontWeight: 600 }, children: l.status }), _jsx("td", { style: { padding: 6 }, children: _jsx("button", { onClick: e => { e.stopPropagation(); downloadLog(l, i); }, style: { fontSize: 10, padding: '2px 6px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 3, cursor: 'pointer' }, children: "\uD83D\uDCE5" }) })] }), expanded === i && (_jsx("tr", { children: _jsxs("td", { colSpan: 6, style: { padding: 10, background: '#f9f9f9' }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 8 }, children: [_jsx("button", { onClick: () => downloadLog(l, i), style: { fontSize: 11, padding: '3px 10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: "\uD83D\uDCE5 Download This Log" }), _jsx("button", { onClick: () => {
                                                            const text = `${l.method} ${l.url}\nStatus: ${l.status}\n\nRequest Body:\n${JSON.stringify(l.request_body, null, 2)}\n\nResponse Body:\n${(() => { try {
                                                                return JSON.stringify(JSON.parse(l.response_body), null, 2);
                                                            }
                                                            catch {
                                                                return l.response_body;
                                                            } })()}`;
                                                            navigator.clipboard.writeText(text);
                                                        }, style: { fontSize: 11, padding: '3px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: "\uD83D\uDCCB Copy to Clipboard" })] }), l.request_body && _jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 4 }, children: "Request Body:" }), _jsx("pre", { style: { fontSize: 11, margin: '0 0 8px', padding: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 4, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: JSON.stringify(l.request_body, null, 2) })] }), _jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 4 }, children: "Response Body:" }), _jsx("pre", { style: { fontSize: 11, margin: 0, padding: 8, background: l.status >= 400 || l.status === 'ERROR' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${l.status >= 400 || l.status === 'ERROR' ? '#fecaca' : '#bbf7d0'}`, borderRadius: 4, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: (() => { try {
                                                    return JSON.stringify(JSON.parse(l.response_body), null, 2);
                                                }
                                                catch {
                                                    return l.response_body;
                                                } })() })] }) }))] }, i))) })] }), logs.length === 0 && _jsx("p", { children: "No API calls recorded yet." })] }));
}
