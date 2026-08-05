import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
const API = '/api/v1';
export function POPublishPanel() {
    const [templates, setTemplates] = useState([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState('');
    const [selectedTemplateExtId, setSelectedTemplateExtId] = useState('');
    const [template, setTemplate] = useState(null);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [newExtId, setNewExtId] = useState('');
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [validStart, setValidStart] = useState('');
    const [validEnd, setValidEnd] = useState('');
    const [priceOverrides, setPriceOverrides] = useState({});
    const [charOverrides, setCharOverrides] = useState([]);
    const [relationships, setRelationships] = useState([]);
    const [showJson, setShowJson] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [updateExtId, setUpdateExtId] = useState('');
    const [updateVersion, setUpdateVersion] = useState('');
    const [unitsByMeasure, setUnitsByMeasure] = useState({});
    const [currencies, setCurrencies] = useState([]);
    useEffect(() => {
        fetch(`${API}/refdata/units`).then(r => r.ok ? r.json() : {}).then(setUnitsByMeasure).catch(() => { });
        fetch(`${API}/refdata/currencies`).then(r => r.ok ? r.json() : []).then(setCurrencies).catch(() => { });
    }, []);
    const fetchTemplates = async () => {
        setTemplatesLoading(true);
        setTemplatesError('');
        try {
            const r = await fetch(`${API}/catalog/productOffering/list?type=TEMPLATE`);
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            const data = await r.json();
            setTemplates(Array.isArray(data) ? data : []);
        }
        catch (e) {
            setTemplatesError(e.message);
        }
        setTemplatesLoading(false);
    };
    const loadTemplate = async () => {
        if (!selectedTemplateExtId)
            return;
        setFetchLoading(true);
        setError('');
        setResult(null);
        setTemplate(null);
        try {
            const r = await fetch(`${API}/catalog/productOffering?externalId=${encodeURIComponent(selectedTemplateExtId)}`);
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            const data = await r.json();
            const pot = Array.isArray(data) ? data[0] : data;
            setTemplate(pot);
            const po = {};
            for (const p of (pot.productOfferingPrice || [])) {
                const rows = JSON.parse(JSON.stringify(p.pricingLogicAlgorithm?.productOfferingPriceRow || []));
                po[p.externalId] = { name: p.name || '', operation: 'UPDATE', partyRoleInvolvementGroupRef: p.partyRoleInvolvementGroupRef || '', pricingRows: rows };
            }
            setPriceOverrides(po);
            setCharOverrides([]);
            setRelationships([]);
            setNewExtId('');
            setNewName('');
            setNewDesc('');
            setValidStart('');
            setValidEnd('');
            setUpdateExtId('');
            setUpdateVersion('');
        }
        catch (e) {
            setError(e.message);
        }
        setFetchLoading(false);
    };
    const sanitizePricingRows = (rows) => rows.map((row) => {
        const rowId = row.id;
        return {
            ...(rowId ? { productOfferingPriceRowRef: { id: rowId } } : {}),
            action: (row.action || []).map((act) => {
                const actionExtId = act.actionRef?.externalId || act.externalId;
                return {
                    ...(actionExtId ? { actionRef: { externalId: actionExtId } } : {}),
                    actionCharacteristicSpecificationUse: (act.actionCharacteristicSpecificationUse || []).map((acsu) => {
                        const acsuExtId = acsu.actionCharacteristicSpecificationUseRef?.externalId || acsu.externalId;
                        return {
                            ...(acsuExtId ? { actionCharacteristicSpecificationUseRef: { externalId: acsuExtId } } : {}),
                            actionCharacteristicSpecificationValueUse: (acsu.actionCharacteristicSpecificationValueUse || []).map((vu) => ({
                                ...(vu.value !== undefined && { value: vu.value }),
                                ...(vu.unitOfMeasure && { unitOfMeasure: vu.unitOfMeasure }),
                                ...(vu.valueReference && { valueReference: vu.valueReference }),
                            })),
                        };
                    }),
                };
            }),
        };
    });
    const stripIds = (obj, keepId = false) => {
        if (Array.isArray(obj))
            return obj.map(i => stripIds(i));
        if (obj && typeof obj === 'object') {
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                if (k === 'id' && !keepId)
                    continue;
                if (k === 'productOfferingTemplateRef' || k === 'valueReference' || k === 'productOfferingPriceRowRef' || k === 'productOfferingPolicyRef' || k === 'productOfferingPriceRef') {
                    out[k] = v;
                    continue;
                }
                out[k] = stripIds(v);
            }
            return out;
        }
        return obj;
    };
    const buildBody = () => {
        if (!template)
            return {};
        const body = {
            externalId: newExtId,
            name: newName || newExtId,
            description: newDesc || undefined,
            productOfferingTemplateRef: { id: template.id, externalId: template.externalId },
            productOfferingPrice: (template.productOfferingPrice || []).map((p) => {
                const ov = priceOverrides[p.externalId] || {};
                const isCreate = (ov.operation || 'UPDATE') === 'CREATE';
                const entry = {
                    externalId: isCreate ? (ov.name || p.externalId) : (ov.externalId || p.externalId),
                    name: ov.name || p.name || null,
                    operation: ov.operation || 'UPDATE',
                    productOfferingPriceRelationship: (p.productOfferingPriceRelationship || []).map((rel) => ({
                        ...(rel.externalId && { externalId: rel.externalId }),
                        ...(rel.type && { type: rel.type }),
                        ...(rel.productOfferingPriceRef && { productOfferingPriceRef: {
                                ...(rel.productOfferingPriceRef.externalId && { externalId: rel.productOfferingPriceRef.externalId }),
                            } }),
                    })),
                };
                if (ov.partyRoleInvolvementGroupRef)
                    entry.partyRoleInvolvementGroupRef = ov.partyRoleInvolvementGroupRef;
                if (p.id)
                    entry.productOfferingPriceRef = { id: p.id, externalId: p.externalId };
                else if (p.externalId)
                    entry.productOfferingPriceRef = { externalId: p.externalId };
                if (ov.pricingRows?.length)
                    entry.pricingLogicAlgorithm = { productOfferingPriceRow: sanitizePricingRows(ov.pricingRows) };
                return entry;
            }),
            ...(() => {
                const prices = template.productOfferingPrice || [];
                const allCreate = prices.every((p) => (priceOverrides[p.externalId]?.operation || 'UPDATE') === 'CREATE');
                if (allCreate)
                    return {};
                return {
                    productOfferingPolicyRef: prices.map((p) => {
                        const isCreate = (priceOverrides[p.externalId]?.operation || 'UPDATE') === 'CREATE';
                        return isCreate
                            ? { priceId: null, productOfferingPriceRef: [{ id: p.id, externalId: p.externalId }] }
                            : { productOfferingPriceRef: [{ id: p.id, externalId: p.externalId }] };
                    })
                };
            })(),
            productOfferingRelationship: relationships.filter(r => r.externalId).map(r => ({
                externalId: r.externalId, type: r.type || null, targetType: r.targetType || null,
            })),
            prodSpecCharValueUse: charOverrides.filter(c => c.refExternalId && c.value).map(c => ({
                productSpecificationCharacteristicValueUseRef: { externalId: c.refExternalId },
                productSpecCharacteristicValue: [{ value: c.value, isDefault: c.isDefault, unitOfMeasure: c.unitOfMeasure || null }],
            })),
        };
        if (validStart || validEnd) {
            body.validFor = {};
            if (validStart)
                body.validFor.startDateTime = validStart;
            if (validEnd)
                body.validFor.endDateTime = validEnd;
        }
        return body;
    };
    const publish = async () => {
        if (!newExtId.trim()) {
            setError('New External ID is required');
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const r = await fetch(`${API}/catalog/productOffering`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stripIds(buildBody()))
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setResult(await r.json());
        }
        catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };
    const update = async () => {
        if (!updateExtId || !updateVersion) {
            setError('External ID and Version required for update');
            return;
        }
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const body = stripIds(buildBody());
            const r = await fetch(`${API}/catalog/productOffering/externalId/${encodeURIComponent(updateExtId)}/version/${encodeURIComponent(updateVersion)}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setResult(await r.json());
        }
        catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };
    const setPriceOv = (extId, k, v) => setPriceOverrides(prev => ({ ...prev, [extId]: { ...prev[extId], [k]: v } }));
    return (_jsxs("div", { children: [_jsx("h2", { children: "\uD83D\uDCE4 PO Publish" }), _jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsx("legend", { children: _jsx("b", { children: "1. Load Template from RMCA Catalog" }) }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }, children: [_jsxs("div", { style: { flex: 1 }, children: [_jsx("button", { onClick: fetchTemplates, disabled: templatesLoading, style: { marginBottom: 6 }, children: templatesLoading ? '⏳ Fetching...' : '🔄 Fetch Template List' }), templatesError && _jsx("p", { style: { color: 'red', fontSize: 12, margin: '4px 0 0' }, children: templatesError }), templates.length > 0 ? (_jsxs("select", { style: { width: '100%' }, value: selectedTemplateExtId, onChange: e => setSelectedTemplateExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- Select template --" }), templates.map((t, i) => (_jsxs("option", { value: t.externalId, children: [t.name || t.externalId, " (", t.externalId, ")"] }, t.id || i)))] })) : (_jsx("input", { style: { width: '100%' }, placeholder: "Or type template externalId", value: selectedTemplateExtId, onChange: e => setSelectedTemplateExtId(e.target.value) }))] }), _jsx("button", { onClick: loadTemplate, disabled: fetchLoading || !selectedTemplateExtId, children: fetchLoading ? 'Loading...' : 'Load Template' })] }), template && (_jsxs("p", { style: { fontSize: 12, color: '#0a7', margin: '6px 0 0' }, children: ["\u2713 Loaded: ", _jsx("b", { children: template.name }), " (v", template.version, ") \u2014 ", (template.productOfferingPrice || []).length, " prices, ", (template.bucketSpecification || []).length, " buckets"] }))] }), template && (_jsxs(_Fragment, { children: [_jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsx("legend", { children: _jsx("b", { children: "2. New Product Offering Identity" }) }), _jsxs("div", { style: { display: 'grid', gap: 8 }, children: [_jsxs("label", { style: { fontSize: 13 }, children: ["External ID ", _jsx("span", { style: { color: 'red' }, children: "*" }), _jsx("input", { style: { width: '100%' }, value: newExtId, onChange: e => setNewExtId(e.target.value), placeholder: "e.g. PO_CHT_DATA_001" })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Name", _jsx("input", { style: { width: '100%' }, value: newName, onChange: e => setNewName(e.target.value), placeholder: newExtId || 'Display name' })] }), _jsxs("label", { style: { fontSize: 13 }, children: ["Description", _jsx("input", { style: { width: '100%' }, value: newDesc, onChange: e => setNewDesc(e.target.value), placeholder: "Optional description" })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsxs("label", { style: { fontSize: 13, flex: 1 }, children: ["Valid From", _jsx("input", { style: { width: '100%' }, type: "datetime-local", value: validStart, onChange: e => setValidStart(e.target.value ? e.target.value + '.000+00:00' : '') })] }), _jsxs("label", { style: { fontSize: 13, flex: 1 }, children: ["Valid To", _jsx("input", { style: { width: '100%' }, type: "datetime-local", value: validEnd, onChange: e => setValidEnd(e.target.value ? e.target.value + '.000+00:00' : '') })] })] })] })] }), _jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsxs("legend", { children: [_jsx("b", { children: "3. Prices" }), " ", _jsx("span", { style: { fontSize: 11, color: '#888', fontWeight: 'normal' }, children: "\u2014 inherited from template" })] }), (template.productOfferingPrice || []).map((p) => (_jsxs("div", { style: { border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600, flex: 1 }, children: p.name || p.externalId }), _jsxs("span", { style: { fontSize: 11, color: '#888' }, children: [p.priceType, p.priceSubType ? ' / ' + p.priceSubType : '', " \u00B7 ", p.paymentContext] }), _jsxs("select", { style: { fontSize: 12 }, value: priceOverrides[p.externalId]?.operation || 'UPDATE', onChange: e => setPriceOv(p.externalId, 'operation', e.target.value), children: [_jsx("option", { value: "UPDATE", children: "UPDATE (inherit)" }), _jsx("option", { value: "CREATE", children: "CREATE (new price)" })] })] }), _jsxs("div", { style: { display: 'grid', gap: 6, marginTop: 4 }, children: [_jsxs("label", { style: { fontSize: 12 }, children: ["Name override", _jsx("input", { style: { width: '100%' }, value: priceOverrides[p.externalId]?.name || '', onChange: e => setPriceOv(p.externalId, 'name', e.target.value), placeholder: p.name || p.externalId })] }), (priceOverrides[p.externalId]?.operation || 'UPDATE') === 'UPDATE' && (_jsxs("label", { style: { fontSize: 12 }, children: ["ExternalId override", _jsx("input", { style: { width: '100%' }, value: priceOverrides[p.externalId]?.externalId || '', onChange: e => setPriceOv(p.externalId, 'externalId', e.target.value), placeholder: p.externalId })] })), _jsxs("label", { style: { fontSize: 12 }, children: ["Party Role Involvement Group Ref", _jsx("input", { style: { width: '100%' }, value: priceOverrides[p.externalId]?.partyRoleInvolvementGroupRef || '', onChange: e => setPriceOv(p.externalId, 'partyRoleInvolvementGroupRef', e.target.value), placeholder: p.partyRoleInvolvementGroupRef || 'e.g. PRIG_001' })] })] }), (() => {
                                        const rows = priceOverrides[p.externalId]?.pricingRows || [];
                                        if (!rows.length)
                                            return null;
                                        return (_jsxs("div", { style: { marginTop: 8 }, children: [_jsx("div", { style: { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }, children: "Pricing Logic Rows" }), rows.map((row, ri) => (_jsxs("div", { style: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', marginBottom: 6 }, children: [_jsxs("div", { style: { fontSize: 11, color: '#6b7280', marginBottom: 4 }, children: ["Row: ", _jsx("b", { children: row.name || row.externalId || `#${ri + 1}` })] }), (row.action || []).map((act, ai) => (_jsxs("div", { style: { marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #d1d5db' }, children: [_jsxs("div", { style: { fontSize: 11, color: '#6b7280', marginBottom: 2 }, children: ["Action: ", _jsx("b", { children: act.actionRef?.externalId || act.name || `#${ai + 1}` })] }), (act.actionCharacteristicSpecificationUse || []).map((acsu, ci) => (_jsxs("div", { style: { marginBottom: 4 }, children: [_jsx("div", { style: { fontSize: 11, color: '#374151', marginBottom: 2 }, children: _jsx("b", { children: acsu.actionCharacteristicSpecificationUseRef?.externalId || acsu.name || acsu.externalId }) }), (acsu.actionCharacteristicSpecificationValueUse || []).map((vu, vi) => {
                                                                            const measure = (acsu.measure || acsu.actionCharacteristicSpecificationType || '');
                                                                            const unitOptions = (() => {
                                                                                if (currencies.includes(measure))
                                                                                    return currencies.length ? currencies : [measure];
                                                                                if (measure && unitsByMeasure[measure]?.length)
                                                                                    return unitsByMeasure[measure];
                                                                                if (vu.unitOfMeasure) {
                                                                                    const all = Object.values(unitsByMeasure).flat();
                                                                                    return all.length ? all : [vu.unitOfMeasure];
                                                                                }
                                                                                return [];
                                                                            })();
                                                                            const hasUnit = vu.unitOfMeasure !== undefined;
                                                                            return (_jsxs("div", { style: { display: 'flex', gap: 4, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 2, fontSize: 12 }, placeholder: "value", value: vu.value ?? '', onChange: e => {
                                                                                            const updated = JSON.parse(JSON.stringify(rows));
                                                                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].value = e.target.value;
                                                                                            setPriceOv(p.externalId, 'pricingRows', updated);
                                                                                        } }), hasUnit && unitOptions.length > 0 ? (_jsx("select", { style: { flex: 1, fontSize: 12 }, value: vu.unitOfMeasure ?? '', onChange: e => {
                                                                                            const updated = JSON.parse(JSON.stringify(rows));
                                                                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value;
                                                                                            setPriceOv(p.externalId, 'pricingRows', updated);
                                                                                        }, children: unitOptions.map(u => _jsx("option", { value: u, children: u }, u)) })) : hasUnit ? (_jsx("input", { style: { flex: 1, fontSize: 12 }, placeholder: "unit", value: vu.unitOfMeasure ?? '', onChange: e => {
                                                                                            const updated = JSON.parse(JSON.stringify(rows));
                                                                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value;
                                                                                            setPriceOv(p.externalId, 'pricingRows', updated);
                                                                                        } })) : null] }, vi));
                                                                        })] }, ci)))] }, ai)))] }, ri)))] }));
                                    })()] }, p.externalId)))] }), _jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsx("legend", { children: _jsx("b", { children: "4. Characteristic Value Overrides" }) }), _jsx("p", { style: { fontSize: 12, color: '#666', margin: '0 0 8px' }, children: "Override specific characteristic values from the template." }), charOverrides.map((c, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 2 }, placeholder: "Characteristic Spec ExternalId", value: c.refExternalId, onChange: e => { const u = [...charOverrides]; u[i] = { ...u[i], refExternalId: e.target.value }; setCharOverrides(u); } }), _jsx("input", { style: { flex: 2 }, placeholder: "Value", value: c.value, onChange: e => { const u = [...charOverrides]; u[i] = { ...u[i], value: e.target.value }; setCharOverrides(u); } }), _jsx("input", { style: { flex: 1 }, placeholder: "Unit (e.g. MB)", value: c.unitOfMeasure, onChange: e => { const u = [...charOverrides]; u[i] = { ...u[i], unitOfMeasure: e.target.value }; setCharOverrides(u); } }), _jsxs("label", { style: { fontSize: 11, whiteSpace: 'nowrap' }, children: [_jsx("input", { type: "checkbox", checked: c.isDefault, onChange: e => { const u = [...charOverrides]; u[i] = { ...u[i], isDefault: e.target.checked }; setCharOverrides(u); } }), " default"] }), _jsx("button", { style: { fontSize: 11 }, onClick: () => setCharOverrides(charOverrides.filter((_, j) => j !== i)), children: "\u2715" })] }, i))), _jsx("button", { style: { fontSize: 11 }, onClick: () => setCharOverrides([...charOverrides, { refExternalId: '', value: '', unitOfMeasure: '', isDefault: true }]), children: "+ Add Override" })] }), _jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsx("legend", { children: _jsx("b", { children: "5. Product Offering Relationships" }) }), relationships.map((r, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 2 }, placeholder: "Target PO ExternalId", value: r.externalId, onChange: e => { const u = [...relationships]; u[i] = { ...u[i], externalId: e.target.value }; setRelationships(u); } }), _jsx("input", { style: { flex: 1 }, placeholder: "Type (e.g. bundled)", value: r.type, onChange: e => { const u = [...relationships]; u[i] = { ...u[i], type: e.target.value }; setRelationships(u); } }), _jsx("input", { style: { flex: 1 }, placeholder: "Target Type", value: r.targetType, onChange: e => { const u = [...relationships]; u[i] = { ...u[i], targetType: e.target.value }; setRelationships(u); } }), _jsx("button", { style: { fontSize: 11 }, onClick: () => setRelationships(relationships.filter((_, j) => j !== i)), children: "\u2715" })] }, i))), _jsx("button", { style: { fontSize: 11 }, onClick: () => setRelationships([...relationships, { externalId: '', type: '', targetType: '' }]), children: "+ Add Relationship" })] }), _jsxs("fieldset", { style: { marginBottom: 12 }, children: [_jsxs("legend", { children: [_jsx("b", { children: "6. Update Existing PO" }), " ", _jsx("span", { style: { fontSize: 11, color: '#888', fontWeight: 'normal' }, children: "\u2014 fill only for PATCH" })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsxs("label", { style: { fontSize: 13, flex: 2 }, children: ["ExternalId to update", _jsx("input", { style: { width: '100%' }, value: updateExtId, onChange: e => setUpdateExtId(e.target.value), placeholder: "existing PO externalId" })] }), _jsxs("label", { style: { fontSize: 13, flex: 1 }, children: ["Version", _jsx("input", { style: { width: '100%' }, value: updateVersion, onChange: e => setUpdateVersion(e.target.value), placeholder: "e.g. 1784615970701" })] })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }, children: [_jsx("button", { disabled: loading, onClick: publish, style: { background: '#1d4ed8', color: '#fff', padding: '6px 16px', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: loading ? 'Publishing...' : '🚀 Publish (POST)' }), _jsx("button", { disabled: loading, onClick: update, style: { padding: '6px 16px' }, children: loading ? 'Updating...' : '✏️ Update (PATCH)' }), _jsxs("button", { style: { fontSize: 11, padding: '4px 10px' }, onClick: () => setShowJson(s => !s), children: [showJson ? 'Hide' : 'Preview', " JSON"] })] }), showJson && (_jsx("pre", { style: { background: '#f5f5f5', padding: 10, borderRadius: 4, fontSize: 11, maxHeight: 400, overflow: 'auto', marginBottom: 12 }, children: JSON.stringify(buildBody(), null, 2) })), error && _jsxs("p", { style: { color: 'red', wordBreak: 'break-all' }, children: ["\u274C ", error] }), result && (_jsx("pre", { style: { background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }, children: JSON.stringify(result, null, 2) }))] }))] }));
}
