import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { CharInput } from './CharInput';
const API = '/api/v1';
export function ProvisionWizard() {
    const [specs, setSpecs] = useState(null);
    const [step, setStep] = useState(0);
    const [editMode, setEditMode] = useState(false);
    const [partyJson, setPartyJson] = useState('');
    const [customerJson, setCustomerJson] = useState('');
    const [contractJson, setContractJson] = useState('');
    const [selectedPartySpec, setSelectedPartySpec] = useState('');
    const [selectedCustSpec, setSelectedCustSpec] = useState('');
    const [selectedBASpec, setSelectedBASpec] = useState('');
    const [selectedContractSpec, setSelectedContractSpec] = useState('');
    const [selectedPO, setSelectedPO] = useState('');
    const [additionalPOs, setAdditionalPOs] = useState([{ poExtId: '', formVals: {}, baRef: true, baRefRecurrence: true, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: false, validFor: { enabled: false, startDateTime: '', endDateTime: '' } }]);
    const [selectedCommIdSpec, setSelectedCommIdSpec] = useState('');
    const [selectedResources, setSelectedResources] = useState([]);
    const [selectedCmSpecs, setSelectedCmSpecs] = useState([{ specExtId: '', charVals: {}, externalId: '' }]);
    const [homeTimeZone, setHomeTimeZone] = useState('Europe/Stockholm');
    const [includeContactMediumAssoc, setIncludeContactMediumAssoc] = useState(true);
    const [cmAssocLanguage, setCmAssocLanguage] = useState('en');
    const [languages, setLanguages] = useState([]);
    const [cmDefaults, setCmDefaults] = useState({});
    const [formValues, setFormValues] = useState({ party: {}, customer: {}, contract: {}, billingAccount: {} });
    const [productOptions, setProductOptions] = useState({ baRef: true, baRefRecurrence: true, sharingProvider: false });
    const [popPersonalization, setPopPersonalization] = useState([]);
    const [popValues, setPopValues] = useState({});
    const [popEnabled, setPopEnabled] = useState(false);
    const [popSelected, setPopSelected] = useState({});
    const [popError, setPopError] = useState('');
    const [popLoading, setPopLoading] = useState(false);
    const [billCycleSpecExtId, setBillCycleSpecExtId] = useState('');
    const [billCycleChangeType, setBillCycleChangeType] = useState('NO_PRORATE');
    const [msisdn, setMsisdn] = useState('');
    const [email, setEmail] = useState('');
    const [givenName, setGivenName] = useState('');
    const [familyName, setFamilyName] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [provisionMode, setProvisionMode] = useState('all');
    // Status selections
    const [partyStatus, setPartyStatus] = useState('PartyActive');
    const [customerStatus, setCustomerStatus] = useState('CustomerActive');
    const [baStatus, setBaStatus] = useState('BillingAccountActive');
    const [contractStatus, setContractStatus] = useState('Created');
    const [techProductStatus, setTechProductStatus] = useState('ProductActive');
    const [basePlanStatus, setBasePlanStatus] = useState('ProductCreated');
    const [productValidFor, setProductValidFor] = useState({ enabled: false, startDateTime: '', endDateTime: '' });
    useEffect(() => {
        fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => { });
        fetch(`${API}/settings`).then(r => r.ok ? r.json() : null).then(cfg => {
            if (cfg?.defaults?.homeTimeZone)
                setHomeTimeZone(cfg.defaults.homeTimeZone);
            if (cfg?.defaults)
                setCmDefaults(cfg.defaults);
        }).catch(() => { });
        fetch(`${API}/refdata/languages`).then(r => r.ok ? r.json() : []).then(setLanguages).catch(() => { });
    }, [step]);
    if (!specs)
        return (_jsxs("div", { children: [_jsx("h2", { children: "Provision Subscriber" }), _jsxs("p", { style: { color: '#c00' }, children: ["No specs loaded. Go to ", _jsx("b", { children: "\uD83D\uDCE6 Catalog" }), " tab and upload a BusinessConfig zip first."] })] }));
    const partySpecs = specs.partySpecifications || [];
    const custSpecs = specs.customerSpecifications || [];
    const baSpecs = specs.billingAccountSpecifications || [];
    const contractSpecs = specs.contractSpecifications || [];
    const poList = specs.productOfferings || [];
    const commIdSpecs = specs.communicationIdentifierSpecifications || [];
    const cmSpecs = specs.contactMediumSpecifications || [];
    const getMustChars = (chars) => chars.filter((c) => (c.externalId || '').trim() !== '' && c.valueRegulator === 'mustBePersonalized');
    const getOptionalChars = (chars) => chars.filter((c) => (c.externalId || '').trim() !== '' && (c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection'));
    const getPersonalizableChars = (chars) => chars.filter((c) => (c.externalId || '').trim() !== '' && c.valueRegulator !== 'fixed');
    const prefillDefaults = (chars, section) => {
        const updates = {};
        for (const c of chars) {
            const key = c.externalId || c.id;
            if (c.valueRegulator === 'mustBePersonalized' && c.defaultValue && !formValues[section]?.[key])
                updates[key] = c.defaultValue;
        }
        if (Object.keys(updates).length)
            setFormValues((prev) => ({ ...prev, [section]: { ...prev[section], ...updates } }));
    };
    const submit = async () => {
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const errMsg = (d) => typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail || d);
            if (provisionMode === 'all') {
                const payload = {
                    partyBody: JSON.parse(partyJson),
                    customerBody: JSON.parse(customerJson),
                    contractBody: JSON.parse(contractJson),
                    customerExternalId: JSON.parse(customerJson).externalId,
                };
                const r = await fetch(`${API}/subscribers/provision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!r.ok)
                    throw new Error(errMsg(await r.json()));
                setResult(await r.json());
            }
            else if (provisionMode === 'party') {
                const r = await fetch(`${API}/party`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: partyJson });
                if (!r.ok)
                    throw new Error(errMsg(await r.json()));
                setResult(await r.json());
            }
            else if (provisionMode === 'customer') {
                const r = await fetch(`${API}/customer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: customerJson });
                if (!r.ok)
                    throw new Error(errMsg(await r.json()));
                setResult(await r.json());
            }
            else if (provisionMode === 'contract') {
                const custExtId = JSON.parse(customerJson).externalId || '';
                const r = await fetch(`${API}/contract?customerExternalId=${encodeURIComponent(custExtId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: contractJson });
                if (!r.ok)
                    throw new Error(errMsg(await r.json()));
                setResult(await r.json());
            }
        }
        catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };
    return (_jsxs("div", { children: [_jsx("h2", { children: "Provision Subscriber (Spec-Driven)" }), error && _jsxs("p", { style: { color: 'red', background: '#fff0f0', padding: 10, border: '1px solid #fcc', borderRadius: 4, wordBreak: 'break-all' }, children: ["\u274C ", error] }), result && _jsx("pre", { style: { background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }, children: JSON.stringify(result, null, 2) }), step === 0 && (_jsxs("div", { style: { display: 'grid', gap: 12, maxWidth: 500 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Step 1: Select Specifications" }), _jsxs("label", { children: ["Party Specification", _jsxs("select", { style: { width: '100%' }, value: selectedPartySpec, onChange: e => {
                                    setSelectedPartySpec(e.target.value);
                                    const ps = partySpecs.find((s) => s.externalId === e.target.value);
                                    if (ps)
                                        prefillDefaults(getPersonalizableChars(ps.characteristics), 'party');
                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), partySpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id))] })] }), _jsxs("label", { children: ["Customer Specification", _jsxs("select", { style: { width: '100%' }, value: selectedCustSpec, onChange: e => {
                                    setSelectedCustSpec(e.target.value);
                                    const cs = custSpecs.find((s) => s.externalId === e.target.value);
                                    if (cs)
                                        prefillDefaults(getPersonalizableChars(cs.characteristics), 'customer');
                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), custSpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id))] })] }), _jsxs("label", { children: ["Billing Account Specification", _jsxs("select", { style: { width: '100%' }, value: selectedBASpec, onChange: e => {
                                    setSelectedBASpec(e.target.value);
                                    const bs = baSpecs.find((s) => s.externalId === e.target.value);
                                    if (bs)
                                        prefillDefaults(getPersonalizableChars(bs.characteristics), 'billingAccount');
                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), baSpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id))] })] }), _jsxs("label", { children: ["Contract Specification", _jsxs("select", { style: { width: '100%' }, value: selectedContractSpec, onChange: e => {
                                    setSelectedContractSpec(e.target.value);
                                    const cs = contractSpecs.find((s) => s.externalId === e.target.value);
                                    if (cs)
                                        prefillDefaults(getPersonalizableChars(cs.characteristics), 'contract');
                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), contractSpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " - ", s.paymentContext, " (", s.externalId, ")"] }, s.id))] })] }), _jsxs("label", { children: ["Base Plan Product Offering", _jsxs("select", { style: { width: '100%' }, value: selectedPO, onChange: e => {
                                    setSelectedPO(e.target.value);
                                    const po = poList.find((p) => p.externalId === e.target.value);
                                    if (po)
                                        prefillDefaults(getPersonalizableChars(po.characteristics || []), 'contract');
                                    const poRs = po?.resourceSpecifications || [];
                                    setSelectedResources(poRs.length > 0
                                        ? poRs.map((rs) => ({ specExtId: rs.externalId, specId: rs.id, value: '' }))
                                        : [{ specExtId: '', specId: '', value: '' }]);
                                    // Auto-detect sharing type from catalog offeringTypes
                                    const types = (po?.offeringTypes || []).map((t) => t.toUpperCase());
                                    if (types.includes('SHARING_PROVIDER') || types.includes('PROVIDER') || (po?.name || '').toLowerCase().includes('technical')) {
                                        setProductOptions(prev => ({ ...prev, sharingProvider: true }));
                                    }
                                    else {
                                        setProductOptions(prev => ({ ...prev, sharingProvider: false }));
                                    }
                                    // Also fetch live spec to detect sharingProviderSpecification
                                    if (e.target.value) {
                                        fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(e.target.value)}`)
                                            .then(r => r.ok ? r.json() : null)
                                            .then((data) => {
                                            const poSpec = Array.isArray(data) ? data[0] : data;
                                            if (poSpec?.sharingProviderSpecification || poSpec?.sharingProviderSpecificationExternalId) {
                                                setProductOptions(prev => ({ ...prev, sharingProvider: true }));
                                            }
                                        })
                                            .catch(() => { });
                                    }
                                    // Fetch POP personalization
                                    setPopPersonalization([]);
                                    setPopValues({});
                                    setPopError('');
                                    setPopEnabled(false);
                                    setPopSelected({});
                                    const fetchPop = (poExtId) => {
                                        setPopLoading(true);
                                        fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(poExtId)}`)
                                            .then(async (r) => {
                                            if (!r.ok) {
                                                const t = await r.text();
                                                throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`);
                                            }
                                            return r.json();
                                        })
                                            .then((pops) => {
                                            setPopPersonalization(pops);
                                            const defaults = {};
                                            for (const pop of pops)
                                                for (const row of (pop.rows || []))
                                                    for (const c of (row.chars || []))
                                                        defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') };
                                            setPopValues(defaults);
                                            setPopLoading(false);
                                        })
                                            .catch((err) => { setPopError(err.message); setPopLoading(false); });
                                    };
                                    if (e.target.value)
                                        fetchPop(e.target.value);
                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id))] })] }), selectedPO && (() => {
                        const po = poList.find((p) => p.externalId === selectedPO);
                        const poMustChars = po ? getMustChars(po.characteristics || []) : [];
                        const poOptChars = po ? getOptionalChars(po.characteristics || []) : [];
                        return (_jsxs("div", { style: { border: '1px solid #e5e7eb', borderRadius: 4, padding: '8px 10px', background: '#f9fafb', marginBottom: 4 }, children: [poMustChars.length > 0 && _jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: 11, color: '#c60', margin: '4px 0 4px', fontWeight: 600 }, children: "Required Characteristics:" }), poMustChars.map((c) => _jsx(CharInput, { char: c, value: formValues.contract[`_po_${c.externalId || c.id}`] || '', onChange: v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } }) }, c.id))] }), poOptChars.length > 0 && _jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: 11, color: '#0a7', margin: '6px 0 4px', fontWeight: 600 }, children: "Optional Characteristics:" }), poOptChars.map((c) => _jsx(CharInput, { char: c, value: formValues.contract[`_po_${c.externalId || c.id}`] || '', onChange: v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } }) }, c.id))] }), popLoading && _jsx("p", { style: { fontSize: 11, color: '#888', margin: '6px 0' }, children: "\u23F3 Loading POP..." }), popError && _jsxs("p", { style: { fontSize: 11, color: '#c00', background: '#fff0f0', padding: '4px 6px', borderRadius: 4, margin: '6px 0' }, children: ["\u26A0 ", popError] }), popPersonalization.length > 0 && (_jsxs("div", { style: { padding: '4px 6px', background: '#fdf4ff', borderRadius: 4, border: '1px solid #f0abfc', marginTop: 6 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: popEnabled, onChange: e => setPopEnabled(e.target.checked) }), "POP Personalization (", popPersonalization.length, ")"] }), popEnabled && popPersonalization.map((pop) => (_jsxs("div", { style: { marginLeft: 12, marginTop: 4 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: !!popSelected[pop.popId], onChange: e => setPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked })) }), pop.popName || pop.popExternalId] }), popSelected[pop.popId] && (pop.rows || []).map((row) => (_jsx("div", { style: { marginLeft: 12, marginTop: 2 }, children: (row.chars || []).map((c) => {
                                                        const key = `${pop.popId}_${row.rowId}_${c.id}`;
                                                        const val = popValues[key] || { value: '', unit: c.defaultUnit || '' };
                                                        return (_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: 10, minWidth: 80, color: '#555' }, children: c.name }), _jsx("input", { style: { flex: 1, padding: '2px 4px', fontSize: 10 }, placeholder: c.defaultValue || 'value', value: val.value, onChange: e => setPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } })) }), c.units?.length > 1 ? (_jsx("select", { style: { padding: '2px 4px', fontSize: 9 }, value: val.unit, onChange: e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } })), children: c.units.map((u) => _jsx("option", { value: u, children: u }, u)) })) : (_jsx("input", { style: { width: 60, padding: '2px 4px', fontSize: 9 }, placeholder: c.defaultUnit || 'unit', value: val.unit, onChange: e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } })) }))] }, c.id));
                                                    }) }, row.rowId)))] }, pop.popId)))] }))] }));
                    })(), selectedPO && (_jsxs("div", { style: { border: '1px solid #e5e7eb', borderRadius: 4, padding: '8px 10px', background: '#f9fafb', marginBottom: 4 }, children: [_jsx("p", { style: { fontSize: 11, color: '#555', margin: '0 0 6px', fontWeight: 600 }, children: "Product Options:" }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }, children: [_jsx("input", { type: "checkbox", checked: productOptions.baRef, onChange: e => setProductOptions({ ...productOptions, baRef: e.target.checked }) }), "billingAccountReference"] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }, children: [_jsx("input", { type: "checkbox", checked: productOptions.baRefRecurrence, onChange: e => setProductOptions({ ...productOptions, baRefRecurrence: e.target.checked }) }), "baRefForBillCycleAlignedRecurrence"] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }, children: [_jsx("input", { type: "checkbox", checked: productOptions.sharingProvider, onChange: e => setProductOptions({ ...productOptions, sharingProvider: e.target.checked }) }), "Include Technical Product (sharingProvider)", productOptions.sharingProvider && _jsx("span", { style: { fontSize: 9, color: '#854d0e', background: '#fef9c3', padding: '1px 5px', borderRadius: 8 }, children: "\u26A1 Auto" })] }), productOptions.sharingProvider && (_jsx("div", { style: { marginLeft: 18, marginTop: 4 }, children: _jsxs("select", { style: { width: '100%', padding: '3px 6px', fontSize: 10 }, value: productOptions.techPO || '', onChange: e => setProductOptions({ ...productOptions, techPO: e.target.value }), children: [_jsx("option", { value: "", children: "-- Technical PO --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId))] }) })), _jsx("p", { style: { fontSize: 11, color: '#555', margin: '8px 0 4px', fontWeight: 600 }, children: "Entity Status:" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }, children: [_jsxs("label", { style: { fontSize: 10 }, children: ["Contract", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: contractStatus, onChange: e => setContractStatus(e.target.value), children: [_jsx("option", { value: "Created", children: "Created" }), _jsx("option", { value: "Active", children: "Active" })] })] }), _jsxs("label", { style: { fontSize: 10 }, children: ["Base Product", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: basePlanStatus, onChange: e => setBasePlanStatus(e.target.value), children: [_jsx("option", { value: "ProductCreated", children: "ProductCreated" }), _jsx("option", { value: "ProductActive", children: "ProductActive" })] })] }), productOptions.sharingProvider && _jsxs("label", { style: { fontSize: 10 }, children: ["Tech Product", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: techProductStatus, onChange: e => setTechProductStatus(e.target.value), children: [_jsx("option", { value: "ProductActive", children: "ProductActive" }), _jsx("option", { value: "ProductCreated", children: "ProductCreated" })] })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }, children: [_jsxs("label", { style: { fontSize: 10 }, children: ["Party", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: partyStatus, onChange: e => setPartyStatus(e.target.value), children: [_jsx("option", { value: "PartyActive", children: "PartyActive" }), _jsx("option", { value: "PartyCreated", children: "PartyCreated" })] })] }), _jsxs("label", { style: { fontSize: 10 }, children: ["Customer", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: customerStatus, onChange: e => setCustomerStatus(e.target.value), children: [_jsx("option", { value: "CustomerActive", children: "CustomerActive" }), _jsx("option", { value: "CustomerCreated", children: "CustomerCreated" })] })] }), _jsxs("label", { style: { fontSize: 10 }, children: ["Billing Acct", _jsxs("select", { style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: baStatus, onChange: e => setBaStatus(e.target.value), children: [_jsx("option", { value: "BillingAccountActive", children: "BillingAccountActive" }), _jsx("option", { value: "BillingAccountCreated", children: "BillingAccountCreated" })] })] })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 6 }, children: [_jsx("input", { type: "checkbox", checked: productValidFor.enabled, onChange: e => setProductValidFor({ ...productValidFor, enabled: e.target.checked }) }), "Product Status validFor"] }), productValidFor.enabled && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }, children: [_jsxs("label", { style: { fontSize: 10 }, children: ["Start", _jsx("input", { type: "datetime-local", style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: productValidFor.startDateTime, onChange: e => setProductValidFor({ ...productValidFor, startDateTime: e.target.value }) })] }), _jsxs("label", { style: { fontSize: 10 }, children: ["End", _jsx("input", { type: "datetime-local", style: { width: '100%', padding: '2px 4px', fontSize: 10 }, value: productValidFor.endDateTime, onChange: e => setProductValidFor({ ...productValidFor, endDateTime: e.target.value }) })] })] }))] })), _jsx("label", { style: { fontSize: 12, fontWeight: 'bold', marginTop: 4 }, children: "Add-On Product Offerings" }), additionalPOs.map((entry, idx) => {
                        const addOnPo = poList.find((p) => p.externalId === entry.poExtId);
                        const addOnChars = addOnPo?.characteristics || [];
                        const addOnMust = addOnChars.filter((c) => c.valueRegulator === 'mustBePersonalized');
                        const addOnOpt = addOnChars.filter((c) => c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection');
                        return (_jsxs("div", { style: { border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', marginBottom: 4 }, children: [_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }, children: [_jsxs("select", { style: { flex: 1 }, value: entry.poExtId, onChange: e => {
                                                const updated = [...additionalPOs];
                                                updated[idx] = { ...updated[idx], poExtId: e.target.value, formVals: {}, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: true };
                                                setAdditionalPOs(updated);
                                                if (e.target.value) {
                                                    fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(e.target.value)}`)
                                                        .then(r => r.ok ? r.json() : [])
                                                        .then((pops) => {
                                                        const defaults = {};
                                                        for (const pop of pops)
                                                            for (const row of (pop.rows || []))
                                                                for (const c of (row.chars || []))
                                                                    defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') };
                                                        setAdditionalPOs(prev => { const u = [...prev]; u[idx] = { ...u[idx], popData: pops, popVals: defaults, popLoading: false }; return u; });
                                                    })
                                                        .catch(() => setAdditionalPOs(prev => { const u = [...prev]; u[idx] = { ...u[idx], popLoading: false }; return u; }));
                                                }
                                            }, children: [_jsx("option", { value: "", children: "-- None --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id))] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }, children: [_jsx("input", { type: "checkbox", checked: entry.baRef, onChange: e => { const u = [...additionalPOs]; u[idx].baRef = e.target.checked; u[idx].baRefRecurrence = e.target.checked; setAdditionalPOs(u); } }), "BA"] }), additionalPOs.length > 1 && _jsx("button", { type: "button", onClick: () => setAdditionalPOs(additionalPOs.filter((_, i) => i !== idx)), style: { fontSize: 11 }, children: "\u2715" })] }), entry.poExtId && (_jsxs("div", { style: { marginBottom: 4 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }, children: [_jsx("input", { type: "checkbox", checked: entry.validFor.enabled, onChange: e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, enabled: e.target.checked }; setAdditionalPOs(u); } }), "validFor"] }), entry.validFor.enabled && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 2 }, children: [_jsxs("label", { style: { fontSize: 9 }, children: ["Start", _jsx("input", { type: "datetime-local", style: { width: '100%', padding: '2px 4px', fontSize: 9 }, value: entry.validFor.startDateTime, onChange: e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, startDateTime: e.target.value }; setAdditionalPOs(u); } })] }), _jsxs("label", { style: { fontSize: 9 }, children: ["End", _jsx("input", { type: "datetime-local", style: { width: '100%', padding: '2px 4px', fontSize: 9 }, value: entry.validFor.endDateTime, onChange: e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, endDateTime: e.target.value }; setAdditionalPOs(u); } })] })] }))] })), entry.poExtId && addOnMust.length > 0 && _jsx("div", { style: { marginBottom: 4 }, children: addOnMust.map((c) => _jsx(CharInput, { char: c, value: entry.formVals[c.externalId || c.id] || '', onChange: v => { const u = [...additionalPOs]; u[idx].formVals = { ...u[idx].formVals, [c.externalId || c.id]: v }; setAdditionalPOs(u); } }, c.id)) }), entry.poExtId && addOnOpt.length > 0 && _jsx("div", { style: { marginBottom: 4 }, children: addOnOpt.map((c) => _jsx(CharInput, { char: c, value: entry.formVals[c.externalId || c.id] || '', onChange: v => { const u = [...additionalPOs]; u[idx].formVals = { ...u[idx].formVals, [c.externalId || c.id]: v }; setAdditionalPOs(u); } }, c.id)) }), entry.popLoading && _jsx("div", { style: { fontSize: 10, color: '#888' }, children: "Loading POP..." }), entry.popData.length > 0 && (_jsxs("div", { style: { padding: '4px 6px', background: '#fdf4ff', borderRadius: 4, border: '1px solid #f0abfc', marginTop: 4 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: entry.popEnabled, onChange: e => { const u = [...additionalPOs]; u[idx].popEnabled = e.target.checked; setAdditionalPOs(u); } }), "POP Personalization (", entry.popData.length, ")"] }), entry.popEnabled && entry.popData.map((pop) => (_jsxs("div", { style: { marginLeft: 12, marginTop: 4 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: !!entry.popSelected[pop.popId], onChange: e => { const u = [...additionalPOs]; u[idx].popSelected = { ...u[idx].popSelected, [pop.popId]: e.target.checked }; setAdditionalPOs(u); } }), pop.popName || pop.popExternalId || pop.popId] }), entry.popSelected[pop.popId] && (pop.rows || []).map((row) => (_jsx("div", { style: { marginLeft: 12 }, children: (row.chars || []).map((c) => {
                                                        const key = `${pop.popId}_${row.rowId}_${c.id}`;
                                                        const val = entry.popVals[key] || { value: '', unit: '' };
                                                        return (_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: 10, minWidth: 80, color: '#555' }, children: c.name || c.externalId || c.id }), _jsx("input", { style: { flex: 1, padding: '2px 4px', fontSize: 10 }, placeholder: c.defaultValue || 'value', value: val.value, onChange: e => { const u = [...additionalPOs]; u[idx].popVals = { ...u[idx].popVals, [key]: { ...val, value: e.target.value } }; setAdditionalPOs(u); } }), c.units && c.units.length > 0 && (_jsx("select", { style: { padding: '2px 4px', fontSize: 9 }, value: val.unit, onChange: e => { const u = [...additionalPOs]; u[idx].popVals = { ...u[idx].popVals, [key]: { ...val, unit: e.target.value } }; setAdditionalPOs(u); }, children: c.units.map((uu) => _jsx("option", { value: uu, children: uu }, uu)) }))] }, c.id));
                                                    }) }, row.rowId)))] }, pop.popId)))] }))] }, idx));
                    }), _jsx("button", { type: "button", style: { fontSize: 11, width: 'fit-content' }, onClick: () => setAdditionalPOs([...additionalPOs, { poExtId: '', formVals: {}, baRef: true, baRefRecurrence: true, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: false, validFor: { enabled: false, startDateTime: '', endDateTime: '' } }]), children: "+ Add Product Offering" }), _jsx("label", { style: { fontSize: 12, fontWeight: 'bold', marginTop: 4 }, children: "Contact Mediums" }), selectedCmSpecs.map((entry, idx) => {
                        const spec = cmSpecs.find((s) => s.externalId === entry.specExtId);
                        const deriveChannelType = (s) => {
                            const n = (s?.externalId || s?.name || '').toUpperCase();
                            if (n.includes('EMAIL') || n.includes('MAIL'))
                                return 'EMail';
                            if (n.includes('REST') || n.includes('SOCIAL'))
                                return 'socialMedia';
                            if (n.includes('SMS') || n.includes('TEL'))
                                return 'SMS';
                            return '';
                        };
                        const channelTypeChar = spec?.characteristics?.find((c) => (c.externalId || '').toLowerCase().includes('channel'));
                        const userChars = spec?.characteristics?.filter((c) => !((c.externalId || '').toLowerCase().includes('channel'))) || [];
                        const commIdLabel = (() => {
                            const ct = deriveChannelType(spec);
                            if (ct === 'EMail')
                                return 'Email Address';
                            if (ct === 'SMS')
                                return 'Phone Number (MSISDN)';
                            if (ct === 'socialMedia')
                                return 'Social Media ID';
                            return 'Communication ID';
                        })();
                        return (_jsxs("div", { style: { border: '1px solid #ddd', borderRadius: 4, padding: 8, display: 'grid', gap: 6 }, children: [_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsxs("select", { style: { flex: 1 }, value: entry.specExtId, onChange: e => {
                                                const s = cmSpecs.find((s) => s.externalId === e.target.value);
                                                const ct = deriveChannelType(s);
                                                const ctKey = s?.characteristics?.find((c) => (c.externalId || '').toLowerCase().includes('channel'))?.externalId;
                                                const u = [...selectedCmSpecs];
                                                u[idx] = { specExtId: e.target.value, charVals: ctKey && ct ? { [ctKey]: ct } : {}, externalId: u[idx].externalId };
                                                setSelectedCmSpecs(u);
                                            }, children: [_jsx("option", { value: "", children: "-- Select Spec --" }), cmSpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id))] }), selectedCmSpecs.length > 1 && _jsx("button", { type: "button", onClick: () => setSelectedCmSpecs(selectedCmSpecs.filter((_, i) => i !== idx)), style: { fontSize: 11 }, children: "\u2715" })] }), channelTypeChar && (_jsxs("label", { style: { fontSize: 12 }, children: ["Channel Type", _jsx("input", { style: { width: '100%' }, placeholder: "e.g. SMS, EMail, socialMedia", value: entry.charVals[channelTypeChar.externalId] || '', onChange: e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [channelTypeChar.externalId]: e.target.value } }; setSelectedCmSpecs(u); } })] })), userChars.map((c) => {
                                    const isCommId = (c.externalId || '').toLowerCase().includes('communication');
                                    const label = isCommId ? commIdLabel : (c.name || c.externalId);
                                    const placeholder = isCommId ? commIdLabel : c.externalId;
                                    return (_jsxs("label", { style: { fontSize: 12 }, children: [label, _jsx("input", { style: { width: '100%' }, placeholder: placeholder, value: entry.charVals[c.externalId || c.id] || '', onChange: e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [c.externalId || c.id]: e.target.value } }; setSelectedCmSpecs(u); } })] }, c.id));
                                })] }, idx));
                    }), _jsx("button", { type: "button", style: { fontSize: 11, width: 'fit-content' }, onClick: () => setSelectedCmSpecs([...selectedCmSpecs, { specExtId: '', charVals: {}, externalId: '' }]), children: "+ Add Contact Medium" }), _jsx("button", { disabled: !selectedPartySpec || !selectedCustSpec || !selectedContractSpec, onClick: () => setStep(1), children: "Next \u2192" })] })), step === 1 && (_jsxs("div", { style: { display: 'grid', gap: 12, maxWidth: 500 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Step 2: Subscriber Details" }), _jsx("input", { placeholder: "Given Name *", value: givenName, onChange: e => setGivenName(e.target.value) }), _jsx("input", { placeholder: "Family Name *", value: familyName, onChange: e => setFamilyName(e.target.value) }), _jsx("input", { placeholder: "MSISDN *", value: msisdn, onChange: e => setMsisdn(e.target.value) }), _jsx("input", { placeholder: "Email (optional)", value: email, onChange: e => setEmail(e.target.value) }), (() => {
                        const ps = partySpecs.find((s) => s.externalId === selectedPartySpec);
                        const chars = ps ? getPersonalizableChars(ps.characteristics) : [];
                        return chars.length > 0 && (_jsxs("fieldset", { children: [_jsx("legend", { children: "Party Characteristics" }), chars.map((c) => _jsx(CharInput, { char: c, value: formValues.party[c.externalId || c.id] || '', onChange: v => setFormValues({ ...formValues, party: { ...formValues.party, [c.externalId || c.id]: v } }) }, c.id))] }));
                    })(), (() => {
                        const cs = custSpecs.find((s) => s.externalId === selectedCustSpec);
                        const chars = cs ? getPersonalizableChars(cs.characteristics) : [];
                        return chars.length > 0 && (_jsxs("fieldset", { children: [_jsx("legend", { children: "Customer Characteristics" }), chars.map((c) => _jsx(CharInput, { char: c, value: formValues.customer[c.externalId || c.id] || '', onChange: v => setFormValues({ ...formValues, customer: { ...formValues.customer, [c.externalId || c.id]: v } }) }, c.id))] }));
                    })(), (() => {
                        const bs = baSpecs.find((s) => s.externalId === selectedBASpec);
                        const chars = bs ? getPersonalizableChars(bs.characteristics) : [];
                        return (_jsxs("fieldset", { children: [_jsx("legend", { children: "Billing Account" }), _jsxs("label", { style: { display: 'block', marginBottom: 6 }, children: ["Bill Cycle Spec", (specs.billingCycleSpecifications || []).length > 0 ? (_jsxs("select", { style: { width: '100%' }, value: billCycleSpecExtId, onChange: e => setBillCycleSpecExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- None --" }), (specs.billingCycleSpecifications || []).map((bcs) => _jsxs("option", { value: bcs.externalId, children: [bcs.name, " (", bcs.externalId, ")"] }, bcs.id || bcs.externalId))] })) : (_jsx("input", { style: { width: '100%' }, placeholder: "e.g. CHT_billcycle_01 (upload BusinessConfig for dropdown)", value: billCycleSpecExtId, onChange: e => setBillCycleSpecExtId(e.target.value) }))] }), _jsxs("label", { style: { display: 'block', marginBottom: 6 }, children: ["Bill Cycle Change Type", _jsxs("select", { style: { width: '100%' }, value: billCycleChangeType, onChange: e => setBillCycleChangeType(e.target.value), children: [_jsx("option", { value: "NO_PRORATE", children: "NO_PRORATE" }), _jsx("option", { value: "PRORATE_END_CURRENT", children: "PRORATE_END_CURRENT" }), _jsx("option", { value: "PRORATE_POS_START_NEW", children: "PRORATE_POS_START_NEW" }), _jsx("option", { value: "PRORATE_NEG_START_NEW", children: "PRORATE_NEG_START_NEW" })] })] }), chars.map((c) => _jsx(CharInput, { char: c, value: formValues.billingAccount[c.externalId || c.id] || '', onChange: v => setFormValues({ ...formValues, billingAccount: { ...formValues.billingAccount, [c.externalId || c.id]: v } }) }, c.id))] }));
                    })(), (() => {
                        const cs = contractSpecs.find((s) => s.externalId === selectedContractSpec);
                        const po = poList.find((p) => p.externalId === selectedPO);
                        const mustChars = cs ? getMustChars(cs.characteristics) : [];
                        const optChars = cs ? getOptionalChars(cs.characteristics) : [];
                        return (_jsxs("fieldset", { children: [_jsx("legend", { children: "Contract & Product" }), selectedPO && (_jsxs("div", { style: { marginBottom: 8 }, children: [_jsx("p", { style: { fontSize: 12, color: '#555', margin: '0 0 6px' }, children: "Identification Resources (MSISDN/IMSI):" }), (() => {
                                            const selectedPOObj = poList.find((p) => p.externalId === selectedPO);
                                            const poHasRs = (selectedPOObj?.resourceSpecifications || []).length > 0;
                                            return selectedResources.map((entry, idx) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }, children: [poHasRs ? (_jsx("span", { style: { flex: 2, fontSize: 12, padding: '4px 6px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4 }, children: entry.specExtId })) : (_jsxs("select", { style: { flex: 2 }, value: entry.specExtId, onChange: e => {
                                                            const s = commIdSpecs.find((s) => s.externalId === e.target.value);
                                                            const u = [...selectedResources];
                                                            u[idx] = { ...u[idx], specExtId: e.target.value, specId: s?.id || '' };
                                                            setSelectedResources(u);
                                                        }, children: [_jsx("option", { value: "", children: "-- Select CommID Spec --" }), commIdSpecs.map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id || s.externalId))] })), _jsx("input", { style: { flex: 2 }, placeholder: entry.specExtId.toLowerCase().includes('imsi') ? 'IMSI (15 digits)' : 'MSISDN', value: entry.value, onChange: e => { const u = [...selectedResources]; u[idx] = { ...u[idx], value: e.target.value }; setSelectedResources(u); } }), !poHasRs && selectedResources.length > 1 && _jsx("button", { type: "button", onClick: () => setSelectedResources(selectedResources.filter((_, i) => i !== idx)), style: { fontSize: 11 }, children: "\u2715" })] }, idx)));
                                        })(), (() => {
                                            const selectedPOObj = poList.find((p) => p.externalId === selectedPO);
                                            const poHasRs = (selectedPOObj?.resourceSpecifications || []).length > 0;
                                            return !poHasRs && (_jsx("button", { type: "button", style: { fontSize: 11, width: 'fit-content' }, onClick: () => setSelectedResources([...selectedResources, { specExtId: '', specId: '', value: '' }]), children: "+ Add Resource" }));
                                        })()] })), _jsxs("label", { style: { display: 'block', marginBottom: 6, fontSize: 12 }, children: ["Home Time Zone", _jsx("input", { style: { width: '100%' }, value: homeTimeZone, onChange: e => setHomeTimeZone(e.target.value), placeholder: "e.g. Europe/Stockholm" })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }, children: [_jsx("input", { type: "checkbox", checked: includeContactMediumAssoc, onChange: e => setIncludeContactMediumAssoc(e.target.checked) }), "Include contactMediumAssociation"] }), includeContactMediumAssoc && (_jsxs("label", { style: { display: 'block', fontSize: 12, marginBottom: 6 }, children: ["Association Language", languages.length > 0 ? (_jsx("select", { style: { width: '100%' }, value: cmAssocLanguage, onChange: e => setCmAssocLanguage(e.target.value), children: languages.map(l => _jsxs("option", { value: l.id, children: [l.name, " (", l.id, ")"] }, l.id)) })) : (_jsx("input", { style: { width: '100%' }, value: cmAssocLanguage, onChange: e => setCmAssocLanguage(e.target.value), placeholder: "e.g. en" }))] })), mustChars.length > 0 && _jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: 12, color: '#c60', margin: '8px 0 4px' }, children: "Contract \u2014 Required Characteristics:" }), mustChars.map((c) => _jsx(CharInput, { char: c, value: formValues.contract[c.externalId || c.id] || '', onChange: v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } }) }, c.id))] }), optChars.length > 0 && _jsxs(_Fragment, { children: [_jsx("p", { style: { fontSize: 12, color: '#0a7', margin: '8px 0 4px' }, children: "Contract \u2014 Optional Characteristics:" }), optChars.map((c) => _jsx(CharInput, { char: c, value: formValues.contract[c.externalId || c.id] || '', onChange: v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } }) }, c.id))] })] }));
                    })(), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { onClick: () => setStep(0), children: "\u2190 Back" }), _jsx("button", { disabled: !givenName || !familyName || !msisdn, onClick: () => {
                                    const subRef = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 8);
                                    const partyExtId = `party-${subRef}`;
                                    const customerExtId = `customer-${subRef}`;
                                    const baExtId = `ba-${subRef}`;
                                    const contractExtId = `contract-${subRef}`;
                                    const nowDt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
                                    const pb = {
                                        externalId: partyExtId,
                                        givenName, familyName,
                                        individualSpecification: { externalId: selectedPartySpec },
                                        status: [{ status: partyStatus }],
                                    };
                                    pb.contactMedium = selectedCmSpecs
                                        .filter(e => e.specExtId)
                                        .map(e => ({
                                        contactMediumSpecExternalId: e.specExtId,
                                        externalId: e.externalId || `cm_${e.specExtId}_${subRef}`,
                                        validFor: { startDateTime: nowDt },
                                        characteristic: Object.entries(e.charVals)
                                            .filter(([, v]) => v)
                                            .map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] })),
                                    }));
                                    const partyChars = Object.entries(formValues.party).filter(([, v]) => v);
                                    if (partyChars.length)
                                        pb.characteristic = partyChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }));
                                    const buildCma = () => selectedCmSpecs
                                        .filter(e => e.specExtId)
                                        .map(e => ({
                                        contactRole: 'Notification',
                                        language: cmAssocLanguage || 'en',
                                        contactMediumExternalId: e.externalId || `cm_${e.specExtId}_${subRef}`,
                                        enabled: true,
                                        validFor: { startDateTime: nowDt },
                                    }));
                                    const cb = {
                                        externalId: customerExtId,
                                        customerSpecification: { externalId: selectedCustSpec },
                                        status: [{ status: customerStatus }],
                                        ...(selectedBASpec ? { account: [{
                                                    externalId: baExtId,
                                                    billingAccountSpecExternalId: selectedBASpec,
                                                    status: [{ status: baStatus }],
                                                    ...(billCycleSpecExtId ? { customerBillCycleSpecification: [{
                                                                externalId: `cbcs-${subRef}`,
                                                                billCycleSpecExternalId: billCycleSpecExtId,
                                                                billCycleChangeType: billCycleChangeType || 'NO_PRORATE',
                                                            }] } : {}),
                                                }] } : {}),
                                        engagedParty: { externalId: partyExtId, '@referredType': 'Individual' },
                                    };
                                    if (includeContactMediumAssoc) {
                                        const cma = buildCma();
                                        if (cma.length) {
                                            cb.contactMediumAssociation = cma;
                                            cb.account[0].contactMediumAssociation = cma;
                                        }
                                    }
                                    if (billCycleSpecExtId.trim()) {
                                        cb.account[0].customerBillCycleSpecification = [{
                                                externalId: `cbcs-${subRef}`,
                                                billCycleSpecExternalId: billCycleSpecExtId.trim(),
                                                billCycleChangeType: billCycleChangeType,
                                            }];
                                    }
                                    const custChars = Object.entries(formValues.customer).filter(([, v]) => v);
                                    if (custChars.length)
                                        cb.characteristic = custChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }));
                                    const baChars = Object.entries(formValues.billingAccount).filter(([, v]) => v);
                                    if (baChars.length)
                                        cb.account[0].characteristic = baChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }));
                                    const ctb = {
                                        externalId: contractExtId,
                                        contractSpecification: { externalId: selectedContractSpec },
                                        status: [{ status: contractStatus }],
                                    };
                                    const products = [];
                                    if (productOptions.sharingProvider) {
                                        const techPO = productOptions.techPO || 'PO-Technical';
                                        products.push({
                                            productOfferingExternalId: techPO,
                                            externalId: `extID_tech-${subRef}`,
                                            correlationId: '1',
                                            name: 'Technical Product',
                                            status: [{ status: techProductStatus }],
                                            billingAccountReference: { externalId: baExtId },
                                            baRefForBillCycleAlignedRecurrence: { externalId: baExtId },
                                            sharingProvider: {
                                                billingAccount: [{ externalId: baExtId }],
                                                consumerList: [{ externalId: `Consumer_List_${subRef}`, consumerCustomerExternalId: customerExtId, consumerContractExternalId: contractExtId }],
                                            },
                                            sharingConsumer: {
                                                providerCustomerExternalId: customerExtId, providerContractExternalId: contractExtId,
                                                providerProductExternalId: `extID_tech-${subRef}`, consumerListEntryExternalId: `Consumer_List_${subRef}`,
                                            },
                                        });
                                    }
                                    if (selectedPO) {
                                        const basePlanProduct = {
                                            productOfferingExternalId: selectedPO,
                                            externalId: `${selectedPO}-${subRef}`,
                                            correlationId: productOptions.sharingProvider ? '2' : '1',
                                            name: selectedPO,
                                            status: [(() => {
                                                    const s = { status: basePlanStatus };
                                                    if (productValidFor.enabled) {
                                                        const vf = {};
                                                        if (productValidFor.startDateTime)
                                                            vf.startDateTime = new Date(productValidFor.startDateTime).toISOString();
                                                        if (productValidFor.endDateTime)
                                                            vf.endDateTime = new Date(productValidFor.endDateTime).toISOString();
                                                        if (Object.keys(vf).length)
                                                            s.validFor = vf;
                                                    }
                                                    return s;
                                                })()],
                                        };
                                        if (productOptions.baRef)
                                            basePlanProduct.billingAccountReference = { externalId: baExtId };
                                        if (productOptions.baRefRecurrence)
                                            basePlanProduct.baRefForBillCycleAlignedRecurrence = { externalId: baExtId };
                                        const poCharEntries = Object.entries(formValues.contract)
                                            .filter(([k, v]) => k.startsWith('_po_') && v && v.trim());
                                        if (poCharEntries.length) {
                                            const poObj = poList.find((p) => p.externalId === selectedPO);
                                            const poChars = poObj?.characteristics || [];
                                            const MEASURE_CATEGORIES = ['Data', 'Duration', 'Money', 'Voice', 'SMS', 'MMS', 'Events'];
                                            basePlanProduct.characteristic = poCharEntries.map(([k, v]) => {
                                                const charExtId = k.replace('_po_', '');
                                                const specChar = poChars.find((c) => (c.externalId || c.id) === charExtId);
                                                // Get unit: possibleValues unitOfMeasure > spec unitOfMeasure > form override
                                                let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || '';
                                                if (!unit && specChar?.unitOfMeasure)
                                                    unit = specChar.unitOfMeasure;
                                                if (!unit && formValues.contract[`_po_unit_${charExtId}`])
                                                    unit = formValues.contract[`_po_unit_${charExtId}`];
                                                // Filter out measure category names (not actual units)
                                                if (MEASURE_CATEGORIES.includes(unit))
                                                    unit = '';
                                                const valObj = { value: v };
                                                if (unit)
                                                    valObj.unitOfMeasure = unit;
                                                return { charSpecExternalId: charExtId, value: [valObj] };
                                            });
                                        }
                                        // POP personalization
                                        const priceEntries = (!popEnabled ? [] : popPersonalization)
                                            .filter((pop) => popSelected[pop.popId])
                                            .map((pop) => {
                                            const priceRows = (pop.rows || []).map((row) => {
                                                const priceAction = (row.chars || []).map((c) => {
                                                    const val = popValues[`${pop.popId}_${row.rowId}_${c.id}`];
                                                    if (!val?.value?.trim())
                                                        return null;
                                                    // Only send if user changed from default
                                                    const defaultVal = c.defaultValue || '';
                                                    if (val.value.trim() === defaultVal.trim())
                                                        return null;
                                                    const char = { value: [{ value: val.value }] };
                                                    if (val.unit)
                                                        char.value[0].unitOfMeasure = val.unit;
                                                    if (c.externalId)
                                                        char.charSpecExternalId = c.externalId;
                                                    else
                                                        char.charSpecId = c.id;
                                                    const action = { characteristic: [char] };
                                                    const _aid = String(c["actionId"] || "");
                                                    const _aeid = String(c["actionExternalId"] || "");
                                                    if (_aeid)
                                                        action["action"] = { externalId: _aeid };
                                                    else if (_aid)
                                                        action["action"] = { id: _aid };
                                                    return action;
                                                }).filter(Boolean);
                                                if (!priceAction.length)
                                                    return null;
                                                return {
                                                    ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}),
                                                    priceAction,
                                                };
                                            }).filter(Boolean);
                                            if (!priceRows.length)
                                                return null;
                                            return {
                                                productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) },
                                                priceRow: priceRows,
                                            };
                                        })
                                            .filter(Boolean);
                                        if (priceEntries.length)
                                            basePlanProduct.price = priceEntries;
                                        products.push(basePlanProduct);
                                    }
                                    // Add-on products
                                    for (const entry of additionalPOs.filter(e => e.poExtId)) {
                                        const addOn = {
                                            productOfferingExternalId: entry.poExtId,
                                            externalId: `${entry.poExtId}-${subRef}`,
                                            name: entry.poExtId,
                                            status: [(() => {
                                                    const s = { status: basePlanStatus };
                                                    if (entry.validFor.enabled) {
                                                        const vf = {};
                                                        if (entry.validFor.startDateTime)
                                                            vf.startDateTime = new Date(entry.validFor.startDateTime).toISOString();
                                                        if (entry.validFor.endDateTime)
                                                            vf.endDateTime = new Date(entry.validFor.endDateTime).toISOString();
                                                        if (Object.keys(vf).length)
                                                            s.validFor = vf;
                                                    }
                                                    return s;
                                                })()],
                                        };
                                        if (entry.baRef)
                                            addOn.billingAccountReference = { externalId: baExtId };
                                        if (entry.baRefRecurrence)
                                            addOn.baRefForBillCycleAlignedRecurrence = { externalId: baExtId };
                                        const addOnChars = Object.entries(entry.formVals).filter(([, v]) => v?.trim());
                                        if (addOnChars.length) {
                                            const addOnPoObj = poList.find((p) => p.externalId === entry.poExtId);
                                            const addOnPoChars = addOnPoObj?.characteristics || [];
                                            const MEASURE_CATEGORIES = ['Data', 'Duration', 'Money', 'Voice', 'SMS', 'MMS', 'Events'];
                                            addOn.characteristic = addOnChars.map(([k, v]) => {
                                                const specChar = addOnPoChars.find((c) => (c.externalId || c.id) === k);
                                                let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || specChar?.specCharacteristicValue?.[0]?.unitOfMeasure || specChar?.unitOfMeasure || '';
                                                if (MEASURE_CATEGORIES.includes(unit))
                                                    unit = '';
                                                const valObj = { value: v };
                                                if (unit)
                                                    valObj.unitOfMeasure = unit;
                                                return { charSpecExternalId: k, value: [valObj] };
                                            });
                                        }
                                        // POP personalization for add-on
                                        if (entry.popEnabled && entry.popData.length > 0) {
                                            const addOnPriceEntries = entry.popData
                                                .filter((pop) => entry.popSelected[pop.popId])
                                                .map((pop) => {
                                                const priceRows = (pop.rows || []).map((row) => {
                                                    const priceAction = (row.chars || []).map((c) => {
                                                        const val = entry.popVals[`${pop.popId}_${row.rowId}_${c.id}`];
                                                        if (!val?.value?.trim())
                                                            return null;
                                                        // Only send if user changed from default
                                                        const defaultVal = c.defaultValue || '';
                                                        if (val.value.trim() === defaultVal.trim())
                                                            return null;
                                                        const char = { value: [{ value: val.value }] };
                                                        if (val.unit)
                                                            char.value[0].unitOfMeasure = val.unit;
                                                        if (c.externalId)
                                                            char.charSpecExternalId = c.externalId;
                                                        else
                                                            char.charSpecId = c.id;
                                                        const action = { characteristic: [char] };
                                                        if (c.actionExternalId)
                                                            action.action = { externalId: c.actionExternalId };
                                                        else if (c.actionId)
                                                            action.action = { id: c.actionId };
                                                        return action;
                                                    }).filter(Boolean);
                                                    if (!priceAction.length)
                                                        return null;
                                                    return { ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction };
                                                }).filter(Boolean);
                                                if (!priceRows.length)
                                                    return null;
                                                return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows };
                                            }).filter(Boolean);
                                            if (addOnPriceEntries.length)
                                                addOn.price = addOnPriceEntries;
                                        }
                                        products.push(addOn);
                                    }
                                    if (products.length)
                                        ctb.product = products;
                                    // Resources
                                    const selectedPOObj2 = poList.find((p) => p.externalId === selectedPO);
                                    const poRsList = selectedPOObj2?.resourceSpecifications || [];
                                    const resources = [];
                                    const basePlanCorrelationId = productOptions.sharingProvider ? '2' : '1';
                                    for (const entry of selectedResources.filter(e => e.specExtId && e.value.trim())) {
                                        const rsLabel = entry.specExtId.replace(/[^a-zA-Z0-9_-]/g, '');
                                        const linkedRs = poRsList.find((r) => r.externalId === entry.specExtId);
                                        const commIdSpec = commIdSpecs.find((s) => s.externalId === entry.specExtId);
                                        const specId = entry.specId || linkedRs?.id || commIdSpec?.id || '';
                                        const res = {
                                            externalId: `${rsLabel}-${subRef}`,
                                            resourceNumber: entry.value,
                                            resourceSpecificationExternalId: entry.specExtId,
                                            productCorrelationId: [basePlanCorrelationId],
                                        };
                                        if (specId)
                                            res.resourceSpecificationId = specId;
                                        resources.push(res);
                                    }
                                    if (resources.length)
                                        ctb.resource = resources;
                                    // communicationIdentifier - only if explicitly selected via CommID Spec dropdown
                                    if (selectedCommIdSpec) {
                                        const msisdnRes = selectedResources.find(e => e.value.trim() && e.specExtId.toLowerCase().includes('msisdn'));
                                        ctb.communicationIdentifier = [{ communicationIdentifierSpecExternalId: selectedCommIdSpec, communicationId: msisdnRes?.value?.trim() || msisdn }];
                                    }
                                    if (homeTimeZone.trim()) {
                                        ctb.homeTimeZone = [{ timeZone: homeTimeZone.trim() }];
                                    }
                                    if (includeContactMediumAssoc) {
                                        ctb.contactMediumAssociation = selectedCmSpecs
                                            .filter(e => e.specExtId)
                                            .map(e => ({
                                            contactRole: 'Notification',
                                            language: 'en',
                                            contactMediumExternalId: e.externalId || `cm_${e.specExtId}_${subRef}`,
                                            enabled: true,
                                        }));
                                    }
                                    const cs2 = contractSpecs.find((s) => s.externalId === selectedContractSpec);
                                    const mustCharKeys = new Set((cs2 ? getMustChars(cs2.characteristics) : []).map((c) => c.externalId || c.id));
                                    const contractChars = Object.entries(formValues.contract)
                                        .filter(([k, v]) => !k.startsWith('_') && v?.trim() && mustCharKeys.has(k));
                                    if (contractChars.length)
                                        ctb.characteristic = contractChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }));
                                    setPartyJson(JSON.stringify(pb, null, 2));
                                    setCustomerJson(JSON.stringify(cb, null, 2));
                                    setContractJson(JSON.stringify(ctb, null, 2));
                                    setStep(2);
                                }, children: "Next \u2192 Review JSON" })] })] })), step === 2 && (_jsxs("div", { style: { display: 'grid', gap: 12, maxWidth: 700 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Step 3: Review & Edit JSON" }), _jsx("p", { style: { fontSize: 12, color: '#555', margin: 0 }, children: "Edit the request bodies before sending." }), _jsxs("div", { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600 }, children: "Send:" }), ['all', 'party', 'customer', 'contract'].map(m => (_jsxs("label", { style: { fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }, children: [_jsx("input", { type: "radio", name: "provisionMode", value: m, checked: provisionMode === m, onChange: () => setProvisionMode(m) }), m === 'all' ? 'All (Party + Customer + Contract)' : m.charAt(0).toUpperCase() + m.slice(1) + ' only'] }, m)))] }), _jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "1. Create Party" }) }), _jsx("textarea", { style: { width: '100%', fontFamily: 'monospace', fontSize: 11 }, rows: 8, value: partyJson, onChange: e => setPartyJson(e.target.value) })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "2. Create Customer" }) }), _jsx("textarea", { style: { width: '100%', fontFamily: 'monospace', fontSize: 11 }, rows: 10, value: customerJson, onChange: e => setCustomerJson(e.target.value) })] }), _jsxs("fieldset", { children: [_jsx("legend", { children: _jsx("b", { children: "3. Create Contract" }) }), _jsx("textarea", { style: { width: '100%', fontFamily: 'monospace', fontSize: 11 }, rows: 20, value: contractJson, onChange: e => setContractJson(e.target.value) })] }), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { onClick: () => setStep(1), children: "\u2190 Back" }), _jsx("button", { disabled: loading, onClick: submit, children: loading ? 'Provisioning...' : provisionMode === 'all' ? 'Provision All' : `Send ${provisionMode.charAt(0).toUpperCase() + provisionMode.slice(1)}` })] })] }))] }));
}
