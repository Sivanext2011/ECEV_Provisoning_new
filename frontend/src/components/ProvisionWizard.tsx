import React, { useState, useEffect } from 'react'
import { CharInput } from './CharInput'

const API = '/api/v1'

export function ProvisionWizard() {
  const [specs, setSpecs] = useState<any>(null)
  const [step, setStep] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [partyJson, setPartyJson] = useState('')
  const [customerJson, setCustomerJson] = useState('')
  const [contractJson, setContractJson] = useState('')
  const [selectedPartySpec, setSelectedPartySpec] = useState('')
  const [selectedCustSpec, setSelectedCustSpec] = useState('')
  const [selectedBASpec, setSelectedBASpec] = useState('')
  const [selectedContractSpec, setSelectedContractSpec] = useState('')
  const [selectedPO, setSelectedPO] = useState('')
  const [additionalPOs, setAdditionalPOs] = useState<Array<{ poExtId: string; formVals: any; baRef: boolean; baRefRecurrence: boolean; popData: any[]; popVals: Record<string, {value:string;unit:string}>; popEnabled: boolean; popSelected: Record<string, boolean>; popLoading: boolean; validFor: { enabled: boolean; startDateTime: string; endDateTime: string } }>>([{ poExtId: '', formVals: {}, baRef: true, baRefRecurrence: true, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: false, validFor: { enabled: false, startDateTime: '', endDateTime: '' } }])
  const [selectedCommIdSpec, setSelectedCommIdSpec] = useState('')
  const [selectedResources, setSelectedResources] = useState<Array<{ specExtId: string; specId?: string; value: string }>>([])
  const [selectedCmSpecs, setSelectedCmSpecs] = useState<Array<{ specExtId: string; charVals: Record<string, string>; externalId: string }>>([{ specExtId: '', charVals: {}, externalId: '' }])
  const [homeTimeZone, setHomeTimeZone] = useState('Europe/Stockholm')
  const [includeContactMediumAssoc, setIncludeContactMediumAssoc] = useState(true)
  const [cmAssocLanguage, setCmAssocLanguage] = useState('en')
  const [languages, setLanguages] = useState<Array<{id: string; name: string}>>([])
  const [cmDefaults, setCmDefaults] = useState<any>({})
  const [formValues, setFormValues] = useState<any>({ party: {}, customer: {}, contract: {}, billingAccount: {} })
  const [productOptions, setProductOptions] = useState({ baRef: true, baRefRecurrence: true, sharingProvider: false })
  const [popPersonalization, setPopPersonalization] = useState<Array<{popId:string;popExternalId:string;popName:string;rows:Array<{rowId:string;rowExternalId:string;chars:any[]}>}>>([])
  const [popValues, setPopValues] = useState<Record<string, {value:string;unit:string}>>({})
  const [popEnabled, setPopEnabled] = useState(false)
  const [popSelected, setPopSelected] = useState<Record<string, boolean>>({})
  const [popError, setPopError] = useState('')
  const [popLoading, setPopLoading] = useState(false)
  const [billCycleSpecExtId, setBillCycleSpecExtId] = useState('')
  const [billCycleChangeType, setBillCycleChangeType] = useState('NO_PRORATE')
  const [msisdn, setMsisdn] = useState('')
  const [email, setEmail] = useState('')
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [provisionMode, setProvisionMode] = useState<'all' | 'party' | 'customer' | 'contract'>('all')

  // Status selections
  const [partyStatus, setPartyStatus] = useState('PartyActive')
  const [customerStatus, setCustomerStatus] = useState('CustomerActive')
  const [baStatus, setBaStatus] = useState('BillingAccountActive')
  const [contractStatus, setContractStatus] = useState('Created')
  const [techProductStatus, setTechProductStatus] = useState('ProductActive')
  const [basePlanStatus, setBasePlanStatus] = useState('ProductCreated')
  const [productValidFor, setProductValidFor] = useState({ enabled: false, startDateTime: '', endDateTime: '' })


  useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
    fetch(`${API}/settings`).then(r => r.ok ? r.json() : null).then(cfg => {
      if (cfg?.defaults?.homeTimeZone) setHomeTimeZone(cfg.defaults.homeTimeZone)
      if (cfg?.defaults) setCmDefaults(cfg.defaults)
    }).catch(() => {})
    fetch(`${API}/refdata/languages`).then(r => r.ok ? r.json() : []).then(setLanguages).catch(() => {})
  }, [step])

  if (!specs) return (
    <div>
      <h2>Provision Subscriber</h2>
      <p style={{ color: '#c00' }}>No specs loaded. Go to <b>📦 Catalog</b> tab and upload a BusinessConfig zip first.</p>
    </div>
  )

  const partySpecs = specs.partySpecifications || []
  const custSpecs = specs.customerSpecifications || []
  const baSpecs = specs.billingAccountSpecifications || []
  const contractSpecs = specs.contractSpecifications || []
  const poList = specs.productOfferings || []
  const commIdSpecs = specs.communicationIdentifierSpecifications || []
  const cmSpecs = specs.contactMediumSpecifications || []

  const getMustChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && c.valueRegulator === 'mustBePersonalized')
  const getOptionalChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && (c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection'))
  const getPersonalizableChars = (chars: any[]) =>
    chars.filter((c: any) => (c.externalId || '').trim() !== '' && c.valueRegulator !== 'fixed')

  const prefillDefaults = (chars: any[], section: string) => {
    const updates: any = {}
    for (const c of chars) {
      const key = c.externalId || c.id
      if (c.valueRegulator === 'mustBePersonalized' && c.defaultValue && !formValues[section]?.[key])
        updates[key] = c.defaultValue
    }
    if (Object.keys(updates).length)
      setFormValues((prev: any) => ({ ...prev, [section]: { ...prev[section], ...updates } }))
  }

  const submit = async () => {
    setLoading(true); setError(''); setResult(null)
    try {
      const errMsg = (d: any) => typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail || d)
      if (provisionMode === 'all') {
        const payload = {
          partyBody: JSON.parse(partyJson),
          customerBody: JSON.parse(customerJson),
          contractBody: JSON.parse(contractJson),
          customerExternalId: JSON.parse(customerJson).externalId,
        }
        const r = await fetch(`${API}/subscribers/provision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!r.ok) throw new Error(errMsg(await r.json()))
        setResult(await r.json())
      } else if (provisionMode === 'party') {
        const r = await fetch(`${API}/party`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: partyJson })
        if (!r.ok) throw new Error(errMsg(await r.json()))
        setResult(await r.json())
      } else if (provisionMode === 'customer') {
        const r = await fetch(`${API}/customer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: customerJson })
        if (!r.ok) throw new Error(errMsg(await r.json()))
        setResult(await r.json())
      } else if (provisionMode === 'contract') {
        const custExtId = JSON.parse(customerJson).externalId || ''
        const r = await fetch(`${API}/contract?customerExternalId=${encodeURIComponent(custExtId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: contractJson })
        if (!r.ok) throw new Error(errMsg(await r.json()))
        setResult(await r.json())
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }


  return (
    <div>
      <h2>Provision Subscriber (Spec-Driven)</h2>
      {error && <p style={{ color: 'red', background: '#fff0f0', padding: 10, border: '1px solid #fcc', borderRadius: 4, wordBreak: 'break-all' }}>❌ {error}</p>}
      {result && <pre style={{ background: '#f0fff0', padding: 10, border: '1px solid #cfc', borderRadius: 4, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>}

      {step === 0 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 1: Select Specifications</h3>
          <label>Party Specification
            <select style={{ width: '100%' }} value={selectedPartySpec} onChange={e => {
              setSelectedPartySpec(e.target.value)
              const ps = partySpecs.find((s: any) => s.externalId === e.target.value)
              if (ps) prefillDefaults(getPersonalizableChars(ps.characteristics), 'party')
            }}>
              <option value="">-- Select --</option>
              {partySpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Customer Specification
            <select style={{ width: '100%' }} value={selectedCustSpec} onChange={e => {
              setSelectedCustSpec(e.target.value)
              const cs = custSpecs.find((s: any) => s.externalId === e.target.value)
              if (cs) prefillDefaults(getPersonalizableChars(cs.characteristics), 'customer')
            }}>
              <option value="">-- Select --</option>
              {custSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Billing Account Specification
            <select style={{ width: '100%' }} value={selectedBASpec} onChange={e => {
              setSelectedBASpec(e.target.value)
              const bs = baSpecs.find((s: any) => s.externalId === e.target.value)
              if (bs) prefillDefaults(getPersonalizableChars(bs.characteristics), 'billingAccount')
            }}>
              <option value="">-- Select --</option>
              {baSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Contract Specification
            <select style={{ width: '100%' }} value={selectedContractSpec} onChange={e => {
              setSelectedContractSpec(e.target.value)
              const cs = contractSpecs.find((s: any) => s.externalId === e.target.value)
              if (cs) prefillDefaults(getPersonalizableChars(cs.characteristics), 'contract')
            }}>
              <option value="">-- Select --</option>
              {contractSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} - {s.paymentContext} ({s.externalId})</option>)}
            </select>
          </label>
          <label>Base Plan Product Offering
            <select style={{ width: '100%' }} value={selectedPO} onChange={e => {
              setSelectedPO(e.target.value)
              const po = poList.find((p: any) => p.externalId === e.target.value)
              if (po) prefillDefaults(getPersonalizableChars(po.characteristics || []), 'contract')
              const poRs = po?.resourceSpecifications || []
              setSelectedResources(
                poRs.length > 0
                  ? poRs.map((rs: any) => ({ specExtId: rs.externalId, specId: rs.id, value: '' }))
                  : [{ specExtId: '', specId: '', value: '' }]
              )
              // Auto-detect sharing type from catalog offeringTypes
              const types = (po?.offeringTypes || []).map((t: string) => t.toUpperCase())
              if (types.includes('SHARING_PROVIDER') || types.includes('PROVIDER') || (po?.name || '').toLowerCase().includes('technical')) {
                setProductOptions(prev => ({ ...prev, sharingProvider: true }))
              } else {
                setProductOptions(prev => ({ ...prev, sharingProvider: false }))
              }
              // Also fetch live spec to detect sharingProviderSpecification
              if (e.target.value) {
                fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(e.target.value)}`)
                  .then(r => r.ok ? r.json() : null)
                  .then((data: any) => {
                    const poSpec = Array.isArray(data) ? data[0] : data
                    if (poSpec?.sharingProviderSpecification || poSpec?.sharingProviderSpecificationExternalId) {
                      setProductOptions(prev => ({ ...prev, sharingProvider: true }))
                    }
                  })
                  .catch(() => {})
              }
              // Fetch POP personalization
              setPopPersonalization([]); setPopValues({}); setPopError(''); setPopEnabled(false); setPopSelected({})
              const fetchPop = (poExtId: string) => {
                setPopLoading(true)
                fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(poExtId)}`)
                  .then(async r => {
                    if (!r.ok) { const t = await r.text(); throw new Error(`HTTP ${r.status}: ${t.slice(0,200)}`) }
                    return r.json()
                  })
                  .then((pops: any[]) => {
                    setPopPersonalization(pops)
                    const defaults: Record<string, {value:string;unit:string}> = {}
                    for (const pop of pops)
                      for (const row of (pop.rows || []))
                        for (const c of (row.chars || []))
                          defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
                    setPopValues(defaults)
                    setPopLoading(false)
                  })
                  .catch((err: any) => { setPopError(err.message); setPopLoading(false) })
              }
              if (e.target.value) fetchPop(e.target.value)
            }}>
              <option value="">-- Select --</option>
              {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
            </select>
          </label>

          {/* Base PO Characteristics & POP — shown right below the PO dropdown */}
          {selectedPO && (() => {
            const po = poList.find((p: any) => p.externalId === selectedPO)
            const poMustChars = po ? getMustChars(po.characteristics || []) : []
            const poOptChars = po ? getOptionalChars(po.characteristics || []) : []
            return (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '8px 10px', background: '#f9fafb', marginBottom: 4 }}>
              {poMustChars.length > 0 && <>
                <p style={{ fontSize: 11, color: '#c60', margin: '4px 0 4px', fontWeight: 600 }}>Required Characteristics:</p>
                {poMustChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[`_po_${c.externalId || c.id}`] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } })} />)}
              </>}
              {poOptChars.length > 0 && <>
                <p style={{ fontSize: 11, color: '#0a7', margin: '6px 0 4px', fontWeight: 600 }}>Optional Characteristics:</p>
                {poOptChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[`_po_${c.externalId || c.id}`] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [`_po_${c.externalId || c.id}`]: v } })} />)}
              </>}
              {popLoading && <p style={{ fontSize: 11, color: '#888', margin: '6px 0' }}>⏳ Loading POP...</p>}
              {popError && <p style={{ fontSize: 11, color: '#c00', background: '#fff0f0', padding: '4px 6px', borderRadius: 4, margin: '6px 0' }}>⚠ {popError}</p>}
              {popPersonalization.length > 0 && (
                <div style={{ padding: '4px 6px', background: '#fdf4ff', borderRadius: 4, border: '1px solid #f0abfc', marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
                    <input type="checkbox" checked={popEnabled} onChange={e => setPopEnabled(e.target.checked)} />
                    POP Personalization ({popPersonalization.length})
                  </label>
                  {popEnabled && popPersonalization.map((pop: any) => (
                    <div key={pop.popId} style={{ marginLeft: 12, marginTop: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!popSelected[pop.popId]} onChange={e => setPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked }))} />
                        {pop.popName || pop.popExternalId}
                      </label>
                      {popSelected[pop.popId] && (pop.rows || []).map((row: any) => (
                        <div key={row.rowId} style={{ marginLeft: 12, marginTop: 2 }}>
                          {(row.chars || []).map((c: any) => {
                            const key = `${pop.popId}_${row.rowId}_${c.id}`
                            const val = popValues[key] || { value: '', unit: c.defaultUnit || '' }
                            return (
                              <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, minWidth: 80, color: '#555' }}>{c.name}</span>
                                <input style={{ flex: 1, padding: '2px 4px', fontSize: 10 }} placeholder={c.defaultValue || 'value'} value={val.value}
                                  onChange={e => setPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } }))} />
                                {c.units?.length > 1 ? (
                                  <select style={{ padding: '2px 4px', fontSize: 9 }} value={val.unit}
                                    onChange={e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } }))}>
                                    {c.units.map((u: string) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                ) : (
                                  <input style={{ width: 60, padding: '2px 4px', fontSize: 9 }} placeholder={c.defaultUnit || 'unit'} value={val.unit}
                                    onChange={e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } }))} />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )
          })()}

          {/* Product Options — shown when base PO is selected */}
          {selectedPO && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '8px 10px', background: '#f9fafb', marginBottom: 4 }}>
              <p style={{ fontSize: 11, color: '#555', margin: '0 0 6px', fontWeight: 600 }}>Product Options:</p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <input type="checkbox" checked={productOptions.baRef} onChange={e => setProductOptions({...productOptions, baRef: e.target.checked})} />
                billingAccountReference
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <input type="checkbox" checked={productOptions.baRefRecurrence} onChange={e => setProductOptions({...productOptions, baRefRecurrence: e.target.checked})} />
                baRefForBillCycleAlignedRecurrence
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                <input type="checkbox" checked={productOptions.sharingProvider} onChange={e => setProductOptions({...productOptions, sharingProvider: e.target.checked})} />
                Include Technical Product (sharingProvider)
                {productOptions.sharingProvider && <span style={{ fontSize: 9, color: '#854d0e', background: '#fef9c3', padding: '1px 5px', borderRadius: 8 }}>⚡ Auto</span>}
              </label>
              {productOptions.sharingProvider && (
                <div style={{ marginLeft: 18, marginTop: 4 }}>
                  <select style={{ width: '100%', padding: '3px 6px', fontSize: 10 }}
                    value={(productOptions as any).techPO || ''}
                    onChange={e => setProductOptions({...productOptions, techPO: e.target.value} as any)}>
                    <option value="">-- Technical PO --</option>
                    {poList.map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                  </select>
                </div>
              )}
              <p style={{ fontSize: 11, color: '#555', margin: '8px 0 4px', fontWeight: 600 }}>Entity Status:</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <label style={{ fontSize: 10 }}>Contract<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={contractStatus} onChange={e => setContractStatus(e.target.value)}><option value="Created">Created</option><option value="Active">Active</option></select></label>
                <label style={{ fontSize: 10 }}>Base Product<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={basePlanStatus} onChange={e => setBasePlanStatus(e.target.value)}><option value="ProductCreated">ProductCreated</option><option value="ProductActive">ProductActive</option></select></label>
                {productOptions.sharingProvider && <label style={{ fontSize: 10 }}>Tech Product<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={techProductStatus} onChange={e => setTechProductStatus(e.target.value)}><option value="ProductActive">ProductActive</option><option value="ProductCreated">ProductCreated</option></select></label>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
                <label style={{ fontSize: 10 }}>Party<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={partyStatus} onChange={e => setPartyStatus(e.target.value)}><option value="PartyActive">PartyActive</option><option value="PartyCreated">PartyCreated</option></select></label>
                <label style={{ fontSize: 10 }}>Customer<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={customerStatus} onChange={e => setCustomerStatus(e.target.value)}><option value="CustomerActive">CustomerActive</option><option value="CustomerCreated">CustomerCreated</option></select></label>
                <label style={{ fontSize: 10 }}>Billing Acct<select style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={baStatus} onChange={e => setBaStatus(e.target.value)}><option value="BillingAccountActive">BillingAccountActive</option><option value="BillingAccountCreated">BillingAccountCreated</option></select></label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 6 }}>
                <input type="checkbox" checked={productValidFor.enabled} onChange={e => setProductValidFor({...productValidFor, enabled: e.target.checked})} />
                Product Status validFor
              </label>
              {productValidFor.enabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 4 }}>
                  <label style={{ fontSize: 10 }}>Start<input type="datetime-local" style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={productValidFor.startDateTime} onChange={e => setProductValidFor({...productValidFor, startDateTime: e.target.value})} /></label>
                  <label style={{ fontSize: 10 }}>End<input type="datetime-local" style={{ width: '100%', padding: '2px 4px', fontSize: 10 }} value={productValidFor.endDateTime} onChange={e => setProductValidFor({...productValidFor, endDateTime: e.target.value})} /></label>
                </div>
              )}
            </div>
          )}

          <label style={{ fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>Add-On Product Offerings</label>
          {additionalPOs.map((entry, idx) => {
            const addOnPo = poList.find((p: any) => p.externalId === entry.poExtId)
            const addOnChars = addOnPo?.characteristics || []
            const addOnMust = addOnChars.filter((c: any) => c.valueRegulator === 'mustBePersonalized')
            const addOnOpt = addOnChars.filter((c: any) => c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection')
            return (
            <div key={idx} style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '6px 8px', marginBottom: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                <select style={{ flex: 1 }} value={entry.poExtId} onChange={e => {
                  const updated = [...additionalPOs]
                  updated[idx] = { ...updated[idx], poExtId: e.target.value, formVals: {}, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: true }
                  setAdditionalPOs(updated)
                  if (e.target.value) {
                    fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(e.target.value)}`)
                      .then(r => r.ok ? r.json() : [])
                      .then((pops: any[]) => {
                        const defaults: Record<string, {value:string;unit:string}> = {}
                        for (const pop of pops)
                          for (const row of (pop.rows || []))
                            for (const c of (row.chars || []))
                              defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
                        setAdditionalPOs(prev => { const u = [...prev]; u[idx] = { ...u[idx], popData: pops, popVals: defaults, popLoading: false }; return u })
                      })
                      .catch(() => setAdditionalPOs(prev => { const u = [...prev]; u[idx] = { ...u[idx], popLoading: false }; return u }))
                  }
                }}>
                  <option value="">-- None --</option>
                  {poList.map((p: any) => <option key={p.id} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}><input type="checkbox" checked={entry.baRef} onChange={e => { const u = [...additionalPOs]; u[idx].baRef = e.target.checked; u[idx].baRefRecurrence = e.target.checked; setAdditionalPOs(u) }} />BA</label>
                {additionalPOs.length > 1 && <button type="button" onClick={() => setAdditionalPOs(additionalPOs.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
              </div>
              {entry.poExtId && (
                <div style={{ marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                    <input type="checkbox" checked={entry.validFor.enabled} onChange={e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, enabled: e.target.checked }; setAdditionalPOs(u) }} />
                    validFor
                  </label>
                  {entry.validFor.enabled && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 2 }}>
                      <label style={{ fontSize: 9 }}>Start<input type="datetime-local" style={{ width: '100%', padding: '2px 4px', fontSize: 9 }} value={entry.validFor.startDateTime} onChange={e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, startDateTime: e.target.value }; setAdditionalPOs(u) }} /></label>
                      <label style={{ fontSize: 9 }}>End<input type="datetime-local" style={{ width: '100%', padding: '2px 4px', fontSize: 9 }} value={entry.validFor.endDateTime} onChange={e => { const u = [...additionalPOs]; u[idx].validFor = { ...u[idx].validFor, endDateTime: e.target.value }; setAdditionalPOs(u) }} /></label>
                    </div>
                  )}
                </div>
              )}
              {entry.poExtId && addOnMust.length > 0 && <div style={{ marginBottom: 4 }}>{addOnMust.map((c: any) => <CharInput key={c.id} char={c} value={entry.formVals[c.externalId || c.id] || ''} onChange={v => { const u = [...additionalPOs]; u[idx].formVals = { ...u[idx].formVals, [c.externalId || c.id]: v }; setAdditionalPOs(u) }} />)}</div>}
              {entry.poExtId && addOnOpt.length > 0 && <div style={{ marginBottom: 4 }}>{addOnOpt.map((c: any) => <CharInput key={c.id} char={c} value={entry.formVals[c.externalId || c.id] || ''} onChange={v => { const u = [...additionalPOs]; u[idx].formVals = { ...u[idx].formVals, [c.externalId || c.id]: v }; setAdditionalPOs(u) }} />)}</div>}
              {entry.popLoading && <div style={{ fontSize: 10, color: '#888' }}>Loading POP...</div>}
              {entry.popData.length > 0 && (
                <div style={{ padding: '4px 6px', background: '#fdf4ff', borderRadius: 4, border: '1px solid #f0abfc', marginTop: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    <input type="checkbox" checked={entry.popEnabled} onChange={e => { const u = [...additionalPOs]; u[idx].popEnabled = e.target.checked; setAdditionalPOs(u) }} />
                    POP Personalization ({entry.popData.length})
                  </label>
                  {entry.popEnabled && entry.popData.map((pop: any) => (
                    <div key={pop.popId} style={{ marginLeft: 12, marginTop: 4 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!entry.popSelected[pop.popId]}
                          onChange={e => { const u = [...additionalPOs]; u[idx].popSelected = { ...u[idx].popSelected, [pop.popId]: e.target.checked }; setAdditionalPOs(u) }} />
                        {pop.popName || pop.popExternalId || pop.popId}
                      </label>
                      {entry.popSelected[pop.popId] && (pop.rows || []).map((row: any) => (
                        <div key={row.rowId} style={{ marginLeft: 12 }}>
                          {(row.chars || []).map((c: any) => {
                            const key = `${pop.popId}_${row.rowId}_${c.id}`
                            const val = entry.popVals[key] || { value: '', unit: '' }
                            return (
                              <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }}>
                                <span style={{ fontSize: 10, minWidth: 80, color: '#555' }}>{c.name || c.externalId || c.id}</span>
                                <input style={{ flex: 1, padding: '2px 4px', fontSize: 10 }} placeholder={c.defaultValue || 'value'}
                                  value={val.value} onChange={e => { const u = [...additionalPOs]; u[idx].popVals = { ...u[idx].popVals, [key]: { ...val, value: e.target.value } }; setAdditionalPOs(u) }} />
                                {c.units && c.units.length > 0 && (
                                  <select style={{ padding: '2px 4px', fontSize: 9 }} value={val.unit}
                                    onChange={e => { const u = [...additionalPOs]; u[idx].popVals = { ...u[idx].popVals, [key]: { ...val, unit: e.target.value } }; setAdditionalPOs(u) }}>
                                    {c.units.map((uu: string) => <option key={uu} value={uu}>{uu}</option>)}
                                  </select>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )
          })}
          <button type="button" style={{ fontSize: 11, width: 'fit-content' }} onClick={() => setAdditionalPOs([...additionalPOs, { poExtId: '', formVals: {}, baRef: true, baRefRecurrence: true, popData: [], popVals: {}, popEnabled: false, popSelected: {}, popLoading: false, validFor: { enabled: false, startDateTime: '', endDateTime: '' } }])}>+ Add Product Offering</button>

          <label style={{ fontSize: 12, fontWeight: 'bold', marginTop: 4 }}>Contact Mediums</label>
          {selectedCmSpecs.map((entry, idx) => {
            const spec = cmSpecs.find((s: any) => s.externalId === entry.specExtId)
            const deriveChannelType = (s: any) => {
              const n = (s?.externalId || s?.name || '').toUpperCase()
              if (n.includes('EMAIL') || n.includes('MAIL')) return 'EMail'
              if (n.includes('REST') || n.includes('SOCIAL')) return 'socialMedia'
              if (n.includes('SMS') || n.includes('TEL')) return 'SMS'
              return ''
            }
            const channelTypeChar = spec?.characteristics?.find((c: any) => (c.externalId || '').toLowerCase().includes('channel'))
            const userChars = spec?.characteristics?.filter((c: any) => !((c.externalId || '').toLowerCase().includes('channel'))) || []
            const commIdLabel = (() => {
              const ct = deriveChannelType(spec)
              if (ct === 'EMail') return 'Email Address'
              if (ct === 'SMS') return 'Phone Number (MSISDN)'
              if (ct === 'socialMedia') return 'Social Media ID'
              return 'Communication ID'
            })()
            return (
              <div key={idx} style={{ border: '1px solid #ddd', borderRadius: 4, padding: 8, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select style={{ flex: 1 }} value={entry.specExtId} onChange={e => {
                    const s = cmSpecs.find((s: any) => s.externalId === e.target.value)
                    const ct = deriveChannelType(s)
                    const ctKey = s?.characteristics?.find((c: any) => (c.externalId || '').toLowerCase().includes('channel'))?.externalId
                    const u = [...selectedCmSpecs]
                    u[idx] = { specExtId: e.target.value, charVals: ctKey && ct ? { [ctKey]: ct } : {}, externalId: u[idx].externalId }
                    setSelectedCmSpecs(u)
                  }}>
                    <option value="">-- Select Spec --</option>
                    {cmSpecs.map((s: any) => <option key={s.id} value={s.externalId}>{s.name} ({s.externalId})</option>)}
                  </select>
                  {selectedCmSpecs.length > 1 && <button type="button" onClick={() => setSelectedCmSpecs(selectedCmSpecs.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
                </div>
                {channelTypeChar && (
                  <label style={{ fontSize: 12 }}>Channel Type
                    <input style={{ width: '100%' }} placeholder="e.g. SMS, EMail, socialMedia"
                      value={entry.charVals[channelTypeChar.externalId] || ''}
                      onChange={e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [channelTypeChar.externalId]: e.target.value } }; setSelectedCmSpecs(u) }} />
                  </label>
                )}
                {userChars.map((c: any) => {
                  const isCommId = (c.externalId || '').toLowerCase().includes('communication')
                  const label = isCommId ? commIdLabel : (c.name || c.externalId)
                  const placeholder = isCommId ? commIdLabel : c.externalId
                  return (
                    <label key={c.id} style={{ fontSize: 12 }}>{label}
                      <input style={{ width: '100%' }} placeholder={placeholder}
                        value={entry.charVals[c.externalId || c.id] || ''}
                        onChange={e => { const u = [...selectedCmSpecs]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [c.externalId || c.id]: e.target.value } }; setSelectedCmSpecs(u) }} />
                    </label>
                  )
                })}
              </div>
            )
          })}
          <button type="button" style={{ fontSize: 11, width: 'fit-content' }} onClick={() => setSelectedCmSpecs([...selectedCmSpecs, { specExtId: '', charVals: {}, externalId: '' }])}>+ Add Contact Medium</button>
          <button disabled={!selectedPartySpec || !selectedCustSpec || !selectedContractSpec} onClick={() => setStep(1)}>Next →</button>
        </div>
      )}


      {step === 1 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 500 }}>
          <h3 style={{ margin: 0 }}>Step 2: Subscriber Details</h3>
          <input placeholder="Given Name *" value={givenName} onChange={e => setGivenName(e.target.value)} />
          <input placeholder="Family Name *" value={familyName} onChange={e => setFamilyName(e.target.value)} />
          <input placeholder="MSISDN *" value={msisdn} onChange={e => setMsisdn(e.target.value)} />
          <input placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} />

          {(() => {
            const ps = partySpecs.find((s: any) => s.externalId === selectedPartySpec)
            const chars = ps ? getPersonalizableChars(ps.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Party Characteristics</legend>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.party[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, party: { ...formValues.party, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}

          {(() => {
            const cs = custSpecs.find((s: any) => s.externalId === selectedCustSpec)
            const chars = cs ? getPersonalizableChars(cs.characteristics) : []
            return chars.length > 0 && (
              <fieldset><legend>Customer Characteristics</legend>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.customer[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, customer: { ...formValues.customer, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}


          {(() => {
            const bs = baSpecs.find((s: any) => s.externalId === selectedBASpec)
            const chars = bs ? getPersonalizableChars(bs.characteristics) : []
            return (
              <fieldset><legend>Billing Account</legend>
                <label style={{ display: 'block', marginBottom: 6 }}>Bill Cycle Spec
                  {(specs.billingCycleSpecifications || []).length > 0 ? (
                    <select style={{ width: '100%' }} value={billCycleSpecExtId} onChange={e => setBillCycleSpecExtId(e.target.value)}>
                      <option value="">-- None --</option>
                      {(specs.billingCycleSpecifications || []).map((bcs: any) => <option key={bcs.id || bcs.externalId} value={bcs.externalId}>{bcs.name} ({bcs.externalId})</option>)}
                    </select>
                  ) : (
                    <input style={{ width: '100%' }} placeholder="e.g. CHT_billcycle_01 (upload BusinessConfig for dropdown)" value={billCycleSpecExtId} onChange={e => setBillCycleSpecExtId(e.target.value)} />
                  )}
                </label>
                <label style={{ display: 'block', marginBottom: 6 }}>Bill Cycle Change Type
                  <select style={{ width: '100%' }} value={billCycleChangeType} onChange={e => setBillCycleChangeType(e.target.value)}>
                    <option value="NO_PRORATE">NO_PRORATE</option>
                    <option value="PRORATE_END_CURRENT">PRORATE_END_CURRENT</option>
                    <option value="PRORATE_POS_START_NEW">PRORATE_POS_START_NEW</option>
                    <option value="PRORATE_NEG_START_NEW">PRORATE_NEG_START_NEW</option>
                  </select>
                </label>
                {chars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.billingAccount[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, billingAccount: { ...formValues.billingAccount, [c.externalId || c.id]: v } })} />)}
              </fieldset>
            )
          })()}


          {(() => {
            const cs = contractSpecs.find((s: any) => s.externalId === selectedContractSpec)
            const po = poList.find((p: any) => p.externalId === selectedPO)
            const mustChars = cs ? getMustChars(cs.characteristics) : []
            const optChars = cs ? getOptionalChars(cs.characteristics) : []
            return (
              <fieldset><legend>Contract & Product</legend>
                {selectedPO && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: '#555', margin: '0 0 6px' }}>Identification Resources (MSISDN/IMSI):</p>
                    {(() => {
                      const selectedPOObj = poList.find((p: any) => p.externalId === selectedPO)
                      const poHasRs = (selectedPOObj?.resourceSpecifications || []).length > 0
                      return selectedResources.map((entry, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                          {poHasRs ? (
                            <span style={{ flex: 2, fontSize: 12, padding: '4px 6px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4 }}>
                              {entry.specExtId}
                            </span>
                          ) : (
                            <select style={{ flex: 2 }} value={entry.specExtId} onChange={e => {
                              const s = commIdSpecs.find((s: any) => s.externalId === e.target.value)
                              const u = [...selectedResources]; u[idx] = { ...u[idx], specExtId: e.target.value, specId: s?.id || '' }; setSelectedResources(u)
                            }}>
                              <option value="">-- Select CommID Spec --</option>
                              {commIdSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name} ({s.externalId})</option>)}
                            </select>
                          )}
                          <input style={{ flex: 2 }} placeholder={entry.specExtId.toLowerCase().includes('imsi') ? 'IMSI (15 digits)' : 'MSISDN'}
                            value={entry.value}
                            onChange={e => { const u = [...selectedResources]; u[idx] = { ...u[idx], value: e.target.value }; setSelectedResources(u) }} />
                          {!poHasRs && selectedResources.length > 1 && <button type="button" onClick={() => setSelectedResources(selectedResources.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
                        </div>
                      ))
                    })()}
                    {(() => {
                      const selectedPOObj = poList.find((p: any) => p.externalId === selectedPO)
                      const poHasRs = (selectedPOObj?.resourceSpecifications || []).length > 0
                      return !poHasRs && (
                        <button type="button" style={{ fontSize: 11, width: 'fit-content' }} onClick={() => setSelectedResources([...selectedResources, { specExtId: '', specId: '', value: '' }])}>+ Add Resource</button>
                      )
                    })()}
                  </div>
                )}
                <label style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>Home Time Zone
                  <input style={{ width: '100%' }} value={homeTimeZone} onChange={e => setHomeTimeZone(e.target.value)} placeholder="e.g. Europe/Stockholm" />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6 }}>
                  <input type="checkbox" checked={includeContactMediumAssoc} onChange={e => setIncludeContactMediumAssoc(e.target.checked)} />
                  Include contactMediumAssociation
                </label>
                {includeContactMediumAssoc && (
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>Association Language
                    {languages.length > 0 ? (
                      <select style={{ width: '100%' }} value={cmAssocLanguage} onChange={e => setCmAssocLanguage(e.target.value)}>
                        {languages.map(l => <option key={l.id} value={l.id}>{l.name} ({l.id})</option>)}
                      </select>
                    ) : (
                      <input style={{ width: '100%' }} value={cmAssocLanguage} onChange={e => setCmAssocLanguage(e.target.value)} placeholder="e.g. en" />
                    )}
                  </label>
                )}

                {mustChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#c60', margin: '8px 0 4px' }}>Contract — Required Characteristics:</p>
                  {mustChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } })} />)}
                </>}
                {optChars.length > 0 && <>
                  <p style={{ fontSize: 12, color: '#0a7', margin: '8px 0 4px' }}>Contract — Optional Characteristics:</p>
                  {optChars.map((c: any) => <CharInput key={c.id} char={c} value={formValues.contract[c.externalId || c.id] || ''} onChange={v => setFormValues({ ...formValues, contract: { ...formValues.contract, [c.externalId || c.id]: v } })} />)}
                </>}
              </fieldset>
            )
          })()}


          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(0)}>← Back</button>
            <button disabled={!givenName || !familyName || !msisdn} onClick={() => {
              const partyExtId = `extID-party-${msisdn}`
              const customerExtId = `extID-customer-${msisdn}`
              const baExtId = `extID_BA-${msisdn}`
              const contractExtId = `extID-contract-${msisdn}`
              const nowDt = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z')

              const pb: any = {
                externalId: partyExtId,
                givenName, familyName,
                individualSpecification: { externalId: selectedPartySpec },
                status: [{ status: partyStatus }],
              }
              pb.contactMedium = selectedCmSpecs
                .filter(e => e.specExtId)
                .map(e => ({
                  contactMediumSpecExternalId: e.specExtId,
                  externalId: e.externalId || `cm_${e.specExtId}_${msisdn}`,
                  validFor: { startDateTime: nowDt },
                  characteristic: Object.entries(e.charVals)
                    .filter(([, v]) => v)
                    .map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] })),
                }))
              const partyChars = Object.entries(formValues.party).filter(([, v]) => v)
              if (partyChars.length) pb.characteristic = partyChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              const buildCma = () => selectedCmSpecs
                .filter(e => e.specExtId)
                .map(e => ({
                  contactRole: 'Notification',
                  language: cmAssocLanguage || 'en',
                  contactMediumExternalId: e.externalId || `cm_${e.specExtId}_${msisdn}`,
                  enabled: true,
                  validFor: { startDateTime: nowDt },
                }))
              const cb: any = {
                externalId: customerExtId,
                customerSpecification: { externalId: selectedCustSpec },
                status: [{ status: customerStatus }],
                ...(selectedBASpec ? { account: [{
                  externalId: baExtId,
                  billingAccountSpecExternalId: selectedBASpec,
                  status: [{ status: baStatus }],
                  ...(billCycleSpecExtId ? { customerBillCycleSpecification: [{
                    externalId: `cbcs-${msisdn}`,
                    billCycleSpecExternalId: billCycleSpecExtId,
                    billCycleChangeType: billCycleChangeType || 'NO_PRORATE',
                  }] } : {}),
                }] } : {}),
                engagedParty: { externalId: partyExtId, '@referredType': 'Individual' },
              }
              if (includeContactMediumAssoc) {
                const cma = buildCma()
                if (cma.length) {
                  cb.contactMediumAssociation = cma
                  cb.account[0].contactMediumAssociation = cma
                }
              }
              if (billCycleSpecExtId.trim()) {
                cb.account[0].customerBillCycleSpecification = [{
                  externalId: `cbcs-${msisdn}`,
                  billCycleSpecExternalId: billCycleSpecExtId.trim(),
                  billCycleChangeType: billCycleChangeType,
                }]
              }
              const custChars = Object.entries(formValues.customer).filter(([, v]) => v)
              if (custChars.length) cb.characteristic = custChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))
              const baChars = Object.entries(formValues.billingAccount).filter(([, v]) => v)
              if (baChars.length) cb.account[0].characteristic = baChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))


              const ctb: any = {
                externalId: contractExtId,
                contractSpecification: { externalId: selectedContractSpec },
                status: [{ status: contractStatus }],
              }
              const products: any[] = []
              if (productOptions.sharingProvider) {
                const techPO = (productOptions as any).techPO || 'PO-Technical'
                products.push({
                  productOfferingExternalId: techPO,
                  externalId: `extID_tech-${msisdn}`,
                  correlationId: '1',
                  name: 'Technical Product',
                  status: [{ status: techProductStatus }],
                  billingAccountReference: { externalId: baExtId },
                  baRefForBillCycleAlignedRecurrence: { externalId: baExtId },
                  sharingProvider: {
                    billingAccount: [{ externalId: baExtId }],
                    consumerList: [{ externalId: `Consumer_List_${msisdn}`, consumerCustomerExternalId: customerExtId, consumerContractExternalId: contractExtId }],
                  },
                  sharingConsumer: {
                    providerCustomerExternalId: customerExtId, providerContractExternalId: contractExtId,
                    providerProductExternalId: `extID_tech-${msisdn}`, consumerListEntryExternalId: `Consumer_List_${msisdn}`,
                  },
                })
              }
              if (selectedPO) {
                const basePlanProduct: any = {
                  productOfferingExternalId: selectedPO,
                  externalId: `${selectedPO}-${msisdn}`,
                  correlationId: productOptions.sharingProvider ? '2' : '1',
                  name: selectedPO,
                  status: [{ status: basePlanStatus, ...(productValidFor.enabled && (productValidFor.startDateTime || productValidFor.endDateTime) ? { validFor: { ...(productValidFor.startDateTime ? { startDateTime: new Date(productValidFor.startDateTime).toISOString() } : {}), ...(productValidFor.endDateTime ? { endDateTime: new Date(productValidFor.endDateTime).toISOString() } : {}) } } : {}) }],
                }
                if (productOptions.baRef) basePlanProduct.billingAccountReference = { externalId: baExtId }
                if (productOptions.baRefRecurrence) basePlanProduct.baRefForBillCycleAlignedRecurrence = { externalId: baExtId }
                const poCharEntries = Object.entries(formValues.contract)
                  .filter(([k, v]) => k.startsWith('_po_') && v && (v as string).trim())
                if (poCharEntries.length) {
                  const poObj = poList.find((p: any) => p.externalId === selectedPO)
                  const poChars = poObj?.characteristics || []
                  const MEASURE_TO_UNIT: Record<string, string> = { 'Data': 'megabyte', 'Duration': 'hour', 'Money': 'euro', 'Voice': 'second' }
                  basePlanProduct.characteristic = poCharEntries.map(([k, v]) => {
                    const charExtId = k.replace('_po_', '')
                    const specChar = poChars.find((c: any) => (c.externalId || c.id) === charExtId)
                    // Get unit: possibleValues > form override > measure-to-unit mapping
                    let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || ''
                    if (!unit && formValues.contract[`_po_unit_${charExtId}`]) unit = formValues.contract[`_po_unit_${charExtId}`]
                    if (!unit && specChar?.unitOfMeasure && MEASURE_TO_UNIT[specChar.unitOfMeasure]) unit = MEASURE_TO_UNIT[specChar.unitOfMeasure]
                    const valObj: any = { value: v }
                    if (unit) valObj.unitOfMeasure = unit
                    return { charSpecExternalId: charExtId, value: [valObj] }
                  })
                }
                // POP personalization
                const priceEntries = (!popEnabled ? [] : popPersonalization)
                  .filter((pop: any) => popSelected[pop.popId])
                  .map((pop: any) => {
                    const priceRows = (pop.rows || []).map((row: any) => {
                      const priceAction = (row.chars || []).map((c: any) => {
                        const val = popValues[`${pop.popId}_${row.rowId}_${c.id}`]
                        if (!val?.value?.trim()) return null
                        const char: any = { value: [{ value: val.value }] }
                        if (val.unit) char.value[0].unitOfMeasure = val.unit
                        if (c.externalId) char.charSpecExternalId = c.externalId
                        else char.charSpecId = c.id
                        const action: any = { characteristic: [char] }
                        const _aid = String(c["actionId"] || "")
                        const _aeid = String(c["actionExternalId"] || "")
                        if (_aeid) action["action"] = { externalId: _aeid }
                        else if (_aid) action["action"] = { id: _aid }
                        return action
                      }).filter(Boolean)
                      if (!priceAction.length) return null
                      return {
                        ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}),
                        priceAction,
                      }
                    }).filter(Boolean)
                    if (!priceRows.length) return null
                    return {
                      productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) },
                      priceRow: priceRows,
                    }
                  })
                  .filter(Boolean)
                if (priceEntries.length) basePlanProduct.price = priceEntries
                products.push(basePlanProduct)
              }

              // Add-on products
              for (const entry of additionalPOs.filter(e => e.poExtId)) {
                const addOn: any = {
                  productOfferingExternalId: entry.poExtId,
                  externalId: `${entry.poExtId}-${msisdn}`,
                  name: entry.poExtId,
                  status: [{ status: basePlanStatus, ...(entry.validFor.enabled && (entry.validFor.startDateTime || entry.validFor.endDateTime) ? { validFor: { ...(entry.validFor.startDateTime ? { startDateTime: new Date(entry.validFor.startDateTime).toISOString() } : {}), ...(entry.validFor.endDateTime ? { endDateTime: new Date(entry.validFor.endDateTime).toISOString() } : {}) } } : {}) }],
                }
                if (entry.baRef) addOn.billingAccountReference = { externalId: baExtId }
                if (entry.baRefRecurrence) addOn.baRefForBillCycleAlignedRecurrence = { externalId: baExtId }
                const addOnChars = Object.entries(entry.formVals).filter(([, v]) => (v as string)?.trim())
                if (addOnChars.length) {
                  const addOnPoObj = poList.find((p: any) => p.externalId === entry.poExtId)
                  const addOnPoChars = addOnPoObj?.characteristics || []
                  const MEASURE_CATEGORIES = ['Data', 'Duration', 'Money', 'Voice', 'SMS', 'MMS', 'Events']
                  addOn.characteristic = addOnChars.map(([k, v]) => {
                    const specChar = addOnPoChars.find((c: any) => (c.externalId || c.id) === k)
                    let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || specChar?.specCharacteristicValue?.[0]?.unitOfMeasure || specChar?.unitOfMeasure || ''
                    if (MEASURE_CATEGORIES.includes(unit)) unit = ''
                    const valObj: any = { value: v }
                    if (unit) valObj.unitOfMeasure = unit
                    return { charSpecExternalId: k, value: [valObj] }
                  })
                }
                // POP personalization for add-on
                if (entry.popEnabled && entry.popData.length > 0) {
                  const addOnPriceEntries = entry.popData
                    .filter((pop: any) => entry.popSelected[pop.popId])
                    .map((pop: any) => {
                      const priceRows = (pop.rows || []).map((row: any) => {
                        const priceAction = (row.chars || []).map((c: any) => {
                          const val = entry.popVals[`${pop.popId}_${row.rowId}_${c.id}`]
                          if (!val?.value?.trim()) return null
                          const char: any = { value: [{ value: val.value }] }
                          if (val.unit) char.value[0].unitOfMeasure = val.unit
                          if (c.externalId) char.charSpecExternalId = c.externalId
                          else char.charSpecId = c.id
                          const action: any = { characteristic: [char] }
                          if (c.actionExternalId) action.action = { externalId: c.actionExternalId }
                          else if (c.actionId) action.action = { id: c.actionId }
                          return action
                        }).filter(Boolean)
                        if (!priceAction.length) return null
                        return { ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction }
                      }).filter(Boolean)
                      if (!priceRows.length) return null
                      return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows }
                    }).filter(Boolean)
                  if (addOnPriceEntries.length) addOn.price = addOnPriceEntries
                }
                products.push(addOn)
              }
              if (products.length) ctb.product = products
              // Resources
              const selectedPOObj2 = poList.find((p: any) => p.externalId === selectedPO)
              const poRsList: any[] = selectedPOObj2?.resourceSpecifications || []
              const resources: any[] = []
              const basePlanCorrelationId = productOptions.sharingProvider ? '2' : '1'
              for (const entry of selectedResources.filter(e => e.specExtId && e.value.trim())) {
                const rsLabel = entry.specExtId.replace(/[^a-zA-Z0-9_-]/g, '')
                const linkedRs = poRsList.find((r: any) => r.externalId === entry.specExtId)
                const commIdSpec = commIdSpecs.find((s: any) => s.externalId === entry.specExtId)
                const specId = entry.specId || linkedRs?.id || commIdSpec?.id || ''
                const res: any = {
                  externalId: `${rsLabel}-${entry.value}`,
                  resourceNumber: entry.value,
                  resourceSpecificationExternalId: entry.specExtId,
                  productCorrelationId: [basePlanCorrelationId],
                }
                if (specId) res.resourceSpecificationId = specId
                resources.push(res)
              }
              if (resources.length) ctb.resource = resources
              if (selectedCommIdSpec) {
                ctb.communicationIdentifier = [{ communicationIdentifierSpecExternalId: selectedCommIdSpec }]
              }
              if (homeTimeZone.trim()) {
                ctb.homeTimeZone = [{ timeZone: homeTimeZone.trim() }]
              }
              if (includeContactMediumAssoc) {
                ctb.contactMediumAssociation = selectedCmSpecs
                  .filter(e => e.specExtId)
                  .map(e => ({
                    contactRole: 'Notification',
                    language: 'en',
                    contactMediumExternalId: e.externalId || `cm_${e.specExtId}_${msisdn}`,
                    enabled: true,
                  }))
              }
              const cs2 = contractSpecs.find((s: any) => s.externalId === selectedContractSpec)
              const mustCharKeys = new Set((cs2 ? getMustChars(cs2.characteristics) : []).map((c: any) => c.externalId || c.id))
              const contractChars = Object.entries(formValues.contract)
                .filter(([k, v]) => !k.startsWith('_') && (v as string)?.trim() && mustCharKeys.has(k))
              if (contractChars.length) ctb.characteristic = contractChars.map(([k, v]) => ({ charSpecExternalId: k, value: [{ value: v }] }))

              setPartyJson(JSON.stringify(pb, null, 2))
              setCustomerJson(JSON.stringify(cb, null, 2))
              setContractJson(JSON.stringify(ctb, null, 2))
              setStep(2)
            }}>Next → Review JSON</button>
          </div>
        </div>
      )}


      {step === 2 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 700 }}>
          <h3 style={{ margin: 0 }}>Step 3: Review & Edit JSON</h3>
          <p style={{ fontSize: 12, color: '#555', margin: 0 }}>Edit the request bodies before sending.</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Send:</span>
            {(['all', 'party', 'customer', 'contract'] as const).map(m => (
              <label key={m} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input type="radio" name="provisionMode" value={m} checked={provisionMode === m} onChange={() => setProvisionMode(m)} />
                {m === 'all' ? 'All (Party + Customer + Contract)' : m.charAt(0).toUpperCase() + m.slice(1) + ' only'}
              </label>
            ))}
          </div>

          <fieldset>
            <legend><b>1. Create Party</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={8} value={partyJson} onChange={e => setPartyJson(e.target.value)} />
          </fieldset>

          <fieldset>
            <legend><b>2. Create Customer</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={10} value={customerJson} onChange={e => setCustomerJson(e.target.value)} />
          </fieldset>

          <fieldset>
            <legend><b>3. Create Contract</b></legend>
            <textarea style={{ width: '100%', fontFamily: 'monospace', fontSize: 11 }} rows={20} value={contractJson} onChange={e => setContractJson(e.target.value)} />
          </fieldset>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setStep(1)}>← Back</button>
            <button disabled={loading} onClick={submit}>
              {loading ? 'Provisioning...' : provisionMode === 'all' ? 'Provision All' : `Send ${provisionMode.charAt(0).toUpperCase() + provisionMode.slice(1)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
