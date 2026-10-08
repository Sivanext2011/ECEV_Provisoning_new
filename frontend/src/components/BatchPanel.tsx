import React, { useState, useRef, useEffect } from 'react'
import { CharInput, splitCharValues } from './CharInput'

const API = '/api/v1'

type SortKey = 'created_desc' | 'created_asc' | 'name_asc' | 'name_desc' | 'status_asc' | 'status_desc'

export function BatchPanel() {
  const [batchFile, setBatchFile] = useState<any>(null)      // parsed uploaded/loaded file
  const [fileName, setFileName] = useState('')
  const [recordCount, setRecordCount] = useState<number | null>(null)

  const [delayMin, setDelayMin] = useState('0')               // schedule delay in minutes
  const [autoStart, setAutoStart] = useState(true)

  const [scheduleId, setScheduleId] = useState('')
  const [scheduleInfo, setScheduleInfo] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('created_desc')

  // per-job expanded failure details: { [jobId]: {loading, data, error} }
  const [failDetails, setFailDetails] = useState<Record<string, any>>({})
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<any>(null)

  // ---- spec-driven build wizard ----
  const [specs, setSpecs] = useState<any>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [wCount, setWCount] = useState('1')
  const [wGiven, setWGiven] = useState('Batch')
  const [wFamily, setWFamily] = useState('Test')
  const [wPartySpec, setWPartySpec] = useState('')
  const [wCustSpec, setWCustSpec] = useState('')
  const [wBASpec, setWBASpec] = useState('')
  const [wBCSpec, setWBCSpec] = useState('')
  const [wContractSpec, setWContractSpec] = useState('')
  const [wPO, setWPO] = useState('')
  const [wAdjust, setWAdjust] = useState(false)
  const [wPartyChars, setWPartyChars] = useState<Record<string, string>>({})
  const [wCustChars, setWCustChars] = useState<Record<string, string>>({})
  const [wContractChars, setWContractChars] = useState<Record<string, string>>({})
  // identification resources + contact medium + comm id + home tz
  const [wResources, setWResources] = useState<Array<{ specExtId: string; specId: string; value: string }>>([{ specExtId: '', specId: '', value: '' }])
  const [wCommIdSpec, setWCommIdSpec] = useState('')
  const [wHomeTz, setWHomeTz] = useState('')
  const [wIncludeCma, setWIncludeCma] = useState(false)
  const [wCmaLang, setWCmaLang] = useState('en')
  const [wContactMedia, setWContactMedia] = useState<Array<{ specExtId: string; externalId: string; charVals: Record<string, string> }>>([])
  // product / status options (parity with provisioning flow)
  const [wIncludeBaRef, setWIncludeBaRef] = useState(false)
  const [wIncludeBaRefRecurrence, setWIncludeBaRefRecurrence] = useState(false)
  const [wPartyStatus, setWPartyStatus] = useState('PartyActive')
  const [wCustomerStatus, setWCustomerStatus] = useState('CustomerActive')
  const [wBaStatus, setWBaStatus] = useState('BillingAccountActive')
  const [wContractStatus, setWContractStatus] = useState('Created')
  const [wProductStatus, setWProductStatus] = useState('ProductCreated')

  useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
    fetch(`${API}/settings`).then(r => r.ok ? r.json() : null).then(cfg => {
      const d = cfg?.defaults || {}
      setWPartySpec(d.partySpecExternalId || '')
      setWCustSpec(d.customerSpecExternalId || '')
      setWBASpec(d.billingAccountSpecExternalId || '')
      setWBCSpec(d.billCycleSpecExternalId || '')
      setWContractSpec(d.contractSpecExternalId || '')
      setWPO(d.basePlanProductOfferingExternalId || '')
    }).catch(() => {})
  }, [])

  // ---- Download template ----
  const downloadTemplate = async () => {
    setErr(''); setMsg('')
    try {
      const r = await fetch(`${API}/batch/template?count=1&adjustment=true`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const tpl = await r.json()
      const blob = new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'cpm_batch_template.json'; a.click()
      URL.revokeObjectURL(url)
      setMsg('Template downloaded. Edit the resource payloads / externalIds, then upload it below.')
    } catch (e: any) { setErr(`Template download failed: ${e.message}`) }
  }

  // ---- Upload / validate batch file ----
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setMsg(''); setFileName(f.name); setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const r = await fetch(`${API}/batch/upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setBatchFile(d.batchFile)
      setRecordCount(d.recordCount)
      setMsg(`Loaded "${f.name}": ${d.recordCount} record(s), batchJobId=${d.batchJobId || '(auto)'}`)
    } catch (e: any) { setErr(`Upload failed: ${e.message}`); setBatchFile(null); setRecordCount(null) }
    setLoading(false)
  }

  // ---- Schedule (create + optionally start, with optional delay) ----
  const schedule = async (bodyOverride?: any) => {
    const body = bodyOverride || (batchFile ? { batchFile } : null)
    if (!body) { setErr('Upload a batch file or use the wizard first'); return }
    setErr(''); setMsg(''); setLoading(true); setScheduleInfo(null)
    try {
      body.delaySeconds = Math.round((Number(delayMin) || 0) * 60)
      body.autoStart = autoStart
      const r = await fetch(`${API}/batch/schedule`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setScheduleId(d.scheduleId)
      setMsg(`Scheduled (id=${d.scheduleId}, delay=${d.delaySeconds}s, autoStart=${d.autoStart}). Polling status...`)
    } catch (e: any) { setErr(`Schedule failed: ${e.message}`) }
    setLoading(false)
  }

  // ---- Build a batch body from the spec-driven wizard ----
  const buildCharsPayload = (map: Record<string, string>) =>
    Object.entries(map)
      .filter(([, v]) => v !== undefined && v !== null && splitCharValues(v).length > 0)
      .map(([k, v]) => ({ charSpecExternalId: k, value: splitCharValues(v).map(sv => ({ value: sv })) }))

  const wizardBody = () => ({
    count: Number(wCount) || 1,
    givenName: wGiven,
    familyName: wFamily,
    adjustment: wAdjust,
    partySpecExternalId: wPartySpec || undefined,
    customerSpecExternalId: wCustSpec || undefined,
    billingAccountSpecExternalId: wBASpec || undefined,
    billCycleSpecExternalId: wBCSpec || undefined,
    contractSpecExternalId: wContractSpec || undefined,
    productOfferingExternalId: wPO || undefined,
    partyCharacteristics: buildCharsPayload(wPartyChars),
    customerCharacteristics: buildCharsPayload(wCustChars),
    contractCharacteristics: buildCharsPayload(wContractChars),
    resources: wResources
      .filter(r => r.specExtId && r.value.trim())
      .map(r => ({ resourceSpecificationExternalId: r.specExtId, resourceNumber: r.value.trim(), resourceSpecificationId: r.specId || undefined })),
    communicationIdentifierSpecExternalId: wCommIdSpec || undefined,
    homeTimeZone: wHomeTz || undefined,
    includeContactMediumAssociation: wIncludeCma,
    contactMediumAssociationLanguage: wCmaLang,
    includeBaRef: wIncludeBaRef,
    includeBaRefRecurrence: wIncludeBaRefRecurrence,
    partyStatus: wPartyStatus || undefined,
    customerStatus: wCustomerStatus || undefined,
    billingAccountStatus: wBaStatus || undefined,
    contractStatus: wContractStatus || undefined,
    productStatus: wProductStatus || undefined,
    contactMedia: wContactMedia
      .filter(c => c.specExtId)
      .map(c => ({
        contactMediumSpecExternalId: c.specExtId,
        externalId: c.externalId || undefined,
        characteristics: Object.entries(c.charVals)
          .filter(([, v]) => v && splitCharValues(v).length > 0)
          .map(([k, v]) => ({ charSpecExternalId: k, value: splitCharValues(v).map(sv => ({ value: sv })) })),
      })),
  })

  const scheduleFromWizard = () => schedule(wizardBody())

  const previewWizard = async () => {
    setErr(''); setMsg('')
    try {
      const r = await fetch(`${API}/batch/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wizardBody()) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'cpm_batch_wizard.json'; a.click()
      URL.revokeObjectURL(url)
      setMsg('Wizard batch file built & downloaded for review.')
    } catch (e: any) { setErr(`Build failed: ${e.message}`) }
  }

  // ---- Bulk Excel workflow (multi-entry, multi-combo) ----
  // Each combo is a full, independent spec selection (its own specs + resources).
  const [showBulk, setShowBulk] = useState(false)
  const [bulkCombos, setBulkCombos] = useState<Array<any>>([])
  const [bulkSampleRows, setBulkSampleRows] = useState('3')
  const [bulkBatchFile, setBulkBatchFile] = useState<any>(null)
  const [bulkRecordCount, setBulkRecordCount] = useState<number | null>(null)
  const [bulkFileName, setBulkFileName] = useState('')
  const bulkFileRef = useRef<HTMLInputElement>(null)

  // make a blank combo seeded from the current wizard selection (which itself
  // starts from config defaults) — user then adjusts each combo independently
  const makeCombo = (name: string) => ({
    comboName: name,
    partySpecExternalId: wPartySpec, customerSpecExternalId: wCustSpec,
    billingAccountSpecExternalId: wBASpec, billCycleSpecExternalId: wBCSpec,
    contractSpecExternalId: wContractSpec, productOfferingExternalId: wPO,
    contactMediumSpecExternalId: '',
    resources: [{ specExtId: '', specId: '', value: '' }],
    includeBaRef: true, includeBaRefRecurrence: true,
  })
  const addCombo = () => setBulkCombos([...bulkCombos, makeCombo(`combo${bulkCombos.length + 1}`)])
  const updateCombo = (i: number, patch: any) => { const u = [...bulkCombos]; u[i] = { ...u[i], ...patch }; setBulkCombos(u) }
  const removeCombo = (i: number) => setBulkCombos(bulkCombos.filter((_, k) => k !== i))

  // fetch POP personalization for a combo's PO and store on the combo
  const fetchComboPop = async (i: number, poExtId: string) => {
    updateCombo(i, { popLoading: true, popError: '', pop: [], popEnabled: false, popSelected: {}, popValues: {} })
    try {
      const r = await fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(poExtId)}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const pops = await r.json()
      const defaults: Record<string, { value: string; unit: string }> = {}
      for (const pop of pops) for (const row of (pop.rows || [])) for (const ch of (row.chars || []))
        defaults[`${pop.popId}_${row.rowId}_${ch.id}`] = { value: ch.defaultValue || '', unit: ch.defaultUnit || (ch.units?.[0] || '') }
      updateCombo(i, { pop: pops, popValues: defaults, popLoading: false })
    } catch (e: any) { updateCombo(i, { popLoading: false, popError: e.message }) }
  }

  // build the product price (POP) array for a combo, like ProvisionWizard
  const buildComboPrice = (c: any) => {
    const popValues = c.popValues || {}
    const popSelected = c.popSelected || {}
    if (!c.popEnabled) return []
    return (c.pop || [])
      .filter((pop: any) => popSelected[pop.popId])
      .map((pop: any) => {
        const priceRow = (pop.rows || []).map((row: any) => {
          const priceAction = (row.chars || []).map((ch: any) => {
            const val = popValues[`${pop.popId}_${row.rowId}_${ch.id}`]
            if (!val?.value?.toString().trim()) return null
            if (val.value.toString().trim() === (ch.defaultValue || '').toString().trim()) return null
            const charObj: any = { value: [{ value: val.value }] }
            if (val.unit) charObj.value[0].unitOfMeasure = val.unit
            if (ch.externalId) charObj.charSpecExternalId = ch.externalId; else charObj.charSpecId = ch.id
            const action: any = { characteristic: [charObj] }
            if (ch.actionExternalId) action.action = { externalId: String(ch.actionExternalId) }
            else if (ch.actionId) action.action = { id: String(ch.actionId) }
            return action
          }).filter(Boolean)
          if (!priceAction.length) return null
          return { ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction }
        }).filter(Boolean)
        if (!priceRow.length) return null
        return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow }
      }).filter(Boolean)
  }

  // serialize combos to the backend shape
  const combosPayload = () => (bulkCombos.length ? bulkCombos : [makeCombo('default')]).map(c => ({
    comboName: c.comboName,
    partySpecExternalId: c.partySpecExternalId, customerSpecExternalId: c.customerSpecExternalId,
    billingAccountSpecExternalId: c.billingAccountSpecExternalId, billCycleSpecExternalId: c.billCycleSpecExternalId,
    contractSpecExternalId: c.contractSpecExternalId, productOfferingExternalId: c.productOfferingExternalId,
    contactMediumSpecExternalId: c.contactMediumSpecExternalId || '',
    resourceSpecs: (c.resources || []).filter((r: any) => r.specExtId).map((r: any) => ({ externalId: r.specExtId, id: r.specId || '' })),
    includeBaRef: c.includeBaRef, includeBaRefRecurrence: c.includeBaRefRecurrence,
    productPrice: buildComboPrice(c),
  }))

  const downloadExcelTemplate = async () => {
    setErr(''); setMsg('')
    const combos = combosPayload()
    try {
      const r = await fetch(`${API}/batch/excel-template`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ combos, sampleRows: Number(bulkSampleRows) || 3 }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.detail || `HTTP ${r.status}`) }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'cpm_batch_bulk_template.xlsx'; a.click()
      URL.revokeObjectURL(url)
      setMsg(`Excel template downloaded (${combos.length} combo(s), with a filled sample row each). Edit the Entries sheet and upload it below.`)
    } catch (e: any) { setErr(`Excel template failed: ${e.message}`) }
  }

  const onBulkFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(''); setMsg(''); setBulkFileName(f.name); setLoading(true); setBulkBatchFile(null); setBulkRecordCount(null)
    try {
      const fd = new FormData(); fd.append('file', f)
      const r = await fetch(`${API}/batch/excel-upload`, { method: 'POST', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setBulkBatchFile(d.batchFile); setBulkRecordCount(d.recordCount)
      setMsg(`Parsed "${f.name}": ${d.recordCount} record(s) across combos [${(d.combos || []).join(', ')}]`)
    } catch (e: any) { setErr(`Excel upload failed: ${e.message}`) }
    setLoading(false)
  }

  const scheduleBulk = () => {
    if (!bulkBatchFile) { setErr('Upload a filled Excel first'); return }
    schedule({ batchFile: bulkBatchFile })
  }

  // ---- Poll schedule status ----
  useEffect(() => {
    if (!scheduleId) return
    const poll = async () => {
      try {
        const r = await fetch(`${API}/batch/schedule/${scheduleId}`)
        if (r.ok) setScheduleInfo(await r.json())
      } catch {}
    }
    poll()
    pollRef.current = setInterval(poll, 4000)
    return () => clearInterval(pollRef.current)
  }, [scheduleId])

  // ---- List all jobs (server-side sorted) ----
  const listJobs = async (key: SortKey = sortKey) => {
    setErr('')
    try {
      const r = await fetch(`${API}/batch/jobs?sort=${key}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setJobs(Array.isArray(d) ? d : [])
      setMsg(`Fetched ${Array.isArray(d) ? d.length : 0} job(s) from CPM Batch`)
    } catch (e: any) { setErr(`List jobs failed: ${e.message}`) }
  }

  const onSortChange = (k: SortKey) => { setSortKey(k); listJobs(k) }

  // ---- Fetch failure reasons for a job (on row click) ----
  const toggleJob = async (jobId: string) => {
    if (expandedJob === jobId) { setExpandedJob(null); return }
    setExpandedJob(jobId)
    if (failDetails[jobId]) return
    setFailDetails(prev => ({ ...prev, [jobId]: { loading: true } }))
    try {
      const r = await fetch(`${API}/batch/jobs/${jobId}/failures`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.detail || `HTTP ${r.status}`)
      setFailDetails(prev => ({ ...prev, [jobId]: { loading: false, data: d } }))
    } catch (e: any) {
      setFailDetails(prev => ({ ...prev, [jobId]: { loading: false, error: e.message } }))
    }
  }

  const btn: React.CSSProperties = { fontSize: 12, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' }
  const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 14, background: '#fff' }
  const sel: React.CSSProperties = { fontSize: 12, padding: '4px 6px', marginLeft: 6 }

  // spec lists
  const partySpecs = specs?.partySpecifications || []
  const custSpecs = specs?.customerSpecifications || []
  const baSpecs = specs?.billingAccountSpecifications || []
  const bcSpecs = specs?.billingCycleSpecifications || []
  const contractSpecs = specs?.contractSpecifications || []
  const poList = specs?.productOfferings || []
  const commIdSpecs = specs?.communicationIdentifierSpecifications || []
  const cmSpecs = specs?.contactMediumSpecifications || []

  const findSpec = (list: any[], ext: string) => list.find((s: any) => s.externalId === ext)
  const personalizable = (chars: any[]) => (chars || []).filter((c: any) => {
    const ext = (c.externalId || '').trim()
    // real settable char: has externalId, no spaces (not a display-name fallback), personalizable
    if (!ext || ext.includes(' ')) return false
    return ['canBePersonalized', 'mustBePersonalized', 'selection'].includes(c.valueRegulator)
  })

  // When a PO with resourceSpecifications is selected, auto-populate the resource rows
  // (identification resources) from the PO's linked resource specs.
  const selectedPOObj = findSpec(poList, wPO)
  const poRsList: any[] = selectedPOObj?.resourceSpecifications || []
  const poHasRs = poRsList.length > 0
  useEffect(() => {
    if (poHasRs) {
      setWResources(poRsList.map((r: any) => ({ specExtId: r.externalId, specId: r.id || '', value: '' })))
    } else {
      setWResources([{ specExtId: '', specId: '', value: '' }])
    }
  }, [wPO])

  const renderCharSet = (specList: any[], ext: string, vals: Record<string, string>, setVals: (v: Record<string, string>) => void, label: string) => {
    const spec = findSpec(specList, ext)
    const chars = personalizable(spec?.characteristics || [])
    if (!spec || chars.length === 0) return <div style={{ fontSize: 11, color: '#999' }}>No personalizable characteristics for {label}.</div>
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {chars.map((c: any) => {
          const key = c.externalId || c.id
          return (
            <div key={key}>
              <div style={{ fontSize: 11, fontWeight: 600 }}>{c.name || key}{c.valueRegulator === 'mustBePersonalized' && <span style={{ color: '#dc2626' }}> *</span>}</div>
              <CharInput char={c} value={vals[key] || ''} onChange={(v) => setVals({ ...vals, [key]: v })} />
            </div>
          )
        })}
      </div>
    )
  }

  // Full spec-driven editor for ONE bulk combo (independent spec selection).
  const renderComboEditor = (c: any, i: number) => {
    const poRs = findSpec(poList, c.productOfferingExternalId)?.resourceSpecifications || []
    const poHasRs = poRs.length > 0
    const resources = c.resources || []
    const specSel = (label: string, field: string, list: any[]) => (
      <label style={{ fontSize: 12 }}>{label}
        <select style={{ ...sel, width: '100%' }} value={c[field] || ''} onChange={e => updateCombo(i, { [field]: e.target.value })}>
          <option value="">(none)</option>
          {list.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
        </select>
      </label>
    )
    return (
      <div key={i} style={{ border: '1px solid #c7d2fe', borderRadius: 6, padding: 10, marginBottom: 10, background: '#fbfbff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Combo</span>
          <input style={{ fontSize: 12, width: 120 }} value={c.comboName} onChange={e => updateCombo(i, { comboName: e.target.value })} />
          <button onClick={() => removeCombo(i)} style={{ ...btn, background: '#dc2626', padding: '2px 8px' }}>Remove</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {specSel('Party spec', 'partySpecExternalId', partySpecs)}
          {specSel('Customer spec', 'customerSpecExternalId', custSpecs)}
          {specSel('Billing account spec', 'billingAccountSpecExternalId', baSpecs)}
          {specSel('Bill cycle spec', 'billCycleSpecExternalId', bcSpecs)}
          {specSel('Contract spec', 'contractSpecExternalId', contractSpecs)}
          <label style={{ fontSize: 12 }}>Product offering
            <select style={{ ...sel, width: '100%' }} value={c.productOfferingExternalId || ''} onChange={e => {
              const po = e.target.value
              const rs = (findSpec(poList, po)?.resourceSpecifications || [])
              updateCombo(i, { productOfferingExternalId: po, resources: rs.length ? rs.map((r: any) => ({ specExtId: r.externalId, specId: r.id || '', value: '' })) : [{ specExtId: '', specId: '', value: '' }], poCharVals: {} })
              if (po) fetchComboPop(i, po)
            }}>
              <option value="">(none)</option>
              {poList.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
            </select>
          </label>
          {specSel('Contact medium spec', 'contactMediumSpecExternalId', cmSpecs)}
        </div>

        {/* identification resources */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Identification resource spec(s) (MSISDN / IMSI){poHasRs ? ' — from PO' : ''}</div>
          {resources.map((r: any, ri: number) => (
            <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
              {poHasRs ? (
                <span style={{ flex: 2, fontSize: 11, padding: '3px 6px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4 }}>{r.specExtId}</span>
              ) : (
                <select style={{ flex: 2, fontSize: 11 }} value={r.specExtId} onChange={e => {
                  const s = commIdSpecs.find((x: any) => x.externalId === e.target.value)
                  const u = [...resources]; u[ri] = { ...u[ri], specExtId: e.target.value, specId: s?.id || '' }; updateCombo(i, { resources: u })
                }}>
                  <option value="">-- resource / CommID spec --</option>
                  {commIdSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              )}
              {!poHasRs && resources.length > 1 && <button type="button" onClick={() => updateCombo(i, { resources: resources.filter((_: any, k: number) => k !== ri) })} style={{ fontSize: 11 }}>✕</button>}
            </div>
          ))}
          {!poHasRs && <button type="button" style={{ fontSize: 11 }} onClick={() => updateCombo(i, { resources: [...resources, { specExtId: '', specId: '', value: '' }] })}>+ Add resource spec</button>}
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Numbers (MSISDN/IMSI values) are entered per-row in the Excel, not here.</div>
        </div>

        {/* PO characteristics (become product.* columns in Excel; defaults shown here) */}
        {c.productOfferingExternalId && (() => {
          const po = findSpec(poList, c.productOfferingExternalId)
          const poChars = personalizable(po?.characteristics || [])
          if (!poChars.length) return null
          const vals = c.poCharVals || {}
          return (
            <div style={{ marginTop: 8, border: '1px solid #eee', borderRadius: 6, padding: 8, background: '#f9fafb' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Product characteristics (base plan) — these become <code>product.*</code> columns</div>
              {poChars.map((ch: any) => {
                const key = ch.externalId || ch.id
                return (
                  <div key={key}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{ch.name || key}{ch.valueRegulator === 'mustBePersonalized' && <span style={{ color: '#dc2626' }}> *</span>}</div>
                    <CharInput char={ch} value={vals[key] || ''} onChange={(v) => updateCombo(i, { poCharVals: { ...vals, [key]: v } })} />
                  </div>
                )
              })}
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Values here seed the Excel sample row; edit per subscriber in the sheet.</div>
            </div>
          )
        })()}

        {/* POP personalization (combo-level, like the provisioning flow) */}
        {c.popLoading && <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>⏳ Loading POP…</div>}
        {c.popError && <div style={{ fontSize: 11, color: '#c00', marginTop: 6 }}>⚠ {c.popError}</div>}
        {(c.pop || []).length > 0 && (
          <div style={{ marginTop: 8, border: '1px solid #f0abfc', borderRadius: 6, padding: 8, background: '#fdf4ff' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#1d4ed8', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!c.popEnabled} onChange={e => updateCombo(i, { popEnabled: e.target.checked })} />
              POP Personalization ({(c.pop || []).length})
            </label>
            {c.popEnabled && (c.pop || []).map((pop: any) => (
              <div key={pop.popId} style={{ marginLeft: 12, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!(c.popSelected || {})[pop.popId]} onChange={e => updateCombo(i, { popSelected: { ...(c.popSelected || {}), [pop.popId]: e.target.checked } })} />
                  {pop.popName || pop.popExternalId}
                </label>
                {(c.popSelected || {})[pop.popId] && (pop.rows || []).map((row: any) => (
                  <div key={row.rowId} style={{ marginLeft: 12, marginTop: 2 }}>
                    {(row.chars || []).map((ch: any) => {
                      const key = `${pop.popId}_${row.rowId}_${ch.id}`
                      const val = (c.popValues || {})[key] || { value: '', unit: ch.defaultUnit || '' }
                      return (
                        <div key={ch.id} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, minWidth: 90, color: '#555' }}>{ch.name}</span>
                          <input style={{ flex: 1, padding: '2px 4px', fontSize: 10 }} placeholder={ch.defaultValue || 'value'} value={val.value}
                            onChange={e => updateCombo(i, { popValues: { ...(c.popValues || {}), [key]: { ...val, value: e.target.value } } })} />
                          <input style={{ width: 70, padding: '2px 4px', fontSize: 9 }} placeholder={ch.defaultUnit || 'unit'} value={val.unit}
                            onChange={e => updateCombo(i, { popValues: { ...(c.popValues || {}), [key]: { ...val, unit: e.target.value } } })} />
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={c.includeBaRef} onChange={e => updateCombo(i, { includeBaRef: e.target.checked })} /> billingAccountReference</label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={c.includeBaRefRecurrence} onChange={e => updateCombo(i, { includeBaRefRecurrence: e.target.checked })} /> baRefForBillCycleAlignedRecurrence</label>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>📦 CPM Batch</h2>
      <p style={{ fontSize: 12, color: '#555' }}>Build a batch with spec-driven assistance (or upload your own file), then schedule it. CPM Batch creates &amp; starts the job.</p>

      {/* Spec-driven wizard */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>🧭 Spec-driven batch builder</span>
          <button onClick={() => setShowWizard(s => !s)} style={{ ...btn, background: '#7c3aed', padding: '3px 10px' }}>{showWizard ? 'Hide' : 'Open'}</button>
        </div>
        {showWizard && (!specs ? (
          <p style={{ color: '#c00', fontSize: 12 }}>No specs loaded. Go to the <b>📦 Catalog</b> tab and upload a BusinessConfig zip first.</p>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12 }}>Records<input type="number" min={1} style={{ width: 70, ...sel }} value={wCount} onChange={e => setWCount(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Given name<input style={sel} value={wGiven} onChange={e => setWGiven(e.target.value)} /></label>
              <label style={{ fontSize: 12 }}>Family name<input style={sel} value={wFamily} onChange={e => setWFamily(e.target.value)} /></label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={wAdjust} onChange={e => setWAdjust(e.target.checked)} /> Add balance adjustment</label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12 }}>Party spec
                <select style={{ ...sel, width: '100%' }} value={wPartySpec} onChange={e => { setWPartySpec(e.target.value); setWPartyChars({}) }}>
                  <option value="">(default)</option>
                  {partySpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Customer spec
                <select style={{ ...sel, width: '100%' }} value={wCustSpec} onChange={e => { setWCustSpec(e.target.value); setWCustChars({}) }}>
                  <option value="">(default)</option>
                  {custSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Billing account spec
                <select style={{ ...sel, width: '100%' }} value={wBASpec} onChange={e => setWBASpec(e.target.value)}>
                  <option value="">(default)</option>
                  {baSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Bill cycle spec
                <select style={{ ...sel, width: '100%' }} value={wBCSpec} onChange={e => setWBCSpec(e.target.value)}>
                  <option value="">(default)</option>
                  {bcSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Contract spec
                <select style={{ ...sel, width: '100%' }} value={wContractSpec} onChange={e => { setWContractSpec(e.target.value); setWContractChars({}) }}>
                  <option value="">(default)</option>
                  {contractSpecs.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Product offering
                <select style={{ ...sel, width: '100%' }} value={wPO} onChange={e => setWPO(e.target.value)}>
                  <option value="">(default)</option>
                  {poList.map((s: any) => <option key={s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
            </div>

            {wPartySpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Party characteristics</div>{renderCharSet(partySpecs, wPartySpec, wPartyChars, setWPartyChars, 'party')}</div>}
            {wCustSpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Customer characteristics</div>{renderCharSet(custSpecs, wCustSpec, wCustChars, setWCustChars, 'customer')}</div>}
            {wContractSpec && <div><div style={{ fontSize: 12, fontWeight: 600, margin: '4px 0' }}>Contract characteristics</div>{renderCharSet(contractSpecs, wContractSpec, wContractChars, setWContractChars, 'contract')}</div>}

            {/* Identification resources (MSISDN/IMSI) */}
            <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, margin: '0 0 4px' }}>Identification resources (MSISDN / IMSI)</div>
              {poHasRs && <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>Resource specs from PO <b>{wPO}</b>. Enter a number for each.</div>}
              {wResources.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                  {poHasRs ? (
                    <span style={{ flex: 2, fontSize: 12, padding: '4px 6px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 4 }}>{r.specExtId}</span>
                  ) : (
                    <select style={{ flex: 2, fontSize: 12 }} value={r.specExtId} onChange={e => {
                      const s = commIdSpecs.find((x: any) => x.externalId === e.target.value)
                      const u = [...wResources]; u[idx] = { ...u[idx], specExtId: e.target.value, specId: s?.id || '' }; setWResources(u)
                    }}>
                      <option value="">-- Select resource / CommID spec --</option>
                      {commIdSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                    </select>
                  )}
                  <input style={{ flex: 2, fontSize: 12, padding: '4px 6px' }} placeholder={r.specExtId.toLowerCase().includes('imsi') ? 'IMSI (15 digits)' : 'MSISDN'}
                    value={r.value} onChange={e => { const u = [...wResources]; u[idx] = { ...u[idx], value: e.target.value }; setWResources(u) }} />
                  {!poHasRs && wResources.length > 1 && <button type="button" onClick={() => setWResources(wResources.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>}
                </div>
              ))}
              {!poHasRs && <button type="button" style={{ fontSize: 11 }} onClick={() => setWResources([...wResources, { specExtId: '', specId: '', value: '' }])}>+ Add Resource</button>}
            </div>

            {/* Communication identifier + home time zone */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12 }}>Communication identifier spec
                <select style={{ ...sel, width: '100%' }} value={wCommIdSpec} onChange={e => setWCommIdSpec(e.target.value)}>
                  <option value="">(none)</option>
                  {commIdSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12 }}>Home time zone
                <input style={{ ...sel, width: '100%' }} value={wHomeTz} onChange={e => setWHomeTz(e.target.value)} placeholder="e.g. Europe/Stockholm" />
              </label>
            </div>

            {/* Contact medium specs */}
            <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Contact medium specs</span>
                <button type="button" style={{ fontSize: 11 }} onClick={() => setWContactMedia([...wContactMedia, { specExtId: '', externalId: '', charVals: {} }])}>+ Add Contact Medium</button>
              </div>
              {wContactMedia.map((cm, idx) => {
                const cmSpec = findSpec(cmSpecs, cm.specExtId)
                const cmChars = personalizable(cmSpec?.characteristics || [])
                return (
                  <div key={idx} style={{ border: '1px solid #eee', borderRadius: 6, padding: 8, marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <select style={{ flex: 2, fontSize: 12 }} value={cm.specExtId} onChange={e => { const u = [...wContactMedia]; u[idx] = { ...u[idx], specExtId: e.target.value, charVals: {} }; setWContactMedia(u) }}>
                        <option value="">-- Select contact medium spec --</option>
                        {cmSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                      </select>
                      <button type="button" onClick={() => setWContactMedia(wContactMedia.filter((_, i) => i !== idx))} style={{ fontSize: 11 }}>✕</button>
                    </div>
                    {cm.specExtId && cmChars.length > 0 && (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {cmChars.map((c: any) => {
                          const key = c.externalId || c.id
                          return (
                            <div key={key}>
                              <div style={{ fontSize: 11, fontWeight: 600 }}>{c.name || key}{c.valueRegulator === 'mustBePersonalized' && <span style={{ color: '#dc2626' }}> *</span>}</div>
                              <CharInput char={c} value={cm.charVals[key] || ''} onChange={(v) => { const u = [...wContactMedia]; u[idx] = { ...u[idx], charVals: { ...u[idx].charVals, [key]: v } }; setWContactMedia(u) }} />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <input type="checkbox" checked={wIncludeCma} onChange={e => setWIncludeCma(e.target.checked)} /> Include contactMediumAssociation (customer + contract)
              </label>
              {wIncludeCma && <label style={{ fontSize: 12 }}>Association language<input style={sel} value={wCmaLang} onChange={e => setWCmaLang(e.target.value)} /></label>}
            </div>

            {/* Initial statuses (user-set) + product options */}
            <div style={{ borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Initial statuses (set by user)</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12 }}>Party<input style={{ ...sel, width: 120 }} value={wPartyStatus} onChange={e => setWPartyStatus(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Customer<input style={{ ...sel, width: 130 }} value={wCustomerStatus} onChange={e => setWCustomerStatus(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Billing acct<input style={{ ...sel, width: 150 }} value={wBaStatus} onChange={e => setWBaStatus(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Contract<input style={{ ...sel, width: 110 }} value={wContractStatus} onChange={e => setWContractStatus(e.target.value)} /></label>
                <label style={{ fontSize: 12 }}>Product<input style={{ ...sel, width: 130 }} value={wProductStatus} onChange={e => setWProductStatus(e.target.value)} /></label>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Product BA refs:</span>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={wIncludeBaRef} onChange={e => setWIncludeBaRef(e.target.checked)} /> billingAccountReference</label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={wIncludeBaRefRecurrence} onChange={e => setWIncludeBaRefRecurrence(e.target.checked)} /> baRefForBillCycleAlignedRecurrence</label>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={previewWizard} style={{ ...btn, background: '#6b7280' }}>⬇️ Build &amp; Download (preview)</button>
              <button onClick={scheduleFromWizard} disabled={loading} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule this batch</button>
            </div>
            <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Mandatory spec characteristics auto-fill from the catalog if left blank. * = must be personalized. BA refs are off by default (match verified working pattern).</p>
          </div>
        ))}
      </div>

      {/* Bulk Excel workflow (multi-entry, multi-combo) */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontWeight: 600 }}>📊 Bulk via Excel (multiple entries / combos)</span>
          <button onClick={() => setShowBulk(s => !s)} style={{ ...btn, background: '#0891b2', padding: '3px 10px' }}>{showBulk ? 'Hide' : 'Open'}</button>
        </div>
        {showBulk && (
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ fontSize: 12, color: '#555', margin: 0 }}>
              1) Define spec combination(s). 2) Download the Excel template (columns come from the specs). 3) Fill one row per subscriber in the <b>Entries</b> sheet (set <b>comboName</b> to pick a combo per row). 4) Upload &amp; schedule — one record per row.
            </p>

            {/* combos — each is a full independent spec selection */}
            <div style={{ border: '1px solid #eee', borderRadius: 6, padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Spec combinations</span>
                <button onClick={addCombo} style={{ ...btn, background: '#7c3aed', padding: '3px 10px' }}>+ Add combo (choose specs)</button>
              </div>
              {bulkCombos.length === 0 ? (
                <div style={{ fontSize: 11, color: '#888' }}>No combos yet — a single "default" combo (current wizard specs) will be used. Click "+ Add combo" to define one or more spec combinations, each with its own specs &amp; resources.</div>
              ) : (
                bulkCombos.map((c, i) => renderComboEditor(c, i))
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12 }}>Extra blank rows<input type="number" min={0} style={{ width: 70, ...sel }} value={bulkSampleRows} onChange={e => setBulkSampleRows(e.target.value)} /></label>
              <button onClick={downloadExcelTemplate} style={{ ...btn, background: '#6b7280' }}>⬇️ Download Excel template (with 1 sample row per combo)</button>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Upload filled Excel:</span>
              <input ref={bulkFileRef} type="file" accept=".xlsx" onChange={onBulkFile} style={{ fontSize: 12 }} />
              {bulkFileName && bulkRecordCount !== null && <span style={{ fontSize: 12, color: '#059669' }}>{bulkRecordCount} record(s) parsed</span>}
            </div>

            {bulkBatchFile && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button onClick={scheduleBulk} disabled={loading} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule bulk batch ({bulkRecordCount} records)</button>
                <button onClick={() => { const blob = new Blob([JSON.stringify(bulkBatchFile, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'cpm_bulk_batch.json'; a.click(); URL.revokeObjectURL(url) }} style={{ ...btn, background: '#6b7280' }}>⬇️ Download built batch (JSON)</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Template + upload (manual path) */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Manual: template &amp; upload</div>
        <button onClick={downloadTemplate} style={{ ...btn, background: '#6b7280', marginRight: 10 }}>⬇️ Download Template (JSON)</button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ fontSize: 12 }} />
        {fileName && <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Selected: {fileName}{recordCount !== null ? ` — ${recordCount} record(s)` : ''}</div>}
      </div>

      {/* Schedule controls */}
      <div style={card}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Schedule</div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12 }}>Delay (minutes)
            <input type="number" min={0} style={{ width: 80, marginLeft: 6, padding: '4px 6px', fontSize: 12 }} value={delayMin} onChange={e => setDelayMin(e.target.value)} />
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoStart} onChange={e => setAutoStart(e.target.checked)} /> Auto-start job after create
          </label>
          <button onClick={() => schedule()} disabled={loading || !batchFile} style={{ ...btn, background: '#16a34a' }}>🕒 Schedule uploaded file</button>
        </div>
      </div>

      {msg && <div style={{ fontSize: 12, color: '#059669', background: '#f0fdf4', padding: 8, borderRadius: 4, marginBottom: 8 }}>{msg}</div>}
      {err && <div style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', padding: 8, borderRadius: 4, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{err}</div>}

      {/* Schedule status */}
      {scheduleInfo && (
        <div style={card}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Schedule status</div>
          <div style={{ fontSize: 12 }}>
            <div><strong>State:</strong> <span style={{ color: scheduleInfo.state === 'ERROR' ? '#dc2626' : '#2563eb' }}>{scheduleInfo.state}</span></div>
            {scheduleInfo.jobId && <div><strong>Job ID:</strong> {scheduleInfo.jobId}</div>}
            {scheduleInfo.error && <div style={{ color: '#dc2626' }}><strong>Error:</strong> {scheduleInfo.error}</div>}
            {scheduleInfo.jobStatus && <div><strong>Job status:</strong> {typeof scheduleInfo.jobStatus === 'string' ? scheduleInfo.jobStatus : (scheduleInfo.jobStatus.status || JSON.stringify(scheduleInfo.jobStatus))}</div>}
          </div>
        </div>
      )}

      {/* Jobs list */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>All batch jobs</span>
          <button onClick={() => listJobs()} style={{ ...btn, background: '#2563eb', padding: '3px 10px' }}>🔄 Refresh</button>
          <label style={{ fontSize: 12 }}>Sort by
            <select style={sel} value={sortKey} onChange={e => onSortChange(e.target.value as SortKey)}>
              <option value="created_desc">Created (newest first)</option>
              <option value="created_asc">Created (oldest first)</option>
              <option value="name_asc">Name (A→Z)</option>
              <option value="name_desc">Name (Z→A)</option>
              <option value="status_asc">Status (A→Z)</option>
              <option value="status_desc">Status (Z→A)</option>
            </select>
          </label>
          <span style={{ fontSize: 11, color: '#888' }}>Click a row to see failure reasons.</span>
        </div>
        {jobs.length > 0 ? (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#f3f4f6' }}>
              <th style={{ textAlign: 'left', padding: 6 }}>Job ID</th><th style={{ textAlign: 'left', padding: 6 }}>Name</th><th style={{ textAlign: 'left', padding: 6 }}>Status</th><th style={{ textAlign: 'left', padding: 6 }}>Created</th>
            </tr></thead>
            <tbody>{jobs.map((j, i) => (
              <React.Fragment key={j.jobId || i}>
                <tr style={{ borderBottom: '1px solid #eee', cursor: 'pointer', background: expandedJob === j.jobId ? '#f8fafc' : undefined }} onClick={() => toggleJob(j.jobId)}>
                  <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{j.jobId}</td>
                  <td style={{ padding: 6 }}>{j.batchName}</td>
                  <td style={{ padding: 6, color: j.status === 'FAILED' ? '#dc2626' : j.status === 'COMPLETED' ? '#059669' : '#555' }}>{j.status}</td>
                  <td style={{ padding: 6 }}>{j.creationDate}</td>
                </tr>
                {expandedJob === j.jobId && (
                  <tr><td colSpan={4} style={{ padding: 10, background: '#f9fafb' }}>
                    {failDetails[j.jobId]?.loading && <div style={{ fontSize: 12, color: '#666' }}>Loading failure details…</div>}
                    {failDetails[j.jobId]?.error && <div style={{ fontSize: 12, color: '#dc2626' }}>Error: {failDetails[j.jobId].error}</div>}
                    {failDetails[j.jobId]?.data && (() => {
                      const d = failDetails[j.jobId].data
                      return (
                        <div style={{ fontSize: 12 }}>
                          <div style={{ marginBottom: 6 }}>
                            <strong>{d.success}</strong> succeeded, <strong style={{ color: d.failed ? '#dc2626' : '#059669' }}>{d.failed}</strong> failed (of {d.total}).
                          </div>
                          {d.failures?.length > 0 ? (
                            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                              <thead><tr style={{ background: '#fee2e2' }}>
                                <th style={{ textAlign: 'left', padding: 4 }}>Rec</th><th style={{ textAlign: 'left', padding: 4 }}>Entity</th><th style={{ textAlign: 'left', padding: 4 }}>Code</th><th style={{ textAlign: 'left', padding: 4 }}>Reason</th>
                              </tr></thead>
                              <tbody>{d.failures.map((f: any, k: number) => (
                                <tr key={k} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: 4 }}>{f.recordNumber}</td>
                                  <td style={{ padding: 4 }}>{f.entity}</td>
                                  <td style={{ padding: 4 }}>{f.responseCode}</td>
                                  <td style={{ padding: 4, color: '#b91c1c' }}>{f.reason}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          ) : <div style={{ color: '#059669' }}>No failures — all entities succeeded.</div>}
                        </div>
                      )
                    })()}
                  </td></tr>
                )}
              </React.Fragment>
            ))}</tbody>
          </table>
        ) : <div style={{ fontSize: 12, color: '#888' }}>No jobs loaded. Click Refresh.</div>}
      </div>
    </div>
  )
}

export default BatchPanel
