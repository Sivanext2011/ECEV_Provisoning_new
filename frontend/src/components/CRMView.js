import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useEffect } from 'react';
const API = '/api/v1';
// === Helper Components ===
function StatusBadge({ status }) {
    const s = (status || '').toLowerCase();
    const color = s.includes('active') ? '#1a7f37' : s.includes('halt') || s.includes('suspend') ? '#b45309' : s.includes('terminat') ? '#b91c1c' : s.includes('creat') ? '#1d4ed8' : '#555';
    const bg = s.includes('active') ? '#dcfce7' : s.includes('halt') || s.includes('suspend') ? '#fef3c7' : s.includes('terminat') ? '#fee2e2' : s.includes('creat') ? '#dbeafe' : '#f3f4f6';
    return _jsx("span", { style: { fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}40`, borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' }, children: status || '—' });
}
function InfoRow({ label, value }) {
    if (!value && value !== 0)
        return null;
    return (_jsxs("div", { style: { display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }, children: [_jsx("span", { style: { color: '#888', minWidth: 160, flexShrink: 0 }, children: label }), _jsx("span", { style: { color: '#222', wordBreak: 'break-all' }, children: String(value) })] }));
}
function Card({ title, icon, color, defaultOpen, rawData, children }) {
    const [open, setOpen] = React.useState(defaultOpen ?? true);
    const [showRaw, setShowRaw] = React.useState(false);
    return (_jsxs("div", { style: { border: `1px solid ${color}40`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }, children: [_jsxs("div", { style: { background: `${color}15`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }, onClick: () => setOpen(o => !o), children: [_jsx("span", { style: { fontSize: 16 }, children: icon }), _jsx("span", { style: { fontWeight: 600, fontSize: 13, flex: 1, color: '#222' }, children: title }), rawData !== undefined && open && (_jsx("button", { style: { fontSize: 10, padding: '1px 6px', background: showRaw ? '#555' : '#eee', color: showRaw ? '#fff' : '#555', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }, onClick: e => { e.stopPropagation(); setShowRaw(r => !r); }, children: showRaw ? 'Visual' : 'Raw JSON' })), _jsx("span", { style: { fontSize: 11, color: '#999' }, children: open ? '▲' : '▼' })] }), open && (_jsx("div", { style: { padding: '10px 14px' }, children: showRaw
                    ? _jsx("pre", { style: { fontSize: 11, margin: 0, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: 8, borderRadius: 4 }, children: JSON.stringify(rawData, null, 2) })
                    : children }))] }));
}
function SectionHeader({ title }) {
    return _jsx("h3", { style: { margin: '16px 0 10px', fontSize: 14, borderBottom: '2px solid #eee', paddingBottom: 6 }, children: title });
}
// === Utility functions ===
const fmtDate = (dt) => {
    if (!dt || dt.startsWith('0001') || dt.startsWith('9999'))
        return null;
    return dt.replace('T', ' ').slice(0, 16) + ' UTC';
};
const flattenBuckets = (data) => {
    const billing = [];
    const prods = {};
    if (!data)
        return { billing, products: prods };
    const arr = Array.isArray(data) ? data : [data];
    for (const item of arr) {
        for (const ba of (item.billingAccount || [])) {
            for (const b of (ba.bucket || []))
                billing.push({ ...b, _baExternalId: ba.externalId });
        }
        for (const prod of (item.product || [])) {
            const key = prod.externalId || prod.id;
            if (key)
                prods[key] = (prod.bucket || []).map((b) => ({ ...b, _productExternalId: key }));
        }
    }
    return { billing, products: prods };
};
const fmtBytes = (n) => {
    if (n >= 1073741824)
        return `${(n / 1073741824).toFixed(2)} GB`;
    if (n >= 1048576)
        return `${(n / 1048576).toFixed(2)} MB`;
    if (n >= 1024)
        return `${(n / 1024).toFixed(2)} KB`;
    return `${n} B`;
};
// === Main Component ===
export function CRMView() {
    // Search state
    const [searchType, setSearchType] = useState('msisdn');
    const [searchValue, setSearchValue] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // Data state
    const [party, setParty] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [contract, setContract] = useState(null);
    const [balance, setBalance] = useState(null);
    const [specs, setSpecs] = useState(null);
    // Action state
    const [actionMsg, setActionMsg] = useState('');
    const [actionErr, setActionErr] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    // Add Product form state
    const [showAddProduct, setShowAddProduct] = useState(false);
    const [newPO, setNewPO] = useState('');
    const [newProductExtId, setNewProductExtId] = useState('');
    const [newProductName, setNewProductName] = useState('');
    const [newProductBaRef, setNewProductBaRef] = useState(true);
    const [newProductBaRefRecurrence, setNewProductBaRefRecurrence] = useState(true);
    const [newProductChars, setNewProductChars] = useState([]);
    const [newProductResources, setNewProductResources] = useState([]);
    const [newProductSharingProvider, setNewProductSharingProvider] = useState(false);
    const [newProductSharingConsumer, setNewProductSharingConsumer] = useState(false);
    const [newProductProviderExtId, setNewProductProviderExtId] = useState('');
    const [newProductConsumerListExtId, setNewProductConsumerListExtId] = useState('');
    const [poSpecs, setPoSpecs] = useState(null);
    // POP Personalization state (for Add Product)
    const [popPersonalization, setPopPersonalization] = useState([]);
    const [popValues, setPopValues] = useState({});
    const [popEnabled, setPopEnabled] = useState(false);
    const [popSelected, setPopSelected] = useState({});
    const [popLoading, setPopLoading] = useState(false);
    // Balance top-up state
    const [showTopUp, setShowTopUp] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState('');
    const [topUpUnit, setTopUpUnit] = useState('euro');
    const [topUpDecimalPlaces, setTopUpDecimalPlaces] = useState('0');
    const [topUpProductExtId, setTopUpProductExtId] = useState('');
    // Run Recurring state
    const [showRecurring, setShowRecurring] = useState(false);
    const [recurringResult, setRecurringResult] = useState(null);
    // Provider/Consumer state
    const [showProviderConsumer, setShowProviderConsumer] = useState(false);
    const [pcAction, setPcAction] = useState('viewConsumers');
    const [pcConsumerMsisdn, setPcConsumerMsisdn] = useState('');
    const [pcConsumerCustExtId, setPcConsumerCustExtId] = useState('');
    const [pcConsumerContractExtId, setPcConsumerContractExtId] = useState('');
    const [pcConsumerListExtId, setPcConsumerListExtId] = useState('');
    const [pcProviderProductExtId, setPcProviderProductExtId] = useState('');
    const [pcResult, setPcResult] = useState(null);
    const [pcLookupLoading, setPcLookupLoading] = useState(false);
    const [pcConsumerPO, setPcConsumerPO] = useState('');
    const [pcConsumerProductExtId, setPcConsumerProductExtId] = useState('');
    const [pcConsumerBaRef, setPcConsumerBaRef] = useState(true);
    const [pcPopPersonalization, setPcPopPersonalization] = useState([]);
    const [pcPopValues, setPcPopValues] = useState({});
    const [pcPopEnabled, setPcPopEnabled] = useState(false);
    const [pcPopSelected, setPcPopSelected] = useState({});
    const [pcPopLoading, setPcPopLoading] = useState(false);
    const [pcLinkedConsumerPO, setPcLinkedConsumerPO] = useState(null);
    // Modify POP state
    const [modifyPopProduct, setModifyPopProduct] = useState(''); // product externalId being modified
    const [modifyPopData, setModifyPopData] = useState([]);
    const [modifyPopValues, setModifyPopValues] = useState({});
    const [modifyPopSelected, setModifyPopSelected] = useState({});
    const [modifyPopLoading, setModifyPopLoading] = useState(false);
    // Set Sharing Limits state
    const [limitCommonValue, setLimitCommonValue] = useState('');
    const [limitCommonUnit, setLimitCommonUnit] = useState('byte');
    const [limitIndividualValue, setLimitIndividualValue] = useState('');
    const [limitIndividualUnit, setLimitIndividualUnit] = useState('byte');
    const [limitConsumerMsisdn, setLimitConsumerMsisdn] = useState('');
    const [limitConsumerCustExtId, setLimitConsumerCustExtId] = useState('');
    const [limitConsumerContractExtId, setLimitConsumerContractExtId] = useState('');
    const [limitConsumerProductExtId, setLimitConsumerProductExtId] = useState('');
    // Add Contract state
    const [showAddContract, setShowAddContract] = useState(false);
    const [newContractExtId, setNewContractExtId] = useState('');
    const [newContractSpecExtId, setNewContractSpecExtId] = useState('');
    const [newContractTimeZone, setNewContractTimeZone] = useState('Europe/Stockholm');
    const [newContractPO, setNewContractPO] = useState('');
    const [newContractProductExtId, setNewContractProductExtId] = useState('');
    const [newContractMsisdn, setNewContractMsisdn] = useState('');
    const [newContractImsi, setNewContractImsi] = useState('');
    const [newContractCommIdSpec, setNewContractCommIdSpec] = useState('');
    const [newContractBaRef, setNewContractBaRef] = useState(true);
    const [newContractChars, setNewContractChars] = useState([]);
    const [newContractSharingProvider, setNewContractSharingProvider] = useState(false);
    // Resource Swap state
    const [showResourceSwap, setShowResourceSwap] = useState(false);
    const [rsOldResourceNumber, setRsOldResourceNumber] = useState('');
    const [rsNewResourceNumber, setRsNewResourceNumber] = useState('');
    const [rsResourceSpecExtId, setRsResourceSpecExtId] = useState('');
    const [rsProductExtId, setRsProductExtId] = useState('');
    // Balance Adjustment state
    const [showBalanceAdj, setShowBalanceAdj] = useState(false);
    const [baAdjType, setBaAdjType] = useState('billing');
    const [baAdjAmount, setBaAdjAmount] = useState('');
    const [baAdjUnit, setBaAdjUnit] = useState('euro');
    const [baAdjDecimalPlaces, setBaAdjDecimalPlaces] = useState('0');
    const [baAdjReason, setBaAdjReason] = useState('');
    const [baAdjProductExtId, setBaAdjProductExtId] = useState('');
    // Product Replace state
    const [showProductReplace, setShowProductReplace] = useState(false);
    const [prOldProductExtId, setPrOldProductExtId] = useState('');
    const [prNewPO, setPrNewPO] = useState('');
    const [prNewProductExtId, setPrNewProductExtId] = useState('');
    // Financial/Billing view state
    const [showFinancial, setShowFinancial] = useState(false);
    const [financialTab, setFinancialTab] = useState('transactions');
    const [financialData, setFinancialData] = useState(null);
    const [financialLoading, setFinancialLoading] = useState(false);
    // Update Party/Customer state
    const [showUpdateEntity, setShowUpdateEntity] = useState(false);
    const [updateTarget, setUpdateTarget] = useState('party');
    const [updatePartyGivenName, setUpdatePartyGivenName] = useState('');
    const [updatePartyFamilyName, setUpdatePartyFamilyName] = useState('');
    const [updatePartyStatus, setUpdatePartyStatus] = useState('');
    const [updateCustStatus, setUpdateCustStatus] = useState('');
    const [updateChars, setUpdateChars] = useState([]);
    useEffect(() => {
        fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => { });
    }, []);
    const search = async () => {
        setLoading(true);
        setError('');
        setParty(null);
        setCustomer(null);
        setContract(null);
        setBalance(null);
        setActionMsg('');
        setActionErr('');
        try {
            if (searchType === 'msisdn') {
                const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(`extID-party-${searchValue}`)}`);
                if (pr.ok)
                    setParty(await pr.json());
                const custr = await fetch(`${API}/customer?msisdn=${encodeURIComponent(searchValue)}`);
                if (custr.ok)
                    setCustomer(await custr.json());
                const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(searchValue)}`);
                if (cr.ok)
                    setContract(await cr.json());
                const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(searchValue)}`);
                if (balr.ok)
                    setBalance(await balr.json());
            }
            else if (searchType === 'externalId') {
                const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(searchValue)}`);
                if (pr.ok)
                    setParty(await pr.json());
                const msisdnFromExt = searchValue.replace('extID-party-', '').replace('extID-customer-', '').replace('extID-contract-', '');
                const custExtId = searchValue.startsWith('extID-customer-') ? searchValue : `extID-customer-${msisdnFromExt}`;
                const custr = await fetch(`${API}/customer?externalId=${encodeURIComponent(custExtId)}`);
                if (custr.ok)
                    setCustomer(await custr.json());
                if (msisdnFromExt) {
                    const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdnFromExt)}`);
                    if (cr.ok)
                        setContract(await cr.json());
                    const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(msisdnFromExt)}`);
                    if (balr.ok)
                        setBalance(await balr.json());
                }
            }
            else {
                const custr = await fetch(`${API}/customer?id=${encodeURIComponent(searchValue)}`);
                if (custr.ok)
                    setCustomer(await custr.json());
            }
        }
        catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };
    // Derived values
    const p0 = Array.isArray(party) ? party[0] : party;
    const cu = Array.isArray(customer) ? customer[0] : customer;
    const c = Array.isArray(contract) ? contract[0] : contract;
    const custExtId = cu?.externalId || '';
    const contractExtId = c?.externalId || '';
    const baExtId = cu?.account?.[0]?.externalId || '';
    const contractStatus = c?.status?.slice(-1)[0]?.status || '';
    const products = c?.product || [];
    const poList = specs?.productOfferings || [];
    const resourceSpecs = specs?.resourceSpecifications || [];
    const contractSpecs = specs?.contractSpecifications || [];
    const commIdSpecs = specs?.communicationIdentifierSpecifications || [];
    const msisdnValue = searchType === 'msisdn' ? searchValue : '';
    // Load PO spec when product offering is selected for Add Product
    useEffect(() => {
        if (!newPO) {
            setPoSpecs(null);
            setPopPersonalization([]);
            setPopValues({});
            setPopEnabled(false);
            setPopSelected({});
            setNewProductSharingProvider(false);
            setNewProductSharingConsumer(false);
            return;
        }
        const po = poList.find((p) => p.externalId === newPO);
        setPoSpecs(po || null);
        setNewProductExtId(`${newPO}-${Date.now().toString(36)}`);
        setNewProductName(po?.name || newPO);
        // Pre-populate characteristics from PO productSpecification
        const chars = po?.characteristics || po?.productSpecification?.characteristics || [];
        const mustChars = chars.filter((ch) => ch.valueRegulator === 'mustBePersonalized' || ch.valueRegulator === 'canBePersonalized');
        setNewProductChars(mustChars.map((ch) => ({ charSpecExternalId: ch.externalId || ch.id, value: ch.defaultValue || '' })));
        // Pre-populate resource specs from PO
        const resSpecs = po?.resourceSpecifications || [];
        setNewProductResources(resSpecs.map((rs) => ({ specExternalId: rs.externalId || rs.id || '', resourceNumber: '', externalId: '' })));
        // Auto-detect sharing type from catalog offeringTypes
        const types = (po?.offeringTypes || []).map((t) => t.toUpperCase());
        if (types.includes('SHARING_PROVIDER') || types.includes('PROVIDER') || (po?.name || '').toLowerCase().includes('technical')) {
            setNewProductSharingProvider(true);
            setNewProductSharingConsumer(false);
        }
        else if (types.includes('SHARING_CONSUMER') || types.includes('CONSUMER')) {
            setNewProductSharingConsumer(true);
            setNewProductSharingProvider(false);
        }
        else {
            setNewProductSharingProvider(false);
            setNewProductSharingConsumer(false);
        }
        // Also fetch live PO spec to check for sharingProviderSpecification
        fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(newPO)}`)
            .then(r => r.ok ? r.json() : null)
            .then((data) => {
            const poSpec = Array.isArray(data) ? data[0] : data;
            if (poSpec?.sharingProviderSpecification || poSpec?.sharingProviderSpecificationExternalId) {
                setNewProductSharingProvider(true);
                setNewProductSharingConsumer(false);
            }
            else if (poSpec?.sharingConsumerSpecification || poSpec?.sharingConsumerSpecificationExternalId) {
                setNewProductSharingConsumer(true);
                setNewProductSharingProvider(false);
            }
        })
            .catch(() => { });
        // Fetch POP personalization from live spec enquiry
        setPopPersonalization([]);
        setPopValues({});
        setPopEnabled(false);
        setPopSelected({});
        setPopLoading(true);
        fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(newPO)}`)
            .then(r => r.ok ? r.json() : [])
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
            .catch(() => setPopLoading(false));
    }, [newPO]);
    // === Action handlers ===
    const patchContract = async (body) => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const r = await fetch(`${API}/execute/update_contract`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, _params: { customerExternalId: custExtId, contractExternalId: contractExtId } })
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ Success');
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    const changeContractStatus = (status) => patchContract({ status: [{ status }] });
    const changeProductStatus = (productExtId, status) => patchContract({ product: [{ externalId: productExtId, status: [{ status }] }] });
    const purchaseProduct = () => {
        if (!newPO || !newProductExtId)
            return;
        const product = {
            productOfferingExternalId: newPO,
            externalId: newProductExtId,
            name: newProductName || newPO,
            status: [{ status: 'ProductCreated' }],
        };
        if (newProductBaRef && baExtId) {
            product.billingAccountReference = { externalId: baExtId };
        }
        if (newProductBaRefRecurrence && baExtId) {
            product.baRefForBillCycleAlignedRecurrence = { externalId: baExtId };
        }
        // Add characteristics with unitOfMeasure from spec
        const validChars = newProductChars.filter(ch => ch.charSpecExternalId && ch.value);
        if (validChars.length > 0) {
            const po = poList.find((p) => p.externalId === newPO);
            const poChars = po?.characteristics || [];
            const MEASURE_TO_UNIT = { 'Data': 'megabyte', 'Duration': 'hour', 'Money': 'euro', 'Voice': 'second' };
            product.characteristic = validChars.map(ch => {
                const specChar = poChars.find((c) => (c.externalId || c.id) === ch.charSpecExternalId);
                let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || '';
                if (!unit && specChar?.unitOfMeasure && MEASURE_TO_UNIT[specChar.unitOfMeasure])
                    unit = MEASURE_TO_UNIT[specChar.unitOfMeasure];
                const valObj = { value: ch.value };
                if (unit)
                    valObj.unitOfMeasure = unit;
                return { charSpecExternalId: ch.charSpecExternalId, value: [valObj] };
            });
        }
        // Add sharing provider config
        if (newProductSharingProvider && baExtId) {
            product.sharingProvider = {
                billingAccount: [{ externalId: baExtId }],
                consumerList: [{
                        externalId: newProductConsumerListExtId || `Consumer_List_${newProductExtId}`,
                        consumerCustomerExternalId: custExtId,
                        consumerContractExternalId: contractExtId,
                    }]
            };
        }
        // Add sharing consumer config
        if (newProductSharingConsumer) {
            product.sharingConsumer = {
                providerCustomerExternalId: custExtId,
                providerContractExternalId: contractExtId,
                providerProductExternalId: newProductProviderExtId,
                consumerListEntryExternalId: newProductConsumerListExtId,
            };
        }
        // Add POP price personalization
        if (popEnabled && popPersonalization.length > 0) {
            const priceEntries = popPersonalization
                .filter((pop) => popSelected[pop.popId])
                .map((pop) => {
                const priceRows = (pop.rows || []).map((row) => {
                    const priceAction = (row.chars || []).map((c) => {
                        const val = popValues[`${pop.popId}_${row.rowId}_${c.id}`];
                        if (!val?.value?.trim())
                            return null;
                        const char = { value: [{ value: val.value }] };
                        if (val.unit)
                            char.value[0].unitOfMeasure = val.unit;
                        if (c.externalId)
                            char.charSpecExternalId = c.externalId;
                        else
                            char.charSpecId = c.id;
                        const action = { characteristic: [char] };
                        if (c.actionId)
                            action.action = { id: c.actionId };
                        else if (c.actionExternalId)
                            action.action = { externalId: c.actionExternalId };
                        return action;
                    }).filter(Boolean);
                    if (!priceAction.length)
                        return null;
                    return {
                        ...(row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}),
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
                product.price = priceEntries;
        }
        // Build the update body
        const body = { product: [product] };
        // Add resources tied to this product
        const validResources = newProductResources.filter(r => r.resourceNumber);
        if (validResources.length > 0) {
            body.resource = validResources.map(r => ({
                resourceSpecificationExternalId: r.specExternalId,
                resourceNumber: r.resourceNumber,
                externalId: r.externalId || `LRS_${r.specExternalId}_${r.resourceNumber}`,
                productCorrelationId: [product.correlationId || '1'],
            }));
        }
        patchContract(body);
        setShowAddProduct(false);
        setNewPO('');
    };
    const doBalanceTopUp = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const body = {
                customerExternalId: custExtId,
                contractExternalId: contractExtId,
                msisdn: msisdnValue || searchValue,
                amount: parseInt(topUpAmount),
                unit: topUpUnit,
                decimalPlaces: parseInt(topUpDecimalPlaces) || 0,
            };
            const r = await fetch(`${API}/balance/topup`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ Balance top-up successful');
            setShowTopUp(false);
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    const doRunRecurring = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        setRecurringResult(null);
        try {
            const commId = msisdnValue || searchValue;
            const r = await fetch(`${API}/recurrence?communicationId=${encodeURIComponent(commId)}&communicationIdType=E.164`);
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            const data = await r.json();
            setRecurringResult(data);
            setActionMsg('✓ Recurrence enquiry complete');
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    const lookupConsumerByMsisdn = async (msisdn) => {
        if (!msisdn)
            return;
        setPcLookupLoading(true);
        setActionErr('');
        try {
            // Fetch customer by MSISDN
            const custR = await fetch(`${API}/customer?msisdn=${encodeURIComponent(msisdn)}`);
            if (custR.ok) {
                const custData = await custR.json();
                const cu2 = Array.isArray(custData) ? custData[0] : custData;
                if (cu2?.externalId)
                    setPcConsumerCustExtId(cu2.externalId);
            }
            // Fetch contract by MSISDN
            const ctrR = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdn)}`);
            if (ctrR.ok) {
                const ctrData = await ctrR.json();
                const c2 = Array.isArray(ctrData) ? ctrData[0] : ctrData;
                if (c2?.externalId)
                    setPcConsumerContractExtId(c2.externalId);
            }
            // Consumer list entry ID is per-consumer: ConsumerEntry-<consumerMsisdn>
            // (NOT the provider's existing list entry - each consumer gets their own entry in the same list)
            const providerProduct = products.find((p) => p.externalId === pcProviderProductExtId || p.sharingProvider);
            const existingListExtId = providerProduct?.sharingProvider?.consumerList?.[0]?.externalId || '';
            // Generate entry ID for this new consumer
            setPcConsumerListExtId(`ConsumerEntry-${msisdn}`);
        }
        catch (e) {
            setActionErr(`Lookup failed: ${e.message}`);
        }
        setPcLookupLoading(false);
    };
    const doProviderConsumerAction = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        setPcResult(null);
        try {
            if (pcAction === 'viewConsumers') {
                // Check if this subscriber has provider products - if so, show their consumer list from loaded data
                const providerProducts = products.filter((p) => p.sharingProvider);
                const consumerProducts = products.filter((p) => p.sharingConsumer);
                if (providerProducts.length > 0) {
                    // This subscriber is a PROVIDER - show their consumer list
                    const consumers = providerProducts.flatMap((p) => (p.sharingProvider?.consumerList || []).map((cl) => ({
                        providerProduct: p.externalId,
                        providerPO: p.productOfferingExternalId,
                        consumerListExtId: cl.externalId,
                        consumerCustomer: cl.consumerCustomerExternalId,
                        consumerContract: cl.consumerContractExternalId,
                        status: cl.status?.slice(-1)[0]?.status || 'Active',
                    })));
                    setPcResult({ _type: 'provider', consumers, message: `This subscriber is a PROVIDER with ${consumers.length} consumer(s)` });
                    setActionMsg(`✓ Provider with ${consumers.length} consumer(s) — from loaded contract data`);
                }
                else if (consumerProducts.length > 0) {
                    // This subscriber is a CONSUMER - show their sharing consumer details
                    const consumerInfo = consumerProducts.map((p) => ({
                        productExtId: p.externalId,
                        productPO: p.productOfferingExternalId,
                        providerCustomer: p.sharingConsumer.providerCustomerExternalId,
                        providerContract: p.sharingConsumer.providerContractExternalId,
                        providerProduct: p.sharingConsumer.providerProductExternalId,
                        consumerListEntry: p.sharingConsumer.consumerListEntryExternalId,
                        status: p.status?.slice(-1)[0]?.status || '',
                    }));
                    setPcResult({ _type: 'consumer', consumerInfo, message: `This subscriber is a CONSUMER in ${consumerInfo.length} sharing group(s)` });
                    setActionMsg(`✓ Consumer in ${consumerInfo.length} sharing group(s) — from loaded contract data`);
                }
                else {
                    // Try fetching consumer products from API
                    const commId = msisdnValue || searchValue;
                    const params = new URLSearchParams();
                    if (custExtId)
                        params.append('customerExternalId', custExtId);
                    if (commId) {
                        params.append('communicationId', commId);
                        params.append('communicationIdType', 'E.164');
                    }
                    const r = await fetch(`${API}/subscription/consumerProduct?${params.toString()}`);
                    if (!r.ok) {
                        const errText = (await r.json()).detail || '';
                        if (errText.includes('partition') || r.status === 400) {
                            setPcResult({ _type: 'none', message: 'This subscriber has no consumer products (not a consumer in any sharing group)' });
                            setActionMsg('ℹ No consumer products found');
                        }
                        else {
                            throw new Error(errText || `HTTP ${r.status}`);
                        }
                    }
                    else {
                        setPcResult(await r.json());
                        setActionMsg('✓ Consumer products loaded');
                    }
                }
            }
            else if (pcAction === 'addConsumer') {
                const consumerListExt = pcConsumerListExtId || `Consumer_List_${pcConsumerMsisdn}`;
                const consumerProdExtId = pcConsumerProductExtId || `${pcConsumerPO}-${pcConsumerMsisdn}`;
                // Step 1: Add consumer to provider's consumerList (must exist before consumer PO can reference it)
                const providerBody = {
                    product: [{
                            externalId: pcProviderProductExtId,
                            sharingProvider: {
                                consumerList: [{
                                        externalId: consumerListExt,
                                        consumerCustomerExternalId: pcConsumerCustExtId,
                                        consumerContractExternalId: pcConsumerContractExtId,
                                    }]
                            }
                        }],
                    _params: { customerExternalId: custExtId, contractExternalId: contractExtId }
                };
                const r1 = await fetch(`${API}/execute/update_contract`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(providerBody)
                });
                if (!r1.ok)
                    throw new Error(`Provider consumerList update failed: ${(await r1.json()).detail || r1.status}`);
                // Step 2: Add consumer product to consumer's contract (now the consumerList entry exists)
                if (pcConsumerPO && pcConsumerCustExtId && pcConsumerContractExtId) {
                    const consumerProduct = {
                        productOfferingExternalId: pcConsumerPO,
                        externalId: consumerProdExtId,
                        name: consumerProdExtId,
                        status: [{ status: 'ProductCreated' }],
                        sharingConsumer: {
                            providerCustomerExternalId: custExtId,
                            providerContractExternalId: contractExtId,
                            providerProductExternalId: pcProviderProductExtId,
                            consumerListEntryExternalId: consumerListExt,
                        }
                    };
                    // Add BA reference from consumer's billing account
                    if (pcConsumerBaRef) {
                        consumerProduct.billingAccountReference = { externalId: `extID_BA-${pcConsumerMsisdn}` };
                        consumerProduct.baRefForBillCycleAlignedRecurrence = { externalId: `extID_BA-${pcConsumerMsisdn}` };
                    }
                    // Add POP price personalization (consumer limits)
                    if (pcPopEnabled && pcPopPersonalization.length > 0) {
                        const priceEntries = pcPopPersonalization
                            .filter((pop) => pcPopSelected[pop.popId])
                            .map((pop) => {
                            const priceRows = (pop.rows || []).map((row) => {
                                const priceAction = (row.chars || []).map((c) => {
                                    const val = pcPopValues[`${pop.popId}_${row.rowId}_${c.id}`];
                                    if (!val?.value?.trim())
                                        return null;
                                    const char = { value: [{ value: val.value }] };
                                    if (val.unit)
                                        char.value[0].unitOfMeasure = val.unit;
                                    if (c.externalId)
                                        char.charSpecExternalId = c.externalId;
                                    else
                                        char.charSpecId = c.id;
                                    const action = { characteristic: [char] };
                                    if (c.actionId)
                                        action.action = { id: c.actionId };
                                    else if (c.actionExternalId)
                                        action.action = { externalId: c.actionExternalId };
                                    return action;
                                }).filter(Boolean);
                                if (!priceAction.length)
                                    return null;
                                return { ...(row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction };
                            }).filter(Boolean);
                            if (!priceRows.length)
                                return null;
                            return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows };
                        }).filter(Boolean);
                        if (priceEntries.length)
                            consumerProduct.price = priceEntries;
                    }
                    const consumerBody = {
                        product: [consumerProduct],
                        _params: { customerExternalId: pcConsumerCustExtId, contractExternalId: pcConsumerContractExtId }
                    };
                    const r2 = await fetch(`${API}/execute/update_contract`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(consumerBody)
                    });
                    if (!r2.ok)
                        throw new Error(`Consumer PO failed: ${(await r2.json()).detail || r2.status}`);
                }
                setActionMsg('✓ Consumer provisioned and added to provider group');
                search();
            }
            else if (pcAction === 'removeConsumer') {
                const body = {
                    product: [{
                            externalId: pcProviderProductExtId,
                            sharingProvider: {
                                consumerList: [{
                                        externalId: pcConsumerListExtId,
                                        status: [{ status: 'Terminated' }]
                                    }]
                            }
                        }],
                    _params: { customerExternalId: custExtId, contractExternalId: contractExtId }
                };
                const r = await fetch(`${API}/execute/update_contract`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setActionMsg('✓ Consumer removed successfully');
                search();
            }
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    const doCreateContract = async () => {
        const contractExtIdFinal = newContractExtId || `CTR_${msisdnValue || searchValue || Date.now().toString(36)}`;
        const msisdnFinal = newContractMsisdn || msisdnValue || searchValue;
        if (!contractExtIdFinal || !custExtId)
            return;
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const body = {
                externalId: contractExtIdFinal,
                status: [{ status: 'Active' }],
            };
            if (newContractSpecExtId) {
                body.contractSpecification = { externalId: newContractSpecExtId };
            }
            if (newContractTimeZone) {
                body.homeTimeZone = [{ timeZone: newContractTimeZone }];
            }
            // Characteristics
            const validChars = newContractChars.filter(ch => ch.charSpecExternalId && ch.value);
            if (validChars.length > 0) {
                body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }));
            }
            // Contact medium association
            body.contactMediumAssociation = [
                { contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_SMS_${msisdnFinal}`, enabled: true },
                { contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_REST_${msisdnFinal}`, enabled: true },
            ];
            // Product
            const products = [];
            if (newContractPO) {
                const prodExtId = newContractProductExtId || `${newContractPO}-${Date.now().toString(36)}`;
                const prod = {
                    productOfferingExternalId: newContractPO,
                    externalId: prodExtId,
                    correlationId: '1',
                    name: prodExtId,
                    status: [{ status: 'ProductCreated' }],
                };
                if (newContractBaRef && baExtId) {
                    prod.billingAccountReference = { externalId: baExtId };
                    prod.baRefForBillCycleAlignedRecurrence = { externalId: baExtId };
                }
                if (newContractSharingProvider && baExtId) {
                    prod.sharingProvider = {
                        billingAccount: [{ externalId: baExtId }],
                        consumerList: [{ externalId: `Consumer_List_${prodExtId}`, consumerCustomerExternalId: custExtId, consumerContractExternalId: newContractExtId }]
                    };
                    prod.sharingConsumer = {
                        providerCustomerExternalId: custExtId,
                        providerContractExternalId: newContractExtId,
                        providerProductExternalId: prodExtId,
                        consumerListEntryExternalId: `Consumer_List_${prodExtId}`,
                    };
                }
                products.push(prod);
            }
            if (products.length > 0)
                body.product = products;
            // Resources
            const resources = [];
            if (msisdnFinal) {
                resources.push({ resourceNumber: msisdnFinal, externalId: `LRS_msisdn_${msisdnFinal}`, productCorrelationId: ['1'] });
            }
            if (newContractImsi) {
                resources.push({ resourceNumber: newContractImsi, externalId: `LRS_imsi_${newContractImsi}`, productCorrelationId: ['1'] });
            }
            if (resources.length > 0)
                body.resource = resources;
            // Communication Identifier
            if (newContractCommIdSpec) {
                body.communicationIdentifier = [{ communicationIdentifierSpecExternalId: newContractCommIdSpec }];
            }
            const r = await fetch(`${API}/contract?customerExternalId=${encodeURIComponent(custExtId)}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ Contract created successfully');
            setShowAddContract(false);
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === Set Sharing Limits handler ===
    const doSetLimits = async (type) => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            if (type === 'common') {
                // Set common limit on provider's product
                const providerProduct = products.find((p) => p.sharingProvider);
                if (!providerProduct)
                    throw new Error('No provider product found');
                const body = {
                    triggerTime: new Date().toISOString().replace(/\.\d{3}Z/, '.000Z'),
                    relatedParty: { externalId: custExtId, '@referredType': 'Customer' },
                    contractExternalId: contractExtId,
                    communicationId: msisdnValue || searchValue,
                    communicationIdType: 'E.164',
                    productAdjustments: [{
                            productRef: { externalId: providerProduct.externalId },
                            productBuckets: [{
                                    bucketSpecExternalId: 'PBS_Data_Sharing_Limit_Common_CHT',
                                    action: 'Set',
                                    amount: { number: parseInt(limitCommonValue), decimalPlaces: 0 },
                                    unitOfMeasure: limitCommonUnit,
                                }]
                        }]
                };
                const r = await fetch(`${API}/balance/productAdjustment`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setActionMsg(`✓ Common limit set to ${limitCommonValue} ${limitCommonUnit}`);
            }
            else {
                // Set individual limit on consumer's product
                if (!limitConsumerCustExtId || !limitConsumerContractExtId || !limitConsumerProductExtId) {
                    throw new Error('Lookup consumer first');
                }
                const body = {
                    triggerTime: new Date().toISOString().replace(/\.\d{3}Z/, '.000Z'),
                    relatedParty: { externalId: limitConsumerCustExtId, '@referredType': 'Customer' },
                    contractExternalId: limitConsumerContractExtId,
                    communicationId: limitConsumerMsisdn,
                    communicationIdType: 'E.164',
                    productAdjustments: [{
                            productRef: { externalId: limitConsumerProductExtId },
                            productBuckets: [{
                                    bucketSpecExternalId: 'PBS_Data_Sharing_Limit_CHT',
                                    action: 'Set',
                                    amount: { number: parseInt(limitIndividualValue), decimalPlaces: 0 },
                                    unitOfMeasure: limitIndividualUnit,
                                }]
                        }]
                };
                const r = await fetch(`${API}/balance/productAdjustment`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setActionMsg(`✓ Individual limit set to ${limitIndividualValue} ${limitIndividualUnit} for ${limitConsumerMsisdn}`);
            }
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    const lookupConsumerForLimit = async (msisdn) => {
        if (!msisdn)
            return;
        setActionErr('');
        try {
            const custR = await fetch(`${API}/customer?msisdn=${encodeURIComponent(msisdn)}`);
            if (custR.ok) {
                const d = await custR.json();
                const cu2 = Array.isArray(d) ? d[0] : d;
                if (cu2?.externalId)
                    setLimitConsumerCustExtId(cu2.externalId);
            }
            const ctrR = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdn)}`);
            if (ctrR.ok) {
                const d = await ctrR.json();
                const c2 = Array.isArray(d) ? d[0] : d;
                if (c2?.externalId)
                    setLimitConsumerContractExtId(c2.externalId);
                // Find the consumer product (one with sharingConsumer)
                const consumerProd = (c2?.product || []).find((p) => p.sharingConsumer);
                if (consumerProd)
                    setLimitConsumerProductExtId(consumerProd.externalId);
            }
        }
        catch (e) {
            setActionErr(`Lookup failed: ${e.message}`);
        }
    };
    // === Modify POP handler ===
    const loadProductPop = async (productExtId, poExtId) => {
        setModifyPopProduct(productExtId);
        setModifyPopData([]);
        setModifyPopValues({});
        setModifyPopSelected({});
        setModifyPopLoading(true);
        try {
            const r = await fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(poExtId)}`);
            const pops = r.ok ? await r.json() : [];
            setModifyPopData(pops);
            const defaults = {};
            const selected = {};
            for (const pop of pops) {
                selected[pop.popId] = true;
                for (const row of (pop.rows || []))
                    for (const c of (row.chars || []))
                        defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') };
            }
            setModifyPopValues(defaults);
            setModifyPopSelected(selected);
        }
        catch (e) { /* ignore */ }
        setModifyPopLoading(false);
    };
    const saveProductPop = async () => {
        if (!modifyPopProduct || modifyPopData.length === 0)
            return;
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const priceEntries = modifyPopData
                .filter((pop) => modifyPopSelected[pop.popId])
                .map((pop) => {
                const priceRows = (pop.rows || []).map((row) => {
                    const priceAction = (row.chars || []).map((c) => {
                        const val = modifyPopValues[`${pop.popId}_${row.rowId}_${c.id}`];
                        if (!val?.value?.trim())
                            return null;
                        const char = { value: [{ value: val.value }] };
                        if (val.unit)
                            char.value[0].unitOfMeasure = val.unit;
                        if (c.externalId)
                            char.charSpecExternalId = c.externalId;
                        else
                            char.charSpecId = c.id;
                        const action = { characteristic: [char] };
                        if (c.actionId)
                            action.action = { id: c.actionId };
                        else if (c.actionExternalId)
                            action.action = { externalId: c.actionExternalId };
                        return action;
                    }).filter(Boolean);
                    if (!priceAction.length)
                        return null;
                    return { ...(row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction };
                }).filter(Boolean);
                if (!priceRows.length)
                    return null;
                return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows };
            }).filter(Boolean);
            if (priceEntries.length === 0) {
                setActionErr('No values to update');
                setActionLoading(false);
                return;
            }
            const body = {
                product: [{ externalId: modifyPopProduct, price: priceEntries }],
                _params: { customerExternalId: custExtId, contractExternalId: contractExtId }
            };
            const r = await fetch(`${API}/execute/update_contract`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ POP values updated successfully');
            setModifyPopProduct('');
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === Resource Swap handler ===
    const doResourceSwap = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const body = {
                customerExternalId: custExtId,
                contractExternalId: contractExtId,
                resource: [{
                        resourceSpecificationExternalId: rsResourceSpecExtId,
                        oldResourceNumber: rsOldResourceNumber,
                        newResourceNumber: rsNewResourceNumber,
                    }]
            };
            if (rsProductExtId)
                body.productExternalId = rsProductExtId;
            const r = await fetch(`${API}/resource/swap`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ Resource swap successful');
            setShowResourceSwap(false);
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === Balance Adjustment handler ===
    const doBalanceAdjustment = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const commId = msisdnValue || searchValue;
            const body = {
                relatedParty: { externalId: custExtId, '@referredType': 'Customer' },
                contractExternalId: contractExtId,
                communicationIdType: 'E.164',
                communicationId: commId,
                amount: { number: parseInt(baAdjAmount), decimalPlaces: parseInt(baAdjDecimalPlaces) || 0 },
                unitOfMeasure: baAdjUnit,
            };
            if (baAdjReason)
                body.reason = baAdjReason;
            const endpoint = baAdjType === 'billing' ? '/balance/billingAccountAdjustment' : '/balance/productAdjustment';
            if (baAdjType === 'product' && baAdjProductExtId) {
                body.productExternalId = baAdjProductExtId;
            }
            const r = await fetch(`${API}${endpoint}`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg(`✓ Balance adjustment (${baAdjType}) successful`);
            setShowBalanceAdj(false);
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === Product Replace handler ===
    const doProductReplace = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            const newExtId = prNewProductExtId || `${prNewPO}-${Date.now().toString(36)}`;
            const body = {
                _params: { customerExternalId: custExtId, contractExternalId: contractExtId },
                product: [
                    { externalId: prOldProductExtId, status: [{ status: 'ProductTerminated' }] },
                    {
                        productOfferingExternalId: prNewPO,
                        externalId: newExtId,
                        name: newExtId,
                        status: [{ status: 'ProductCreated' }],
                        billingAccountReference: { externalId: baExtId },
                        baRefForBillCycleAlignedRecurrence: { externalId: baExtId },
                    }
                ]
            };
            const r = await fetch(`${API}/execute/update_contract`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setActionMsg('✓ Product replaced successfully');
            setShowProductReplace(false);
            search();
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === Financial/Billing fetch handler ===
    const fetchFinancialData = async (tab) => {
        setFinancialLoading(true);
        setFinancialData(null);
        try {
            const commId = msisdnValue || searchValue;
            let url = '';
            switch (tab) {
                case 'transactions':
                    url = `${API}/financial/transaction?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`;
                    break;
                case 'unbilled':
                    url = `${API}/bill/unbilledCharge?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`;
                    break;
                case 'bills':
                    url = `${API}/bill/customerBill?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`;
                    break;
                case 'summary':
                    url = `${API}/bill/summary?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`;
                    break;
            }
            const r = await fetch(url);
            if (!r.ok)
                throw new Error((await r.json()).detail || `HTTP ${r.status}`);
            setFinancialData(await r.json());
        }
        catch (e) {
            setActionErr(e.message);
        }
        setFinancialLoading(false);
    };
    // === Update Party/Customer handler ===
    const doUpdateEntity = async () => {
        setActionLoading(true);
        setActionMsg('');
        setActionErr('');
        try {
            if (updateTarget === 'party' && p0) {
                const body = {};
                if (updatePartyGivenName)
                    body.givenName = updatePartyGivenName;
                if (updatePartyFamilyName)
                    body.familyName = updatePartyFamilyName;
                if (updatePartyStatus)
                    body.status = [{ status: updatePartyStatus }];
                const validChars = updateChars.filter(ch => ch.charSpecExternalId && ch.value);
                if (validChars.length > 0)
                    body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }));
                const r = await fetch(`${API}/execute/update_party_by_external_id`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, _params: { partyExternalId: p0.externalId } })
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setActionMsg('✓ Party updated successfully');
                search();
            }
            else if (updateTarget === 'customer' && cu) {
                const body = {};
                if (updateCustStatus)
                    body.status = [{ status: updateCustStatus }];
                const validChars = updateChars.filter(ch => ch.charSpecExternalId && ch.value);
                if (validChars.length > 0)
                    body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }));
                const r = await fetch(`${API}/execute/update_customer_by_external_id`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, _params: { customerExternalId: cu.externalId } })
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setActionMsg('✓ Customer updated successfully');
                search();
            }
            setShowUpdateEntity(false);
        }
        catch (e) {
            setActionErr(e.message);
        }
        setActionLoading(false);
    };
    // === BucketCard sub-component ===
    const BucketCard = ({ bucket, productExtId }) => {
        const rawAmount = Number(bucket?.amount?.number ?? 0);
        const decPlaces = Number(bucket?.amount?.decimalPlaces ?? 0);
        const rawReserved = Number(bucket?.reservedAmount?.number ?? 0);
        const unit = (bucket?.unitOfMeasure || '').toLowerCase();
        const fmtAmount = (n) => {
            if (unit === 'byte' || unit === 'bytes')
                return fmtBytes(n);
            const scaled = decPlaces > 0 ? n / Math.pow(10, decPlaces) : n;
            return `${scaled.toFixed(decPlaces > 0 ? 2 : 0)}${unit ? ' ' + bucket.unitOfMeasure : ''}`;
        };
        const activeContainer = (bucket?.valueContainer || []).find((vc) => {
            const s = vc.validFor?.startDateTime;
            const e = vc.validFor?.endDateTime;
            const now = Date.now();
            const after = s && !s.startsWith('0001') ? new Date(s).getTime() <= now : true;
            const before = e && !e.startsWith('9999') ? new Date(e).getTime() >= now : true;
            return after && before && Number(vc.amount?.number) > 0;
        });
        const displayAmount = activeContainer ? fmtAmount(Number(activeContainer.amount.number)) : fmtAmount(rawAmount);
        const name = bucket?.bucketSpecExternalId || bucket?.bucketName || bucket?.name || 'Bucket';
        const start = fmtDate(bucket?.validFor?.startDateTime);
        const end = fmtDate(bucket?.validFor?.endDateTime);
        const [showAdj, setShowAdj] = React.useState(false);
        const [adjAction, setAdjAction] = React.useState('Add');
        const [adjAmount, setAdjAmount] = React.useState('');
        const [adjEndDate, setAdjEndDate] = React.useState('');
        const [adjLoading, setAdjLoading] = React.useState(false);
        const [adjMsg, setAdjMsg] = React.useState('');
        const doAdjust = async () => {
            setAdjLoading(true);
            setAdjMsg('');
            try {
                const body = {
                    triggerTime: new Date().toISOString().replace(/\.\d{3}Z/, '.000Z'),
                    relatedParty: { externalId: custExtId, '@referredType': 'Customer' },
                    contractExternalId: contractExtId,
                    communicationId: msisdnValue || searchValue,
                    communicationIdType: 'E.164',
                    productExternalId: productExtId || bucket?._productExternalId || '',
                    bucketSpecExternalId: bucket?.bucketSpecExternalId,
                    action: adjAction === 'Set' ? 'Set' : 'Relative',
                    amount: { number: adjAction === 'Subtract' ? -Math.abs(parseInt(adjAmount)) : Math.abs(parseInt(adjAmount)), decimalPlaces: 0 },
                    unitOfMeasure: bucket?.unitOfMeasure || 'byte',
                };
                if (adjEndDate) {
                    body.validFor = { startDateTime: new Date().toISOString().replace(/\.\d{3}Z/, '.000Z'), endDateTime: adjEndDate + 'T23:59:59.000Z' };
                }
                const r = await fetch(`${API}/balance/productAdjustment`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                if (!r.ok)
                    throw new Error((await r.json()).detail || `HTTP ${r.status}`);
                setAdjMsg('✓');
                setShowAdj(false);
                search();
            }
            catch (e) {
                setAdjMsg(`✗ ${e.message}`);
            }
            setAdjLoading(false);
        };
        return (_jsxs("div", { style: { border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#fffbeb' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontWeight: 600, fontSize: 12, flex: 1 }, children: name }), productExtId && _jsx("button", { onClick: () => setShowAdj(v => !v), style: { fontSize: 9, padding: '1px 5px', background: showAdj ? '#f59e0b' : '#fef3c7', color: showAdj ? '#fff' : '#92400e', border: '1px solid #fbbf24', borderRadius: 3, cursor: 'pointer' }, children: showAdj ? '✕' : '⚡ Adjust' })] }), _jsx(InfoRow, { label: "Amount", value: displayAmount }), rawReserved > 0 && _jsx(InfoRow, { label: "Reserved", value: fmtAmount(rawReserved) }), bucket?._baExternalId && _jsx(InfoRow, { label: "Billing Account", value: bucket._baExternalId }), start && _jsx(InfoRow, { label: "Valid From", value: start }), end && _jsx(InfoRow, { label: "Valid To", value: end }), adjMsg && _jsx("div", { style: { fontSize: 10, color: adjMsg.startsWith('✓') ? '#059669' : '#dc2626', marginTop: 3 }, children: adjMsg }), showAdj && (_jsxs("div", { style: { marginTop: 6, padding: '6px 8px', background: '#fff', borderRadius: 4, border: '1px solid #fde68a' }, children: [_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsxs("select", { style: { padding: '2px 4px', fontSize: 10 }, value: adjAction, onChange: e => setAdjAction(e.target.value), children: [_jsx("option", { value: "Add", children: "Add" }), _jsx("option", { value: "Subtract", children: "Subtract" }), _jsx("option", { value: "Set", children: "Set to" })] }), _jsx("input", { type: "number", style: { width: 90, padding: '2px 4px', fontSize: 10 }, value: adjAmount, onChange: e => setAdjAmount(e.target.value), placeholder: "amount" }), _jsx("span", { style: { fontSize: 9, color: '#888' }, children: bucket?.unitOfMeasure || 'byte' })] }), _jsxs("div", { style: { display: 'flex', gap: 4, alignItems: 'center' }, children: [_jsx("label", { style: { fontSize: 9, color: '#666' }, children: "Expiry:" }), _jsx("input", { type: "date", style: { padding: '2px 4px', fontSize: 10, flex: 1 }, value: adjEndDate, onChange: e => setAdjEndDate(e.target.value) }), _jsx("button", { onClick: doAdjust, disabled: adjLoading || !adjAmount, style: { fontSize: 9, padding: '2px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }, children: adjLoading ? '...' : 'Apply' })] })] }))] }));
    };
    // === RENDER ===
    return (_jsxs("div", { children: [_jsx("h2", { children: "\uD83D\uDC64 360\u00B0 Subscriber View" }), _jsxs("div", { style: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }, children: [_jsxs("select", { value: searchType, onChange: e => setSearchType(e.target.value), children: [_jsx("option", { value: "msisdn", children: "MSISDN" }), _jsx("option", { value: "externalId", children: "External ID" }), _jsx("option", { value: "id", children: "Internal ID" })] }), _jsx("input", { style: { flex: 1, minWidth: 200 }, placeholder: `Enter ${searchType}...`, value: searchValue, onChange: e => setSearchValue(e.target.value), onKeyDown: e => e.key === 'Enter' && search() }), _jsx("button", { onClick: search, disabled: loading || !searchValue, children: loading ? 'Searching...' : 'Search' })] }), error && _jsx("p", { style: { color: 'red' }, children: error }), actionMsg && _jsx("p", { style: { color: 'green', fontSize: 12, background: '#f0fff0', padding: 8, borderRadius: 4 }, children: actionMsg }), actionErr && (() => {
                // Parse BSSF error messages for better display
                let errDisplay = actionErr;
                try {
                    const parsed = JSON.parse(actionErr);
                    if (parsed.messages) {
                        errDisplay = parsed.messages.map((m) => `[${m.code || m.action || ''}] ${m.message || ''} ${m.details || ''}`).join('\n');
                    }
                    else if (parsed.detail) {
                        try {
                            const inner = JSON.parse(parsed.detail);
                            errDisplay = inner.messages ? inner.messages.map((m) => `[${m.code || ''}] ${m.details || m.message || ''}`).join('\n') : parsed.detail;
                        }
                        catch {
                            errDisplay = parsed.detail;
                        }
                    }
                }
                catch {
                    // Try parsing as nested JSON string
                    try {
                        const inner = JSON.parse(actionErr.replace(/^[^{]*/, '').replace(/[^}]*$/, ''));
                        if (inner.messages)
                            errDisplay = inner.messages.map((m) => `[${m.code || m.action || ''}] ${m.details || m.message}`).join('\n');
                    }
                    catch { /* keep original */ }
                }
                return _jsxs("pre", { style: { color: '#dc2626', fontSize: 12, background: '#fef2f2', padding: 10, borderRadius: 4, border: '1px solid #fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0' }, children: ["\u274C ", errDisplay] });
            })(), (c || cu || p0) && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: [_jsxs("div", { children: [p0 && (_jsxs(Card, { title: `Party — ${p0.givenName || ''} ${p0.familyName || ''}`, icon: "\uD83D\uDC64", color: "#f97316", rawData: p0, children: [_jsx(InfoRow, { label: "External ID", value: p0.externalId }), _jsx(InfoRow, { label: "Internal ID", value: p0.id }), _jsx(InfoRow, { label: "Given Name", value: p0.givenName }), _jsx(InfoRow, { label: "Family Name", value: p0.familyName }), _jsx(InfoRow, { label: "Spec", value: p0.individualSpecification?.externalId }), _jsx(InfoRow, { label: "Status", value: p0.status?.slice(-1)[0]?.status }), (p0.contactMedium || []).map((cm, i) => {
                                        const commId = cm.characteristic?.find((ch) => (ch.charSpecExternalId || '').toLowerCase().includes('communication'))?.value?.[0]?.value;
                                        const chType = cm.characteristic?.find((ch) => (ch.charSpecExternalId || '').toLowerCase().includes('channel'))?.value?.[0]?.value;
                                        return _jsx(InfoRow, { label: `Contact (${chType || cm.contactMediumSpecExternalId || i + 1})`, value: commId || cm.externalId }, i);
                                    })] })), cu && (_jsxs(Card, { title: `Customer — ${cu.externalId || ''}`, icon: "\uD83C\uDFE2", color: "#3b82f6", rawData: cu, children: [_jsx(InfoRow, { label: "External ID", value: cu.externalId }), _jsx(InfoRow, { label: "Internal ID", value: cu.id }), _jsx(InfoRow, { label: "Spec", value: cu.customerSpecification?.externalId }), _jsx(InfoRow, { label: "Status", value: cu.status?.slice(-1)[0]?.status }), (cu.characteristic || []).map((ch, i) => (_jsx(InfoRow, { label: ch.charSpecExternalId || ch.name || `Char ${i + 1}`, value: ch.value?.[0]?.value ?? ch.value }, i))), (cu.account || []).map((a, i) => (_jsxs("div", { style: { marginTop: 8, padding: '6px 8px', background: '#eff6ff', borderRadius: 6, fontSize: 12 }, children: [_jsxs("div", { style: { fontWeight: 600, marginBottom: 4 }, children: ["\uD83D\uDCB3 Billing Account ", a.externalId] }), _jsx(InfoRow, { label: "Internal ID", value: a.id }), _jsx(InfoRow, { label: "Spec", value: a.billingAccountSpecExternalId }), _jsx(InfoRow, { label: "Status", value: a.status?.slice(-1)[0]?.status }), a.customerBillCycleSpecification?.map((bcs, j) => (_jsx(InfoRow, { label: "Bill Cycle Spec", value: bcs.billCycleSpecExternalId }, j)))] }, i)))] }))] }), _jsxs("div", { children: [c && (_jsxs(Card, { title: `Contract — ${c.externalId || ''}`, icon: "\uD83D\uDCC4", color: "#8b5cf6", rawData: c, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }, children: [_jsx(StatusBadge, { status: contractStatus }), _jsx("span", { style: { fontSize: 11, color: '#888' }, children: c.externalId })] }), _jsx(InfoRow, { label: "Internal ID", value: c.id }), _jsx(InfoRow, { label: "Spec", value: c.contractSpecification?.externalId }), _jsx(InfoRow, { label: "Valid From", value: fmtDate(c.validFor?.startDateTime) }), _jsx(InfoRow, { label: "Valid To", value: fmtDate(c.validFor?.endDateTime) }), _jsx(InfoRow, { label: "Home Time Zone", value: c.homeTimeZone?.[0]?.timeZone }), (c.characteristic || []).map((ch, i) => (_jsx(InfoRow, { label: ch.charSpecExternalId || `Char ${i + 1}`, value: ch.value?.[0]?.value ?? ch.value }, i))), (c.resource || []).map((r, i) => (_jsx(InfoRow, { label: `Resource (${r.resourceSpecificationExternalId || 'spec'})`, value: r.resourceNumber || r.externalId }, i))), _jsxs("div", { style: { display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }, children: [_jsx("button", { disabled: actionLoading || contractStatus === 'Active', onClick: () => changeContractStatus('Active'), style: { fontSize: 10, padding: '3px 8px' }, children: "Activate" }), _jsx("button", { disabled: actionLoading || contractStatus === 'Halt', onClick: () => changeContractStatus('Halt'), style: { fontSize: 10, padding: '3px 8px' }, children: "Halt" }), _jsx("button", { disabled: actionLoading || contractStatus === 'Terminated', onClick: () => changeContractStatus('Terminated'), style: { fontSize: 10, padding: '3px 8px', color: 'red' }, children: "Terminate" })] }), products.length > 0 && (_jsxs("div", { style: { marginTop: 12 }, children: [_jsxs("div", { style: { fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }, children: ["\uD83D\uDCE6 Products (", products.length, ")"] }), products.map((p, i) => {
                                                const pStatus = p.status?.slice(-1)[0]?.status || '';
                                                return (_jsxs("div", { style: { border: '1px solid #e9d5ff', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#faf5ff' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }, children: [_jsx("span", { style: { fontSize: 12, fontWeight: 600, flex: 1 }, children: p.productOfferingExternalId || p.name || p.externalId }), _jsx(StatusBadge, { status: pStatus })] }), _jsx(InfoRow, { label: "External ID", value: p.externalId }), _jsx(InfoRow, { label: "Internal ID", value: p.id }), _jsx(InfoRow, { label: "PO External ID", value: p.productOfferingExternalId }), _jsx(InfoRow, { label: "Valid From", value: fmtDate(p.validFor?.startDateTime) }), _jsx(InfoRow, { label: "Valid To", value: fmtDate(p.validFor?.endDateTime) }), _jsx(InfoRow, { label: "Billing Account", value: p.billingAccountReference?.externalId }), p.sharingProvider && (_jsxs("div", { style: { marginTop: 6, padding: '6px 8px', background: '#fef9c3', borderRadius: 4, border: '1px solid #fde047' }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, color: '#854d0e', marginBottom: 4 }, children: "\uD83D\uDD17 Sharing Provider" }), (p.sharingProvider.billingAccount || []).map((ba, j) => (_jsx(InfoRow, { label: "Provider BA", value: ba.externalId || ba.id }, `ba-${j}`))), (p.sharingProvider.consumerList || []).map((cl, j) => (_jsxs("div", { style: { marginTop: 4, padding: '4px 6px', background: '#fff', borderRadius: 3, border: '1px solid #fde68a' }, children: [_jsx(InfoRow, { label: "Consumer List", value: cl.externalId || cl.id }), _jsx(InfoRow, { label: "Consumer Customer", value: cl.consumerCustomerExternalId }), _jsx(InfoRow, { label: "Consumer Contract", value: cl.consumerContractExternalId }), _jsx(InfoRow, { label: "Status", value: cl.status?.slice(-1)[0]?.status })] }, j)))] })), p.sharingConsumer && (_jsxs("div", { style: { marginTop: 6, padding: '6px 8px', background: '#ede9fe', borderRadius: 4, border: '1px solid #c4b5fd' }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, color: '#5b21b6', marginBottom: 4 }, children: "\uD83D\uDD17 Sharing Consumer" }), _jsx(InfoRow, { label: "Provider Customer", value: p.sharingConsumer.providerCustomerExternalId }), _jsx(InfoRow, { label: "Provider Contract", value: p.sharingConsumer.providerContractExternalId }), _jsx(InfoRow, { label: "Provider Product", value: p.sharingConsumer.providerProductExternalId }), _jsx(InfoRow, { label: "Consumer List Entry", value: p.sharingConsumer.consumerListEntryExternalId })] })), (p.characteristic || []).map((ch, j) => (_jsx(InfoRow, { label: ch.charSpecExternalId || `Char ${j + 1}`, value: ch.value?.[0]?.value ?? ch.value }, j))), (() => {
                                                            const { products: prodBucketMap } = flattenBuckets(balance);
                                                            const buckets = prodBucketMap[p.externalId] || prodBucketMap[p.id] || [];
                                                            return buckets.length > 0 ? (_jsxs("div", { style: { marginTop: 6 }, children: [_jsx("div", { style: { fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }, children: "Buckets" }), buckets.map((b, k) => _jsx(BucketCard, { bucket: b, productExtId: p.externalId }, k))] })) : null;
                                                        })(), _jsxs("div", { style: { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }, children: [_jsx("button", { disabled: actionLoading, onClick: () => changeProductStatus(p.externalId, 'ProductActive'), style: { fontSize: 10, padding: '2px 6px' }, children: "Activate" }), _jsx("button", { disabled: actionLoading, onClick: () => changeProductStatus(p.externalId, 'ProductHalt'), style: { fontSize: 10, padding: '2px 6px' }, children: "Halt" }), _jsx("button", { disabled: actionLoading, onClick: () => changeProductStatus(p.externalId, 'ProductTerminated'), style: { fontSize: 10, padding: '2px 6px', color: 'red' }, children: "Terminate" }), _jsx("button", { disabled: actionLoading, onClick: () => modifyPopProduct === p.externalId ? setModifyPopProduct('') : loadProductPop(p.externalId, p.productOfferingExternalId), style: { fontSize: 10, padding: '2px 6px', background: modifyPopProduct === p.externalId ? '#7c3aed' : '#f3e8ff', color: modifyPopProduct === p.externalId ? '#fff' : '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 3 }, children: modifyPopProduct === p.externalId ? '✕ Close' : '✎ Modify POP' })] }), modifyPopProduct === p.externalId && (_jsxs("div", { style: { marginTop: 8, padding: '8px 10px', background: '#faf5ff', borderRadius: 6, border: '1px solid #e9d5ff' }, children: [modifyPopLoading && _jsx("div", { style: { fontSize: 11, color: '#888' }, children: "Loading POP values..." }), modifyPopData.length === 0 && !modifyPopLoading && _jsx("div", { style: { fontSize: 11, color: '#888' }, children: "No personalizable POP values for this product" }), modifyPopData.map((pop) => (_jsxs("div", { style: { marginBottom: 6 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 3 }, children: [_jsx("input", { type: "checkbox", checked: !!modifyPopSelected[pop.popId], onChange: e => setModifyPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked })) }), pop.popName || pop.popExternalId] }), modifyPopSelected[pop.popId] && (pop.rows || []).map((row) => (_jsx("div", { style: { marginLeft: 14 }, children: (row.chars || []).map((c) => {
                                                                                const key = `${pop.popId}_${row.rowId}_${c.id}`;
                                                                                const val = modifyPopValues[key] || { value: '', unit: '' };
                                                                                return (_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: 10, minWidth: 80, color: '#555' }, children: c.name || c.externalId }), _jsx("input", { style: { flex: 1, padding: '2px 4px', fontSize: 10 }, value: val.value, onChange: e => setModifyPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } })) }), c.units && c.units.length > 0 ? (_jsx("select", { style: { padding: '2px 4px', fontSize: 9 }, value: val.unit, onChange: e => setModifyPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } })), children: c.units.map((u) => _jsx("option", { value: u, children: u }, u)) })) : val.unit ? _jsx("span", { style: { fontSize: 9, color: '#888' }, children: val.unit }) : null] }, c.id));
                                                                            }) }, row.rowId)))] }, pop.popId))), modifyPopData.length > 0 && (_jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 6 }, children: [_jsx("button", { onClick: saveProductPop, disabled: actionLoading, style: { fontSize: 10, padding: '3px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: actionLoading ? 'Saving...' : 'Save Changes' }), _jsx("button", { onClick: () => setModifyPopProduct(''), style: { fontSize: 10, padding: '3px 10px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }, children: "Cancel" })] }))] }))] }, i));
                                            })] }))] })), balance && (() => {
                                const { billing } = flattenBuckets(balance);
                                if (!billing.length)
                                    return null;
                                return (_jsx(Card, { title: `Balance — Billing (${billing.length} bucket${billing.length !== 1 ? 's' : ''})`, icon: "\uD83D\uDCB0", color: "#f59e0b", rawData: balance, children: billing.map((b, i) => _jsx(BucketCard, { bucket: b }, i)) }));
                            })()] })] })), cu && (_jsxs("div", { style: { marginTop: 16, borderTop: '2px solid #eee', paddingTop: 14 }, children: [_jsx(SectionHeader, { title: "\u26A1 Actions" }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, children: [_jsx("button", { onClick: () => { setShowAddContract(v => !v); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showAddContract ? '#1d4ed8' : '#f3f4f6', color: showAddContract ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDCC4 Add Contract" }), _jsx("button", { onClick: () => { setShowAddProduct(v => !v); setShowAddContract(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showAddProduct ? '#7c3aed' : '#f3f4f6', color: showAddProduct ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\u2795 Add Product" }), _jsx("button", { onClick: () => { setShowResourceSwap(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showResourceSwap ? '#ea580c' : '#f3f4f6', color: showResourceSwap ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDD04 Resource Swap" }), _jsx("button", { onClick: () => { setShowProductReplace(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showProductReplace ? '#9333ea' : '#f3f4f6', color: showProductReplace ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDD00 Product Replace" }), _jsx("button", { onClick: () => { setShowTopUp(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showTopUp ? '#059669' : '#f3f4f6', color: showTopUp ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDCB0 Balance Top-Up" }), _jsx("button", { onClick: () => { setShowBalanceAdj(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showBalanceAdj ? '#b45309' : '#f3f4f6', color: showBalanceAdj ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDCB3 Balance Adjust" }), _jsx("button", { onClick: () => { setShowRecurring(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showRecurring ? '#0284c7' : '#f3f4f6', color: showRecurring ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDD01 Recurring" }), _jsx("button", { onClick: () => { setShowProviderConsumer(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false); }, style: { background: showProviderConsumer ? '#dc2626' : '#f3f4f6', color: showProviderConsumer ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDD17 Provider/Consumer" }), _jsx("button", { onClick: () => { setShowFinancial(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowUpdateEntity(false); if (!showFinancial)
                                    fetchFinancialData(financialTab); }, style: { background: showFinancial ? '#0f766e' : '#f3f4f6', color: showFinancial ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\uD83D\uDCCA Financial" }), _jsx("button", { onClick: () => { setShowUpdateEntity(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); }, style: { background: showUpdateEntity ? '#4338ca' : '#f3f4f6', color: showUpdateEntity ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }, children: "\u270F\uFE0F Update Party/Customer" })] }), showAddContract && (() => {
                        const defaultContractExtId = newContractExtId || `CTR_${msisdnValue || searchValue || Date.now().toString(36)}`;
                        const defaultMsisdn = newContractMsisdn || msisdnValue || searchValue;
                        return (_jsxs("div", { style: { border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, background: '#eff6ff', marginBottom: 16 }, children: [_jsxs("h4", { style: { margin: '0 0 12px', color: '#1d4ed8' }, children: ["\uD83D\uDCC4 Add Contract to Customer: ", custExtId] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Contract External ID *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractExtId, onChange: e => setNewContractExtId(e.target.value), placeholder: defaultContractExtId, onFocus: () => { if (!newContractExtId)
                                                        setNewContractExtId(defaultContractExtId); } })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Contract Specification" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractSpecExtId, onChange: e => setNewContractSpecExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- Select Spec --" }), contractSpecs.map((s) => _jsx("option", { value: s.externalId, children: s.name || s.externalId }, s.id || s.externalId))] })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Home Time Zone" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractTimeZone, onChange: e => setNewContractTimeZone(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Communication ID Spec" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractCommIdSpec, onChange: e => setNewContractCommIdSpec(e.target.value), children: [_jsx("option", { value: "", children: "-- None --" }), commIdSpecs.map((s) => _jsx("option", { value: s.externalId, children: s.name || s.externalId }, s.id || s.externalId))] })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "MSISDN (Resource)" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractMsisdn, onChange: e => setNewContractMsisdn(e.target.value), placeholder: defaultMsisdn, onFocus: () => { if (!newContractMsisdn)
                                                        setNewContractMsisdn(defaultMsisdn); } })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "IMSI (Optional)" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newContractImsi, onChange: e => setNewContractImsi(e.target.value), placeholder: "14-15 digits" })] })] }), _jsxs("div", { style: { marginBottom: 12, padding: '8px 10px', background: '#f0fdf4', borderRadius: 6 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "\uD83D\uDCE6 Initial Product (Optional)" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, marginBottom: 2 }, children: "Product Offering" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 11 }, value: newContractPO, onChange: e => { setNewContractPO(e.target.value); setNewContractProductExtId(`${e.target.value}-${Date.now().toString(36)}`); }, children: [_jsx("option", { value: "", children: "-- None --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId))] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, marginBottom: 2 }, children: "Product External ID" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 11 }, value: newContractProductExtId, onChange: e => setNewContractProductExtId(e.target.value), placeholder: "Auto-generated" })] })] }), newContractPO && (_jsxs("div", { style: { marginTop: 8 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: newContractBaRef, onChange: e => setNewContractBaRef(e.target.checked) }), "Link to Billing Account (", baExtId || 'none', ")"] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginTop: 4 }, children: [_jsx("input", { type: "checkbox", checked: newContractSharingProvider, onChange: e => setNewContractSharingProvider(e.target.checked) }), "Configure as Sharing Provider (technical product)"] })] }))] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 11, fontWeight: 600 }, children: "Contract Characteristics" }), _jsx("button", { onClick: () => setNewContractChars(prev => [...prev, { charSpecExternalId: '', value: '' }]), style: { fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }, children: "+ Add" })] }), newContractChars.map((ch, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "charSpecExternalId", value: ch.charSpecExternalId, onChange: e => {
                                                        const updated = [...newContractChars];
                                                        updated[i].charSpecExternalId = e.target.value;
                                                        setNewContractChars(updated);
                                                    } }), _jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "value", value: ch.value, onChange: e => {
                                                        const updated = [...newContractChars];
                                                        updated[i].value = e.target.value;
                                                        setNewContractChars(updated);
                                                    } }), _jsx("button", { onClick: () => setNewContractChars(prev => prev.filter((_, j) => j !== i)), style: { fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }, children: "\u2715" })] }, i)))] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("button", { onClick: doCreateContract, disabled: actionLoading || !newContractExtId, style: { background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Creating...' : 'Create Contract' }), _jsx("button", { onClick: () => setShowAddContract(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })(), showAddProduct && (_jsxs("div", { style: { border: '1px solid #e9d5ff', borderRadius: 8, padding: 16, background: '#faf5ff', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#7c3aed' }, children: "\u2795 Add Product to Contract" }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }, children: "Product Offering *" }), _jsxs("select", { style: { width: '100%', padding: '6px 8px' }, value: newPO, onChange: e => setNewPO(e.target.value), children: [_jsx("option", { value: "", children: "-- Select Product Offering --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId))] })] }), newPO && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Product External ID *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newProductExtId, onChange: e => setNewProductExtId(e.target.value) })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Product Name" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: newProductName, onChange: e => setNewProductName(e.target.value) })] })] }), _jsxs("div", { style: { marginBottom: 12, padding: '8px 10px', background: '#eff6ff', borderRadius: 6 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "Billing Account References" }), _jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 6 }, children: ["BA: ", baExtId || '(none found)'] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: newProductBaRef, onChange: e => setNewProductBaRef(e.target.checked) }), "billingAccountReference"] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 4 }, children: [_jsx("input", { type: "checkbox", checked: newProductBaRefRecurrence, onChange: e => setNewProductBaRefRecurrence(e.target.checked) }), "baRefForBillCycleAlignedRecurrence"] })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 11, fontWeight: 600 }, children: "Characteristics" }), _jsx("button", { onClick: () => setNewProductChars(prev => [...prev, { charSpecExternalId: '', value: '' }]), style: { fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }, children: "+ Custom" })] }), (() => {
                                                const po = poList.find((p) => p.externalId === newPO);
                                                const chars = po?.characteristics || [];
                                                const personalizable = chars.filter((c) => c.valueRegulator === 'mustBePersonalized' || c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection');
                                                return personalizable.length > 0 ? personalizable.map((c) => {
                                                    const charExtId = c.externalId || c.id;
                                                    const idx = newProductChars.findIndex(ch => ch.charSpecExternalId === charExtId);
                                                    const val = idx >= 0 ? newProductChars[idx].value : '';
                                                    const possVals = c.possibleValues || [];
                                                    const isMust = c.valueRegulator === 'mustBePersonalized';
                                                    const unit = c.unitOfMeasure || '';
                                                    return (_jsxs("div", { style: { marginBottom: 6 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }, children: [_jsx("span", { style: { fontSize: 11 }, children: c.name || charExtId }), isMust && _jsx("span", { style: { fontSize: 9, background: '#c60', color: '#fff', borderRadius: 3, padding: '0 4px' }, children: "required" }), !isMust && _jsx("span", { style: { fontSize: 9, background: '#0a7', color: '#fff', borderRadius: 3, padding: '0 4px' }, children: "optional" }), unit && _jsxs("span", { style: { fontSize: 9, color: '#888' }, children: ["[", unit, "]"] })] }), possVals.length > 0 ? (_jsxs("select", { style: { width: '100%', padding: '3px 6px', fontSize: 11 }, value: val, onChange: e => {
                                                                    const updated = [...newProductChars];
                                                                    if (idx >= 0) {
                                                                        updated[idx].value = e.target.value;
                                                                    }
                                                                    else {
                                                                        updated.push({ charSpecExternalId: charExtId, value: e.target.value });
                                                                    }
                                                                    setNewProductChars(updated);
                                                                }, children: [_jsx("option", { value: "", children: "-- Select --" }), possVals.map((pv) => _jsxs("option", { value: pv.value, children: [pv.name || pv.value, pv.default ? ' ✓' : ''] }, pv.value))] })) : (_jsxs("div", { style: { display: 'flex', gap: 4, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: c.defaultValue || `Enter ${c.name || charExtId}`, value: val, onChange: e => {
                                                                            const updated = [...newProductChars];
                                                                            if (idx >= 0) {
                                                                                updated[idx].value = e.target.value;
                                                                            }
                                                                            else {
                                                                                updated.push({ charSpecExternalId: charExtId, value: e.target.value });
                                                                            }
                                                                            setNewProductChars(updated);
                                                                        } }), unit && _jsx("span", { style: { fontSize: 10, color: '#888' }, children: unit })] }))] }, charExtId));
                                                }) : null;
                                            })(), newProductChars.filter(ch => {
                                                const po = poList.find((p) => p.externalId === newPO);
                                                const specChars = (po?.characteristics || []).map((c) => c.externalId || c.id);
                                                return !specChars.includes(ch.charSpecExternalId);
                                            }).map((ch, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "charSpecExternalId", value: ch.charSpecExternalId, onChange: e => {
                                                            const allIdx = newProductChars.indexOf(ch);
                                                            const updated = [...newProductChars];
                                                            updated[allIdx].charSpecExternalId = e.target.value;
                                                            setNewProductChars(updated);
                                                        } }), _jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "value", value: ch.value, onChange: e => {
                                                            const allIdx = newProductChars.indexOf(ch);
                                                            const updated = [...newProductChars];
                                                            updated[allIdx].value = e.target.value;
                                                            setNewProductChars(updated);
                                                        } }), _jsx("button", { onClick: () => setNewProductChars(prev => prev.filter(p => p !== ch)), style: { fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }, children: "\u2715" })] }, `custom-${i}`)))] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 11, fontWeight: 600 }, children: "Resources" }), _jsx("button", { onClick: () => setNewProductResources(prev => [...prev, { specExternalId: '', resourceNumber: '', externalId: '' }]), style: { fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }, children: "+ Add" })] }), newProductResources.map((r, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }, children: [_jsxs("select", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, value: r.specExternalId, onChange: e => { const u = [...newProductResources]; u[i].specExternalId = e.target.value; setNewProductResources(u); }, children: [_jsx("option", { value: "", children: "-- Resource Spec --" }), resourceSpecs.map((rs) => _jsx("option", { value: rs.externalId, children: rs.name || rs.externalId }, rs.id || rs.externalId))] }), _jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "Resource Number (e.g. MSISDN)", value: r.resourceNumber, onChange: e => { const u = [...newProductResources]; u[i].resourceNumber = e.target.value; setNewProductResources(u); } }), _jsx("input", { style: { width: 160, padding: '3px 6px', fontSize: 11 }, placeholder: "External ID (auto)", value: r.externalId, onChange: e => { const u = [...newProductResources]; u[i].externalId = e.target.value; setNewProductResources(u); } }), _jsx("button", { onClick: () => setNewProductResources(prev => prev.filter((_, j) => j !== i)), style: { fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }, children: "\u2715" })] }, i)))] }), _jsxs("div", { style: { marginBottom: 12, padding: '8px 10px', background: newProductSharingProvider ? '#fef9c3' : newProductSharingConsumer ? '#ede9fe' : '#f3f4f6', borderRadius: 6, border: `1px solid ${newProductSharingProvider ? '#fde047' : newProductSharingConsumer ? '#c4b5fd' : '#e5e7eb'}` }, children: [_jsxs("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: ["Sharing Configuration", newProductSharingProvider && _jsx("span", { style: { fontSize: 10, color: '#854d0e', marginLeft: 8, fontWeight: 400 }, children: "\u26A1 Auto-detected: Provider PO" }), newProductSharingConsumer && _jsx("span", { style: { fontSize: 10, color: '#5b21b6', marginLeft: 8, fontWeight: 400 }, children: "\u26A1 Auto-detected: Consumer PO" }), !newProductSharingProvider && !newProductSharingConsumer && _jsx("span", { style: { fontSize: 10, color: '#888', marginLeft: 8, fontWeight: 400 }, children: "Standard PO (no sharing)" })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: newProductSharingProvider, onChange: e => { setNewProductSharingProvider(e.target.checked); if (e.target.checked)
                                                            setNewProductSharingConsumer(false); } }), "This product is a Sharing Provider"] }), newProductSharingProvider && (_jsx("div", { style: { marginTop: 6, marginLeft: 20 }, children: _jsx("input", { style: { width: '100%', padding: '3px 6px', fontSize: 11, marginBottom: 4 }, placeholder: "Consumer List External ID", value: newProductConsumerListExtId, onChange: e => setNewProductConsumerListExtId(e.target.value) }) })), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 6 }, children: [_jsx("input", { type: "checkbox", checked: newProductSharingConsumer, onChange: e => { setNewProductSharingConsumer(e.target.checked); if (e.target.checked)
                                                            setNewProductSharingProvider(false); } }), "This product is a Sharing Consumer"] }), newProductSharingConsumer && (_jsxs("div", { style: { marginTop: 6, marginLeft: 20, display: 'grid', gap: 4 }, children: [_jsx("input", { style: { width: '100%', padding: '3px 6px', fontSize: 11 }, placeholder: "Provider Product External ID", value: newProductProviderExtId, onChange: e => setNewProductProviderExtId(e.target.value) }), _jsx("input", { style: { width: '100%', padding: '3px 6px', fontSize: 11 }, placeholder: "Consumer List Entry External ID", value: newProductConsumerListExtId, onChange: e => setNewProductConsumerListExtId(e.target.value) })] }))] }), (popLoading || popPersonalization.length > 0) && (_jsxs("div", { style: { marginBottom: 12, padding: '8px 10px', background: '#fdf4ff', borderRadius: 6, border: '1px solid #f0abfc' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: popEnabled, onChange: e => setPopEnabled(e.target.checked) }), "Personalize POP Prices (", popPersonalization.length, " available)"] }), popLoading && _jsx("span", { style: { fontSize: 10, color: '#999' }, children: "Loading..." })] }), popEnabled && popPersonalization.map((pop) => (_jsxs("div", { style: { border: '1px solid #e9d5ff', borderRadius: 4, padding: '6px 8px', marginBottom: 6, background: '#fff' }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }, children: [_jsx("input", { type: "checkbox", checked: !!popSelected[pop.popId], onChange: e => setPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked })) }), pop.popName || pop.popExternalId || pop.popId] }), popSelected[pop.popId] && (pop.rows || []).map((row) => (_jsxs("div", { style: { marginLeft: 16, marginBottom: 4 }, children: [row.rowExternalId && _jsxs("div", { style: { fontSize: 10, color: '#888', marginBottom: 2 }, children: ["Row: ", row.rowExternalId] }), (row.chars || []).map((c) => {
                                                                const key = `${pop.popId}_${row.rowId}_${c.id}`;
                                                                const val = popValues[key] || { value: '', unit: '' };
                                                                return (_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: 10, minWidth: 100, color: '#555' }, children: c.name || c.externalId || c.id }), _jsx("input", { style: { flex: 1, padding: '2px 4px', fontSize: 11 }, placeholder: c.defaultValue || 'value', value: val.value, onChange: e => setPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } })) }), c.units && c.units.length > 0 ? (_jsx("select", { style: { padding: '2px 4px', fontSize: 10 }, value: val.unit, onChange: e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } })), children: c.units.map((u) => _jsx("option", { value: u, children: u }, u)) })) : val.unit ? (_jsx("span", { style: { fontSize: 10, color: '#888' }, children: val.unit })) : null] }, c.id));
                                                            })] }, row.rowId)))] }, pop.popId)))] })), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("button", { onClick: purchaseProduct, disabled: actionLoading || !newProductExtId, style: { background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Adding...' : 'Add Product' }), _jsx("button", { onClick: () => setShowAddProduct(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }))] })), showTopUp && (() => {
                        const { billing } = flattenBuckets(balance);
                        const knownUnits = [...new Set(billing.map((b) => b.unitOfMeasure).filter(Boolean))];
                        return (_jsxs("div", { style: { border: '1px solid #a7f3d0', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#059669' }, children: "\uD83D\uDCB0 Balance Top-Up" }), _jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 10, padding: '6px 8px', background: '#fff', borderRadius: 4 }, children: ["Customer: ", _jsx("b", { children: custExtId }), " | Contract: ", _jsx("b", { children: contractExtId }), " | MSISDN: ", _jsx("b", { children: msisdnValue || searchValue })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Amount *" }), _jsx("input", { type: "number", style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: topUpAmount, onChange: e => setTopUpAmount(e.target.value), placeholder: "e.g. 1000" })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Unit of Measure" }), _jsx("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: topUpUnit, onChange: e => setTopUpUnit(e.target.value), children: knownUnits.length > 0
                                                        ? knownUnits.map(u => _jsx("option", { value: u, children: u }, u))
                                                        : _jsxs(_Fragment, { children: [_jsx("option", { value: "euro", children: "euro" }), _jsx("option", { value: "byte", children: "byte" }), _jsx("option", { value: "second", children: "second" }), _jsx("option", { value: "unit", children: "unit" }), _jsx("option", { value: "SMS", children: "SMS" }), _jsx("option", { value: "MMS", children: "MMS" })] }) }), knownUnits.length > 0 && _jsx("div", { style: { fontSize: 10, color: '#999', marginTop: 2 }, children: "From loaded buckets" })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Decimal Places" }), _jsx("input", { type: "number", style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: topUpDecimalPlaces, onChange: e => setTopUpDecimalPlaces(e.target.value), placeholder: "0" })] })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: doBalanceTopUp, disabled: actionLoading || !topUpAmount, style: { background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Processing...' : 'Top Up' }), _jsx("button", { onClick: () => setShowTopUp(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })(), showRecurring && (_jsxs("div", { style: { border: '1px solid #bae6fd', borderRadius: 8, padding: 16, background: '#f0f9ff', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#0284c7' }, children: "\uD83D\uDD04 Recurrence Enquiry" }), _jsxs("p", { style: { fontSize: 12, color: '#555', margin: '0 0 10px' }, children: ["Query recurrence schedules for this subscriber. This fetches active recurring charges tied to MSISDN: ", _jsx("b", { children: msisdnValue || searchValue })] }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 10 }, children: [_jsx("button", { onClick: doRunRecurring, disabled: actionLoading, style: { background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Querying...' : 'Query Recurrences' }), _jsx("button", { onClick: () => { setShowRecurring(false); setRecurringResult(null); }, style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Close" })] }), recurringResult && (_jsx("pre", { style: { fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: JSON.stringify(recurringResult, null, 2) }))] })), showProviderConsumer && (_jsxs("div", { style: { border: '1px solid #fecaca', borderRadius: 8, padding: 16, background: '#fef2f2', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#dc2626' }, children: "\uD83D\uDD17 Sharing Provider / Consumer Management" }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }, children: "Action" }), _jsxs("select", { style: { width: '100%', padding: '6px 8px', fontSize: 12 }, value: pcAction, onChange: e => setPcAction(e.target.value), children: [_jsx("option", { value: "viewConsumers", children: "View Provider/Consumer Products" }), _jsx("option", { value: "addConsumer", children: "Add Consumer to Provider" }), _jsx("option", { value: "removeConsumer", children: "Remove Consumer from Provider" }), _jsx("option", { value: "setLimits", children: "Set Sharing Limits" })] })] }), pcAction === 'viewConsumers' && (_jsx("div", { children: _jsxs("p", { style: { fontSize: 11, color: '#666', margin: '0 0 10px' }, children: ["View sharing provider/consumer products for: ", _jsx("b", { children: custExtId })] }) })), (pcAction === 'addConsumer' || pcAction === 'removeConsumer') && (_jsxs("div", { style: { display: 'grid', gap: 8, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Provider Product External ID *" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: pcProviderProductExtId, onChange: e => {
                                                    setPcProviderProductExtId(e.target.value);
                                                    setPcLinkedConsumerPO(null);
                                                    // Fetch provider PO spec to get linked consumer PO
                                                    const selProd = products.find((p) => p.externalId === e.target.value);
                                                    const poExtId = selProd?.productOfferingExternalId;
                                                    if (poExtId) {
                                                        fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(poExtId)}`)
                                                            .then(r => r.ok ? r.json() : null)
                                                            .then((data) => {
                                                            const poSpec = Array.isArray(data) ? data[0] : data;
                                                            // Find linked consumer PO from productOffering[type=PROVIDES_TO]
                                                            const linkedPOs = (poSpec?.productOffering || []).filter((po) => po.type === 'PROVIDES_TO');
                                                            if (linkedPOs.length > 0) {
                                                                const linked = linkedPOs[0];
                                                                setPcLinkedConsumerPO({ id: linked.id, externalId: linked.externalId, name: linked.name });
                                                                setPcConsumerPO(linked.externalId);
                                                                setPcConsumerProductExtId(`${linked.externalId}-${pcConsumerMsisdn || 'new'}`);
                                                                // Also fetch POP for the linked consumer PO
                                                                setPcPopLoading(true);
                                                                fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(linked.externalId)}`)
                                                                    .then(r => r.ok ? r.json() : [])
                                                                    .then((pops) => {
                                                                    setPcPopPersonalization(pops);
                                                                    const defaults = {};
                                                                    const selectedAll = {};
                                                                    for (const pop of pops) {
                                                                        selectedAll[pop.popId] = true;
                                                                        for (const row of (pop.rows || []))
                                                                            for (const c of (row.chars || []))
                                                                                defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') };
                                                                    }
                                                                    setPcPopValues(defaults);
                                                                    setPcPopSelected(selectedAll);
                                                                    if (pops.length > 0)
                                                                        setPcPopEnabled(true);
                                                                    setPcPopLoading(false);
                                                                })
                                                                    .catch(() => setPcPopLoading(false));
                                                            }
                                                        })
                                                            .catch(() => { });
                                                    }
                                                }, children: [_jsx("option", { value: "", children: "-- Select provider product --" }), products.filter((p) => p.sharingProvider).map((p) => (_jsxs("option", { value: p.externalId, children: [p.name || p.productOfferingExternalId, " (", p.externalId, ")"] }, p.externalId))), _jsx("option", { value: "_custom", children: "Enter manually..." })] }), pcProviderProductExtId === '_custom' && (_jsx("input", { style: { width: '100%', padding: '3px 6px', fontSize: 11, marginTop: 4 }, placeholder: "Provider product external ID", onChange: e => setPcProviderProductExtId(e.target.value) }))] }), pcAction === 'addConsumer' && (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Consumer MSISDN *" }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("input", { style: { flex: 1, padding: '4px 8px', fontSize: 12 }, value: pcConsumerMsisdn, onChange: e => setPcConsumerMsisdn(e.target.value), placeholder: "Enter consumer MSISDN to lookup" }), _jsx("button", { onClick: () => lookupConsumerByMsisdn(pcConsumerMsisdn), disabled: pcLookupLoading || !pcConsumerMsisdn, style: { fontSize: 11, padding: '4px 10px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' }, children: pcLookupLoading ? '...' : '🔍 Lookup' })] })] }), _jsxs("div", { children: [_jsxs("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: ["Consumer Customer External ID ", pcConsumerCustExtId ? '✓' : '*'] }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerCustExtId ? '#f0fff4' : '#fff' }, value: pcConsumerCustExtId, onChange: e => setPcConsumerCustExtId(e.target.value), placeholder: "Auto-filled from lookup" })] }), _jsxs("div", { children: [_jsxs("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: ["Consumer Contract External ID ", pcConsumerContractExtId ? '✓' : '*'] }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerContractExtId ? '#f0fff4' : '#fff' }, value: pcConsumerContractExtId, onChange: e => setPcConsumerContractExtId(e.target.value), placeholder: "Auto-filled from lookup" })] })] })), _jsxs("div", { children: [_jsxs("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: ["Consumer Entry External ID ", pcAction === 'removeConsumer' ? '*' : `${pcConsumerListExtId ? '✓' : '(auto: ConsumerEntry-<msisdn>)'}`] }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerListExtId ? '#f0fff4' : '#fff' }, value: pcConsumerListExtId, onChange: e => setPcConsumerListExtId(e.target.value), placeholder: "ConsumerEntry-<consumerMsisdn>" })] })] })), pcAction === 'addConsumer' && pcConsumerCustExtId && (_jsxs("div", { style: { padding: '8px 10px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', marginBottom: 12 }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "\uD83D\uDCE6 Consumer Product Offering" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }, children: [_jsxs("div", { children: [_jsxs("label", { style: { display: 'block', fontSize: 10, marginBottom: 2 }, children: ["Consumer PO *", pcLinkedConsumerPO && _jsx("span", { style: { fontSize: 9, color: '#059669', marginLeft: 6 }, children: "\u26A1 Auto-detected from provider spec" })] }), pcLinkedConsumerPO ? (_jsxs("div", { style: { padding: '4px 8px', fontSize: 11, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4 }, children: [pcLinkedConsumerPO.name, " (", pcLinkedConsumerPO.externalId, ")"] })) : (_jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 11 }, value: pcConsumerPO, onChange: e => {
                                                            setPcConsumerPO(e.target.value);
                                                            setPcConsumerProductExtId(`${e.target.value}-${pcConsumerMsisdn}`);
                                                            setPcPopPersonalization([]);
                                                            setPcPopValues({});
                                                            setPcPopEnabled(false);
                                                            setPcPopSelected({});
                                                            setPcPopLoading(true);
                                                            if (e.target.value) {
                                                                fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(e.target.value)}`)
                                                                    .then(r => r.ok ? r.json() : [])
                                                                    .then((pops) => {
                                                                    setPcPopPersonalization(pops);
                                                                    const defaults = {};
                                                                    const selectedAll = {};
                                                                    for (const pop of pops) {
                                                                        selectedAll[pop.popId] = true;
                                                                        for (const row of (pop.rows || []))
                                                                            for (const c of (row.chars || []))
                                                                                defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') };
                                                                    }
                                                                    setPcPopValues(defaults);
                                                                    setPcPopSelected(selectedAll);
                                                                    if (pops.length > 0)
                                                                        setPcPopEnabled(true);
                                                                    setPcPopLoading(false);
                                                                })
                                                                    .catch(() => setPcPopLoading(false));
                                                            }
                                                            else {
                                                                setPcPopLoading(false);
                                                            }
                                                        }, children: [_jsx("option", { value: "", children: "-- Select Consumer PO --" }), poList.filter((p) => {
                                                                const types = (p.offeringTypes || []).map((t) => t.toUpperCase());
                                                                const name = (p.name || '').toLowerCase();
                                                                return types.includes('SHARING_CONSUMER') || types.includes('CONSUMER') || name.includes('consumer') || name.includes('sharing');
                                                            }).map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId)), _jsx("option", { disabled: true, children: "\u2500\u2500\u2500\u2500\u2500 All POs \u2500\u2500\u2500\u2500\u2500" }), poList.filter((p) => {
                                                                const types = (p.offeringTypes || []).map((t) => t.toUpperCase());
                                                                const name = (p.name || '').toLowerCase();
                                                                return !(types.includes('SHARING_CONSUMER') || types.includes('CONSUMER') || name.includes('consumer') || name.includes('sharing'));
                                                            }).map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId))] }))] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 10, marginBottom: 2 }, children: "Product External ID" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 11 }, value: pcConsumerProductExtId, onChange: e => setPcConsumerProductExtId(e.target.value), placeholder: "Auto-generated" })] })] }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 6 }, children: [_jsx("input", { type: "checkbox", checked: pcConsumerBaRef, onChange: e => setPcConsumerBaRef(e.target.checked) }), "Link to consumer's Billing Account"] }), (pcPopLoading || pcPopPersonalization.length > 0) && (_jsxs("div", { style: { padding: '6px 8px', background: '#fff', borderRadius: 4, border: '1px solid #d1fae5' }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }, children: [_jsx("input", { type: "checkbox", checked: pcPopEnabled, onChange: e => setPcPopEnabled(e.target.checked) }), "Set Consumer Limits (", pcPopPersonalization.length, " POP", pcPopPersonalization.length !== 1 ? 's' : '', ")", pcPopLoading && _jsx("span", { style: { fontSize: 10, color: '#999' }, children: "Loading..." })] }), pcPopEnabled && pcPopPersonalization.map((pop) => (_jsxs("div", { style: { border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px', marginBottom: 4 }, children: [_jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 3 }, children: [_jsx("input", { type: "checkbox", checked: !!pcPopSelected[pop.popId], onChange: e => setPcPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked })) }), pop.popName || pop.popExternalId || pop.popId] }), pcPopSelected[pop.popId] && (pop.rows || []).map((row) => (_jsx("div", { style: { marginLeft: 14 }, children: (row.chars || []).map((c) => {
                                                            const key = `${pop.popId}_${row.rowId}_${c.id}`;
                                                            const val = pcPopValues[key] || { value: '', unit: '' };
                                                            return (_jsxs("div", { style: { display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }, children: [_jsx("span", { style: { fontSize: 10, minWidth: 80, color: '#555' }, children: c.name || c.externalId || c.id }), _jsx("input", { style: { flex: 1, padding: '2px 4px', fontSize: 10 }, placeholder: c.defaultValue || 'limit value', value: val.value, onChange: e => setPcPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } })) }), c.units && c.units.length > 0 ? (_jsx("select", { style: { padding: '2px 4px', fontSize: 10 }, value: val.unit, onChange: e => setPcPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } })), children: c.units.map((u) => _jsx("option", { value: u, children: u }, u)) })) : val.unit ? _jsx("span", { style: { fontSize: 9, color: '#888' }, children: val.unit }) : null] }, c.id));
                                                        }) }, row.rowId)))] }, pop.popId)))] }))] })), pcAction === 'setLimits' && (_jsxs("div", { style: { display: 'grid', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { style: { padding: '8px 10px', background: '#fef9c3', borderRadius: 6, border: '1px solid #fde047' }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "Common Limit (all consumers collectively)" }), _jsx("div", { style: { fontSize: 10, color: '#666', marginBottom: 6 }, children: "Bucket: PBS_Data_Sharing_Limit_Common_CHT on provider product" }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("input", { type: "number", style: { flex: 1, padding: '4px 8px', fontSize: 12 }, value: limitCommonValue, onChange: e => setLimitCommonValue(e.target.value), placeholder: "e.g. 5368709120 (5GB in bytes)" }), _jsxs("select", { style: { padding: '4px 8px', fontSize: 11 }, value: limitCommonUnit, onChange: e => setLimitCommonUnit(e.target.value), children: [_jsx("option", { value: "byte", children: "byte" }), _jsx("option", { value: "kilobyte", children: "kilobyte" }), _jsx("option", { value: "megabyte", children: "megabyte" }), _jsx("option", { value: "gigabyte", children: "gigabyte" })] }), _jsx("button", { onClick: () => doSetLimits('common'), disabled: actionLoading || !limitCommonValue, style: { fontSize: 10, padding: '4px 12px', background: '#b45309', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: "Set Common" })] })] }), _jsxs("div", { style: { padding: '8px 10px', background: '#ede9fe', borderRadius: 6, border: '1px solid #c4b5fd' }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "Individual Limit (per consumer)" }), _jsx("div", { style: { fontSize: 10, color: '#666', marginBottom: 6 }, children: "Bucket: PBS_Data_Sharing_Limit_CHT on consumer product" }), _jsxs("div", { style: { marginBottom: 6 }, children: [_jsx("label", { style: { display: 'block', fontSize: 10, marginBottom: 2 }, children: "Consumer MSISDN" }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("input", { style: { flex: 1, padding: '4px 8px', fontSize: 11 }, value: limitConsumerMsisdn, onChange: e => setLimitConsumerMsisdn(e.target.value), placeholder: "Consumer MSISDN" }), _jsx("button", { onClick: () => lookupConsumerForLimit(limitConsumerMsisdn), disabled: !limitConsumerMsisdn, style: { fontSize: 10, padding: '3px 8px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' }, children: "\uD83D\uDD0D" })] }), limitConsumerProductExtId && (_jsxs("div", { style: { fontSize: 10, color: '#059669', marginTop: 3 }, children: ["\u2713 Product: ", limitConsumerProductExtId] }))] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("input", { type: "number", style: { flex: 1, padding: '4px 8px', fontSize: 12 }, value: limitIndividualValue, onChange: e => setLimitIndividualValue(e.target.value), placeholder: "e.g. 1073741824 (1GB in bytes)" }), _jsxs("select", { style: { padding: '4px 8px', fontSize: 11 }, value: limitIndividualUnit, onChange: e => setLimitIndividualUnit(e.target.value), children: [_jsx("option", { value: "byte", children: "byte" }), _jsx("option", { value: "kilobyte", children: "kilobyte" }), _jsx("option", { value: "megabyte", children: "megabyte" }), _jsx("option", { value: "gigabyte", children: "gigabyte" })] }), _jsx("button", { onClick: () => doSetLimits('individual'), disabled: actionLoading || !limitIndividualValue || !limitConsumerProductExtId, style: { fontSize: 10, padding: '4px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: "Set Individual" })] })] })] })), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 10 }, children: [_jsx("button", { onClick: doProviderConsumerAction, disabled: actionLoading || pcAction === 'setLimits', style: { background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Processing...' : pcAction === 'viewConsumers' ? 'Fetch' : pcAction === 'addConsumer' ? 'Add Consumer' : pcAction === 'setLimits' ? 'Set Limits' : 'Remove Consumer' }), _jsx("button", { onClick: () => { setShowProviderConsumer(false); setPcResult(null); }, style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Close" })] }), pcResult && (_jsx("pre", { style: { fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: JSON.stringify(pcResult, null, 2) }))] })), showResourceSwap && (() => {
                        // Extract current resources from contract
                        const contractResources = (c?.resource || []).map((r) => ({
                            number: r.resourceNumber,
                            specExtId: r.resourceSpecificationExternalId || '',
                            extId: r.externalId || '',
                            specName: resourceSpecs.find((s) => s.externalId === r.resourceSpecificationExternalId)?.name || r.resourceSpecificationExternalId || 'Unknown'
                        }));
                        return (_jsxs("div", { style: { border: '1px solid #fed7aa', borderRadius: 8, padding: 16, background: '#fff7ed', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#ea580c' }, children: "\uD83D\uDD04 Resource Swap (SIM/MSISDN Change)" }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Old Resource (from contract) *" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: rsOldResourceNumber, onChange: e => {
                                                        setRsOldResourceNumber(e.target.value);
                                                        const res = contractResources.find((r) => r.number === e.target.value);
                                                        if (res)
                                                            setRsResourceSpecExtId(res.specExtId);
                                                    }, children: [_jsx("option", { value: "", children: "-- Select current resource --" }), contractResources.map((r, i) => _jsxs("option", { value: r.number, children: [r.number, " (", r.specName, ")"] }, i))] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "New Resource Number *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: rsNewResourceNumber, onChange: e => setRsNewResourceNumber(e.target.value), placeholder: "Enter new MSISDN/IMSI" })] })] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Resource Spec (auto-filled)" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12, background: '#f8f8f8' }, value: rsResourceSpecExtId, readOnly: true })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Product (optional scope)" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: rsProductExtId, onChange: e => setRsProductExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- All products --" }), products.map((p) => _jsxs("option", { value: p.externalId, children: [p.name || p.productOfferingExternalId, " (", p.externalId, ")"] }, p.externalId))] })] })] }), _jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 10 }, children: ["Customer: ", _jsx("b", { children: custExtId }), " | Contract: ", _jsx("b", { children: contractExtId })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: doResourceSwap, disabled: actionLoading || !rsOldResourceNumber || !rsNewResourceNumber, style: { background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Swapping...' : 'Swap Resource' }), _jsx("button", { onClick: () => setShowResourceSwap(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })(), showBalanceAdj && (() => {
                        // Extract known bucket units from balance data
                        const { billing, products: prodBuckets } = flattenBuckets(balance);
                        const allBuckets = [...billing, ...Object.values(prodBuckets).flat()];
                        const knownUnits = [...new Set(allBuckets.map((b) => b.unitOfMeasure).filter(Boolean))];
                        return (_jsxs("div", { style: { border: '1px solid #fde68a', borderRadius: 8, padding: 16, background: '#fffbeb', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#b45309' }, children: "\uD83D\uDCB3 Balance Adjustment (Credit / Debit)" }), _jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 10, padding: '6px 8px', background: '#fff', borderRadius: 4 }, children: ["Customer: ", _jsx("b", { children: custExtId }), " | Contract: ", _jsx("b", { children: contractExtId }), " | MSISDN: ", _jsx("b", { children: msisdnValue || searchValue })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }, children: "Adjustment Type" }), _jsxs("select", { style: { width: '100%', padding: '6px 8px', fontSize: 12 }, value: baAdjType, onChange: e => setBaAdjType(e.target.value), children: [_jsxs("option", { value: "billing", children: ["Billing Account Adjustment (", baExtId || 'no BA', ")"] }), _jsx("option", { value: "product", children: "Product Bucket Adjustment" })] })] }), baAdjType === 'product' && (_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Target Product" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: baAdjProductExtId, onChange: e => setBaAdjProductExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- Select product --" }), products.map((p) => _jsxs("option", { value: p.externalId, children: [p.name || p.productOfferingExternalId, " (", p.externalId, ")"] }, p.externalId))] })] })), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Amount * (negative = debit)" }), _jsx("input", { type: "number", style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: baAdjAmount, onChange: e => setBaAdjAmount(e.target.value), placeholder: "e.g. 500 or -200" })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Unit of Measure" }), _jsx("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: baAdjUnit, onChange: e => setBaAdjUnit(e.target.value), children: knownUnits.length > 0
                                                        ? knownUnits.map(u => _jsx("option", { value: u, children: u }, u))
                                                        : _jsxs(_Fragment, { children: [_jsx("option", { value: "euro", children: "euro" }), _jsx("option", { value: "byte", children: "byte" }), _jsx("option", { value: "second", children: "second" }), _jsx("option", { value: "unit", children: "unit" }), _jsx("option", { value: "SMS", children: "SMS" }), _jsx("option", { value: "MMS", children: "MMS" })] }) }), knownUnits.length > 0 && _jsx("div", { style: { fontSize: 10, color: '#999', marginTop: 2 }, children: "From loaded buckets" })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Decimal Places" }), _jsx("input", { type: "number", style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: baAdjDecimalPlaces, onChange: e => setBaAdjDecimalPlaces(e.target.value), placeholder: "0" })] })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Reason (optional)" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: baAdjReason, onChange: e => setBaAdjReason(e.target.value), placeholder: "e.g. Goodwill credit, Refund, Correction" })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: doBalanceAdjustment, disabled: actionLoading || !baAdjAmount, style: { background: '#b45309', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Adjusting...' : 'Apply Adjustment' }), _jsx("button", { onClick: () => setShowBalanceAdj(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })(), showProductReplace && (() => {
                        const activeProducts = products.filter((p) => {
                            const s = (p.status?.slice(-1)[0]?.status || '').toLowerCase();
                            return !s.includes('terminat');
                        });
                        const selectedOld = activeProducts.find((p) => p.externalId === prOldProductExtId);
                        return (_jsxs("div", { style: { border: '1px solid #e9d5ff', borderRadius: 8, padding: 16, background: '#faf5ff', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#9333ea' }, children: "\uD83D\uDD00 Product Replace (Plan Change)" }), _jsx("p", { style: { fontSize: 11, color: '#666', margin: '0 0 12px' }, children: "Terminate old product and add a new one in a single contract update." }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Old Product (to terminate) *" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: prOldProductExtId, onChange: e => setPrOldProductExtId(e.target.value), children: [_jsx("option", { value: "", children: "-- Select current product --" }), activeProducts.map((p) => _jsxs("option", { value: p.externalId, children: [p.name || p.productOfferingExternalId, " (", p.externalId, ")"] }, p.externalId))] }), selectedOld && (_jsxs("div", { style: { fontSize: 10, color: '#999', marginTop: 2 }, children: ["Current PO: ", selectedOld.productOfferingExternalId, " | Status: ", selectedOld.status?.slice(-1)[0]?.status] }))] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "New Product Offering *" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: prNewPO, onChange: e => { setPrNewPO(e.target.value); setPrNewProductExtId(`${e.target.value}-${Date.now().toString(36)}`); }, children: [_jsx("option", { value: "", children: "-- Select new PO --" }), poList.map((p) => _jsxs("option", { value: p.externalId, children: [p.name, " (", p.externalId, ")"] }, p.id || p.externalId))] })] })] }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "New Product External ID (auto-generated)" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: prNewProductExtId, onChange: e => setPrNewProductExtId(e.target.value) })] }), _jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 10 }, children: ["BA Reference: ", _jsx("b", { children: baExtId }), " | Contract: ", _jsx("b", { children: contractExtId })] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: doProductReplace, disabled: actionLoading || !prOldProductExtId || !prNewPO, style: { background: '#9333ea', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Replacing...' : 'Replace Product' }), _jsx("button", { onClick: () => setShowProductReplace(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })(), showFinancial && (_jsxs("div", { style: { border: '1px solid #99f6e4', borderRadius: 8, padding: 16, background: '#f0fdfa', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#0f766e' }, children: "\uD83D\uDCCA Financial / Billing" }), _jsx("div", { style: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }, children: ['transactions', 'unbilled', 'bills', 'summary'].map(t => (_jsx("button", { onClick: () => { setFinancialTab(t); fetchFinancialData(t); }, style: { fontSize: 11, padding: '4px 10px', background: financialTab === t ? '#0f766e' : '#e0e0e0', color: financialTab === t ? '#fff' : '#333', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: financialTab === t ? 600 : 400 }, children: t === 'transactions' ? 'Transactions' : t === 'unbilled' ? 'Unbilled Charges' : t === 'bills' ? 'Customer Bills' : 'Summary' }, t))) }), financialLoading && _jsx("p", { style: { fontSize: 12, color: '#666' }, children: "Loading..." }), financialData && (_jsx("pre", { style: { fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }, children: JSON.stringify(financialData, null, 2) })), _jsx("button", { onClick: () => { setShowFinancial(false); setFinancialData(null); }, style: { marginTop: 10, background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }, children: "Close" })] })), showUpdateEntity && (() => {
                        const currentPartyStatus = p0?.status?.slice(-1)[0]?.status || '';
                        const currentCustStatus = cu?.status?.slice(-1)[0]?.status || '';
                        const currentPartyChars = p0?.characteristic || [];
                        const currentCustChars = cu?.characteristic || [];
                        return (_jsxs("div", { style: { border: '1px solid #c7d2fe', borderRadius: 8, padding: 16, background: '#eef2ff', marginBottom: 16 }, children: [_jsx("h4", { style: { margin: '0 0 12px', color: '#4338ca' }, children: "\u270F\uFE0F Update Party / Customer" }), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }, children: "Target" }), _jsxs("select", { style: { width: '100%', padding: '6px 8px', fontSize: 12 }, value: updateTarget, onChange: e => { setUpdateTarget(e.target.value); setUpdateChars([]); }, children: [_jsxs("option", { value: "party", children: ["Party (", p0?.externalId || 'not loaded', ") \u2014 Current: ", currentPartyStatus] }), _jsxs("option", { value: "customer", children: ["Customer (", cu?.externalId || 'not loaded', ") \u2014 Current: ", currentCustStatus] })] })] }), updateTarget === 'party' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }, children: [_jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Given Name" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: updatePartyGivenName, onChange: e => setUpdatePartyGivenName(e.target.value), placeholder: p0?.givenName || 'Current value' }), p0?.givenName && _jsxs("div", { style: { fontSize: 10, color: '#999', marginTop: 1 }, children: ["Current: ", p0.givenName] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Family Name" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: updatePartyFamilyName, onChange: e => setUpdatePartyFamilyName(e.target.value), placeholder: p0?.familyName || 'Current value' }), p0?.familyName && _jsxs("div", { style: { fontSize: 10, color: '#999', marginTop: 1 }, children: ["Current: ", p0.familyName] })] }), _jsxs("div", { children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Status" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: updatePartyStatus, onChange: e => setUpdatePartyStatus(e.target.value), children: [_jsxs("option", { value: "", children: ["-- No change (", currentPartyStatus, ") --"] }), _jsx("option", { value: "PartyActive", children: "PartyActive" }), _jsx("option", { value: "PartyInactive", children: "PartyInactive" })] })] })] }), currentPartyChars.length > 0 && (_jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 8, padding: '4px 8px', background: '#fff', borderRadius: 4 }, children: ["Current characteristics: ", currentPartyChars.map((ch) => `${ch.charSpecExternalId}=${ch.value?.[0]?.value ?? ''}`).join(', ')] }))] })), updateTarget === 'customer' && (_jsxs(_Fragment, { children: [_jsxs("div", { style: { marginBottom: 12 }, children: [_jsx("label", { style: { display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }, children: "Status" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: updateCustStatus, onChange: e => setUpdateCustStatus(e.target.value), children: [_jsxs("option", { value: "", children: ["-- No change (", currentCustStatus, ") --"] }), _jsx("option", { value: "CustomerActive", children: "CustomerActive" }), _jsx("option", { value: "CustomerSuspended", children: "CustomerSuspended" }), _jsx("option", { value: "CustomerInactive", children: "CustomerInactive" })] })] }), currentCustChars.length > 0 && (_jsxs("div", { style: { fontSize: 11, color: '#666', marginBottom: 8, padding: '4px 8px', background: '#fff', borderRadius: 4 }, children: ["Current characteristics: ", currentCustChars.map((ch) => `${ch.charSpecExternalId || ch.name}=${ch.value?.[0]?.value ?? ''}`).join(', ')] }))] })), _jsxs("div", { style: { marginBottom: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }, children: [_jsx("span", { style: { fontSize: 11, fontWeight: 600 }, children: "Characteristics to Update" }), _jsx("button", { onClick: () => setUpdateChars(prev => [...prev, { charSpecExternalId: '', value: '' }]), style: { fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }, children: "+ Add" }), (updateTarget === 'party' ? currentPartyChars : currentCustChars).length > 0 && (_jsx("button", { onClick: () => setUpdateChars((updateTarget === 'party' ? currentPartyChars : currentCustChars).map((ch) => ({
                                                        charSpecExternalId: ch.charSpecExternalId || ch.name || '', value: ch.value?.[0]?.value ?? ''
                                                    }))), style: { fontSize: 10, padding: '1px 6px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3, cursor: 'pointer' }, children: "Load current" }))] }), updateChars.map((ch, i) => (_jsxs("div", { style: { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }, children: [_jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "charSpecExternalId", value: ch.charSpecExternalId, onChange: e => {
                                                        const u = [...updateChars];
                                                        u[i].charSpecExternalId = e.target.value;
                                                        setUpdateChars(u);
                                                    } }), _jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, placeholder: "value", value: ch.value, onChange: e => {
                                                        const u = [...updateChars];
                                                        u[i].value = e.target.value;
                                                        setUpdateChars(u);
                                                    } }), _jsx("button", { onClick: () => setUpdateChars(prev => prev.filter((_, j) => j !== i)), style: { fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }, children: "\u2715" })] }, i)))] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: doUpdateEntity, disabled: actionLoading, style: { background: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }, children: actionLoading ? 'Updating...' : `Update ${updateTarget === 'party' ? 'Party' : 'Customer'}` }), _jsx("button", { onClick: () => setShowUpdateEntity(false), style: { background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }, children: "Cancel" })] })] }));
                    })()] }))] }));
}
