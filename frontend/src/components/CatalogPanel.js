import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
const API = '/api/v1';
export function CatalogPanel() {
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [specs, setSpecs] = useState(null);
    const [error, setError] = useState('');
    const [fetching, setFetching] = useState(false);
    const [fetchResult, setFetchResult] = useState(null);
    const loadSpecs = () => {
        fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => { });
    };
    useEffect(() => { loadSpecs(); }, []);
    const upload = async (e) => {
        const file = e.target.files?.[0];
        if (!file)
            return;
        setUploading(true);
        setError('');
        setUploadResult(null);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const r = await fetch(`${API}/specs/upload`, { method: 'POST', body: formData });
            if (!r.ok)
                throw new Error((await r.json()).detail);
            setUploadResult(await r.json());
            loadSpecs();
        }
        catch (err) {
            setError(err.message);
        }
        setUploading(false);
    };
    const fetchFromBSSF = async () => {
        setFetching(true);
        setError('');
        setFetchResult(null);
        try {
            const r = await fetch(`${API}/specs/fetch`, { method: 'POST' });
            if (!r.ok)
                throw new Error((await r.json()).detail);
            const data = await r.json();
            setFetchResult(data);
            loadSpecs();
        }
        catch (err) {
            setError(err.message);
        }
        setFetching(false);
    };
    return (_jsxs("div", { children: [_jsx("h2", { children: "\uD83D\uDCE6 Catalog - RMCA Specs" }), _jsxs("fieldset", { style: { marginBottom: 16 }, children: [_jsx("legend", { children: _jsx("b", { children: "Fetch from Live BSSF" }) }), _jsx("p", { style: { fontSize: 13, color: '#666', margin: '0 0 8px' }, children: "Fetch all specifications directly from the connected BSSF system via Specification Enquiry API" }), _jsx("button", { onClick: fetchFromBSSF, disabled: fetching, children: fetching ? '⏳ Fetching...' : '🔄 Fetch from BSSF' }), fetchResult && (_jsxs("div", { style: { marginTop: 8, fontSize: 13 }, children: [_jsx("p", { style: { color: 'green', margin: '0 0 4px' }, children: "\u2713 Fetched from live BSSF:" }), _jsx("ul", { style: { margin: 0, paddingLeft: 20 }, children: fetchResult.counts
                                    ? Object.entries(fetchResult.counts).map(([k, v]) => _jsxs("li", { children: [k, ": ", v] }, k))
                                    : _jsxs(_Fragment, { children: [_jsxs("li", { children: ["Party specs: ", fetchResult.partySpecs] }), _jsxs("li", { children: ["Customer specs: ", fetchResult.customerSpecs] }), _jsxs("li", { children: ["Contract specs: ", fetchResult.contractSpecs] }), _jsxs("li", { children: ["Billing Account specs: ", fetchResult.billingAccountSpecs] }), _jsxs("li", { children: ["Product specs: ", fetchResult.productSpecs] }), _jsxs("li", { children: ["Product Offerings: ", fetchResult.productOfferings] }), _jsxs("li", { children: ["Contact Medium specs: ", fetchResult.contactMediumSpecs] })] }) }), fetchResult.errors && Object.keys(fetchResult.errors).length > 0 && (_jsxs("details", { style: { marginTop: 6 }, children: [_jsxs("summary", { style: { fontSize: 12, color: '#c60', cursor: 'pointer' }, children: ["\u26A0 ", Object.keys(fetchResult.errors).length, " endpoints failed"] }), _jsx("pre", { style: { fontSize: 11, background: '#fff8e1', padding: 8, marginTop: 4 }, children: JSON.stringify(fetchResult.errors, null, 2) })] }))] }))] }), _jsxs("fieldset", { style: { marginBottom: 16 }, children: [_jsx("legend", { children: _jsx("b", { children: "Upload BusinessConfig (Offline)" }) }), _jsx("p", { style: { fontSize: 13, color: '#666', margin: '0 0 8px' }, children: "Export from RMCA and upload the BusinessConfig .zip file" }), _jsx("input", { type: "file", accept: ".zip", onChange: upload, disabled: uploading }), uploading && _jsx("p", { children: "Parsing..." }), error && _jsx("p", { style: { color: 'red' }, children: error }), uploadResult && _jsxs("p", { style: { color: 'green' }, children: ["\u2713 Parsed: ", uploadResult.partySpecs, " party specs, ", uploadResult.customerSpecs, " customer specs, ", uploadResult.contractSpecs, " contract specs, ", uploadResult.productOfferings, " product offerings"] })] }), specs && (_jsxs("div", { children: [_jsx("h3", { children: "Loaded Specifications" }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#eee', textAlign: 'left' }, children: [_jsx("th", { style: { padding: 6 }, children: "Type" }), _jsx("th", { style: { padding: 6 }, children: "Name" }), _jsx("th", { style: { padding: 6 }, children: "External ID" })] }) }), _jsxs("tbody", { children: [(specs.partySpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Party" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.customerSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Customer" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.contractSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Contract" }), _jsxs("td", { style: { padding: 6 }, children: [s.name, " (", s.paymentContext, ")"] }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.billingAccountSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Billing Account" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.communicationIdentifierSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Comm ID" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.contactMediumSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Contact Medium" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.agreementSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Agreement" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.partyRoleSpecifications || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Party Role" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id))), (specs.bucketTags || []).map((s) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: "Bucket" }), _jsx("td", { style: { padding: 6 }, children: s.name }), _jsx("td", { style: { padding: 6 }, children: s.externalId })] }, s.id)))] })] }), _jsxs("h3", { style: { marginTop: 16 }, children: ["Product Offerings (", (specs.productOfferings || []).length, ")"] }), _jsxs("table", { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { background: '#eee', textAlign: 'left' }, children: [_jsx("th", { style: { padding: 6 }, children: "Name" }), _jsx("th", { style: { padding: 6 }, children: "External ID" }), _jsx("th", { style: { padding: 6 }, children: "Types" })] }) }), _jsx("tbody", { children: (specs.productOfferings || []).map((p) => (_jsxs("tr", { style: { borderBottom: '1px solid #ddd' }, children: [_jsx("td", { style: { padding: 6 }, children: p.name }), _jsx("td", { style: { padding: 6 }, children: p.externalId }), _jsx("td", { style: { padding: 6 }, children: (p.offeringTypes || []).join(', ') })] }, p.id))) })] })] }))] }));
}
