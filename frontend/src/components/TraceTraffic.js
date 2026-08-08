import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
const API = '/api/v1/trace';
// Styles
const styles = {
    container: {
        padding: '24px',
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        color: '#e0e0e0',
        backgroundColor: '#1a1a2e',
        minHeight: '100vh',
    },
    title: {
        fontSize: '24px',
        fontWeight: 600,
        marginBottom: '24px',
        color: '#ffffff',
        borderBottom: '2px solid #0f3460',
        paddingBottom: '12px',
    },
    section: {
        backgroundColor: '#16213e',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        border: '1px solid #0f3460',
    },
    sectionHeader: {
        fontSize: '18px',
        fontWeight: 600,
        marginBottom: '16px',
        color: '#e94560',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    formRow: {
        display: 'flex',
        gap: '12px',
        marginBottom: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    label: {
        fontSize: '13px',
        color: '#a0a0b0',
        marginBottom: '4px',
        display: 'block',
    },
    input: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid #0f3460',
        backgroundColor: '#0d1b2a',
        color: '#e0e0e0',
        fontSize: '14px',
        outline: 'none',
        minWidth: '160px',
    },
    select: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid #0f3460',
        backgroundColor: '#0d1b2a',
        color: '#e0e0e0',
        fontSize: '14px',
        outline: 'none',
        minWidth: '140px',
    },
    button: {
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: '#e94560',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
        transition: 'background-color 0.2s',
    },
    buttonSecondary: {
        padding: '8px 16px',
        borderRadius: '4px',
        border: '1px solid #0f3460',
        backgroundColor: '#0f3460',
        color: '#e0e0e0',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    buttonDanger: {
        padding: '6px 12px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: '#c0392b',
        color: '#ffffff',
        fontSize: '13px',
        cursor: 'pointer',
    },
    buttonSuccess: {
        padding: '8px 16px',
        borderRadius: '4px',
        border: 'none',
        backgroundColor: '#27ae60',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    statusBadge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 500,
    },
    traceCard: {
        backgroundColor: '#0d1b2a',
        borderRadius: '6px',
        padding: '12px 16px',
        marginBottom: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px solid #0f3460',
    },
    resultArea: {
        backgroundColor: '#0d1b2a',
        borderRadius: '6px',
        padding: '16px',
        marginTop: '12px',
        border: '1px solid #0f3460',
        maxHeight: '400px',
        overflow: 'auto',
        fontFamily: 'monospace',
        fontSize: '13px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
    },
    error: {
        color: '#e74c3c',
        fontSize: '13px',
        marginTop: '8px',
    },
    loading: {
        color: '#3498db',
        fontSize: '13px',
        fontStyle: 'italic',
    },
    fieldGroup: {
        display: 'flex',
        flexDirection: 'column',
    },
    progressStep: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 0',
        fontSize: '14px',
    },
};
// Helper
const downloadJson = (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};
const StatusDot = ({ ok, label }) => (_jsxs("span", { style: { ...styles.statusBadge, backgroundColor: ok ? '#1e4d2b' : '#4d1e1e', color: ok ? '#2ecc71' : '#e74c3c' }, children: [_jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', backgroundColor: ok ? '#2ecc71' : '#e74c3c', display: 'inline-block' } }), label] }));
export const TraceTraffic = () => {
    // Setup state
    const [setupOpen, setSetupOpen] = useState(true);
    const [status, setStatus] = useState({ bamctlExists: false, loggedIn: false, trafficConfigured: false });
    const [oamDomain, setOamDomain] = useState('');
    const [loginUser, setLoginUser] = useState('');
    const [loginPass, setLoginPass] = useState('');
    const [iamUrl, setIamUrl] = useState('');
    // Trace state
    const [criteriaType, setCriteriaType] = useState('MSISDN');
    const [criteriaValue, setCriteriaValue] = useState('');
    const [traceInterface, setTraceInterface] = useState('CHA-ALL');
    const [traceLevel, setTraceLevel] = useState(1);
    const [traceJobs, setTraceJobs] = useState([]);
    const [traceResult, setTraceResult] = useState(null);
    const [selectedTraceId, setSelectedTraceId] = useState('');
    // Traffic state
    const [chfFqdn, setChfFqdn] = useState('');
    const [chfPort, setChfPort] = useState('');
    const [pcfFqdn, setPcfFqdn] = useState('');
    const [pcfPort, setPcfPort] = useState('');
    const [certPath, setCertPath] = useState('');
    const [keyPath, setKeyPath] = useState('');
    const [caPath, setCaPath] = useState('');
    const [trafficProtocol, setTrafficProtocol] = useState('CHF');
    const [tMsisdn, setTMsisdn] = useState('');
    const [tImsi, setTImsi] = useState('');
    const [tRatingGroup, setTRatingGroup] = useState('');
    const [tRequestedUnits, setTRequestedUnits] = useState('');
    const [tDnn, setTDnn] = useState('');
    const [tSliceSst, setTSliceSst] = useState('');
    const [trafficResults, setTrafficResults] = useState([]);
    const [chargingDataRef, setChargingDataRef] = useState('');
    const [policyId, setPolicyId] = useState('');
    // Workflow state
    const [wfMsisdn, setWfMsisdn] = useState('');
    const [wfCustomerId, setWfCustomerId] = useState('');
    const [wfTrafficType, setWfTrafficType] = useState('CHF');
    const [wfRatingGroup, setWfRatingGroup] = useState('');
    const [wfRequestedUnits, setWfRequestedUnits] = useState('');
    const [workflowSteps, setWorkflowSteps] = useState([]);
    const [workflowResult, setWorkflowResult] = useState(null);
    // General state
    const [loading, setLoading] = useState('');
    const [error, setError] = useState('');
    // Fetch status on mount
    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API}/status`);
            if (res.ok)
                setStatus(await res.json());
        }
        catch { /* silent */ }
    }, []);
    const fetchJobs = useCallback(async () => {
        try {
            const res = await fetch(`${API}/jobs`);
            if (res.ok)
                setTraceJobs(await res.json());
        }
        catch { /* silent */ }
    }, []);
    useEffect(() => {
        fetchStatus();
        fetchJobs();
    }, [fetchStatus, fetchJobs]);
    // API helpers
    const apiPost = async (path, body) => {
        const res = await fetch(`${API}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(errData.message || errData.error || `Request failed (${res.status})`);
        }
        return res.json();
    };
    const apiGet = async (path) => {
        const res = await fetch(`${API}${path}`);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(errData.message || errData.error || `Request failed (${res.status})`);
        }
        return res.json();
    };
    const apiDelete = async (path) => {
        const res = await fetch(`${API}${path}`, { method: 'DELETE' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({ message: res.statusText }));
            throw new Error(errData.message || errData.error || `Request failed (${res.status})`);
        }
        return res.json();
    };
    // Setup handlers
    const handleDownload = async () => {
        setError('');
        setLoading('download');
        try {
            await apiPost('/setup/download', { oam_domain: oamDomain });
            await fetchStatus();
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    const handleLogin = async () => {
        setError('');
        setLoading('login');
        try {
            await apiPost('/setup/login', { username: loginUser, password: loginPass, iam_url: iamUrl });
            await fetchStatus();
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    // Trace handlers
    const handleCreateTrace = async () => {
        setError('');
        setLoading('createTrace');
        try {
            await apiPost('/jobs/create', { criteriaType, criteriaValue, interface: traceInterface, traceLevel });
            await fetchJobs();
            setCriteriaValue('');
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    const handleGetResult = async (traceId) => {
        setError('');
        setLoading(`result-${traceId}`);
        try {
            const data = await apiGet(`/jobs/${traceId}/result`);
            setTraceResult(data);
            setSelectedTraceId(traceId);
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    const handleDeleteTrace = async (traceId) => {
        setError('');
        setLoading(`delete-${traceId}`);
        try {
            await apiDelete(`/jobs/${traceId}`);
            await fetchJobs();
            if (selectedTraceId === traceId) {
                setTraceResult(null);
                setSelectedTraceId('');
            }
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    // Traffic handlers
    const handleSaveTrafficConfig = async () => {
        setError('');
        setLoading('trafficConfig');
        try {
            await apiPost('/traffic/configure', { chf_fqdn: chfFqdn, chf_port: parseInt(chfPort), pcf_fqdn: pcfFqdn, pcf_port: parseInt(pcfPort), cert_path: certPath, key_path: keyPath, ca_path: caPath });
            await fetchStatus();
        }
        catch (e) {
            setError(e.message);
        }
        setLoading('');
    };
    const handleChfCreate = async () => {
        setError('');
        setLoading('chfCreate');
        try {
            const data = await apiPost('/traffic/chf/create', { msisdn: tMsisdn, imsi: tImsi, ratingGroup: parseInt(tRatingGroup), requestedUnits: parseInt(tRequestedUnits) });
            setChargingDataRef(data.chargingDataRef || '');
            setTrafficResults(prev => [...prev, { step: 'CHF Create', success: true, data }]);
        }
        catch (e) {
            setError(e.message);
            setTrafficResults(prev => [...prev, { step: 'CHF Create', success: false, data: e.message }]);
        }
        setLoading('');
    };
    const handleChfUpdate = async () => {
        setError('');
        setLoading('chfUpdate');
        try {
            const data = await apiPost('/traffic/chf/update', { chargingDataRef, msisdn: tMsisdn, usedUnits: parseInt(tRequestedUnits), requestedUnits: parseInt(tRequestedUnits) });
            setTrafficResults(prev => [...prev, { step: 'CHF Update', success: true, data }]);
        }
        catch (e) {
            setError(e.message);
            setTrafficResults(prev => [...prev, { step: 'CHF Update', success: false, data: e.message }]);
        }
        setLoading('');
    };
    const handleChfRelease = async () => {
        setError('');
        setLoading('chfRelease');
        try {
            const data = await apiPost('/traffic/chf/release', { chargingDataRef, msisdn: tMsisdn, usedUnits: parseInt(tRequestedUnits) });
            setChargingDataRef('');
            setTrafficResults(prev => [...prev, { step: 'CHF Release', success: true, data }]);
        }
        catch (e) {
            setError(e.message);
            setTrafficResults(prev => [...prev, { step: 'CHF Release', success: false, data: e.message }]);
        }
        setLoading('');
    };
    const handlePcfCreate = async () => {
        setError('');
        setLoading('pcfCreate');
        try {
            const data = await apiPost('/traffic/pcf/create', { msisdn: tMsisdn, imsi: tImsi, dnn: tDnn });
            setPolicyId(data.policyId || '');
            setTrafficResults(prev => [...prev, { step: 'PCF Create', success: true, data }]);
        }
        catch (e) {
            setError(e.message);
            setTrafficResults(prev => [...prev, { step: 'PCF Create', success: false, data: e.message }]);
        }
        setLoading('');
    };
    const handlePcfDelete = async () => {
        setError('');
        setLoading('pcfDelete');
        try {
            const data = await apiPost('/traffic/pcf/delete', { policyId });
            setPolicyId('');
            setTrafficResults(prev => [...prev, { step: 'PCF Delete', success: true, data }]);
        }
        catch (e) {
            setError(e.message);
            setTrafficResults(prev => [...prev, { step: 'PCF Delete', success: false, data: e.message }]);
        }
        setLoading('');
    };
    // Workflow handler
    const handleRunWorkflow = async () => {
        setError('');
        setWorkflowResult(null);
        const steps = [
            { label: 'Setting up trace...', status: 'pending' },
            { label: 'Sending traffic...', status: 'pending' },
            { label: 'Collecting trace result...', status: 'pending' },
            { label: 'Cleaning up...', status: 'pending' },
        ];
        setWorkflowSteps(steps);
        setLoading('workflow');
        try {
            // Update step 1
            steps[0].status = 'running';
            setWorkflowSteps([...steps]);
            const data = await apiPost('/workflow/run', {
                msisdn: wfMsisdn,
                customerId: wfCustomerId,
                trafficType: wfTrafficType,
                ratingGroup: wfRatingGroup ? parseInt(wfRatingGroup) : undefined,
                requestedUnits: wfRequestedUnits ? parseInt(wfRequestedUnits) : undefined,
            });
            // Mark all done
            steps.forEach(s => s.status = 'done');
            setWorkflowSteps([...steps]);
            setWorkflowResult(data);
        }
        catch (e) {
            const runningIdx = steps.findIndex(s => s.status === 'running');
            if (runningIdx >= 0)
                steps[runningIdx].status = 'error';
            else
                steps[0].status = 'error';
            setWorkflowSteps([...steps]);
            setError(e.message);
        }
        setLoading('');
    };
    // RENDER
    return (_jsxs("div", { style: styles.container, children: [_jsx("h1", { style: styles.title, children: "\uD83D\uDD0D Trace & Traffic" }), error && _jsxs("div", { style: { ...styles.error, marginBottom: 12, padding: '10px 14px', backgroundColor: '#2c1010', borderRadius: 6, border: '1px solid #e74c3c' }, children: ["\u26A0\uFE0F ", error] }), _jsxs("div", { style: styles.section, children: [_jsxs("div", { style: styles.sectionHeader, onClick: () => setSetupOpen(!setupOpen), children: [_jsx("span", { children: "\u2699\uFE0F Setup" }), _jsx("span", { style: { fontSize: 14 }, children: setupOpen ? '▼' : '▶' })] }), setupOpen && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { ...styles.formRow, marginBottom: 16 }, children: [_jsx(StatusDot, { ok: status.bamctlExists, label: "bamctl" }), _jsx(StatusDot, { ok: status.loggedIn, label: "Logged In" }), _jsx(StatusDot, { ok: status.trafficConfigured, label: "Traffic Configured" })] }), _jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Download bamctl" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "OAM Domain" }), _jsx("input", { style: styles.input, value: oamDomain, onChange: e => setOamDomain(e.target.value), placeholder: "oam.example.com" })] }), _jsx("button", { style: styles.button, onClick: handleDownload, disabled: loading === 'download' || !oamDomain, children: loading === 'download' ? '⏳ Downloading...' : '⬇️ Download' })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Login" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Username" }), _jsx("input", { style: styles.input, value: loginUser, onChange: e => setLoginUser(e.target.value), placeholder: "admin" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Password" }), _jsx("input", { style: { ...styles.input }, type: "password", value: loginPass, onChange: e => setLoginPass(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "IAM URL" }), _jsx("input", { style: { ...styles.input, minWidth: 220 }, value: iamUrl, onChange: e => setIamUrl(e.target.value), placeholder: "https://iam.example.com" })] }), _jsx("button", { style: styles.button, onClick: handleLogin, disabled: loading === 'login' || !loginUser || !loginPass || !iamUrl, children: loading === 'login' ? '⏳ Logging in...' : '🔑 Login' })] })] })] }))] }), _jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionHeader, children: _jsx("span", { children: "\uD83D\uDCCB Trace Management" }) }), _jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Create Trace" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Criteria Type" }), _jsxs("select", { style: styles.select, value: criteriaType, onChange: e => setCriteriaType(e.target.value), children: [_jsx("option", { value: "CustomerId", children: "CustomerId" }), _jsx("option", { value: "MSISDN", children: "MSISDN" }), _jsx("option", { value: "IMSI", children: "IMSI" })] })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Criteria Value" }), _jsx("input", { style: styles.input, value: criteriaValue, onChange: e => setCriteriaValue(e.target.value), placeholder: "e.g. 886912345678" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Interface" }), _jsxs("select", { style: styles.select, value: traceInterface, onChange: e => setTraceInterface(e.target.value), children: [_jsx("option", { value: "CHA-ALL", children: "CHA-ALL" }), _jsx("option", { value: "CPM-ALL", children: "CPM-ALL" }), _jsx("option", { value: "BAE-ALL", children: "BAE-ALL" })] })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Trace Level" }), _jsxs("select", { style: styles.select, value: traceLevel, onChange: e => setTraceLevel(Number(e.target.value)), children: [_jsx("option", { value: 1, children: "1" }), _jsx("option", { value: 2, children: "2" })] })] }), _jsx("button", { style: styles.button, onClick: handleCreateTrace, disabled: loading === 'createTrace' || !criteriaValue, children: loading === 'createTrace' ? '⏳ Creating...' : '➕ Create' })] })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsxs("span", { style: { fontSize: 14, fontWeight: 500, color: '#ccc' }, children: ["Active Traces (", traceJobs.length, ")"] }), _jsx("button", { style: styles.buttonSecondary, onClick: fetchJobs, children: "\uD83D\uDD04 Refresh" })] }), traceJobs.length === 0 && _jsx("div", { style: { color: '#666', fontSize: 13 }, children: "No active traces" }), traceJobs.map(job => (_jsxs("div", { style: styles.traceCard, children: [_jsxs("div", { children: [_jsx("span", { style: { fontWeight: 500, color: '#e0e0e0' }, children: job.traceId }), _jsxs("span", { style: { marginLeft: 12, fontSize: 12, color: '#888' }, children: [job.criteriaType, ": ", job.criteriaValue] })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { style: styles.buttonSecondary, onClick: () => handleGetResult(job.traceId), disabled: loading === `result-${job.traceId}`, children: loading === `result-${job.traceId}` ? '⏳' : '📄 Get Result' }), _jsx("button", { style: styles.buttonDanger, onClick: () => handleDeleteTrace(job.traceId), disabled: loading === `delete-${job.traceId}`, children: loading === `delete-${job.traceId}` ? '⏳' : '🗑️ Delete' })] })] }, job.traceId)))] }), traceResult && (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsxs("span", { style: { fontSize: 14, fontWeight: 500, color: '#ccc' }, children: ["Trace Result: ", selectedTraceId] }), _jsx("button", { style: styles.buttonSuccess, onClick: () => downloadJson(traceResult, `trace_${selectedTraceId}.json`), children: "\u2B07\uFE0F Download JSON" })] }), _jsx("div", { style: styles.resultArea, children: JSON.stringify(traceResult, null, 2) })] }))] }), _jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionHeader, children: _jsx("span", { children: "\uD83D\uDE80 Traffic Generator" }) }), _jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Configuration" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "CHF FQDN" }), _jsx("input", { style: styles.input, value: chfFqdn, onChange: e => setChfFqdn(e.target.value), placeholder: "chf.example.com" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "CHF Port" }), _jsx("input", { style: { ...styles.input, minWidth: 80 }, value: chfPort, onChange: e => setChfPort(e.target.value), placeholder: "443" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "PCF FQDN" }), _jsx("input", { style: styles.input, value: pcfFqdn, onChange: e => setPcfFqdn(e.target.value), placeholder: "pcf.example.com" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "PCF Port" }), _jsx("input", { style: { ...styles.input, minWidth: 80 }, value: pcfPort, onChange: e => setPcfPort(e.target.value), placeholder: "443" })] })] }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Cert Path" }), _jsx("input", { style: { ...styles.input, minWidth: 200 }, value: certPath, onChange: e => setCertPath(e.target.value), placeholder: "/path/to/cert.pem" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Key Path" }), _jsx("input", { style: { ...styles.input, minWidth: 200 }, value: keyPath, onChange: e => setKeyPath(e.target.value), placeholder: "/path/to/key.pem" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "CA Path" }), _jsx("input", { style: { ...styles.input, minWidth: 200 }, value: caPath, onChange: e => setCaPath(e.target.value), placeholder: "/path/to/ca.pem" })] }), _jsx("button", { style: styles.buttonSuccess, onClick: handleSaveTrafficConfig, disabled: loading === 'trafficConfig', children: loading === 'trafficConfig' ? '⏳ Saving...' : '💾 Save Config' })] })] }), _jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Send Traffic" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Protocol" }), _jsxs("select", { style: styles.select, value: trafficProtocol, onChange: e => setTrafficProtocol(e.target.value), children: [_jsx("option", { value: "CHF", children: "CHF (N28)" }), _jsx("option", { value: "PCF", children: "PCF (N40)" })] })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "MSISDN" }), _jsx("input", { style: styles.input, value: tMsisdn, onChange: e => setTMsisdn(e.target.value), placeholder: "886912345678" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "IMSI" }), _jsx("input", { style: styles.input, value: tImsi, onChange: e => setTImsi(e.target.value), placeholder: "466920123456789" })] }), trafficProtocol === 'CHF' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Rating Group" }), _jsx("input", { style: { ...styles.input, minWidth: 100 }, value: tRatingGroup, onChange: e => setTRatingGroup(e.target.value), placeholder: "1" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Requested Units" }), _jsx("input", { style: { ...styles.input, minWidth: 100 }, value: tRequestedUnits, onChange: e => setTRequestedUnits(e.target.value), placeholder: "1000" })] })] })), trafficProtocol === 'PCF' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "DNN" }), _jsx("input", { style: { ...styles.input, minWidth: 100 }, value: tDnn, onChange: e => setTDnn(e.target.value), placeholder: "internet" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Slice SST" }), _jsx("input", { style: { ...styles.input, minWidth: 80 }, value: tSliceSst, onChange: e => setTSliceSst(e.target.value), placeholder: "1" })] })] }))] }), _jsxs("div", { style: { ...styles.formRow, marginTop: 12 }, children: [trafficProtocol === 'CHF' ? (_jsxs(_Fragment, { children: [_jsx("button", { style: styles.button, onClick: handleChfCreate, disabled: !!loading || !tMsisdn, children: loading === 'chfCreate' ? '⏳' : '1️⃣ CHF Create' }), _jsx("button", { style: styles.buttonSecondary, onClick: handleChfUpdate, disabled: !!loading || !chargingDataRef, children: loading === 'chfUpdate' ? '⏳' : '2️⃣ CHF Update' }), _jsx("button", { style: styles.buttonSecondary, onClick: handleChfRelease, disabled: !!loading || !chargingDataRef, children: loading === 'chfRelease' ? '⏳' : '3️⃣ CHF Release' }), chargingDataRef && _jsxs("span", { style: { fontSize: 12, color: '#888' }, children: ["Ref: ", chargingDataRef] })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { style: styles.button, onClick: handlePcfCreate, disabled: !!loading || !tMsisdn, children: loading === 'pcfCreate' ? '⏳' : '1️⃣ PCF Create' }), _jsx("button", { style: styles.buttonDanger, onClick: handlePcfDelete, disabled: !!loading || !policyId, children: loading === 'pcfDelete' ? '⏳' : '2️⃣ PCF Delete' }), policyId && _jsxs("span", { style: { fontSize: 12, color: '#888' }, children: ["Policy: ", policyId] })] })), trafficResults.length > 0 && (_jsx("button", { style: { ...styles.buttonSecondary, marginLeft: 'auto' }, onClick: () => setTrafficResults([]), children: "\uD83E\uDDF9 Clear Results" }))] })] }), trafficResults.length > 0 && (_jsxs("div", { children: [_jsx("div", { style: { fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }, children: "Results" }), trafficResults.map((r, i) => (_jsx("div", { style: { ...styles.traceCard, borderLeftColor: r.success ? '#27ae60' : '#e74c3c', borderLeftWidth: 3 }, children: _jsxs("div", { children: [_jsxs("span", { style: { fontWeight: 500, color: r.success ? '#2ecc71' : '#e74c3c' }, children: [r.success ? '✅' : '❌', " ", r.step] }), _jsx("div", { style: { fontSize: 12, color: '#888', marginTop: 4, maxWidth: 600, overflow: 'hidden', textOverflow: 'ellipsis' }, children: typeof r.data === 'string' ? r.data : JSON.stringify(r.data).substring(0, 120) })] }) }, i)))] }))] }), _jsxs("div", { style: styles.section, children: [_jsx("div", { style: styles.sectionHeader, children: _jsx("span", { children: "\u26A1 Full Workflow" }) }), _jsx("p", { style: { fontSize: 13, color: '#888', marginBottom: 16 }, children: "One-click: Set trace \u2192 Send traffic \u2192 Collect result \u2192 Download \u2192 Cleanup" }), _jsxs("div", { style: styles.formRow, children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "MSISDN" }), _jsx("input", { style: styles.input, value: wfMsisdn, onChange: e => setWfMsisdn(e.target.value), placeholder: "886912345678" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Customer ID" }), _jsx("input", { style: styles.input, value: wfCustomerId, onChange: e => setWfCustomerId(e.target.value), placeholder: "optional" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Traffic Type" }), _jsxs("select", { style: styles.select, value: wfTrafficType, onChange: e => setWfTrafficType(e.target.value), children: [_jsx("option", { value: "CHF", children: "CHF (N28)" }), _jsx("option", { value: "PCF", children: "PCF (N40)" })] })] }), wfTrafficType === 'CHF' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Rating Group" }), _jsx("input", { style: { ...styles.input, minWidth: 80 }, value: wfRatingGroup, onChange: e => setWfRatingGroup(e.target.value), placeholder: "1" })] }), _jsxs("div", { style: styles.fieldGroup, children: [_jsx("label", { style: styles.label, children: "Requested Units" }), _jsx("input", { style: { ...styles.input, minWidth: 100 }, value: wfRequestedUnits, onChange: e => setWfRequestedUnits(e.target.value), placeholder: "1000" })] })] })), _jsx("button", { style: { ...styles.button, padding: '10px 24px', fontSize: 15 }, onClick: handleRunWorkflow, disabled: loading === 'workflow' || !wfMsisdn, children: loading === 'workflow' ? '⏳ Running...' : '▶️ Run Workflow' })] }), workflowSteps.length > 0 && (_jsx("div", { style: { marginTop: 16, padding: '12px 16px', backgroundColor: '#0d1b2a', borderRadius: 6, border: '1px solid #0f3460' }, children: workflowSteps.map((step, i) => (_jsxs("div", { style: styles.progressStep, children: [_jsxs("span", { style: { fontSize: 16 }, children: [step.status === 'pending' && '⬜', step.status === 'running' && '🔄', step.status === 'done' && '✅', step.status === 'error' && '❌'] }), _jsx("span", { style: { color: step.status === 'done' ? '#2ecc71' : step.status === 'error' ? '#e74c3c' : step.status === 'running' ? '#3498db' : '#888' }, children: step.label })] }, i))) })), workflowResult && (_jsxs("div", { style: { marginTop: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsx("span", { style: { fontSize: 14, fontWeight: 500, color: '#ccc' }, children: "Workflow Result" }), _jsx("button", { style: styles.buttonSuccess, onClick: () => downloadJson(workflowResult, `workflow_result_${wfMsisdn}.json`), children: "\u2B07\uFE0F Download Result" })] }), _jsx("div", { style: styles.resultArea, children: JSON.stringify(workflowResult, null, 2) })] }))] })] }));
};
export default TraceTraffic;
