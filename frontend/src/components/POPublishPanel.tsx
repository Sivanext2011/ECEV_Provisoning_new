import React, { useState, useEffect } from 'react'

const API = '/api/v1'

export function POPublishPanel() {
  const [templates, setTemplates] = useState<any[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')
  const [selectedTemplateExtId, setSelectedTemplateExtId] = useState('')
  const [template, setTemplate] = useState<any>(null)
  const [fetchLoading, setFetchLoading] = useState(false)
  const [newExtId, setNewExtId] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [validStart, setValidStart] = useState('')
  const [validEnd, setValidEnd] = useState('')
  const [priceOverrides, setPriceOverrides] = useState<Record<string, any>>({})
  const [charOverrides, setCharOverrides] = useState<Array<{ refExternalId: string; value: string; unitOfMeasure: string; isDefault: boolean }>>([])
  const [relationships, setRelationships] = useState<Array<{ externalId: string; type: string; targetType: string }>>([])
  const [showJson, setShowJson] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [updateExtId, setUpdateExtId] = useState('')
  const [updateVersion, setUpdateVersion] = useState('')
  const [unitsByMeasure, setUnitsByMeasure] = useState<Record<string, string[]>>({})
  const [currencies, setCurrencies] = useState<string[]>([])

  useEffect(() => {
    fetch(`${API}/refdata/units`).then(r => r.ok ? r.json() : {}).then(setUnitsByMeasure).catch(() => {})
    fetch(`${API}/refdata/currencies`).then(r => r.ok ? r.json() : []).then(setCurrencies).catch(() => {})
  }, [])

  const fetchTemplates = async () => {
    setTemplatesLoading(true); setTemplatesError('')
    try {
      const r = await fetch(`${API}/catalog/productOffering/list?type=TEMPLATE`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      setTemplates(Array.isArray(data) ? data : [])
    } catch (e: any) { setTemplatesError(e.message) }
    setTemplatesLoading(false)
  }

  const loadTemplate = async () => {
    if (!selectedTemplateExtId) return
    setFetchLoading(true); setError(''); setResult(null); setTemplate(null)
    try {
      const r = await fetch(`${API}/catalog/productOffering?externalId=${encodeURIComponent(selectedTemplateExtId)}`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      const pot = Array.isArray(data) ? data[0] : data
      setTemplate(pot)
      const po: Record<string, any> = {}
      for (const p of (pot.productOfferingPrice || [])) {
        const rows = JSON.parse(JSON.stringify(p.pricingLogicAlgorithm?.productOfferingPriceRow || []))
        po[p.externalId] = { name: p.name || '', operation: 'UPDATE', partyRoleInvolvementGroupRef: p.partyRoleInvolvementGroupRef || '', pricingRows: rows }
      }
      setPriceOverrides(po)
      setCharOverrides([])
      setRelationships([])
      setNewExtId(''); setNewName(''); setNewDesc('')
      setValidStart(''); setValidEnd('')
      setUpdateExtId(''); setUpdateVersion('')
    } catch (e: any) { setError(e.message) }
    setFetchLoading(false)
  }

  const sanitizePricingRows = (rows: any[]): any[] => rows.map((row) => {
    const rowId = row.id
    return {
      ...(rowId ? { productOfferingPriceRowRef: { id: rowId } } : {}),
      action: (row.action || []).map((act: any) => {
        const actionExtId = act.actionRef?.externalId || act.externalId
        return {
          ...(actionExtId ? { actionRef: { externalId: actionExtId } } : {}),
          actionCharacteristicSpecificationUse: (act.actionCharacteristicSpecificationUse || []).map((acsu: any) => {
            const acsuExtId = acsu.actionCharacteristicSpecificationUseRef?.externalId || acsu.externalId
            return {
              ...(acsuExtId ? { actionCharacteristicSpecificationUseRef: { externalId: acsuExtId } } : {}),
              actionCharacteristicSpecificationValueUse: (acsu.actionCharacteristicSpecificationValueUse || []).map((vu: any) => ({
                ...(vu.value !== undefined && { value: vu.value }),
                ...(vu.unitOfMeasure && { unitOfMeasure: vu.unitOfMeasure }),
                ...(vu.valueReference && { valueReference: vu.valueReference }),
              })),
            }
          }),
        }
      }),
    }
  })

  const stripIds = (obj: any, keepId = false): any => {
    if (Array.isArray(obj)) return obj.map(i => stripIds(i))
    if (obj && typeof obj === 'object') {
      const out: any = {}
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'id' && !keepId) continue
        if (k === 'productOfferingTemplateRef' || k === 'valueReference' || k === 'productOfferingPriceRowRef' || k === 'productOfferingPolicyRef' || k === 'productOfferingPriceRef') { out[k] = v; continue }
        out[k] = stripIds(v)
      }
      return out
    }
    return obj
  }


  const buildBody = (): any => {
    if (!template) return {}
    const body: any = {
      externalId: newExtId,
      name: newName || newExtId,
      description: newDesc || undefined,
      productOfferingTemplateRef: { id: template.id, externalId: template.externalId },
      productOfferingPrice: (template.productOfferingPrice || []).map((p: any) => {
        const ov = priceOverrides[p.externalId] || {}
        const isCreate = (ov.operation || 'UPDATE') === 'CREATE'
        const entry: any = {
          externalId: isCreate ? (ov.name || p.externalId) : (ov.externalId || p.externalId),
          name: ov.name || p.name || null,
          operation: ov.operation || 'UPDATE',
          productOfferingPriceRelationship: (p.productOfferingPriceRelationship || []).map((rel: any) => ({
            ...(rel.externalId && { externalId: rel.externalId }),
            ...(rel.type && { type: rel.type }),
            ...(rel.productOfferingPriceRef && { productOfferingPriceRef: {
              ...(rel.productOfferingPriceRef.externalId && { externalId: rel.productOfferingPriceRef.externalId }),
            }}),
          })),
        }
        if (ov.partyRoleInvolvementGroupRef) entry.partyRoleInvolvementGroupRef = ov.partyRoleInvolvementGroupRef
        if (p.id) entry.productOfferingPriceRef = { id: p.id, externalId: p.externalId }
        else if (p.externalId) entry.productOfferingPriceRef = { externalId: p.externalId }
        if (ov.pricingRows?.length)
          entry.pricingLogicAlgorithm = { productOfferingPriceRow: sanitizePricingRows(ov.pricingRows) }
        return entry
      }),
      ...(() => {
        const prices = template.productOfferingPrice || []
        const allCreate = prices.every((p: any) => (priceOverrides[p.externalId]?.operation || 'UPDATE') === 'CREATE')
        if (allCreate) return {}
        return {
          productOfferingPolicyRef: prices.map((p: any) => {
            const isCreate = (priceOverrides[p.externalId]?.operation || 'UPDATE') === 'CREATE'
            return isCreate
              ? { priceId: null, productOfferingPriceRef: [{ id: p.id, externalId: p.externalId }] }
              : { productOfferingPriceRef: [{ id: p.id, externalId: p.externalId }] }
          })
        }
      })(),
      productOfferingRelationship: relationships.filter(r => r.externalId).map(r => ({
        externalId: r.externalId, type: r.type || null, targetType: r.targetType || null,
      })),
      prodSpecCharValueUse: charOverrides.filter(c => c.refExternalId && c.value).map(c => ({
        productSpecificationCharacteristicValueUseRef: { externalId: c.refExternalId },
        productSpecCharacteristicValue: [{ value: c.value, isDefault: c.isDefault, unitOfMeasure: c.unitOfMeasure || null }],
      })),
    }
    if (validStart || validEnd) {
      body.validFor = {}
      if (validStart) body.validFor.startDateTime = validStart
      if (validEnd) body.validFor.endDateTime = validEnd
    }
    return body
  }

  const publish = async () => {
    if (!newExtId.trim()) { setError('New External ID is required'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const r = await fetch(`${API}/catalog/productOffering`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stripIds(buildBody()))
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const update = async () => {
    if (!updateExtId || !updateVersion) { setError('External ID and Version required for update'); return }
    setLoading(true); setError(''); setResult(null)
    try {
      const body = stripIds(buildBody())
      const r = await fetch(`${API}/catalog/productOffering/externalId/${encodeURIComponent(updateExtId)}/version/${encodeURIComponent(updateVersion)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setResult(await r.json())
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  const setPriceOv = (extId: string, k: string, v: any) =>
    setPriceOverrides(prev => ({ ...prev, [extId]: { ...prev[extId], [k]: v } }))


  return (
    <div>
      <h2>📤 PO Publish</h2>

      <fieldset style={{ marginBottom: 12 }}>
        <legend><b>1. Load Template from RMCA Catalog</b></legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <button onClick={fetchTemplates} disabled={templatesLoading} style={{ marginBottom: 6 }}>
              {templatesLoading ? '⏳ Fetching...' : '🔄 Fetch Template List'}
            </button>
            {templatesError && <p style={{ color: 'red', fontSize: 12, margin: '4px 0 0' }}>{templatesError}</p>}
            {templates.length > 0 ? (
              <select style={{ width: '100%' }} value={selectedTemplateExtId} onChange={e => setSelectedTemplateExtId(e.target.value)}>
                <option value="">-- Select template --</option>
                {templates.map((t: any, i: number) => (
                  <option key={t.id || i} value={t.externalId}>{t.name || t.externalId} ({t.externalId})</option>
                ))}
              </select>
            ) : (
              <input style={{ width: '100%' }} placeholder="Or type template externalId" value={selectedTemplateExtId} onChange={e => setSelectedTemplateExtId(e.target.value)} />
            )}
          </div>
          <button onClick={loadTemplate} disabled={fetchLoading || !selectedTemplateExtId}>
            {fetchLoading ? 'Loading...' : 'Load Template'}
          </button>
        </div>
        {template && (
          <p style={{ fontSize: 12, color: '#0a7', margin: '6px 0 0' }}>
            ✓ Loaded: <b>{template.name}</b> (v{template.version}) — {(template.productOfferingPrice || []).length} prices, {(template.bucketSpecification || []).length} buckets
          </p>
        )}
      </fieldset>

      {template && (
        <>
          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>2. New Product Offering Identity</b></legend>
            <div style={{ display: 'grid', gap: 8 }}>
              <label style={{ fontSize: 13 }}>External ID <span style={{ color: 'red' }}>*</span>
                <input style={{ width: '100%' }} value={newExtId} onChange={e => setNewExtId(e.target.value)} placeholder="e.g. PO_CHT_DATA_001" />
              </label>
              <label style={{ fontSize: 13 }}>Name
                <input style={{ width: '100%' }} value={newName} onChange={e => setNewName(e.target.value)} placeholder={newExtId || 'Display name'} />
              </label>
              <label style={{ fontSize: 13 }}>Description
                <input style={{ width: '100%' }} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Optional description" />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label style={{ fontSize: 13, flex: 1 }}>Valid From
                  <input style={{ width: '100%' }} type="datetime-local" value={validStart} onChange={e => setValidStart(e.target.value ? e.target.value + '.000+00:00' : '')} />
                </label>
                <label style={{ fontSize: 13, flex: 1 }}>Valid To
                  <input style={{ width: '100%' }} type="datetime-local" value={validEnd} onChange={e => setValidEnd(e.target.value ? e.target.value + '.000+00:00' : '')} />
                </label>
              </div>
            </div>
          </fieldset>


          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>3. Prices</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— inherited from template</span></legend>
            {(template.productOfferingPrice || []).map((p: any) => (
              <div key={p.externalId} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{p.name || p.externalId}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{p.priceType}{p.priceSubType ? ' / ' + p.priceSubType : ''} · {p.paymentContext}</span>
                  <select style={{ fontSize: 12 }} value={priceOverrides[p.externalId]?.operation || 'UPDATE'}
                    onChange={e => setPriceOv(p.externalId, 'operation', e.target.value)}>
                    <option value="UPDATE">UPDATE (inherit)</option>
                    <option value="CREATE">CREATE (new price)</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gap: 6, marginTop: 4 }}>
                  <label style={{ fontSize: 12 }}>Name override
                    <input style={{ width: '100%' }} value={priceOverrides[p.externalId]?.name || ''}
                      onChange={e => setPriceOv(p.externalId, 'name', e.target.value)} placeholder={p.name || p.externalId} />
                  </label>
                  {(priceOverrides[p.externalId]?.operation || 'UPDATE') === 'UPDATE' && (
                    <label style={{ fontSize: 12 }}>ExternalId override
                      <input style={{ width: '100%' }} value={priceOverrides[p.externalId]?.externalId || ''}
                        onChange={e => setPriceOv(p.externalId, 'externalId', e.target.value)} placeholder={p.externalId} />
                    </label>
                  )}
                  <label style={{ fontSize: 12 }}>Party Role Involvement Group Ref
                    <input style={{ width: '100%' }} value={priceOverrides[p.externalId]?.partyRoleInvolvementGroupRef || ''}
                      onChange={e => setPriceOv(p.externalId, 'partyRoleInvolvementGroupRef', e.target.value)} placeholder={p.partyRoleInvolvementGroupRef || 'e.g. PRIG_001'} />
                  </label>
                </div>
                {(() => {
                  const rows: any[] = priceOverrides[p.externalId]?.pricingRows || []
                  if (!rows.length) return null
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Pricing Logic Rows</div>
                      {rows.map((row: any, ri: number) => (
                        <div key={ri} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>Row: <b>{row.name || row.externalId || `#${ri+1}`}</b></div>
                          {(row.action || []).map((act: any, ai: number) => (
                            <div key={ai} style={{ marginBottom: 4, paddingLeft: 8, borderLeft: '2px solid #d1d5db' }}>
                              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Action: <b>{act.actionRef?.externalId || act.name || `#${ai+1}`}</b></div>
                              {(act.actionCharacteristicSpecificationUse || []).map((acsu: any, ci: number) => (
                                <div key={ci} style={{ marginBottom: 4 }}>
                                  <div style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}><b>{acsu.actionCharacteristicSpecificationUseRef?.externalId || acsu.name || acsu.externalId}</b></div>
                                  {(acsu.actionCharacteristicSpecificationValueUse || []).map((vu: any, vi: number) => {
                                    const measure = (acsu.measure || acsu.actionCharacteristicSpecificationType || '')
                                    const unitOptions: string[] = (() => {
                                      if (currencies.includes(measure)) return currencies.length ? currencies : [measure]
                                      if (measure && unitsByMeasure[measure]?.length) return unitsByMeasure[measure]
                                      if (vu.unitOfMeasure) {
                                        const all = Object.values(unitsByMeasure).flat()
                                        return all.length ? all : [vu.unitOfMeasure]
                                      }
                                      return []
                                    })()
                                    const hasUnit = vu.unitOfMeasure !== undefined
                                    return (
                                      <div key={vi} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                        <input style={{ flex: 2, fontSize: 12 }} placeholder="value" value={vu.value ?? ''}
                                          onChange={e => {
                                            const updated = JSON.parse(JSON.stringify(rows))
                                            updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].value = e.target.value
                                            setPriceOv(p.externalId, 'pricingRows', updated)
                                          }} />
                                        {hasUnit && unitOptions.length > 0 ? (
                                          <select style={{ flex: 1, fontSize: 12 }} value={vu.unitOfMeasure ?? ''}
                                            onChange={e => {
                                              const updated = JSON.parse(JSON.stringify(rows))
                                              updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value
                                              setPriceOv(p.externalId, 'pricingRows', updated)
                                            }}>
                                            {unitOptions.map(u => <option key={u} value={u}>{u}</option>)}
                                          </select>
                                        ) : hasUnit ? (
                                          <input style={{ flex: 1, fontSize: 12 }} placeholder="unit" value={vu.unitOfMeasure ?? ''}
                                            onChange={e => {
                                              const updated = JSON.parse(JSON.stringify(rows))
                                              updated[ri].action[ai].actionCharacteristicSpecificationUse[ci].actionCharacteristicSpecificationValueUse[vi].unitOfMeasure = e.target.value
                                              setPriceOv(p.externalId, 'pricingRows', updated)
                                            }} />
                                        ) : null}
                                      </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            ))}
          </fieldset>


          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>4. Characteristic Value Overrides</b></legend>
            <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>Override specific characteristic values from the template.</p>
            {charOverrides.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} placeholder="Characteristic Spec ExternalId" value={c.refExternalId}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], refExternalId: e.target.value }; setCharOverrides(u) }} />
                <input style={{ flex: 2 }} placeholder="Value" value={c.value}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], value: e.target.value }; setCharOverrides(u) }} />
                <input style={{ flex: 1 }} placeholder="Unit (e.g. MB)" value={c.unitOfMeasure}
                  onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], unitOfMeasure: e.target.value }; setCharOverrides(u) }} />
                <label style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={c.isDefault} onChange={e => { const u = [...charOverrides]; u[i] = { ...u[i], isDefault: e.target.checked }; setCharOverrides(u) }} /> default
                </label>
                <button style={{ fontSize: 11 }} onClick={() => setCharOverrides(charOverrides.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button style={{ fontSize: 11 }} onClick={() => setCharOverrides([...charOverrides, { refExternalId: '', value: '', unitOfMeasure: '', isDefault: true }])}>+ Add Override</button>
          </fieldset>

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>5. Product Offering Relationships</b></legend>
            {relationships.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input style={{ flex: 2 }} placeholder="Target PO ExternalId" value={r.externalId}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], externalId: e.target.value }; setRelationships(u) }} />
                <input style={{ flex: 1 }} placeholder="Type (e.g. bundled)" value={r.type}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], type: e.target.value }; setRelationships(u) }} />
                <input style={{ flex: 1 }} placeholder="Target Type" value={r.targetType}
                  onChange={e => { const u = [...relationships]; u[i] = { ...u[i], targetType: e.target.value }; setRelationships(u) }} />
                <button style={{ fontSize: 11 }} onClick={() => setRelationships(relationships.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button style={{ fontSize: 11 }} onClick={() => setRelationships([...relationships, { externalId: '', type: '', targetType: '' }])}>+ Add Relationship</button>
          </fieldset>

          <fieldset style={{ marginBottom: 12 }}>
            <legend><b>6. Update Existing PO</b> <span style={{ fontSize: 11, color: '#888', fontWeight: 'normal' }}>— fill only for PATCH</span></legend>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ fontSize: 13, flex: 2 }}>ExternalId to update
                <input style={{ width: '100%' }} value={updateExtId} onChange={e => setUpdateExtId(e.target.value)} placeholder="existing PO externalId" />
              </label>
              <label style={{ fontSize: 13, flex: 1 }}>Version
                <input style={{ width: '100%' }} value={updateVersion} onChange={e => setUpdateVersion(e.target.value)} placeholder="e.g. 1784615970701" />
              </label>
            </div>
          </fieldset>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <button disabled={loading} onClick={publish} style={{ background: '#1d4ed8', color: '#fff', padding: '6px 16px', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              {loading ? 'Publishing...' : '🚀 Publish (POST)'}
            </button>
            <button disabled={loading} onClick={update} style={{ padding: '6px 16px' }}>
              {loading ? 'Updating...' : '✏️ Update (PATCH)'}
            </button>
            <button style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setShowJson(s => !s)}>
              {showJson ? 'Hide' : 'Preview'} JSON
            </button>
          </div>

          {showJson && (
            <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4, fontSize: 11, maxHeight: 400, overflow: 'auto', marginBottom: 12 }}>
              {JSON.stringify(buildBody(), null, 2)}
            </pre>
          )}

          {error && <p style={{ color: 'red', wordBreak: 'break-all' }}>❌ {error}</p>}
          {result && (
            <pre style={{ background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </>
      )}
    </div>
  )
}
