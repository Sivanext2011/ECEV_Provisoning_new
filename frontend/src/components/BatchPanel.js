import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useRef, useEffect } from 'react';
const API = '/api/v1';
export function BatchPanel() {
    const [batchFile, setBatchFile] = useState(null); // parsed uploaded/loaded file
    const [fileName, setFileName] = useState('');
    const [recordCount, setRecordCount] = useState(null);
    const [delayMin, setDelayMin] = useState('0'); // schedule delay in minutes
    const [autoStart, setAutoStart] = useState(true);
    const [scheduleId, setScheduleId] = useState('');
    const [scheduleInfo, setScheduleInfo] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const fileRef = useRef(null);
    const pollRef = useRef(null);
    // ---- Download template ----
    const downloadTemplate = async () => {
        setErr('');
        setMsg('');
        try {
            const r = await fetch(`${API}/batch/template?count=1&adjustment=true`);
            if (!r.ok)
                throw new Error(`HTTP ${r.status}`);
            const tpl = await r.json();
            const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cpm_batch_template.json';
            a.click();
            URL.revokeObjectURL(url);
            setMsg('Template downloaded. Edit the resource payloads / externalIds, then upload it below.');
        }
        catch (e) {
            setErr(`Template download failed: ${e.message}`);
        }
    };
    // ---- Upload / validate batch file ----
    const onFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f)
            return;
        setErr('');
        setMsg('');
        setFileName(f.name);
        setLoading(true);
        try {
            const fd = new FormData();
            fd.append('file', f);
            const r = await fetch(`${API}/batch/upload`, { method: 'POST', body: fd });
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setBatchFile(d.batchFile);
            setRecordCount(d.recordCount);
            setMsg(`Loaded "${f.name}": ${d.recordCount} record(s), batchJobId=${d.batchJobId || '(auto)'}`);
        }
        catch (e) {
            setErr(`Upload failed: ${e.message}`);
            setBatchFile(null);
            setRecordCount(null);
        }
        setLoading(false);
    };
    // ---- Schedule (create + optionally start, with optional delay) ----
    const schedule = async () => {
        if (!batchFile) {
            setErr('Upload a batch file first');
            return;
        }
        setErr('');
        setMsg('');
        setLoading(true);
        setScheduleInfo(null);
        try {
            const body = { batchFile, delaySeconds: Math.round((Number(delayMin) || 0) * 60), autoStart };
            const r = await fetch(`${API}/batch/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setScheduleId(d.scheduleId);
            setMsg(`Scheduled (id=${d.scheduleId}, delay=${d.delaySeconds}s, autoStart=${d.autoStart}). Polling status...`);
        }
        catch (e) {
            setErr(`Schedule failed: ${e.message}`);
        }
        setLoading(false);
    };
    // ---- Poll schedule status ----
    useEffect(() => {
        if (!scheduleId)
            return;
        const poll = async () => {
            try {
                const r = await fetch(`${API}/batch/schedule/${scheduleId}`);
                if (r.ok)
                    setScheduleInfo(await r.json());
            }
            catch { }
        };
        poll();
        pollRef.current = setInterval(poll, 4000);
        return () => clearInterval(pollRef.current);
    }, [scheduleId]);
    // ---- List all jobs ----
    const listJobs = async () => {
        setErr('');
        try {
            const r = await fetch(`${API}/batch/jobs`);
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setJobs(Array.isArray(d) ? d : []);
            setMsg(`Fetched ${Array.isArray(d) ? d.length : 0} job(s) from CPM Batch`);
        }
        catch (e) {
            setErr(`List jobs failed: ${e.message}`);
        }
    };
    const btn = { fontSize: 12, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' };
    const card = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14, background: '#fff' };
    return (_jsxs("div", { children: [_jsx("h2", { children: "\uD83D\uDCE6 CPM Batch" }), _jsx("p", { style: { fontSize: 12, color: '#555' }, children: "Download a template, edit it, upload your batch file, then schedule it (CPM Batch creates & starts the job)." }), _jsxs("div", { style: card, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "1. Get a template" }), _jsx("p", { style: { fontSize: 12, color: '#666', margin: '0 0 8px' }, children: "A ready-to-edit batch file (party \u2192 customer+BA \u2192 contract+product \u2192 adjustment). Edit the resource payloads / externalIds for your subscribers." }), _jsx("button", { onClick: downloadTemplate, style: { ...btn, background: '#6b7280' }, children: "\u2B07\uFE0F Download Template (JSON)" })] }), _jsxs("div", { style: card, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "2. Upload your batch file" }), _jsx("input", { ref: fileRef, type: "file", accept: ".json,application/json", onChange: onFile, style: { fontSize: 12 } }), fileName && _jsxs("div", { style: { fontSize: 12, color: '#666', marginTop: 6 }, children: ["Selected: ", fileName, recordCount !== null ? ` — ${recordCount} record(s)` : ''] })] }), _jsxs("div", { style: card, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "3. Schedule" }), _jsxs("div", { style: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Delay (minutes)", _jsx("input", { type: "number", min: 0, style: { width: 80, marginLeft: 6, padding: '4px 6px', fontSize: 12 }, value: delayMin, onChange: e => setDelayMin(e.target.value) })] }), _jsxs("label", { style: { fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: autoStart, onChange: e => setAutoStart(e.target.checked) }), " Auto-start job after create"] }), _jsx("button", { onClick: schedule, disabled: loading || !batchFile, style: { ...btn, background: '#16a34a' }, children: "\uD83D\uDD52 Schedule Batch" })] }), _jsx("p", { style: { fontSize: 11, color: '#888', margin: '6px 0 0' }, children: "Delay 0 = run immediately. The tool creates the job and (if checked) starts it, then polls status." })] }), msg && _jsx("div", { style: { fontSize: 12, color: '#059669', background: '#f0fdf4', padding: 8, borderRadius: 4, marginBottom: 8 }, children: msg }), err && _jsx("div", { style: { fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap' }, children: err }), scheduleInfo && (_jsxs("div", { style: card, children: [_jsx("div", { style: { fontWeight: 600, marginBottom: 6 }, children: "Schedule status" }), _jsxs("div", { style: { fontSize: 12 }, children: [_jsxs("div", { children: [_jsx("strong", { children: "State:" }), " ", _jsx("span", { style: { color: scheduleInfo.state === 'ERROR' ? '#dc2626' : '#2563eb' }, children: scheduleInfo.state })] }), scheduleInfo.jobId && _jsxs("div", { children: [_jsx("strong", { children: "Job ID:" }), " ", scheduleInfo.jobId] }), scheduleInfo.error && _jsxs("div", { style: { color: '#dc2626' }, children: [_jsx("strong", { children: "Error:" }), " ", scheduleInfo.error] }), scheduleInfo.jobStatus && _jsxs("div", { children: [_jsx("strong", { children: "Job status:" }), " ", typeof scheduleInfo.jobStatus === 'string' ? scheduleInfo.jobStatus : (scheduleInfo.jobStatus.status || JSON.stringify(scheduleInfo.jobStatus))] })] }), _jsx("pre", { style: { fontSize: 11, background: '#1a202c', color: '#e2e8f0', padding: 10, borderRadius: 6, maxHeight: 300, overflow: 'auto', marginTop: 8 }, children: JSON.stringify(scheduleInfo, null, 2) })] })), _jsxs("div", { style: card, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }, children: [_jsx("span", { style: { fontWeight: 600 }, children: "All batch jobs" }), _jsx("button", { onClick: listJobs, style: { ...btn, background: '#2563eb', padding: '3px 10px' }, children: "\uD83D\uDD04 Refresh" })] }), jobs.length > 0 ? (_jsxs("table", { style: { width: '100%', fontSize: 12, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#f3f4f6' }, children: [_jsx("th", { style: { textAlign: 'left', padding: 6 }, children: "Job ID" }), _jsx("th", { style: { textAlign: 'left', padding: 6 }, children: "Name" }), _jsx("th", { style: { textAlign: 'left', padding: 6 }, children: "Status" }), _jsx("th", { style: { textAlign: 'left', padding: 6 }, children: "Created" })] }) }), _jsx("tbody", { children: jobs.map((j, i) => (_jsxs("tr", { style: { borderBottom: '1px solid #eee' }, children: [_jsx("td", { style: { padding: 6, fontFamily: 'monospace', fontSize: 11 }, children: j.jobId }), _jsx("td", { style: { padding: 6 }, children: j.batchName }), _jsx("td", { style: { padding: 6, color: j.status === 'FAILED' ? '#dc2626' : j.status === 'COMPLETED' ? '#059669' : '#555' }, children: j.status }), _jsx("td", { style: { padding: 6 }, children: j.creationDate })] }, i))) })] })) : _jsx("div", { style: { fontSize: 12, color: '#888' }, children: "No jobs loaded. Click Refresh." })] })] }));
}
export default BatchPanel;
