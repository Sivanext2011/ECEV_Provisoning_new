import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useState, useEffect } from 'react';
const API = '/api/v1';
function CertUpload({ value, onChange, name }) {
    const [uploading, setUploading] = useState(false);
    const upload = async (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('name', name);
        try {
            const r = await fetch(`${API}/certs/upload`, { method: 'POST', body: formData });
            if (!r.ok)
                throw new Error('Upload failed');
            const data = await r.json();
            onChange(data.path);
        }
        catch (err) {
            alert('Failed to upload cert file');
        }
        setUploading(false);
    };
    return (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', width: '100%' }, children: [_jsx("input", { style: { flex: 1 }, placeholder: "Path to cert/key file", value: value, onChange: e => onChange(e.target.value) }), _jsxs("label", { style: { cursor: 'pointer', padding: '4px 8px', background: '#eee', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }, children: [uploading ? '...' : '📁 Browse', _jsx("input", { type: "file", accept: ".crt,.pem,.key,.cer", style: { display: 'none' }, onChange: upload })] })] }));
}
function FqdnRow({ label, fqdn, onFqdn, tls, onTls, certNames }) {
    const [open, setOpen] = React.useState(false);
    return (_jsxs("div", { style: { borderBottom: '1px solid #eee', paddingBottom: 8 }, children: [_jsxs("label", { style: { fontSize: 13 }, children: [label, _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1 }, value: fqdn, onChange: e => onFqdn(e.target.value), placeholder: `https://...` }), tls && onTls && (_jsx("button", { type: "button", style: { fontSize: 11, padding: '3px 8px', background: open ? '#dbeafe' : '#eee', borderRadius: 4, whiteSpace: 'nowrap' }, onClick: () => setOpen(o => !o), children: "\uD83D\uDD12 TLS" }))] })] }), tls && onTls && open && (_jsxs("div", { style: { marginTop: 6, paddingLeft: 8, display: 'grid', gap: 6, borderLeft: '3px solid #93c5fd' }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }, children: [_jsx("input", { type: "checkbox", checked: tls.ssl_verify, onChange: e => onTls('ssl_verify', e.target.checked) }), "Verify SSL"] }), _jsxs("label", { style: { fontSize: 12 }, children: ["CA Cert", _jsx(CertUpload, { value: tls.ca_cert_path, onChange: v => onTls('ca_cert_path', v), name: certNames?.ca || 'ca' })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Client Cert", _jsx(CertUpload, { value: tls.client_cert_path, onChange: v => onTls('client_cert_path', v), name: certNames?.cert || 'client_cert' })] }), _jsxs("label", { style: { fontSize: 12 }, children: ["Client Key", _jsx(CertUpload, { value: tls.client_key_path, onChange: v => onTls('client_key_path', v), name: certNames?.key || 'client_key' })] })] }))] }));
}
export function SettingsPanel() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [loadError, setLoadError] = useState('');
    const load = async () => {
        setLoadError('');
        try {
            const r = await fetch(`${API}/settings`);
            if (!r.ok)
                throw new Error(`HTTP ${r.status}`);
            setConfig(await r.json());
        }
        catch (e) {
            setLoadError(`Failed to load settings: ${e.message}`);
        }
    };
    const save = async () => {
        setLoading(true);
        setMsg('');
        try {
            const r = await fetch(`${API}/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
            if (!r.ok)
                throw new Error((await r.json()).detail);
            setMsg('Saved!');
        }
        catch (e) {
            setMsg(`Error: ${e.message}`);
        }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);
    if (loadError)
        return _jsx("p", { style: { color: 'red' }, children: loadError });
    if (!config)
        return _jsx("p", { children: "Loading config..." });
    const updateEnv = (k, v) => setConfig({ ...config, environment: { ...config.environment, [k]: v } });
    const updateAuth = (k, v) => setConfig({ ...config, auth: { ...config.auth, [k]: v } });
    const updateTls = (k, v) => setConfig({ ...config, tls: { ...config.tls, [k]: v } });
    const updateCatalogTls = (k, v) => setConfig({ ...config, rmca_catalog_tls: { ...config.rmca_catalog_tls, [k]: v } });
    const updateNet = (k, v) => setConfig({ ...config, network: { ...config.network, [k]: v } });
    const mainTlsFqdns = ['ROOT_BAE', 'ROOT_RMCA', 'ROOT_CPM', 'ROOT_CPM_INTERNAL', 'ROOT_CPM_BATCH'];
    const otherEnvKeys = Object.keys(config.environment || {}).filter(k => !mainTlsFqdns.includes(k) && k !== 'ROOT_RMCA_CATALOG' && k !== 'ROOT_SEC');
    return (_jsxs("div", { children: [_jsx("h2", { children: "Settings" }), _jsxs("div", { style: { display: 'grid', gap: 16, maxWidth: 600 }, children: [_jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "Token FQDN (Keycloak)" }) }), _jsxs("div", { style: { display: 'grid', gap: 8 }, children: [_jsx(FqdnRow, { label: "Token FQDN (ROOT_SEC)", fqdn: config.environment?.ROOT_SEC || '', onFqdn: v => updateEnv('ROOT_SEC', v) }), _jsxs("label", { style: { fontSize: 13 }, children: ["Token Endpoint Path", _jsx("input", { style: { width: '100%' }, value: config.auth?.token_endpoint || '', onChange: e => updateAuth('token_endpoint', e.target.value), placeholder: "https://<ROOT_SEC>/auth/realms/master/protocol/openid-connect/token" })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Username", _jsx("input", { style: { width: '100%' }, value: config.auth?.username || '', onChange: e => updateAuth('username', e.target.value) })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Password", _jsx("input", { style: { width: '100%' }, type: "password", value: config.auth?.password || '', onChange: e => updateAuth('password', e.target.value) })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Client ID", _jsx("input", { style: { width: '100%' }, value: config.auth?.client_id || '', onChange: e => updateAuth('client_id', e.target.value) })] })] })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "BAE / RMCA FQDNs" }) }), _jsx("p", { style: { fontSize: 12, color: '#666', margin: '0 0 8px' }, children: "Click \uD83D\uDD12 TLS to configure certificates per endpoint." }), _jsxs("div", { style: { display: 'grid', gap: 10 }, children: [mainTlsFqdns.map(k => (_jsx(FqdnRow, { label: k, fqdn: config.environment?.[k] || '', onFqdn: v => updateEnv(k, v), tls: config.tls, onTls: updateTls, certNames: { ca: 'ca', cert: 'client_cert', key: 'client_key' } }, k))), _jsx(FqdnRow, { label: "ROOT_RMCA_CATALOG", fqdn: config.environment?.ROOT_RMCA_CATALOG || '', onFqdn: v => updateEnv('ROOT_RMCA_CATALOG', v), tls: config.rmca_catalog_tls, onTls: updateCatalogTls, certNames: { ca: 'rmca_ca', cert: 'rmca_cert', key: 'rmca_key' } }), otherEnvKeys.map(k => (_jsx(FqdnRow, { label: k, fqdn: config.environment?.[k] || '', onFqdn: v => updateEnv(k, v) }, k)))] })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "Network" }) }), _jsxs("div", { style: { display: 'grid', gap: 8 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: config.network?.socks5_enabled || false, onChange: e => updateNet('socks5_enabled', e.target.checked) }), "Enable SOCKS5 Proxy"] }), _jsxs("label", { style: { fontSize: 13 }, children: ["SOCKS5 Proxy", _jsx("input", { style: { width: '100%' }, placeholder: "socks5://127.0.0.1:1080", value: config.network?.socks5_proxy || '', onChange: e => updateNet('socks5_proxy', e.target.value), disabled: !config.network?.socks5_enabled })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Timeout (s)", _jsx("input", { style: { width: '100%' }, type: "number", value: config.network?.timeout_seconds || 30, onChange: e => updateNet('timeout_seconds', Number(e.target.value)) })] })] })] }), _jsx("button", { onClick: save, disabled: loading, children: loading ? 'Saving...' : 'Save Configuration' }), msg && _jsx("p", { style: { color: msg.startsWith('Error') ? 'red' : 'green' }, children: msg })] })] }));
}
