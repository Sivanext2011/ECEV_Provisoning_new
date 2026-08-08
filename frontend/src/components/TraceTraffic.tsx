import React, { useState, useEffect, useCallback } from 'react';

const API = '/api/v1/trace';

// Types
interface TraceJob {
  traceId: string;
  criteriaType: string;
  criteriaValue: string;
  interface?: string;
  traceLevel?: number;
  status?: string;
}

interface StatusInfo {
  bamctlExists: boolean;
  loggedIn: boolean;
  trafficConfigured: boolean;
}

interface WorkflowStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  result?: string;
}

interface TrafficResult {
  step: string;
  success: boolean;
  data: any;
}

// Styles
const styles: Record<string, React.CSSProperties> = {
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
    flexWrap: 'wrap' as const,
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
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
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
    flexDirection: 'column' as const,
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
const downloadJson = (data: any, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const StatusDot: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span style={{ ...styles.statusBadge, backgroundColor: ok ? '#1e4d2b' : '#4d1e1e', color: ok ? '#2ecc71' : '#e74c3c' }}>
    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: ok ? '#2ecc71' : '#e74c3c', display: 'inline-block' }} />
    {label}
  </span>
);

export const TraceTraffic: React.FC = () => {
  // Setup state
  const [setupOpen, setSetupOpen] = useState(true);
  const [status, setStatus] = useState<StatusInfo>({ bamctlExists: false, loggedIn: false, trafficConfigured: false });
  const [oamDomain, setOamDomain] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [iamUrl, setIamUrl] = useState('');

  // Trace state
  const [criteriaType, setCriteriaType] = useState('MSISDN');
  const [criteriaValue, setCriteriaValue] = useState('');
  const [traceInterface, setTraceInterface] = useState('CHA-ALL');
  const [traceLevel, setTraceLevel] = useState<number>(1);
  const [traceJobs, setTraceJobs] = useState<TraceJob[]>([]);
  const [traceResult, setTraceResult] = useState<any>(null);
  const [selectedTraceId, setSelectedTraceId] = useState('');

  // Traffic state
  const [chfFqdn, setChfFqdn] = useState('');
  const [chfPort, setChfPort] = useState('');
  const [pcfFqdn, setPcfFqdn] = useState('');
  const [pcfPort, setPcfPort] = useState('');
  const [certPath, setCertPath] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [caPath, setCaPath] = useState('');
  const [trafficProtocol, setTrafficProtocol] = useState<'CHF' | 'PCF'>('CHF');
  const [tMsisdn, setTMsisdn] = useState('');
  const [tImsi, setTImsi] = useState('');
  const [tRatingGroup, setTRatingGroup] = useState('');
  const [tRequestedUnits, setTRequestedUnits] = useState('');
  const [tDnn, setTDnn] = useState('');
  const [tSliceSst, setTSliceSst] = useState('');
  const [trafficResults, setTrafficResults] = useState<TrafficResult[]>([]);
  const [chargingDataRef, setChargingDataRef] = useState('');
  const [policyId, setPolicyId] = useState('');

  // Workflow state
  const [wfMsisdn, setWfMsisdn] = useState('');
  const [wfCustomerId, setWfCustomerId] = useState('');
  const [wfTrafficType, setWfTrafficType] = useState<'CHF' | 'PCF'>('CHF');
  const [wfRatingGroup, setWfRatingGroup] = useState('');
  const [wfRequestedUnits, setWfRequestedUnits] = useState('');
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowResult, setWorkflowResult] = useState<any>(null);

  // General state
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  // Fetch status on mount
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`);
      if (res.ok) setStatus(await res.json());
    } catch { /* silent */ }
  }, []);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API}/jobs`);
      if (res.ok) {
        const data = await res.json();
        setTraceJobs(Array.isArray(data) ? data : []);
      }
    } catch { setTraceJobs([]); }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchJobs();
  }, [fetchStatus, fetchJobs]);

  // API helpers
  const apiPost = async (path: string, body: any) => {
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

  const apiGet = async (path: string) => {
    const res = await fetch(`${API}${path}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(errData.message || errData.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const apiDelete = async (path: string) => {
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
    } catch (e: any) { setError(e.message); }
    setLoading('');
  };

  const handleLogin = async () => {
    setError('');
    setLoading('login');
    try {
      await apiPost('/setup/login', { username: loginUser, password: loginPass, iam_url: iamUrl });
      await fetchStatus();
    } catch (e: any) { setError(e.message); }
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
    } catch (e: any) { setError(e.message); }
    setLoading('');
  };

  const handleGetResult = async (traceId: string) => {
    setError('');
    setLoading(`result-${traceId}`);
    try {
      const data = await apiGet(`/jobs/${traceId}/result`);
      setTraceResult(data);
      setSelectedTraceId(traceId);
    } catch (e: any) { setError(e.message); }
    setLoading('');
  };

  const handleDeleteTrace = async (traceId: string) => {
    setError('');
    setLoading(`delete-${traceId}`);
    try {
      await apiDelete(`/jobs/${traceId}`);
      await fetchJobs();
      if (selectedTraceId === traceId) { setTraceResult(null); setSelectedTraceId(''); }
    } catch (e: any) { setError(e.message); }
    setLoading('');
  };

  // Traffic handlers
  const handleSaveTrafficConfig = async () => {
    setError('');
    setLoading('trafficConfig');
    try {
      await apiPost('/traffic/configure', { chf_fqdn: chfFqdn, chf_port: parseInt(chfPort), pcf_fqdn: pcfFqdn, pcf_port: parseInt(pcfPort), cert_path: certPath, key_path: keyPath, ca_path: caPath });
      await fetchStatus();
    } catch (e: any) { setError(e.message); }
    setLoading('');
  };

  const handleChfCreate = async () => {
    setError('');
    setLoading('chfCreate');
    try {
      const data = await apiPost('/traffic/chf/create', { msisdn: tMsisdn, imsi: tImsi, ratingGroup: parseInt(tRatingGroup), requestedUnits: parseInt(tRequestedUnits) });
      setChargingDataRef(data.chargingDataRef || '');
      setTrafficResults(prev => [...prev, { step: 'CHF Create', success: true, data }]);
    } catch (e: any) { setError(e.message); setTrafficResults(prev => [...prev, { step: 'CHF Create', success: false, data: e.message }]); }
    setLoading('');
  };

  const handleChfUpdate = async () => {
    setError('');
    setLoading('chfUpdate');
    try {
      const data = await apiPost('/traffic/chf/update', { chargingDataRef, msisdn: tMsisdn, usedUnits: parseInt(tRequestedUnits), requestedUnits: parseInt(tRequestedUnits) });
      setTrafficResults(prev => [...prev, { step: 'CHF Update', success: true, data }]);
    } catch (e: any) { setError(e.message); setTrafficResults(prev => [...prev, { step: 'CHF Update', success: false, data: e.message }]); }
    setLoading('');
  };

  const handleChfRelease = async () => {
    setError('');
    setLoading('chfRelease');
    try {
      const data = await apiPost('/traffic/chf/release', { chargingDataRef, msisdn: tMsisdn, usedUnits: parseInt(tRequestedUnits) });
      setChargingDataRef('');
      setTrafficResults(prev => [...prev, { step: 'CHF Release', success: true, data }]);
    } catch (e: any) { setError(e.message); setTrafficResults(prev => [...prev, { step: 'CHF Release', success: false, data: e.message }]); }
    setLoading('');
  };

  const handlePcfCreate = async () => {
    setError('');
    setLoading('pcfCreate');
    try {
      const data = await apiPost('/traffic/pcf/create', { msisdn: tMsisdn, imsi: tImsi, dnn: tDnn });
      setPolicyId(data.policyId || '');
      setTrafficResults(prev => [...prev, { step: 'PCF Create', success: true, data }]);
    } catch (e: any) { setError(e.message); setTrafficResults(prev => [...prev, { step: 'PCF Create', success: false, data: e.message }]); }
    setLoading('');
  };

  const handlePcfDelete = async () => {
    setError('');
    setLoading('pcfDelete');
    try {
      const data = await apiPost('/traffic/pcf/delete', { policyId });
      setPolicyId('');
      setTrafficResults(prev => [...prev, { step: 'PCF Delete', success: true, data }]);
    } catch (e: any) { setError(e.message); setTrafficResults(prev => [...prev, { step: 'PCF Delete', success: false, data: e.message }]); }
    setLoading('');
  };

  // Workflow handler
  const handleRunWorkflow = async () => {
    setError('');
    setWorkflowResult(null);
    const steps: WorkflowStep[] = [
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
    } catch (e: any) {
      const runningIdx = steps.findIndex(s => s.status === 'running');
      if (runningIdx >= 0) steps[runningIdx].status = 'error';
      else steps[0].status = 'error';
      setWorkflowSteps([...steps]);
      setError(e.message);
    }
    setLoading('');
  };



  // RENDER
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🔍 Trace & Traffic</h1>

      {error && <div style={{ ...styles.error, marginBottom: 12, padding: '10px 14px', backgroundColor: '#2c1010', borderRadius: 6, border: '1px solid #e74c3c' }}>⚠️ {error}</div>}

      {/* SECTION 1: Setup */}
      <div style={styles.section}>
        <div style={styles.sectionHeader} onClick={() => setSetupOpen(!setupOpen)}>
          <span>⚙️ Setup</span>
          <span style={{ fontSize: 14 }}>{setupOpen ? '▼' : '▶'}</span>
        </div>

        {setupOpen && (
          <>
            {/* Status indicators */}
            <div style={{ ...styles.formRow, marginBottom: 16 }}>
              <StatusDot ok={status.bamctlExists} label="bamctl" />
              <StatusDot ok={status.loggedIn} label="Logged In" />
              <StatusDot ok={status.trafficConfigured} label="Traffic Configured" />
            </div>

            {/* Download bamctl */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Download bamctl</div>
              <div style={styles.formRow}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>OAM Domain</label>
                  <input style={styles.input} value={oamDomain} onChange={e => setOamDomain(e.target.value)} placeholder="oam.example.com" />
                </div>
                <button style={styles.button} onClick={handleDownload} disabled={loading === 'download' || !oamDomain}>
                  {loading === 'download' ? '⏳ Downloading...' : '⬇️ Download'}
                </button>
              </div>
            </div>

            {/* Login */}
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Login</div>
              <div style={styles.formRow}>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Username</label>
                  <input style={styles.input} value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="admin" />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Password</label>
                  <input style={{ ...styles.input }} type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••" />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>IAM URL</label>
                  <input style={{ ...styles.input, minWidth: 220 }} value={iamUrl} onChange={e => setIamUrl(e.target.value)} placeholder="https://iam.example.com" />
                </div>
                <button style={styles.button} onClick={handleLogin} disabled={loading === 'login' || !loginUser || !loginPass || !iamUrl}>
                  {loading === 'login' ? '⏳ Logging in...' : '🔑 Login'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* SECTION 2: Trace Management */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span>📋 Trace Management</span>
        </div>

        {/* Create Trace */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Create Trace</div>
          <div style={styles.formRow}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Criteria Type</label>
              <select style={styles.select} value={criteriaType} onChange={e => setCriteriaType(e.target.value)}>
                <option value="CustomerId">CustomerId</option>
                <option value="MSISDN">MSISDN</option>
                <option value="IMSI">IMSI</option>
              </select>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Criteria Value</label>
              <input style={styles.input} value={criteriaValue} onChange={e => setCriteriaValue(e.target.value)} placeholder="e.g. 886912345678" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Interface</label>
              <select style={styles.select} value={traceInterface} onChange={e => setTraceInterface(e.target.value)}>
                <option value="CHA-ALL">CHA-ALL</option>
                <option value="CPM-ALL">CPM-ALL</option>
                <option value="BAE-ALL">BAE-ALL</option>
              </select>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Trace Level</label>
              <select style={styles.select} value={traceLevel} onChange={e => setTraceLevel(Number(e.target.value))}>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </div>
            <button style={styles.button} onClick={handleCreateTrace} disabled={loading === 'createTrace' || !criteriaValue}>
              {loading === 'createTrace' ? '⏳ Creating...' : '➕ Create'}
            </button>
          </div>
        </div>

        {/* Active Traces */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>Active Traces ({traceJobs.length})</span>
            <button style={styles.buttonSecondary} onClick={fetchJobs}>🔄 Refresh</button>
          </div>
          {traceJobs.length === 0 && <div style={{ color: '#666', fontSize: 13 }}>No active traces</div>}
          {traceJobs.map(job => (
            <div key={job.traceId} style={styles.traceCard}>
              <div>
                <span style={{ fontWeight: 500, color: '#e0e0e0' }}>{job.traceId}</span>
                <span style={{ marginLeft: 12, fontSize: 12, color: '#888' }}>{job.criteriaType}: {job.criteriaValue}</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.buttonSecondary} onClick={() => handleGetResult(job.traceId)} disabled={loading === `result-${job.traceId}`}>
                  {loading === `result-${job.traceId}` ? '⏳' : '📄 Get Result'}
                </button>
                <button style={styles.buttonDanger} onClick={() => handleDeleteTrace(job.traceId)} disabled={loading === `delete-${job.traceId}`}>
                  {loading === `delete-${job.traceId}` ? '⏳' : '🗑️ Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Trace Result Display */}
        {traceResult && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>Trace Result: {selectedTraceId}</span>
              <button style={styles.buttonSuccess} onClick={() => downloadJson(traceResult, `trace_${selectedTraceId}.json`)}>
                ⬇️ Download JSON
              </button>
            </div>
            <div style={styles.resultArea}>{JSON.stringify(traceResult, null, 2)}</div>
          </div>
        )}
      </div>



      {/* SECTION 3: Traffic Generator */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span>🚀 Traffic Generator</span>
        </div>

        {/* Configure */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Configuration</div>
          <div style={styles.formRow}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>CHF FQDN</label>
              <input style={styles.input} value={chfFqdn} onChange={e => setChfFqdn(e.target.value)} placeholder="chf.example.com" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>CHF Port</label>
              <input style={{ ...styles.input, minWidth: 80 }} value={chfPort} onChange={e => setChfPort(e.target.value)} placeholder="443" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>PCF FQDN</label>
              <input style={styles.input} value={pcfFqdn} onChange={e => setPcfFqdn(e.target.value)} placeholder="pcf.example.com" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>PCF Port</label>
              <input style={{ ...styles.input, minWidth: 80 }} value={pcfPort} onChange={e => setPcfPort(e.target.value)} placeholder="443" />
            </div>
          </div>
          <div style={styles.formRow}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Cert Path</label>
              <input style={{ ...styles.input, minWidth: 200 }} value={certPath} onChange={e => setCertPath(e.target.value)} placeholder="/path/to/cert.pem" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Key Path</label>
              <input style={{ ...styles.input, minWidth: 200 }} value={keyPath} onChange={e => setKeyPath(e.target.value)} placeholder="/path/to/key.pem" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>CA Path</label>
              <input style={{ ...styles.input, minWidth: 200 }} value={caPath} onChange={e => setCaPath(e.target.value)} placeholder="/path/to/ca.pem" />
            </div>
            <button style={styles.buttonSuccess} onClick={handleSaveTrafficConfig} disabled={loading === 'trafficConfig'}>
              {loading === 'trafficConfig' ? '⏳ Saving...' : '💾 Save Config'}
            </button>
          </div>
        </div>

        {/* Send Traffic */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Send Traffic</div>
          <div style={styles.formRow}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Protocol</label>
              <select style={styles.select} value={trafficProtocol} onChange={e => setTrafficProtocol(e.target.value as 'CHF' | 'PCF')}>
                <option value="CHF">CHF (N28)</option>
                <option value="PCF">PCF (N40)</option>
              </select>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>MSISDN</label>
              <input style={styles.input} value={tMsisdn} onChange={e => setTMsisdn(e.target.value)} placeholder="886912345678" />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>IMSI</label>
              <input style={styles.input} value={tImsi} onChange={e => setTImsi(e.target.value)} placeholder="466920123456789" />
            </div>
            {trafficProtocol === 'CHF' && (
              <>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Rating Group</label>
                  <input style={{ ...styles.input, minWidth: 100 }} value={tRatingGroup} onChange={e => setTRatingGroup(e.target.value)} placeholder="1" />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Requested Units</label>
                  <input style={{ ...styles.input, minWidth: 100 }} value={tRequestedUnits} onChange={e => setTRequestedUnits(e.target.value)} placeholder="1000" />
                </div>
              </>
            )}
            {trafficProtocol === 'PCF' && (
              <>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>DNN</label>
                  <input style={{ ...styles.input, minWidth: 100 }} value={tDnn} onChange={e => setTDnn(e.target.value)} placeholder="internet" />
                </div>
                <div style={styles.fieldGroup}>
                  <label style={styles.label}>Slice SST</label>
                  <input style={{ ...styles.input, minWidth: 80 }} value={tSliceSst} onChange={e => setTSliceSst(e.target.value)} placeholder="1" />
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ ...styles.formRow, marginTop: 12 }}>
            {trafficProtocol === 'CHF' ? (
              <>
                <button style={styles.button} onClick={handleChfCreate} disabled={!!loading || !tMsisdn}>
                  {loading === 'chfCreate' ? '⏳' : '1️⃣ CHF Create'}
                </button>
                <button style={styles.buttonSecondary} onClick={handleChfUpdate} disabled={!!loading || !chargingDataRef}>
                  {loading === 'chfUpdate' ? '⏳' : '2️⃣ CHF Update'}
                </button>
                <button style={styles.buttonSecondary} onClick={handleChfRelease} disabled={!!loading || !chargingDataRef}>
                  {loading === 'chfRelease' ? '⏳' : '3️⃣ CHF Release'}
                </button>
                {chargingDataRef && <span style={{ fontSize: 12, color: '#888' }}>Ref: {chargingDataRef}</span>}
              </>
            ) : (
              <>
                <button style={styles.button} onClick={handlePcfCreate} disabled={!!loading || !tMsisdn}>
                  {loading === 'pcfCreate' ? '⏳' : '1️⃣ PCF Create'}
                </button>
                <button style={styles.buttonDanger} onClick={handlePcfDelete} disabled={!!loading || !policyId}>
                  {loading === 'pcfDelete' ? '⏳' : '2️⃣ PCF Delete'}
                </button>
                {policyId && <span style={{ fontSize: 12, color: '#888' }}>Policy: {policyId}</span>}
              </>
            )}
            {trafficResults.length > 0 && (
              <button style={{ ...styles.buttonSecondary, marginLeft: 'auto' }} onClick={() => setTrafficResults([])}>
                🧹 Clear Results
              </button>
            )}
          </div>
        </div>

        {/* Traffic Results */}
        {trafficResults.length > 0 && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#ccc' }}>Results</div>
            {trafficResults.map((r, i) => (
              <div key={i} style={{ ...styles.traceCard, borderLeftColor: r.success ? '#27ae60' : '#e74c3c', borderLeftWidth: 3 }}>
                <div>
                  <span style={{ fontWeight: 500, color: r.success ? '#2ecc71' : '#e74c3c' }}>{r.success ? '✅' : '❌'} {r.step}</span>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 4, maxWidth: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {typeof r.data === 'string' ? r.data : JSON.stringify(r.data).substring(0, 120)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>



      {/* SECTION 4: Full Workflow */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span>⚡ Full Workflow</span>
        </div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
          One-click: Set trace → Send traffic → Collect result → Download → Cleanup
        </p>

        <div style={styles.formRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>MSISDN</label>
            <input style={styles.input} value={wfMsisdn} onChange={e => setWfMsisdn(e.target.value)} placeholder="886912345678" />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Customer ID</label>
            <input style={styles.input} value={wfCustomerId} onChange={e => setWfCustomerId(e.target.value)} placeholder="optional" />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Traffic Type</label>
            <select style={styles.select} value={wfTrafficType} onChange={e => setWfTrafficType(e.target.value as 'CHF' | 'PCF')}>
              <option value="CHF">CHF (N28)</option>
              <option value="PCF">PCF (N40)</option>
            </select>
          </div>
          {wfTrafficType === 'CHF' && (
            <>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Rating Group</label>
                <input style={{ ...styles.input, minWidth: 80 }} value={wfRatingGroup} onChange={e => setWfRatingGroup(e.target.value)} placeholder="1" />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Requested Units</label>
                <input style={{ ...styles.input, minWidth: 100 }} value={wfRequestedUnits} onChange={e => setWfRequestedUnits(e.target.value)} placeholder="1000" />
              </div>
            </>
          )}
          <button style={{ ...styles.button, padding: '10px 24px', fontSize: 15 }} onClick={handleRunWorkflow} disabled={loading === 'workflow' || !wfMsisdn}>
            {loading === 'workflow' ? '⏳ Running...' : '▶️ Run Workflow'}
          </button>
        </div>

        {/* Progress Steps */}
        {workflowSteps.length > 0 && (
          <div style={{ marginTop: 16, padding: '12px 16px', backgroundColor: '#0d1b2a', borderRadius: 6, border: '1px solid #0f3460' }}>
            {workflowSteps.map((step, i) => (
              <div key={i} style={styles.progressStep}>
                <span style={{ fontSize: 16 }}>
                  {step.status === 'pending' && '⬜'}
                  {step.status === 'running' && '🔄'}
                  {step.status === 'done' && '✅'}
                  {step.status === 'error' && '❌'}
                </span>
                <span style={{ color: step.status === 'done' ? '#2ecc71' : step.status === 'error' ? '#e74c3c' : step.status === 'running' ? '#3498db' : '#888' }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Workflow Result */}
        {workflowResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: '#ccc' }}>Workflow Result</span>
              <button style={styles.buttonSuccess} onClick={() => downloadJson(workflowResult, `workflow_result_${wfMsisdn}.json`)}>
                ⬇️ Download Result
              </button>
            </div>
            <div style={styles.resultArea}>{JSON.stringify(workflowResult, null, 2)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TraceTraffic;
