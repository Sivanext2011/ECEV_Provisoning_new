import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
const API = '/api/v1';
export function BatchPanel() {
    const [count, setCount] = useState(1);
    const [givenName, setGivenName] = useState('Batch');
    const [familyName, setFamilyName] = useState('Test');
    const [po, setPo] = useState('');
    const [doAdjust, setDoAdjust] = useState(true);
    const [adjAmount, setAdjAmount] = useState('1024');
    const [adjUnit, setAdjUnit] = useState('byte');
    const [bucketSpec, setBucketSpec] = useState('');
    const [preview, setPreview] = useState(null);
    const [jobId, setJobId] = useState('');
    const [status, setStatus] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const buildBody = () => ({
        count: Number(count) || 1,
        givenName, familyName,
        productOfferingExternalId: po || undefined,
        adjustment: doAdjust,
        adjustmentAmount: Number(adjAmount) || 0,
        adjustmentUnit: adjUnit,
        bucketSpecExternalId: bucketSpec || undefined,
    });
    const doBuild = async () => {
        setErr('');
        setMsg('');
        setLoading(true);
        try {
            const r = await fetch(`${API}/batch/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setPreview(await r.json());
            setMsg('Batch file built (preview below). Not submitted yet.');
        }
        catch (e) {
            setErr(e.message);
        }
        setLoading(false);
    };
    const doSubmit = async () => {
        setErr('');
        setMsg('');
        setResult(null);
        setStatus('');
        setLoading(true);
        try {
            const r = await fetch(`${API}/batch/jobs/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preview ? { batchFile: preview } : buildBody()) });
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            const jid = d.jobId || d.id || d.batchJobId || (d.job && d.job.jobId) || '';
            setJobId(jid);
            setMsg(`Job created: ${jid || JSON.stringify(d)}`);
        }
        catch (e) {
            setErr(e.message);
        }
        setLoading(false);
    };
    const doStart = async () => {
        if (!jobId)
            return;
        setErr('');
        setLoading(true);
        try {
            const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST' });
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setMsg(`Job started: ${jobId}`);
        }
        catch (e) {
            setErr(e.message);
        }
        setLoading(false);
    };
    const doStatus = async () => {
        if (!jobId)
            return;
        setErr('');
        setLoading(true);
        try {
            const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/status`);
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setStatus(typeof d === 'string' ? d : (d.status || JSON.stringify(d)));
        }
        catch (e) {
            setErr(e.message);
        }
        setLoading(false);
    };
    const doResult = async () => {
        if (!jobId)
            return;
        setErr('');
        setLoading(true);
        try {
            const r = await fetch(`${API}/batch/jobs/${encodeURIComponent(jobId)}/result`);
            const d = await r.json();
            if (!r.ok)
                throw new Error(d.detail || `HTTP ${r.status}`);
            setResult(d);
        }
        catch (e) {
            setErr(e.message);
        }
        setLoading(false);
    };
    const lbl = { fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 3 };
    const inp = { width: '100%', padding: '5px 7px', fontSize: 12, marginBottom: 8 };
    const btn = { fontSize: 12, padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' };
    return (_jsxs("div", { children: [_jsx("h2", { children: "\uD83D\uDCE6 CPM Batch Provisioning" }), _jsx("p", { style: { fontSize: 12, color: '#555' }, children: "Builds a CPM Batch v1.1 file (party \u2192 customer+BA \u2192 contract+product \u2192 adjustment) and submits it to eric-bss-cpm-batch." }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, maxWidth: 760, marginTop: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: lbl, children: "Subscribers (count)" }), _jsx("input", { type: "number", min: 1, style: inp, value: count, onChange: e => setCount(Number(e.target.value)) })] }), _jsxs("div", { children: [_jsx("label", { style: lbl, children: "Given Name" }), _jsx("input", { style: inp, value: givenName, onChange: e => setGivenName(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { style: lbl, children: "Family Name" }), _jsx("input", { style: inp, value: familyName, onChange: e => setFamilyName(e.target.value) })] }), _jsxs("div", { style: { gridColumn: '1 / 3' }, children: [_jsx("label", { style: lbl, children: "Product Offering externalId (blank = default)" }), _jsx("input", { style: inp, value: po, onChange: e => setPo(e.target.value), placeholder: "e.g. 145001" })] })] }), _jsxs("fieldset", { style: { maxWidth: 760, border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, marginBottom: 10 }, children: [_jsx("legend", { style: { fontSize: 12, fontWeight: 600 }, children: _jsxs("label", { style: { cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: doAdjust, onChange: e => setDoAdjust(e.target.checked) }), " Include balance adjustment"] }) }), doAdjust && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: lbl, children: "Amount" }), _jsx("input", { type: "number", style: inp, value: adjAmount, onChange: e => setAdjAmount(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { style: lbl, children: "Unit" }), _jsx("input", { style: inp, value: adjUnit, onChange: e => setAdjUnit(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { style: lbl, children: "Bucket Spec externalId" }), _jsx("input", { style: inp, value: bucketSpec, onChange: e => setBucketSpec(e.target.value), placeholder: "optional" })] })] }))] }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }, children: [_jsx("button", { onClick: doBuild, disabled: loading, style: { ...btn, background: '#6b7280' }, children: "\uD83D\uDD27 Build / Preview" }), _jsx("button", { onClick: doSubmit, disabled: loading, style: { ...btn, background: '#2563eb' }, children: "\u2B06\uFE0F Submit Job" }), _jsx("button", { onClick: doStart, disabled: loading || !jobId, style: { ...btn, background: '#16a34a' }, children: "\u25B6\uFE0F Start" }), _jsx("button", { onClick: doStatus, disabled: loading || !jobId, style: { ...btn, background: '#f59e0b' }, children: "\uD83D\uDD04 Status" }), _jsx("button", { onClick: doResult, disabled: loading || !jobId, style: { ...btn, background: '#7c3aed' }, children: "\uD83D\uDCC4 Result" })] }), msg && _jsx("div", { style: { fontSize: 12, color: '#059669', background: '#f0fdf4', padding: 8, borderRadius: 4, marginBottom: 8 }, children: msg }), err && _jsx("div", { style: { fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap' }, children: err }), jobId && _jsxs("div", { style: { fontSize: 12, marginBottom: 8 }, children: [_jsx("strong", { children: "Job ID:" }), " ", jobId, " ", status && _jsxs("span", { style: { marginLeft: 10 }, children: [_jsx("strong", { children: "Status:" }), " ", status] })] }), result && (_jsxs(_Fragment, { children: [_jsx("h3", { style: { fontSize: 13, margin: '10px 0 4px' }, children: "Result" }), _jsx("pre", { style: { fontSize: 11, background: '#1a202c', color: '#e2e8f0', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }, children: JSON.stringify(result, null, 2) })] })), preview && (_jsxs(_Fragment, { children: [_jsx("h3", { style: { fontSize: 13, margin: '10px 0 4px' }, children: "Batch File Preview" }), _jsx("pre", { style: { fontSize: 11, background: '#f8fafc', border: '1px solid #e5e7eb', padding: 12, borderRadius: 6, maxHeight: 400, overflow: 'auto' }, children: JSON.stringify(preview, null, 2) })] }))] }));
}
export default BatchPanel;
