import React, { useState, useEffect } from 'react'

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

  const inputEl = enumPVs.length > 0 ? (
    <select style={{ width: '100%' }} value={value} onChange={e => onChange(e.target.value)} disabled={isFixed || (!personalize && isCan)}>
      <option value="">-- Select --</option>
      {enumPVs.map((pv: any, i: number) => (
        <option key={i} value={pv.value || ''}>{pv.name || pv.value}{pv.default ? ' ✓' : ''}</option>
      ))}
    </select>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        type={isDateTime ? 'datetime-local' : isNumeric ? 'number' : 'text'}
        style={{ flex: 1, background: (isFixed || (!personalize && isCan)) ? '#f5f5f5' : undefined }}
        placeholder={c.defaultValue || (hasRange && isNumeric ? `${c.valueFrom}–${c.valueTo}` : isDateTime ? 'Select date/time' : `Enter ${c.name || charKey}`)}
        value={isDateTime && value && value.includes('T') && value.includes('Z') ? value.slice(0, 16) : value}
        onChange={e => {
          if (isDateTime && e.target.value) {
            // Ensure full BSSF datetime format: yyyy-MM-ddTHH:mm:ss.SSSZ
            const v = e.target.value
            if (v.length === 16) onChange(v + ':00.000Z')       // 2026-09-30T11:32 → add :00.000Z
            else if (v.length === 19) onChange(v + '.000Z')     // 2026-09-30T11:32:00 → add .000Z
            else if (!v.endsWith('Z')) onChange(v + 'Z')        // add Z if missing
            else onChange(v)
          } else {
            onChange(e.target.value)
          }
        }}
        readOnly={isFixed || (!personalize && isCan)}
        min={hasRange && isNumeric ? c.valueFrom : undefined}
        max={hasRange && isNumeric ? c.valueTo : undefined}
      />
      {rangeHint && <span style={{ fontSize: 10, color: '#888', whiteSpace: 'nowrap' }}>{rangeHint}</span>}
    </div>
  )

  return (
    <label style={{ display: 'block', marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
        <span style={{ fontSize: 12 }}>
          {c.name || charKey}
          {c.required && <span style={{ color: 'red', marginLeft: 2 }}>*</span>}
          {badge}
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
