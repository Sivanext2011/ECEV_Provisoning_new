import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
// Multi-value encoding: when maxCardinality > 1, CharInput joins values with this delimiter.
// Callers use splitCharValues() to turn the encoded string into multiple {value} objects.
export const MULTI_VALUE_DELIM = '\u0001';
/** Split a (possibly multi-value) characteristic string into individual trimmed values. */
export function splitCharValues(v) {
    if (v === undefined || v === null)
        return [];
    return String(v).split(MULTI_VALUE_DELIM).map(s => s.trim()).filter(s => s !== '');
}
export function CharInput({ char: c, value, onChange }) {
    const reg = c.valueRegulator;
    const isMust = reg === 'mustBePersonalized';
    const isCan = reg === 'canBePersonalized';
    const isFixed = reg === 'fixed';
    const isSelection = reg === 'selection';
    const possibleValues = c.possibleValues || [];
    const charKey = c.externalId || c.id;
    const hasRange = c.valueFrom !== undefined && c.valueFrom !== '';
    const isNumeric = c.valueType === 'LONG' || c.valueType === 'INTEGER' || c.valueType === 'DOUBLE' || c.valueType === 'FLOAT';
    const nameLC = (c.name || c.externalId || '').toLowerCase();
    const isDateByName = nameLC.includes('date') || nameLC.includes('datetime') || nameLC.includes('starttime') || nameLC.includes('endtime') || nameLC.includes('expir');
    const isDateTime = c.valueType === 'DATE_TIME' || c.valueType === 'DATE' || (c.valueType === 'STRING' && isDateByName);
    const enumPVs = possibleValues.filter((pv) => pv.value !== undefined || pv.name);
    const maxCard = Number(c.maxCardinality) || 1;
    const isMulti = maxCard > 1;
    const [personalize, setPersonalize] = useState(isMust || isFixed || isSelection);
    useEffect(() => {
        if (!personalize)
            onChange('');
    }, [personalize, c.externalId]);
    const badge = isMust
        ? _jsx("span", { style: { fontSize: 10, background: '#c60', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }, children: "required" })
        : isCan
            ? _jsx("span", { style: { fontSize: 10, background: '#0a7', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }, children: "optional" })
            : isFixed
                ? _jsx("span", { style: { fontSize: 10, background: '#888', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }, children: "fixed" })
                : isSelection
                    ? _jsx("span", { style: { fontSize: 10, background: '#46a', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }, children: "selection" })
                    : null;
    const rangeHint = hasRange
        ? `${c.valueFrom}–${c.valueTo}${c.unitOfMeasure ? ' ' + c.unitOfMeasure : (!isNumeric ? ' chars' : '')}`
        : c.unitOfMeasure ? c.unitOfMeasure : '';
    const disabled = isFixed || (!personalize && isCan);
    // ---- single-value input renderer (reused for each row in multi mode) ----
    const renderSingle = (val, setVal) => {
        if (enumPVs.length > 0) {
            return (_jsxs("select", { style: { width: '100%' }, value: val, onChange: e => setVal(e.target.value), disabled: disabled, children: [_jsx("option", { value: "", children: "-- Select --" }), enumPVs.map((pv, i) => (_jsxs("option", { value: pv.value || '', children: [pv.value, pv.name && pv.name !== pv.value && pv.name !== c.name ? ` (${pv.name})` : '', pv.default ? ' ✓' : ''] }, i)))] }));
        }
        return (_jsx("input", { type: isDateTime ? 'datetime-local' : isNumeric ? 'number' : 'text', style: { flex: 1, width: '100%', background: disabled ? '#f5f5f5' : undefined }, placeholder: c.defaultValue || (hasRange && isNumeric ? `${c.valueFrom}–${c.valueTo}` : isDateTime ? 'Select date/time' : `Enter ${c.name || charKey}`), value: isDateTime && val && val.includes('T') && val.includes('Z') ? val.slice(0, 16) : val, onChange: e => {
                if (isDateTime && e.target.value) {
                    const v = e.target.value;
                    if (v.length === 16)
                        setVal(v + ':00.000Z');
                    else if (v.length === 19)
                        setVal(v + '.000Z');
                    else if (!v.endsWith('Z'))
                        setVal(v + 'Z');
                    else
                        setVal(v);
                }
                else {
                    setVal(e.target.value);
                }
            }, readOnly: disabled, min: hasRange && isNumeric ? c.valueFrom : undefined, max: hasRange && isNumeric ? c.valueTo : undefined }));
    };
    // ---- multi-value input: one row per value, add/remove, capped at maxCardinality ----
    const renderMulti = () => {
        const values = value ? value.split(MULTI_VALUE_DELIM) : [''];
        const setAt = (idx, v) => {
            const next = [...values];
            next[idx] = v;
            onChange(next.join(MULTI_VALUE_DELIM));
        };
        const removeAt = (idx) => {
            const next = values.filter((_, i) => i !== idx);
            onChange((next.length ? next : ['']).join(MULTI_VALUE_DELIM));
        };
        const addRow = () => {
            if (values.length >= maxCard)
                return;
            onChange([...values, ''].join(MULTI_VALUE_DELIM));
        };
        return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [values.map((v, i) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [renderSingle(v, nv => setAt(i, nv)), rangeHint && _jsx("span", { style: { fontSize: 10, color: '#888', whiteSpace: 'nowrap' }, children: rangeHint }), values.length > 1 && !disabled && (_jsx("button", { type: "button", onClick: () => removeAt(i), style: { fontSize: 11, padding: '0 6px', cursor: 'pointer' }, children: "\u2715" }))] }, i))), !disabled && values.length < maxCard && (_jsxs("button", { type: "button", onClick: addRow, style: { fontSize: 10, width: 'fit-content', padding: '1px 8px', cursor: 'pointer' }, children: ["+ Add value (", values.length, "/", maxCard, ")"] }))] }));
    };
    const inputEl = isMulti ? renderMulti() : (enumPVs.length > 0 ? renderSingle(value, onChange) : (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [renderSingle(value, onChange), rangeHint && _jsx("span", { style: { fontSize: 10, color: '#888', whiteSpace: 'nowrap' }, children: rangeHint })] })));
    return (_jsxs("label", { style: { display: 'block', marginBottom: 6 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }, children: [_jsxs("span", { style: { fontSize: 12 }, children: [c.name || charKey, c.required && _jsx("span", { style: { color: 'red', marginLeft: 2 }, children: "*" }), badge, isMulti && _jsxs("span", { style: { fontSize: 10, background: '#7c3aed', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }, children: ["multi \u2264", maxCard] }), c.valueType && _jsxs("span", { style: { fontSize: 10, color: '#aaa', marginLeft: 4 }, children: ["[", c.valueType, "]"] })] }), isCan && (_jsxs("label", { style: { fontSize: 10, color: '#0a7', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: personalize, onChange: e => {
                                    setPersonalize(e.target.checked);
                                    if (!e.target.checked)
                                        onChange(c.defaultValue || '');
                                } }), "personalize"] }))] }), (!isCan || personalize) && inputEl] }));
}
