import React, { useState, useEffect } from 'react'

// Multi-value encoding: when maxCardinality > 1, CharInput joins values with this delimiter.
// Callers use splitCharValues() to turn the encoded string into multiple {value} objects.
export const MULTI_VALUE_DELIM = '\u0001'

/** Split a (possibly multi-value) characteristic string into individual trimmed values. */
export function splitCharValues(v: string): string[] {
  if (v === undefined || v === null) return []
  return String(v).split(MULTI_VALUE_DELIM).map(s => s.trim()).filter(s => s !== '')
}

interface CharInputProps {
  char: any
  value: string
  onChange: (v: string) => void
}

export function CharInput({ char: c, value, onChange }: CharInputProps) {
  const reg = c.valueRegulator
  const isMust = reg === 'mustBePersonalized'
  const isCan = reg === 'canBePersonalized'
  const isFixed = reg === 'fixed'
  const isSelection = reg === 'selection'
  const possibleValues = c.possibleValues || []
  const charKey = c.externalId || c.id
  const hasRange = c.valueFrom !== undefined && c.valueFrom !== ''
  const isNumeric = c.valueType === 'LONG' || c.valueType === 'INTEGER' || c.valueType === 'DOUBLE' || c.valueType === 'FLOAT'
  const nameLC = (c.name || c.externalId || '').toLowerCase()
  const isDateByName = nameLC.includes('date') || nameLC.includes('datetime') || nameLC.includes('starttime') || nameLC.includes('endtime') || nameLC.includes('expir')
  const isDateTime = c.valueType === 'DATE_TIME' || c.valueType === 'DATE' || (c.valueType === 'STRING' && isDateByName)
  const enumPVs = possibleValues.filter((pv: any) => pv.value !== undefined || pv.name)
  const maxCard = Number(c.maxCardinality) || 1
  const isMulti = maxCard > 1
  const [personalize, setPersonalize] = useState(isMust || isFixed || isSelection)

  useEffect(() => {
    if (!personalize) onChange('')
  }, [personalize, c.externalId])

  const badge = isMust
    ? <span style={{ fontSize: 10, background: '#c60', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>required</span>
    : isCan
    ? <span style={{ fontSize: 10, background: '#0a7', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>optional</span>
    : isFixed
    ? <span style={{ fontSize: 10, background: '#888', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>fixed</span>
    : isSelection
    ? <span style={{ fontSize: 10, background: '#46a', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>selection</span>
    : null

  const rangeHint = hasRange
    ? `${c.valueFrom}–${c.valueTo}${c.unitOfMeasure ? ' ' + c.unitOfMeasure : (!isNumeric ? ' chars' : '')}`
    : c.unitOfMeasure ? c.unitOfMeasure : ''

  const disabled = isFixed || (!personalize && isCan)

  // ---- single-value input renderer (reused for each row in multi mode) ----
  const renderSingle = (val: string, setVal: (v: string) => void) => {
    if (enumPVs.length > 0) {
      return (
        <select style={{ width: '100%' }} value={val} onChange={e => setVal(e.target.value)} disabled={disabled}>
          <option value="">-- Select --</option>
          {enumPVs.map((pv: any, i: number) => (
            <option key={i} value={pv.value || ''}>{pv.value}{pv.name && pv.name !== pv.value && pv.name !== c.name ? ` (${pv.name})` : ''}{pv.default ? ' ✓' : ''}</option>
          ))}
        </select>
      )
    }
    return (
      <input
        type={isDateTime ? 'datetime-local' : isNumeric ? 'number' : 'text'}
        style={{ flex: 1, width: '100%', background: disabled ? '#f5f5f5' : undefined }}
        placeholder={c.defaultValue || (hasRange && isNumeric ? `${c.valueFrom}–${c.valueTo}` : isDateTime ? 'Select date/time' : `Enter ${c.name || charKey}`)}
        value={isDateTime && val && val.includes('T') && val.includes('Z') ? val.slice(0, 16) : val}
        onChange={e => {
          if (isDateTime && e.target.value) {
            const v = e.target.value
            if (v.length === 16) setVal(v + ':00.000Z')
            else if (v.length === 19) setVal(v + '.000Z')
            else if (!v.endsWith('Z')) setVal(v + 'Z')
            else setVal(v)
          } else {
            setVal(e.target.value)
          }
        }}
        readOnly={disabled}
        min={hasRange && isNumeric ? c.valueFrom : undefined}
        max={hasRange && isNumeric ? c.valueTo : undefined}
      />
    )
  }

  // ---- multi-value input: one row per value, add/remove, capped at maxCardinality ----
  const renderMulti = () => {
    const values = value ? value.split(MULTI_VALUE_DELIM) : ['']
    const setAt = (idx: number, v: string) => {
      const next = [...values]; next[idx] = v; onChange(next.join(MULTI_VALUE_DELIM))
    }
    const removeAt = (idx: number) => {
      const next = values.filter((_, i) => i !== idx)
      onChange((next.length ? next : ['']).join(MULTI_VALUE_DELIM))
    }
    const addRow = () => {
      if (values.length >= maxCard) return
      onChange([...values, ''].join(MULTI_VALUE_DELIM))
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {values.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {renderSingle(v, nv => setAt(i, nv))}
            {rangeHint && <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>{rangeHint}</span>}
            {values.length > 1 && !disabled && (
              <button type="button" onClick={() => removeAt(i)} style={{ fontSize: 11, padding: '0 6px', cursor: 'pointer' }}>✕</button>
            )}
          </div>
        ))}
        {!disabled && values.length < maxCard && (
          <button type="button" onClick={addRow} style={{ fontSize: 10, width: 'fit-content', padding: '1px 8px', cursor: 'pointer' }}>+ Add value ({values.length}/{maxCard})</button>
        )}
      </div>
    )
  }

  const inputEl = isMulti ? renderMulti() : (
    enumPVs.length > 0 ? renderSingle(value, onChange) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {renderSingle(value, onChange)}
        {rangeHint && <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>{rangeHint}</span>}
      </div>
    )
  )

  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 12 }}>
          {c.name || charKey}
          {c.required && <span style={{ color: 'red', marginLeft: 2 }}>*</span>}
          {badge}
          {isMulti && <span style={{ fontSize: 10, background: '#7c3aed', color: '#fff', borderRadius: 3, padding: '1px 4px', marginLeft: 4 }}>multi ≤{maxCard}</span>}
          {c.valueType && <span style={{ fontSize: 10, color: '#aaa', marginLeft: 4 }}>[{c.valueType}]</span>}
        </span>
        {isCan && (
          <label style={{ fontSize: 10, color: '#0a7', display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', cursor: 'pointer' }}>
            <input type="checkbox" checked={personalize} onChange={e => {
              setPersonalize(e.target.checked)
              if (!e.target.checked) onChange(c.defaultValue || '')
            }} />
            personalize
          </label>
        )}
      </div>
      {(!isCan || personalize) && inputEl}
    </label>
  )
}
