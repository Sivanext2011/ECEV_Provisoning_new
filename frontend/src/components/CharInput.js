import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
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
    const isDateTime = c.valueType === 'DATE_TIME' || c.valueType === 'DATE';
    const enumPVs = possibleValues.filter((pv) => pv.value !== undefined || pv.name);
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
    const inputEl = enumPVs.length > 0 ? (_jsxs("select", { style: { width: '100%' }, value: value, onChange: e => onChange(e.target.value), disabled: isFixed || (!personalize && isCan), children: [_jsx("option", { value: "", children: "-- Select --" }), enumPVs.map((pv, i) => (_jsxs("option", { value: pv.value || '', children: [pv.name || pv.value, pv.default ? ' ✓' : ''] }, i)))] })) : (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4 }, children: [_jsx("input", { type: isDateTime ? 'datetime-local' : isNumeric ? 'number' : 'text', style: { flex: 1, background: (isFixed || (!personalize && isCan)) ? '#f5f5f5' : undefined }, placeholder: c.defaultValue || (hasRange && isNumeric ? `${c.valueFrom}–${c.valueTo}` : `Enter ${c.name || charKey}`), value: value, onChange: e => onChange(e.target.value), readOnly: isFixed || (!personalize && isCan), min: hasRange && isNumeric ? c.valueFrom : undefined, max: hasRange && isNumeric ? c.valueTo : undefined }), rangeHint && _jsx("span", { style: { fontSize: 10, color: '#888', whiteSpace: 'nowrap' }, children: rangeHint })] }));
    return (_jsxs("label", { style: { display: 'block', marginBottom: 6 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }, children: [_jsxs("span", { style: { fontSize: 12 }, children: [c.name || charKey, c.required && _jsx("span", { style: { color: 'red', marginLeft: 2 }, children: "*" }), badge, c.valueType && _jsxs("span", { style: { fontSize: 10, color: '#aaa', marginLeft: 4 }, children: ["[", c.valueType, "]"] })] }), isCan && (_jsxs("label", { style: { fontSize: 10, color: '#0a7', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: personalize, onChange: e => {
                                    setPersonalize(e.target.checked);
                                    if (!e.target.checked)
                                        onChange(c.defaultValue || '');
                                } }), "personalize"] }))] }), (!isCan || personalize) && inputEl] }));
}
