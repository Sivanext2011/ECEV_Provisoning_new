import React, { useState, useEffect } from 'react'

const API = '/api/v1'

// === Helper Components ===

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  const color = s.includes('active') ? '#1a7f37' : s.includes('halt') || s.includes('suspend') ? '#b45309' : s.includes('terminat') ? '#b91c1c' : s.includes('creat') ? '#1d4ed8' : '#555'
  const bg = s.includes('active') ? '#dcfce7' : s.includes('halt') || s.includes('suspend') ? '#fef3c7' : s.includes('terminat') ? '#fee2e2' : s.includes('creat') ? '#dbeafe' : '#f3f4f6'
  return <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}40`, borderRadius: 10, padding: '1px 8px', whiteSpace: 'nowrap' }}>{status || '—'}</span>
}

function InfoRow({ label, value }: { label: string; value: any }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ color: '#888', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{ color: '#222', wordBreak: 'break-all' }}>{String(value)}</span>
    </div>
  )
}

/** Determine current status from a BSSF status timeline array.
 *  Finds the entry whose validFor covers 'now'. Falls back to last entry without endDateTime, or last entry overall. */
function getCurrentStatus(statusArr: any[]): string {
  if (!statusArr || statusArr.length === 0) return ''
  if (statusArr.length === 1) return statusArr[0].status || ''
  const now = new Date()
  // Find entry where startDateTime <= now < endDateTime (or endDateTime is absent)
  for (const s of statusArr) {
    const start = s.validFor?.startDateTime ? new Date(s.validFor.startDateTime) : null
    const end = s.validFor?.endDateTime ? new Date(s.validFor.endDateTime) : null
    if (start && start <= now && (!end || now < end)) return s.status || ''
  }
  // Fallback: entry with no endDateTime (open-ended = final state)
  const openEnded = statusArr.find((s: any) => s.validFor?.startDateTime && !s.validFor?.endDateTime)
  if (openEnded) return openEnded.status || ''
  // Last resort: last element
  return statusArr[statusArr.length - 1].status || ''
}

function Card({ title, icon, color, defaultOpen, rawData, children }: { title: string; icon: string; color: string; defaultOpen?: boolean; rawData?: any; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen ?? true)
  const [showRaw, setShowRaw] = React.useState(false)
  return (
    <div style={{ border: `1px solid ${color}40`, borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ background: `${color}15`, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: '#222' }}>{title}</span>
        {rawData !== undefined && open && (
          <button style={{ fontSize: 10, padding: '1px 6px', background: showRaw ? '#555' : '#eee', color: showRaw ? '#fff' : '#555', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); setShowRaw(r => !r) }}>{showRaw ? 'Visual' : 'Raw JSON'}</button>
        )}
        <span style={{ fontSize: 11, color: '#999' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ padding: '10px 14px' }}>
          {showRaw
            ? <pre style={{ fontSize: 11, margin: 0, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f8f8f8', padding: 8, borderRadius: 4 }}>{JSON.stringify(rawData, null, 2)}</pre>
            : children}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <h3 style={{ margin: '16px 0 10px', fontSize: 14, borderBottom: '2px solid #eee', paddingBottom: 6 }}>{title}</h3>
}

// === Utility functions ===

const fmtDate = (dt: string) => {
  if (!dt || dt.startsWith('0001') || dt.startsWith('9999')) return null
  return dt.replace('T', ' ').slice(0, 16) + ' UTC'
}

const flattenBuckets = (data: any): { billing: any[], products: Record<string, any[]> } => {
  const billing: any[] = []
  const prods: Record<string, any[]> = {}
  if (!data) return { billing, products: prods }
  const arr = Array.isArray(data) ? data : [data]
  for (const item of arr) {
    for (const ba of (item.billingAccount || [])) {
      for (const b of (ba.bucket || [])) billing.push({ ...b, _baExternalId: ba.externalId })
    }
    for (const prod of (item.product || [])) {
      const key = prod.externalId || prod.id
      if (key) prods[key] = (prod.bucket || []).map((b: any) => ({ ...b, _productExternalId: key }))
    }
  }
  return { billing, products: prods }
}

const fmtBytes = (n: number) => {
  if (n >= 1073741824) return `${(n / 1073741824).toFixed(2)} GB`
  if (n >= 1048576) return `${(n / 1048576).toFixed(2)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KB`
  return `${n} B`
}

// === Main Component ===

export function CRMView() {
  // Search state
  const [searchType, setSearchType] = useState<'msisdn' | 'externalId' | 'id'>('msisdn')
  const [searchValue, setSearchValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Data state
  const [party, setParty] = useState<any>(null)
  const [customer, setCustomer] = useState<any>(null)
  const [contract, setContract] = useState<any>(null)
  const [balance, setBalance] = useState<any>(null)
  const [specs, setSpecs] = useState<any>(null)

  // Action state
  const [actionMsg, setActionMsg] = useState('')
  const [actionErr, setActionErr] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Add Product form state
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newPO, setNewPO] = useState('')
  const [newProductExtId, setNewProductExtId] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [newProductBaRef, setNewProductBaRef] = useState(true)
  const [newProductBaRefRecurrence, setNewProductBaRefRecurrence] = useState(true)
  const [newProductChars, setNewProductChars] = useState<Array<{ charSpecExternalId: string; value: string }>>([])
  const [newProductResources, setNewProductResources] = useState<Array<{ specExternalId: string; resourceNumber: string; externalId: string }>>([])
  const [newProductSharingProvider, setNewProductSharingProvider] = useState(false)
  const [newProductSharingConsumer, setNewProductSharingConsumer] = useState(false)
  const [newProductProviderExtId, setNewProductProviderExtId] = useState('')
  const [newProductConsumerListExtId, setNewProductConsumerListExtId] = useState('')
  const [newProductValidFor, setNewProductValidFor] = useState({ enabled: false, startDateTime: '', endDateTime: '' })
  const [poSpecs, setPoSpecs] = useState<any>(null)

  // POP Personalization state (for Add Product)
  const [popPersonalization, setPopPersonalization] = useState<Array<any>>([])
  const [popValues, setPopValues] = useState<Record<string, { value: string; unit: string }>>({})
  const [popEnabled, setPopEnabled] = useState(false)
  const [popSelected, setPopSelected] = useState<Record<string, boolean>>({})
  const [popLoading, setPopLoading] = useState(false)

  // Balance top-up state
  const [showTopUp, setShowTopUp] = useState(false)
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpUnit, setTopUpUnit] = useState('euro')
  const [topUpDecimalPlaces, setTopUpDecimalPlaces] = useState('0')
  const [topUpProductExtId, setTopUpProductExtId] = useState('')

  // Run Recurring state
  const [showRecurring, setShowRecurring] = useState(false)
  const [recurringResult, setRecurringResult] = useState<any>(null)

  // Provider/Consumer state
  const [showProviderConsumer, setShowProviderConsumer] = useState(false)
  const [pcAction, setPcAction] = useState<'addConsumer' | 'removeConsumer' | 'viewConsumers' | 'setLimits'>('viewConsumers')
  const [pcConsumerMsisdn, setPcConsumerMsisdn] = useState('')
  const [pcConsumerCustExtId, setPcConsumerCustExtId] = useState('')
  const [pcConsumerContractExtId, setPcConsumerContractExtId] = useState('')
  const [pcConsumerListExtId, setPcConsumerListExtId] = useState('')
  const [pcProviderProductExtId, setPcProviderProductExtId] = useState('')
  const [pcResult, setPcResult] = useState<any>(null)
  const [pcLookupLoading, setPcLookupLoading] = useState(false)
  const [pcConsumerPO, setPcConsumerPO] = useState('')
  const [pcConsumerProductExtId, setPcConsumerProductExtId] = useState('')
  const [pcConsumerBaRef, setPcConsumerBaRef] = useState(true)
  const [pcPopPersonalization, setPcPopPersonalization] = useState<Array<any>>([])
  const [pcPopValues, setPcPopValues] = useState<Record<string, { value: string; unit: string }>>({})
  const [pcPopEnabled, setPcPopEnabled] = useState(false)
  const [pcPopSelected, setPcPopSelected] = useState<Record<string, boolean>>({})
  const [pcPopLoading, setPcPopLoading] = useState(false)
  const [pcLinkedConsumerPO, setPcLinkedConsumerPO] = useState<{ id: string; externalId: string; name: string } | null>(null)

  // Modify POP state
  const [modifyPopProduct, setModifyPopProduct] = useState<string>('')  // product externalId being modified
  const [modifyPopData, setModifyPopData] = useState<any[]>([])
  const [modifyPopValues, setModifyPopValues] = useState<Record<string, { value: string; unit: string }>>({})
  const [modifyPopSelected, setModifyPopSelected] = useState<Record<string, boolean>>({})
  const [modifyPopLoading, setModifyPopLoading] = useState(false)

  // Set Sharing Limits state
  const [limitCommonValue, setLimitCommonValue] = useState('')
  const [limitCommonUnit, setLimitCommonUnit] = useState('byte')
  const [limitIndividualValue, setLimitIndividualValue] = useState('')
  const [limitIndividualUnit, setLimitIndividualUnit] = useState('byte')
  const [limitConsumerMsisdn, setLimitConsumerMsisdn] = useState('')
  const [limitConsumerCustExtId, setLimitConsumerCustExtId] = useState('')
  const [limitConsumerContractExtId, setLimitConsumerContractExtId] = useState('')
  const [limitConsumerProductExtId, setLimitConsumerProductExtId] = useState('')

  // Add Contract state
  const [showAddContract, setShowAddContract] = useState(false)
  const [newContractExtId, setNewContractExtId] = useState('')
  const [newContractSpecExtId, setNewContractSpecExtId] = useState('')
  const [newContractTimeZone, setNewContractTimeZone] = useState('Europe/Stockholm')
  const [newContractPO, setNewContractPO] = useState('')
  const [newContractProductExtId, setNewContractProductExtId] = useState('')
  const [newContractMsisdn, setNewContractMsisdn] = useState('')
  const [newContractImsi, setNewContractImsi] = useState('')
  const [newContractCommIdSpec, setNewContractCommIdSpec] = useState('')
  const [newContractBaRef, setNewContractBaRef] = useState(true)
  const [newContractChars, setNewContractChars] = useState<Array<{ charSpecExternalId: string; value: string }>>([])
  const [newContractSharingProvider, setNewContractSharingProvider] = useState(false)

  // Resource Swap state
  const [showResourceSwap, setShowResourceSwap] = useState(false)
  const [rsOldResourceNumber, setRsOldResourceNumber] = useState('')
  const [rsNewResourceNumber, setRsNewResourceNumber] = useState('')
  const [rsResourceSpecExtId, setRsResourceSpecExtId] = useState('')
  const [rsProductExtId, setRsProductExtId] = useState('')

  // Balance Adjustment state
  const [showBalanceAdj, setShowBalanceAdj] = useState(false)
  const [baAdjType, setBaAdjType] = useState<'billing' | 'product'>('billing')
  const [baAdjAmount, setBaAdjAmount] = useState('')
  const [baAdjUnit, setBaAdjUnit] = useState('euro')
  const [baAdjDecimalPlaces, setBaAdjDecimalPlaces] = useState('0')
  const [baAdjReason, setBaAdjReason] = useState('')
  const [baAdjProductExtId, setBaAdjProductExtId] = useState('')

  // Product Replace state
  const [showProductReplace, setShowProductReplace] = useState(false)
  const [prOldProductExtId, setPrOldProductExtId] = useState('')
  const [prNewPO, setPrNewPO] = useState('')
  const [prNewProductExtId, setPrNewProductExtId] = useState('')

  // Financial/Billing view state
  const [showFinancial, setShowFinancial] = useState(false)
  const [financialTab, setFinancialTab] = useState<'transactions' | 'unbilled' | 'bills' | 'summary'>('transactions')
  const [financialData, setFinancialData] = useState<any>(null)
  const [financialLoading, setFinancialLoading] = useState(false)

  // Update Party/Customer state
  const [showUpdateEntity, setShowUpdateEntity] = useState(false)
  const [updateTarget, setUpdateTarget] = useState<'party' | 'customer'>('party')
  const [updatePartyGivenName, setUpdatePartyGivenName] = useState('')
  const [updatePartyFamilyName, setUpdatePartyFamilyName] = useState('')
  const [updatePartyStatus, setUpdatePartyStatus] = useState('')
  const [updateCustStatus, setUpdateCustStatus] = useState('')
  const [updateChars, setUpdateChars] = useState<Array<{ charSpecExternalId: string; value: string }>>([])

  useEffect(() => {
    fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecs).catch(() => {})
  }, [])

  const search = async () => {
    setLoading(true); setError(''); setParty(null); setCustomer(null); setContract(null); setBalance(null)
    setActionMsg(''); setActionErr('')
    try {
      if (searchType === 'msisdn') {
        const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(`extID-party-${searchValue}`)}`)
        if (pr.ok) setParty(await pr.json())
        const custr = await fetch(`${API}/customer?msisdn=${encodeURIComponent(searchValue)}`)
        if (custr.ok) setCustomer(await custr.json())
        const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(searchValue)}`)
        if (cr.ok) setContract(await cr.json())
        const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(searchValue)}`)
        if (balr.ok) setBalance(await balr.json())
      } else if (searchType === 'externalId') {
        const pr = await fetch(`${API}/party?externalId=${encodeURIComponent(searchValue)}`)
        if (pr.ok) setParty(await pr.json())
        const msisdnFromExt = searchValue.replace('extID-party-', '').replace('extID-customer-', '').replace('extID-contract-', '')
        const custExtId = searchValue.startsWith('extID-customer-') ? searchValue : `extID-customer-${msisdnFromExt}`
        const custr = await fetch(`${API}/customer?externalId=${encodeURIComponent(custExtId)}`)
        if (custr.ok) setCustomer(await custr.json())
        if (msisdnFromExt) {
          const cr = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdnFromExt)}`)
          if (cr.ok) setContract(await cr.json())
          const balr = await fetch(`${API}/balance?msisdn=${encodeURIComponent(msisdnFromExt)}`)
          if (balr.ok) setBalance(await balr.json())
        }
      } else {
        const custr = await fetch(`${API}/customer?id=${encodeURIComponent(searchValue)}`)
        if (custr.ok) setCustomer(await custr.json())
      }
    } catch (e: any) { setError(e.message) }
    setLoading(false)
  }

  // Derived values
  const p0 = Array.isArray(party) ? party[0] : party
  const cu = Array.isArray(customer) ? customer[0] : customer
  const c = Array.isArray(contract) ? contract[0] : contract
  const custExtId = cu?.externalId || ''
  const contractExtId = c?.externalId || ''
  const baExtId = cu?.account?.[0]?.externalId || ''
  const contractStatus = getCurrentStatus(c?.status) || ''
  const products = c?.product || []
  const poList = specs?.productOfferings || []
  const resourceSpecs = specs?.resourceSpecifications || []
  const contractSpecs = specs?.contractSpecifications || []
  const commIdSpecs = specs?.communicationIdentifierSpecifications || []
  const msisdnValue = searchType === 'msisdn' ? searchValue : ''

  // Load PO spec when product offering is selected for Add Product
  useEffect(() => {
    if (!newPO) { setPoSpecs(null); setPopPersonalization([]); setPopValues({}); setPopEnabled(false); setPopSelected({}); setNewProductSharingProvider(false); setNewProductSharingConsumer(false); return }
    const po = poList.find((p: any) => p.externalId === newPO)
    setPoSpecs(po || null)
    setNewProductExtId(`${newPO}-${Date.now().toString(36)}`)
    setNewProductName(po?.name || newPO)
    // Pre-populate characteristics from PO productSpecification
    const chars = po?.characteristics || po?.productSpecification?.characteristics || []
    const mustChars = chars.filter((ch: any) => ch.valueRegulator === 'mustBePersonalized' || ch.valueRegulator === 'canBePersonalized')
    setNewProductChars(mustChars.map((ch: any) => ({ charSpecExternalId: ch.externalId || ch.id, value: ch.defaultValue || '' })))
    // Pre-populate resource specs from PO
    const resSpecs = po?.resourceSpecifications || []
    setNewProductResources(resSpecs.map((rs: any) => ({ specExternalId: rs.externalId || rs.id || '', resourceNumber: '', externalId: '' })))
    // Auto-detect sharing type from catalog offeringTypes
    const types = (po?.offeringTypes || []).map((t: string) => t.toUpperCase())
    if (types.includes('SHARING_PROVIDER') || types.includes('PROVIDER') || (po?.name || '').toLowerCase().includes('technical')) {
      setNewProductSharingProvider(true); setNewProductSharingConsumer(false)
    } else if (types.includes('SHARING_CONSUMER') || types.includes('CONSUMER')) {
      setNewProductSharingConsumer(true); setNewProductSharingProvider(false)
    } else {
      setNewProductSharingProvider(false); setNewProductSharingConsumer(false)
    }
    // Also fetch live PO spec to check for sharingProviderSpecification
    fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(newPO)}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        const poSpec = Array.isArray(data) ? data[0] : data
        if (poSpec?.sharingProviderSpecification || poSpec?.sharingProviderSpecificationExternalId) {
          setNewProductSharingProvider(true); setNewProductSharingConsumer(false)
        } else if (poSpec?.sharingConsumerSpecification || poSpec?.sharingConsumerSpecificationExternalId) {
          setNewProductSharingConsumer(true); setNewProductSharingProvider(false)
        }
      })
      .catch(() => {})
    // Fetch POP personalization from live spec enquiry
    setPopPersonalization([]); setPopValues({}); setPopEnabled(false); setPopSelected({}); setPopLoading(true)
    fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(newPO)}`)
      .then(r => r.ok ? r.json() : [])
      .then((pops: any[]) => {
        setPopPersonalization(pops)
        const defaults: Record<string, { value: string; unit: string }> = {}
        for (const pop of pops)
          for (const row of (pop.rows || []))
            for (const c of (row.chars || []))
              defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
        setPopValues(defaults)
        setPopLoading(false)
      })
      .catch(() => setPopLoading(false))
  }, [newPO])

  // === Action handlers ===

  const patchContract = async (body: any) => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const r = await fetch(`${API}/execute/update_contract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, _params: { customerExternalId: custExtId, contractExternalId: contractExtId } })
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Success'); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  const changeContractStatus = (status: string) => patchContract({ status: [{ status }] })
  const changeProductStatus = (productExtId: string, status: string) => patchContract({ product: [{ externalId: productExtId, status: [{ status }] }] })

  const purchaseProduct = () => {
    if (!newPO || !newProductExtId) return
    const statusObj: any = { status: 'ProductCreated' }
    if (newProductValidFor.enabled) {
      const vf: any = {}
      if (newProductValidFor.startDateTime) vf.startDateTime = new Date(newProductValidFor.startDateTime).toISOString()
      if (newProductValidFor.endDateTime) vf.endDateTime = new Date(newProductValidFor.endDateTime).toISOString()
      if (Object.keys(vf).length) statusObj.validFor = vf
    }
    const product: any = {
      productOfferingExternalId: newPO,
      externalId: newProductExtId,
      name: newProductName || newPO,
      status: [statusObj],
    }
    if (newProductBaRef && baExtId) {
      product.billingAccountReference = { externalId: baExtId }
    }
    if (newProductBaRefRecurrence && baExtId) {
      product.baRefForBillCycleAlignedRecurrence = { externalId: baExtId }
    }
    // Add characteristics with unitOfMeasure from spec
    const validChars = newProductChars.filter(ch => ch.charSpecExternalId && ch.value)
    if (validChars.length > 0) {
      const po = poList.find((p: any) => p.externalId === newPO)
      const poChars = po?.characteristics || []
      const MEASURE_TO_UNIT: Record<string, string> = { 'Data': 'megabyte', 'Duration': 'hour', 'Money': 'euro', 'Voice': 'second' }
      product.characteristic = validChars.map(ch => {
        const specChar = poChars.find((c: any) => (c.externalId || c.id) === ch.charSpecExternalId)
        let unit = specChar?.possibleValues?.[0]?.unitOfMeasure || ''
        if (!unit && specChar?.unitOfMeasure && MEASURE_TO_UNIT[specChar.unitOfMeasure]) unit = MEASURE_TO_UNIT[specChar.unitOfMeasure]
        const valObj: any = { value: ch.value }
        if (unit) valObj.unitOfMeasure = unit
        return { charSpecExternalId: ch.charSpecExternalId, value: [valObj] }
      })
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
      }
    }
    // Add sharing consumer config
    if (newProductSharingConsumer) {
      product.sharingConsumer = {
        providerCustomerExternalId: custExtId,
        providerContractExternalId: contractExtId,
        providerProductExternalId: newProductProviderExtId,
        consumerListEntryExternalId: newProductConsumerListExtId,
      }
    }

    // Add POP price personalization
    if (popEnabled && popPersonalization.length > 0) {
      const priceEntries = popPersonalization
        .filter((pop: any) => popSelected[pop.popId])
        .map((pop: any) => {
          const priceRows = (pop.rows || []).map((row: any) => {
            const priceAction = (row.chars || []).map((c: any) => {
              const val = popValues[`${pop.popId}_${row.rowId}_${c.id}`]
              if (!val?.value?.trim()) return null
              // Only send if user changed from default
              const defaultVal = c.defaultValue || ''
              if (val.value.trim() === defaultVal.trim()) return null
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
      if (priceEntries.length) product.price = priceEntries
    }

    // Build the update body
    const body: any = { product: [product] }

    // Add resources tied to this product
    const validResources = newProductResources.filter(r => r.resourceNumber)
    if (validResources.length > 0) {
      body.resource = validResources.map(r => ({
        resourceSpecificationExternalId: r.specExternalId,
        resourceNumber: r.resourceNumber,
        externalId: r.externalId || `LRS_${r.specExternalId}_${r.resourceNumber}`,
        productCorrelationId: [product.correlationId || '1'],
      }))
    }

    patchContract(body)
    setShowAddProduct(false)
    setNewPO('')
  }

  const doBalanceTopUp = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const body = {
        customerExternalId: custExtId,
        contractExternalId: contractExtId,
        msisdn: msisdnValue || searchValue,
        amount: parseInt(topUpAmount),
        unit: topUpUnit,
        decimalPlaces: parseInt(topUpDecimalPlaces) || 0,
      }
      const r = await fetch(`${API}/balance/topup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Balance top-up successful'); setShowTopUp(false); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  const doRunRecurring = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr(''); setRecurringResult(null)
    try {
      const commId = msisdnValue || searchValue
      const r = await fetch(`${API}/recurrence?communicationId=${encodeURIComponent(commId)}&communicationIdType=E.164`)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      const data = await r.json()
      setRecurringResult(data)
      setActionMsg('✓ Recurrence enquiry complete')
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  const lookupConsumerByMsisdn = async (msisdn: string) => {
    if (!msisdn) return
    setPcLookupLoading(true); setActionErr('')
    try {
      // Fetch customer by MSISDN
      const custR = await fetch(`${API}/customer?msisdn=${encodeURIComponent(msisdn)}`)
      if (custR.ok) {
        const custData = await custR.json()
        const cu2 = Array.isArray(custData) ? custData[0] : custData
        if (cu2?.externalId) setPcConsumerCustExtId(cu2.externalId)
      }
      // Fetch contract by MSISDN
      const ctrR = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdn)}`)
      if (ctrR.ok) {
        const ctrData = await ctrR.json()
        const c2 = Array.isArray(ctrData) ? ctrData[0] : ctrData
        if (c2?.externalId) setPcConsumerContractExtId(c2.externalId)
      }
      // Consumer list entry ID is per-consumer: ConsumerEntry-<consumerMsisdn>
      // (NOT the provider's existing list entry - each consumer gets their own entry in the same list)
      const providerProduct = products.find((p: any) => p.externalId === pcProviderProductExtId || p.sharingProvider)
      const existingListExtId = providerProduct?.sharingProvider?.consumerList?.[0]?.externalId || ''
      // Generate entry ID for this new consumer
      setPcConsumerListExtId(`ConsumerEntry-${msisdn}`)
    } catch (e: any) { setActionErr(`Lookup failed: ${e.message}`) }
    setPcLookupLoading(false)
  }

  const doProviderConsumerAction = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr(''); setPcResult(null)
    try {
      if (pcAction === 'viewConsumers') {
        // Check if this subscriber has provider products - if so, show their consumer list from loaded data
        const providerProducts = products.filter((p: any) => p.sharingProvider)
        const consumerProducts = products.filter((p: any) => p.sharingConsumer)

        if (providerProducts.length > 0) {
          // This subscriber is a PROVIDER - show their consumer list
          const consumers = providerProducts.flatMap((p: any) =>
            (p.sharingProvider?.consumerList || []).map((cl: any) => ({
              providerProduct: p.externalId,
              providerPO: p.productOfferingExternalId,
              consumerListExtId: cl.externalId,
              consumerCustomer: cl.consumerCustomerExternalId,
              consumerContract: cl.consumerContractExternalId,
              status: getCurrentStatus(cl.status) || 'Active',
            }))
          )
          setPcResult({ _type: 'provider', consumers, message: `This subscriber is a PROVIDER with ${consumers.length} consumer(s)` })
          setActionMsg(`✓ Provider with ${consumers.length} consumer(s) — from loaded contract data`)
        } else if (consumerProducts.length > 0) {
          // This subscriber is a CONSUMER - show their sharing consumer details
          const consumerInfo = consumerProducts.map((p: any) => ({
            productExtId: p.externalId,
            productPO: p.productOfferingExternalId,
            providerCustomer: p.sharingConsumer.providerCustomerExternalId,
            providerContract: p.sharingConsumer.providerContractExternalId,
            providerProduct: p.sharingConsumer.providerProductExternalId,
            consumerListEntry: p.sharingConsumer.consumerListEntryExternalId,
            status: getCurrentStatus(p.status) || '',
          }))
          setPcResult({ _type: 'consumer', consumerInfo, message: `This subscriber is a CONSUMER in ${consumerInfo.length} sharing group(s)` })
          setActionMsg(`✓ Consumer in ${consumerInfo.length} sharing group(s) — from loaded contract data`)
        } else {
          // Try fetching consumer products from API
          const commId = msisdnValue || searchValue
          const params = new URLSearchParams()
          if (custExtId) params.append('customerExternalId', custExtId)
          if (commId) { params.append('communicationId', commId); params.append('communicationIdType', 'E.164') }
          const r = await fetch(`${API}/subscription/consumerProduct?${params.toString()}`)
          if (!r.ok) {
            const errText = (await r.json()).detail || ''
            if (errText.includes('partition') || r.status === 400) {
              setPcResult({ _type: 'none', message: 'This subscriber has no consumer products (not a consumer in any sharing group)' })
              setActionMsg('ℹ No consumer products found')
            } else {
              throw new Error(errText || `HTTP ${r.status}`)
            }
          } else {
            setPcResult(await r.json())
            setActionMsg('✓ Consumer products loaded')
          }
        }
      } else if (pcAction === 'addConsumer') {
        const consumerListExt = pcConsumerListExtId || `Consumer_List_${pcConsumerMsisdn}`
        const consumerProdExtId = pcConsumerProductExtId || `${pcConsumerPO}-${pcConsumerMsisdn}`

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
        }
        const r1 = await fetch(`${API}/execute/update_contract`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(providerBody)
        })
        if (!r1.ok) throw new Error(`Provider consumerList update failed: ${(await r1.json()).detail || r1.status}`)

        // Step 2: Add consumer product to consumer's contract (now the consumerList entry exists)
        if (pcConsumerPO && pcConsumerCustExtId && pcConsumerContractExtId) {
          const consumerProduct: any = {
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
          }
          // Add BA reference from consumer's billing account
          if (pcConsumerBaRef) {
            consumerProduct.billingAccountReference = { externalId: `extID_BA-${pcConsumerMsisdn}` }
            consumerProduct.baRefForBillCycleAlignedRecurrence = { externalId: `extID_BA-${pcConsumerMsisdn}` }
          }
          // Add POP price personalization (consumer limits)
          if (pcPopEnabled && pcPopPersonalization.length > 0) {
            const priceEntries = pcPopPersonalization
              .filter((pop: any) => pcPopSelected[pop.popId])
              .map((pop: any) => {
                const priceRows = (pop.rows || []).map((row: any) => {
                  const priceAction = (row.chars || []).map((c: any) => {
                    const val = pcPopValues[`${pop.popId}_${row.rowId}_${c.id}`]
                    if (!val?.value?.trim()) return null
                    // Only send if user changed from default
                    const defaultVal = c.defaultValue || ''
                    if (val.value.trim() === defaultVal.trim()) return null
                    const char: any = { value: [{ value: val.value }] }
                    if (val.unit) char.value[0].unitOfMeasure = val.unit
                    if (c.externalId) char.charSpecExternalId = c.externalId
                    else char.charSpecId = c.id
                    const action: any = { characteristic: [char] }
                    if (c.actionId) action.action = { id: c.actionId }
                    else if (c.actionExternalId) action.action = { externalId: c.actionExternalId }
                    return action
                  }).filter(Boolean)
                  if (!priceAction.length) return null
                  return { ...(row.rowExternalId ? { productOfferingPriceRow: { externalId: row.rowExternalId } } : row.rowId ? { productOfferingPriceRow: { id: row.rowId } } : {}), priceAction }
                }).filter(Boolean)
                if (!priceRows.length) return null
                return { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows }
              }).filter(Boolean)
            if (priceEntries.length) consumerProduct.price = priceEntries
          }

          const consumerBody = {
            product: [consumerProduct],
            _params: { customerExternalId: pcConsumerCustExtId, contractExternalId: pcConsumerContractExtId }
          }
          const r2 = await fetch(`${API}/execute/update_contract`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(consumerBody)
          })
          if (!r2.ok) throw new Error(`Consumer PO failed: ${(await r2.json()).detail || r2.status}`)
        }
        setActionMsg('✓ Consumer provisioned and added to provider group'); search()
      } else if (pcAction === 'removeConsumer') {
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
        }
        const r = await fetch(`${API}/execute/update_contract`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setActionMsg('✓ Consumer removed successfully'); search()
      }
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  const doCreateContract = async () => {
    const contractExtIdFinal = newContractExtId || `CTR_${msisdnValue || searchValue || Date.now().toString(36)}`
    const msisdnFinal = newContractMsisdn || msisdnValue || searchValue
    if (!contractExtIdFinal || !custExtId) return
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const body: any = {
        externalId: contractExtIdFinal,
        status: [{ status: 'Active' }],
      }
      if (newContractSpecExtId) {
        body.contractSpecification = { externalId: newContractSpecExtId }
      }
      if (newContractTimeZone) {
        body.homeTimeZone = [{ timeZone: newContractTimeZone }]
      }
      // Characteristics
      const validChars = newContractChars.filter(ch => ch.charSpecExternalId && ch.value)
      if (validChars.length > 0) {
        body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }))
      }
      // Contact medium association
      body.contactMediumAssociation = [
        { contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_SMS_${msisdnFinal}`, enabled: true },
        { contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_REST_${msisdnFinal}`, enabled: true },
      ]
      // Product
      const products: any[] = []
      if (newContractPO) {
        const prodExtId = newContractProductExtId || `${newContractPO}-${Date.now().toString(36)}`
        const prod: any = {
          productOfferingExternalId: newContractPO,
          externalId: prodExtId,
          correlationId: '1',
          name: prodExtId,
          status: [{ status: 'ProductCreated' }],
        }
        if (newContractBaRef && baExtId) {
          prod.billingAccountReference = { externalId: baExtId }
          prod.baRefForBillCycleAlignedRecurrence = { externalId: baExtId }
        }
        if (newContractSharingProvider && baExtId) {
          prod.sharingProvider = {
            billingAccount: [{ externalId: baExtId }],
            consumerList: [{ externalId: `Consumer_List_${prodExtId}`, consumerCustomerExternalId: custExtId, consumerContractExternalId: newContractExtId }]
          }
          prod.sharingConsumer = {
            providerCustomerExternalId: custExtId,
            providerContractExternalId: newContractExtId,
            providerProductExternalId: prodExtId,
            consumerListEntryExternalId: `Consumer_List_${prodExtId}`,
          }
        }
        products.push(prod)
      }
      if (products.length > 0) body.product = products
      // Resources
      const resources: any[] = []
      if (msisdnFinal) {
        resources.push({ resourceNumber: msisdnFinal, externalId: `LRS_msisdn_${msisdnFinal}`, productCorrelationId: ['1'] })
      }
      if (newContractImsi) {
        resources.push({ resourceNumber: newContractImsi, externalId: `LRS_imsi_${newContractImsi}`, productCorrelationId: ['1'] })
      }
      if (resources.length > 0) body.resource = resources
      // Communication Identifier
      if (newContractCommIdSpec) {
        body.communicationIdentifier = [{ communicationIdentifierSpecExternalId: newContractCommIdSpec }]
      }

      const r = await fetch(`${API}/contract?customerExternalId=${encodeURIComponent(custExtId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Contract created successfully'); setShowAddContract(false); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === Set Sharing Limits handler ===
  const doSetLimits = async (type: 'common' | 'individual') => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      if (type === 'common') {
        // Set common limit on provider's product
        const providerProduct = products.find((p: any) => p.sharingProvider)
        if (!providerProduct) throw new Error('No provider product found')
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
        }
        const r = await fetch(`${API}/balance/productAdjustment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setActionMsg(`✓ Common limit set to ${limitCommonValue} ${limitCommonUnit}`)
      } else {
        // Set individual limit on consumer's product
        if (!limitConsumerCustExtId || !limitConsumerContractExtId || !limitConsumerProductExtId) {
          throw new Error('Lookup consumer first')
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
        }
        const r = await fetch(`${API}/balance/productAdjustment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setActionMsg(`✓ Individual limit set to ${limitIndividualValue} ${limitIndividualUnit} for ${limitConsumerMsisdn}`)
      }
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  const lookupConsumerForLimit = async (msisdn: string) => {
    if (!msisdn) return
    setActionErr('')
    try {
      const custR = await fetch(`${API}/customer?msisdn=${encodeURIComponent(msisdn)}`)
      if (custR.ok) {
        const d = await custR.json()
        const cu2 = Array.isArray(d) ? d[0] : d
        if (cu2?.externalId) setLimitConsumerCustExtId(cu2.externalId)
      }
      const ctrR = await fetch(`${API}/contract?msisdn=${encodeURIComponent(msisdn)}`)
      if (ctrR.ok) {
        const d = await ctrR.json()
        const c2 = Array.isArray(d) ? d[0] : d
        if (c2?.externalId) setLimitConsumerContractExtId(c2.externalId)
        // Find the consumer product (one with sharingConsumer)
        const consumerProd = (c2?.product || []).find((p: any) => p.sharingConsumer)
        if (consumerProd) setLimitConsumerProductExtId(consumerProd.externalId)
      }
    } catch (e: any) { setActionErr(`Lookup failed: ${e.message}`) }
  }

  // === Modify POP handler ===
  const loadProductPop = async (productExtId: string, poExtId: string) => {
    setModifyPopProduct(productExtId)
    setModifyPopData([]); setModifyPopValues({}); setModifyPopSelected({}); setModifyPopLoading(true)
    try {
      const r = await fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(poExtId)}`)
      const pops = r.ok ? await r.json() : []
      setModifyPopData(pops)
      const defaults: Record<string, { value: string; unit: string }> = {}
      const selected: Record<string, boolean> = {}
      for (const pop of pops) {
        selected[pop.popId] = true
        for (const row of (pop.rows || []))
          for (const c of (row.chars || []))
            defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
      }
      setModifyPopValues(defaults)
      setModifyPopSelected(selected)
    } catch (e) { /* ignore */ }
    setModifyPopLoading(false)
  }

  const saveProductPop = async () => {
    if (!modifyPopProduct || modifyPopData.length === 0) return
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      // Find existing price instance IDs from the loaded contract product
      const contractProduct = products.find((p: any) => p.externalId === modifyPopProduct)
      const existingPrices = contractProduct?.price || contractProduct?.prices || contractProduct?.productPrice || []
      // Debug: log if no prices found
      if (existingPrices.length === 0) {
        console.warn('No existing prices found for product', modifyPopProduct, 'Available keys:', Object.keys(contractProduct || {}))
      } else {
        console.log('Found existing prices:', existingPrices.map((ep: any) => ({ id: ep.id, popId: ep.productOfferingPriceId, popExtId: ep.productOfferingPriceExternalId, popRef: ep.productOfferingPrice })))
      }

      const priceEntries = modifyPopData
        .filter((pop: any) => modifyPopSelected[pop.popId])
        .map((pop: any) => {
          const priceRows = (pop.rows || []).map((row: any) => {
            const priceAction = (row.chars || []).map((c: any) => {
              const val = modifyPopValues[`${pop.popId}_${row.rowId}_${c.id}`]
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
          // Find existing price instance ID by matching productOfferingPriceId or productOfferingPriceExternalId
          const existingPrice = existingPrices.find((ep: any) =>
            ep.productOfferingPriceId === pop.popId ||
            ep.productOfferingPriceExternalId === pop.popExternalId ||
            ep.productOfferingPrice?.id === pop.popId ||
            ep.productOfferingPrice?.externalId === pop.popExternalId ||
            ep.productOfferingPriceId === pop.popExternalId
          )
          if (!existingPrice) {
            console.warn('No match for POP:', { popId: pop.popId, popExternalId: pop.popExternalId }, 'in prices:', existingPrices.map((ep: any) => ({ id: ep.id, popId: ep.productOfferingPriceId, popExtId: ep.productOfferingPriceExternalId })))
          }
          const entry: any = { productOfferingPrice: { id: pop.popId, ...(pop.popExternalId ? { externalId: pop.popExternalId } : {}) }, priceRow: priceRows }
          // Include existing price instance ID to update (not create new)
          if (existingPrice?.id) entry.id = existingPrice.id
          return entry
        }).filter(Boolean)

      if (priceEntries.length === 0) { setActionErr('No values to update'); setActionLoading(false); return }

      const body = {
        product: [{ externalId: modifyPopProduct, price: priceEntries }],
        _params: { customerExternalId: custExtId, contractExternalId: contractExtId }
      }
      const r = await fetch(`${API}/execute/update_contract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ POP values updated successfully'); setModifyPopProduct(''); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === Resource Swap handler ===
  const doResourceSwap = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const body: any = {
        customerExternalId: custExtId,
        contractExternalId: contractExtId,
        resource: [{
          resourceSpecificationExternalId: rsResourceSpecExtId,
          oldResourceNumber: rsOldResourceNumber,
          newResourceNumber: rsNewResourceNumber,
        }]
      }
      if (rsProductExtId) body.productExternalId = rsProductExtId
      const r = await fetch(`${API}/resource/swap`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Resource swap successful'); setShowResourceSwap(false); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === Balance Adjustment handler ===
  const doBalanceAdjustment = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const commId = msisdnValue || searchValue
      const body: any = {
        relatedParty: { externalId: custExtId, '@referredType': 'Customer' },
        contractExternalId: contractExtId,
        communicationIdType: 'E.164',
        communicationId: commId,
        amount: { number: parseInt(baAdjAmount), decimalPlaces: parseInt(baAdjDecimalPlaces) || 0 },
        unitOfMeasure: baAdjUnit,
      }
      if (baAdjReason) body.reason = baAdjReason
      const endpoint = baAdjType === 'billing' ? '/balance/billingAccountAdjustment' : '/balance/productAdjustment'
      if (baAdjType === 'product' && baAdjProductExtId) {
        body.productExternalId = baAdjProductExtId
      }
      const r = await fetch(`${API}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg(`✓ Balance adjustment (${baAdjType}) successful`); setShowBalanceAdj(false); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === Product Replace handler ===
  const doProductReplace = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      const newExtId = prNewProductExtId || `${prNewPO}-${Date.now().toString(36)}`
      const body: any = {
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
      }
      const r = await fetch(`${API}/execute/update_contract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setActionMsg('✓ Product replaced successfully'); setShowProductReplace(false); search()
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === Financial/Billing fetch handler ===
  const fetchFinancialData = async (tab: string) => {
    setFinancialLoading(true); setFinancialData(null)
    try {
      const commId = msisdnValue || searchValue
      let url = ''
      switch (tab) {
        case 'transactions': url = `${API}/financial/transaction?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`; break
        case 'unbilled': url = `${API}/bill/unbilledCharge?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`; break
        case 'bills': url = `${API}/bill/customerBill?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`; break
        case 'summary': url = `${API}/bill/summary?customerExternalId=${encodeURIComponent(custExtId)}&communicationId=${encodeURIComponent(commId)}`; break
      }
      const r = await fetch(url)
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
      setFinancialData(await r.json())
    } catch (e: any) { setActionErr(e.message) }
    setFinancialLoading(false)
  }

  // === Update Party/Customer handler ===
  const doUpdateEntity = async () => {
    setActionLoading(true); setActionMsg(''); setActionErr('')
    try {
      if (updateTarget === 'party' && p0) {
        const body: any = {}
        if (updatePartyGivenName) body.givenName = updatePartyGivenName
        if (updatePartyFamilyName) body.familyName = updatePartyFamilyName
        if (updatePartyStatus) body.status = [{ status: updatePartyStatus }]
        const validChars = updateChars.filter(ch => ch.charSpecExternalId && ch.value)
        if (validChars.length > 0) body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }))
        const r = await fetch(`${API}/execute/update_party_by_external_id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, _params: { partyExternalId: p0.externalId } })
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setActionMsg('✓ Party updated successfully'); search()
      } else if (updateTarget === 'customer' && cu) {
        const body: any = {}
        if (updateCustStatus) body.status = [{ status: updateCustStatus }]
        const validChars = updateChars.filter(ch => ch.charSpecExternalId && ch.value)
        if (validChars.length > 0) body.characteristic = validChars.map(ch => ({ charSpecExternalId: ch.charSpecExternalId, value: [{ value: ch.value }] }))
        const r = await fetch(`${API}/execute/update_customer_by_external_id`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, _params: { customerExternalId: cu.externalId } })
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setActionMsg('✓ Customer updated successfully'); search()
      }
      setShowUpdateEntity(false)
    } catch (e: any) { setActionErr(e.message) }
    setActionLoading(false)
  }

  // === BucketCard sub-component ===
  const BucketCard = ({ bucket, productExtId }: { bucket: any; productExtId?: string }) => {
    const rawAmount = Number(bucket?.amount?.number ?? 0)
    const decPlaces = Number(bucket?.amount?.decimalPlaces ?? 0)
    const rawReserved = Number(bucket?.reservedAmount?.number ?? 0)
    const unit = (bucket?.unitOfMeasure || '').toLowerCase()
    const fmtAmount = (n: number) => {
      if (unit === 'byte' || unit === 'bytes') return fmtBytes(n)
      const scaled = decPlaces > 0 ? n / Math.pow(10, decPlaces) : n
      return `${scaled.toFixed(decPlaces > 0 ? 2 : 0)}${unit ? ' ' + bucket.unitOfMeasure : ''}`
    }
    const activeContainer = (bucket?.valueContainer || []).find((vc: any) => {
      const s = vc.validFor?.startDateTime
      const e = vc.validFor?.endDateTime
      const now = Date.now()
      const after = s && !s.startsWith('0001') ? new Date(s).getTime() <= now : true
      const before = e && !e.startsWith('9999') ? new Date(e).getTime() >= now : true
      return after && before && Number(vc.amount?.number) > 0
    })
    const displayAmount = activeContainer ? fmtAmount(Number(activeContainer.amount.number)) : fmtAmount(rawAmount)
    const name = bucket?.bucketSpecExternalId || bucket?.bucketName || bucket?.name || 'Bucket'
    const start = fmtDate(bucket?.validFor?.startDateTime)
    const end = fmtDate(bucket?.validFor?.endDateTime)

    const [showAdj, setShowAdj] = React.useState(false)
    const [adjAction, setAdjAction] = React.useState<'Add' | 'Subtract' | 'Set'>('Add')
    const [adjAmount, setAdjAmount] = React.useState('')
    const [adjEndDate, setAdjEndDate] = React.useState('')
    const [adjLoading, setAdjLoading] = React.useState(false)
    const [adjMsg, setAdjMsg] = React.useState('')

    const doAdjust = async () => {
      setAdjLoading(true); setAdjMsg('')
      try {
        const body: any = {
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
        }
        if (adjEndDate) {
          body.validFor = { startDateTime: new Date().toISOString().replace(/\.\d{3}Z/, '.000Z'), endDateTime: adjEndDate + 'T23:59:59.000Z' }
        }
        const r = await fetch(`${API}/balance/productAdjustment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`)
        setAdjMsg('✓'); setShowAdj(false); search()
      } catch (e: any) { setAdjMsg(`✗ ${e.message}`) }
      setAdjLoading(false)
    }

    return (
      <div style={{ border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#fffbeb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{name}</span>
          {productExtId && <button onClick={() => setShowAdj(v => !v)} style={{ fontSize: 9, padding: '1px 5px', background: showAdj ? '#f59e0b' : '#fef3c7', color: showAdj ? '#fff' : '#92400e', border: '1px solid #fbbf24', borderRadius: 3, cursor: 'pointer' }}>{showAdj ? '✕' : '⚡ Adjust'}</button>}
        </div>
        <InfoRow label="Amount" value={displayAmount} />
        {rawReserved > 0 && <InfoRow label="Reserved" value={fmtAmount(rawReserved)} />}
        {bucket?._baExternalId && <InfoRow label="Billing Account" value={bucket._baExternalId} />}
        {start && <InfoRow label="Valid From" value={start} />}
        {end && <InfoRow label="Valid To" value={end} />}
        {adjMsg && <div style={{ fontSize: 10, color: adjMsg.startsWith('✓') ? '#059669' : '#dc2626', marginTop: 3 }}>{adjMsg}</div>}
        {showAdj && (
          <div style={{ marginTop: 6, padding: '6px 8px', background: '#fff', borderRadius: 4, border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <select style={{ padding: '2px 4px', fontSize: 10 }} value={adjAction} onChange={e => setAdjAction(e.target.value as any)}>
                <option value="Add">Add</option>
                <option value="Subtract">Subtract</option>
                <option value="Set">Set to</option>
              </select>
              <input type="number" style={{ width: 90, padding: '2px 4px', fontSize: 10 }} value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="amount" />
              <span style={{ fontSize: 9, color: '#888' }}>{bucket?.unitOfMeasure || 'byte'}</span>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <label style={{ fontSize: 9, color: '#666' }}>Expiry:</label>
              <input type="date" style={{ padding: '2px 4px', fontSize: 10, flex: 1 }} value={adjEndDate} onChange={e => setAdjEndDate(e.target.value)} />
              <button onClick={doAdjust} disabled={adjLoading || !adjAmount}
                style={{ fontSize: 9, padding: '2px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>
                {adjLoading ? '...' : 'Apply'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // === RENDER ===
  return (
    <div>
      <h2>👤 360° Subscriber View</h2>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={searchType} onChange={e => setSearchType(e.target.value as any)}>
          <option value="msisdn">MSISDN</option>
          <option value="externalId">External ID</option>
          <option value="id">Internal ID</option>
        </select>
        <input style={{ flex: 1, minWidth: 200 }} placeholder={`Enter ${searchType}...`} value={searchValue}
          onChange={e => setSearchValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()} />
        <button onClick={search} disabled={loading || !searchValue}>{loading ? 'Searching...' : 'Search'}</button>
      </div>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {actionMsg && <p style={{ color: 'green', fontSize: 12, background: '#f0fff0', padding: 8, borderRadius: 4 }}>{actionMsg}</p>}
      {actionErr && (() => {
        // Parse BSSF error messages for better display
        let errDisplay = actionErr
        try {
          const parsed = JSON.parse(actionErr)
          if (parsed.messages) {
            errDisplay = parsed.messages.map((m: any) => `[${m.code || m.action || ''}] ${m.message || ''} ${m.details || ''}`).join('\n')
          } else if (parsed.detail) {
            try { const inner = JSON.parse(parsed.detail); errDisplay = inner.messages ? inner.messages.map((m: any) => `[${m.code || ''}] ${m.details || m.message || ''}`).join('\n') : parsed.detail } catch { errDisplay = parsed.detail }
          }
        } catch {
          // Try parsing as nested JSON string
          try { const inner = JSON.parse(actionErr.replace(/^[^{]*/, '').replace(/[^}]*$/, '')); if (inner.messages) errDisplay = inner.messages.map((m: any) => `[${m.code || m.action || ''}] ${m.details || m.message}`).join('\n') } catch { /* keep original */ }
        }
        return <pre style={{ color: '#dc2626', fontSize: 12, background: '#fef2f2', padding: 10, borderRadius: 4, border: '1px solid #fecaca', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '8px 0' }}>❌ {errDisplay}</pre>
      })()}

      {/* Main Grid - Party/Customer left, Contract/Balance right */}
      {(c || cu || p0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* LEFT COLUMN */}
          <div>
            {/* Party Card */}
            {p0 && (
              <Card title={`Party — ${p0.givenName || ''} ${p0.familyName || ''}`} icon="👤" color="#f97316" rawData={p0}>
                <InfoRow label="External ID" value={p0.externalId} />
                <InfoRow label="Internal ID" value={p0.id} />
                <InfoRow label="Given Name" value={p0.givenName} />
                <InfoRow label="Family Name" value={p0.familyName} />
                <InfoRow label="Spec" value={p0.individualSpecification?.externalId} />
                <InfoRow label="Status" value={getCurrentStatus(p0.status)} />
                {(p0.contactMedium || []).map((cm: any, i: number) => {
                  const commId = cm.characteristic?.find((ch: any) => (ch.charSpecExternalId || '').toLowerCase().includes('communication'))?.value?.[0]?.value
                  const chType = cm.characteristic?.find((ch: any) => (ch.charSpecExternalId || '').toLowerCase().includes('channel'))?.value?.[0]?.value
                  return <InfoRow key={i} label={`Contact (${chType || cm.contactMediumSpecExternalId || i+1})`} value={commId || cm.externalId} />
                })}
              </Card>
            )}

            {/* Customer Card */}
            {cu && (
              <Card title={`Customer — ${cu.externalId || ''}`} icon="🏢" color="#3b82f6" rawData={cu}>
                <InfoRow label="External ID" value={cu.externalId} />
                <InfoRow label="Internal ID" value={cu.id} />
                <InfoRow label="Spec" value={cu.customerSpecification?.externalId} />
                <InfoRow label="Status" value={getCurrentStatus(cu.status)} />
                {(cu.characteristic || []).map((ch: any, i: number) => (
                  <InfoRow key={i} label={ch.charSpecExternalId || ch.name || `Char ${i+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                ))}
                {(cu.account || []).map((a: any, i: number) => (
                  <div key={i} style={{ marginTop: 8, padding: '6px 8px', background: '#eff6ff', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>💳 Billing Account {a.externalId}</div>
                    <InfoRow label="Internal ID" value={a.id} />
                    <InfoRow label="Spec" value={a.billingAccountSpecExternalId} />
                    <InfoRow label="Status" value={getCurrentStatus(a.status)} />
                    {a.customerBillCycleSpecification?.map((bcs: any, j: number) => (
                      <InfoRow key={j} label="Bill Cycle Spec" value={bcs.billCycleSpecExternalId} />
                    ))}
                  </div>
                ))}
              </Card>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div>

            {/* Contract Card */}
            {c && (
              <Card title={`Contract — ${c.externalId || ''}`} icon="📄" color="#8b5cf6" rawData={c}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <StatusBadge status={contractStatus} />
                  <span style={{ fontSize: 11, color: '#888' }}>{c.externalId}</span>
                </div>
                <InfoRow label="Internal ID" value={c.id} />
                <InfoRow label="Spec" value={c.contractSpecification?.externalId} />
                <InfoRow label="Valid From" value={fmtDate(c.validFor?.startDateTime)} />
                <InfoRow label="Valid To" value={fmtDate(c.validFor?.endDateTime)} />
                <InfoRow label="Home Time Zone" value={c.homeTimeZone?.[0]?.timeZone} />
                {(c.characteristic || []).map((ch: any, i: number) => (
                  <InfoRow key={i} label={ch.charSpecExternalId || `Char ${i+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                ))}
                {(c.resource || []).map((r: any, i: number) => (
                  <InfoRow key={i} label={`Resource (${r.resourceSpecificationExternalId || 'spec'})`} value={r.resourceNumber || r.externalId} />
                ))}

                {/* Contract Status Actions */}
                <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap' }}>
                  <button disabled={actionLoading || contractStatus === 'Active'} onClick={() => changeContractStatus('Active')} style={{ fontSize: 10, padding: '3px 8px' }}>Activate</button>
                  <button disabled={actionLoading || contractStatus === 'Halt'} onClick={() => changeContractStatus('Halt')} style={{ fontSize: 10, padding: '3px 8px' }}>Halt</button>
                  <button disabled={actionLoading || contractStatus === 'Terminated'} onClick={() => changeContractStatus('Terminated')} style={{ fontSize: 10, padding: '3px 8px', color: 'red' }}>Terminate</button>
                </div>

                {/* Products List */}
                {products.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>📦 Products ({products.length})</div>
                    {products.map((p: any, i: number) => {
                      const pStatus = getCurrentStatus(p.status) || ''
                      return (
                        <div key={i} style={{ border: '1px solid #e9d5ff', borderRadius: 6, padding: '8px 10px', marginBottom: 8, background: '#faf5ff' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{p.productOfferingExternalId || p.name || p.externalId}</span>
                            <StatusBadge status={pStatus} />
                          </div>
                          <InfoRow label="External ID" value={p.externalId} />
                          <InfoRow label="Internal ID" value={p.id} />
                          <InfoRow label="PO External ID" value={p.productOfferingExternalId} />
                          <InfoRow label="Valid From" value={fmtDate(p.validFor?.startDateTime)} />
                          <InfoRow label="Valid To" value={fmtDate(p.validFor?.endDateTime)} />
                          <InfoRow label="Billing Account" value={p.billingAccountReference?.externalId} />
                          {p.sharingProvider && (
                            <div style={{ marginTop: 6, padding: '6px 8px', background: '#fef9c3', borderRadius: 4, border: '1px solid #fde047' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#854d0e', marginBottom: 4 }}>🔗 Sharing Provider</div>
                              {(p.sharingProvider.billingAccount || []).map((ba: any, j: number) => (
                                <InfoRow key={`ba-${j}`} label="Provider BA" value={ba.externalId || ba.id} />
                              ))}
                              {(p.sharingProvider.consumerList || []).map((cl: any, j: number) => (
                                <div key={j} style={{ marginTop: 4, padding: '4px 6px', background: '#fff', borderRadius: 3, border: '1px solid #fde68a' }}>
                                  <InfoRow label="Consumer List" value={cl.externalId || cl.id} />
                                  <InfoRow label="Consumer Customer" value={cl.consumerCustomerExternalId} />
                                  <InfoRow label="Consumer Contract" value={cl.consumerContractExternalId} />
                                  <InfoRow label="Status" value={getCurrentStatus(cl.status)} />
                                </div>
                              ))}
                            </div>
                          )}
                          {p.sharingConsumer && (
                            <div style={{ marginTop: 6, padding: '6px 8px', background: '#ede9fe', borderRadius: 4, border: '1px solid #c4b5fd' }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#5b21b6', marginBottom: 4 }}>🔗 Sharing Consumer</div>
                              <InfoRow label="Provider Customer" value={p.sharingConsumer.providerCustomerExternalId} />
                              <InfoRow label="Provider Contract" value={p.sharingConsumer.providerContractExternalId} />
                              <InfoRow label="Provider Product" value={p.sharingConsumer.providerProductExternalId} />
                              <InfoRow label="Consumer List Entry" value={p.sharingConsumer.consumerListEntryExternalId} />
                            </div>
                          )}
                          {(p.characteristic || []).map((ch: any, j: number) => (
                            <InfoRow key={j} label={ch.charSpecExternalId || `Char ${j+1}`} value={ch.value?.[0]?.value ?? ch.value} />
                          ))}
                          {(() => {
                            const { products: prodBucketMap } = flattenBuckets(balance)
                            const buckets = prodBucketMap[p.externalId] || prodBucketMap[p.id] || []
                            return buckets.length > 0 ? (
                              <div style={{ marginTop: 6 }}>
                                <div style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600, marginBottom: 4 }}>Buckets</div>
                                {buckets.map((b: any, k: number) => <BucketCard key={k} bucket={b} productExtId={p.externalId} />)}
                              </div>
                            ) : null
                          })()}
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductActive')} style={{ fontSize: 10, padding: '2px 6px' }}>Activate</button>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductHalt')} style={{ fontSize: 10, padding: '2px 6px' }}>Halt</button>
                            <button disabled={actionLoading} onClick={() => changeProductStatus(p.externalId, 'ProductTerminated')} style={{ fontSize: 10, padding: '2px 6px', color: 'red' }}>Terminate</button>
                            <button disabled={actionLoading} onClick={() => modifyPopProduct === p.externalId ? setModifyPopProduct('') : loadProductPop(p.externalId, p.productOfferingExternalId)}
                              style={{ fontSize: 10, padding: '2px 6px', background: modifyPopProduct === p.externalId ? '#7c3aed' : '#f3e8ff', color: modifyPopProduct === p.externalId ? '#fff' : '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 3 }}>
                              {modifyPopProduct === p.externalId ? '✕ Close' : '✎ Modify POP'}
                            </button>
                          </div>
                          {/* Inline POP Editor */}
                          {modifyPopProduct === p.externalId && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: '#faf5ff', borderRadius: 6, border: '1px solid #e9d5ff' }}>
                              {modifyPopLoading && <div style={{ fontSize: 11, color: '#888' }}>Loading POP values...</div>}
                              {modifyPopData.length === 0 && !modifyPopLoading && <div style={{ fontSize: 11, color: '#888' }}>No personalizable POP values for this product</div>}
                              {modifyPopData.map((pop: any) => (
                                <div key={pop.popId} style={{ marginBottom: 6 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 3 }}>
                                    <input type="checkbox" checked={!!modifyPopSelected[pop.popId]}
                                      onChange={e => setModifyPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked }))} />
                                    {pop.popName || pop.popExternalId}
                                  </label>
                                  {modifyPopSelected[pop.popId] && (pop.rows || []).map((row: any) => (
                                    <div key={row.rowId} style={{ marginLeft: 14 }}>
                                      {(row.chars || []).map((c: any) => {
                                        const key = `${pop.popId}_${row.rowId}_${c.id}`
                                        const val = modifyPopValues[key] || { value: '', unit: '' }
                                        return (
                                          <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }}>
                                            <span style={{ fontSize: 10, minWidth: 80, color: '#555' }}>{c.name || c.externalId}</span>
                                            <input style={{ flex: 1, padding: '2px 4px', fontSize: 10 }} value={val.value}
                                              onChange={e => setModifyPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } }))} />
                                            {c.units && c.units.length > 0 ? (
                                              <select style={{ padding: '2px 4px', fontSize: 9 }} value={val.unit}
                                                onChange={e => setModifyPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } }))}>
                                                {c.units.map((u: string) => <option key={u} value={u}>{u}</option>)}
                                              </select>
                                            ) : val.unit ? <span style={{ fontSize: 9, color: '#888' }}>{val.unit}</span> : null}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  ))}
                                </div>
                              ))}
                              {modifyPopData.length > 0 && (
                                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                  <button onClick={saveProductPop} disabled={actionLoading}
                                    style={{ fontSize: 10, padding: '3px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                                    {actionLoading ? 'Saving...' : 'Save Changes'}
                                  </button>
                                  <button onClick={() => setModifyPopProduct('')}
                                    style={{ fontSize: 10, padding: '3px 10px', background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            )}


            {/* Balance Card */}
            {balance && (() => {
              const { billing } = flattenBuckets(balance)
              if (!billing.length) return null
              return (
                <Card title={`Balance — Billing (${billing.length} bucket${billing.length !== 1 ? 's' : ''})`} icon="💰" color="#f59e0b" rawData={balance}>
                  {billing.map((b: any, i: number) => <BucketCard key={i} bucket={b} />)}
                </Card>
              )
            })()}
          </div>
          {/* END RIGHT COLUMN */}
        </div>
      )}


      {/* === ACTIONS SECTION === */}
      {cu && (
        <div style={{ marginTop: 16, borderTop: '2px solid #eee', paddingTop: 14 }}>
          <SectionHeader title="⚡ Actions" />

          {/* Action buttons row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button onClick={() => { setShowAddContract(v => !v); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showAddContract ? '#1d4ed8' : '#f3f4f6', color: showAddContract ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              📄 Add Contract
            </button>
            <button onClick={() => { setShowAddProduct(v => !v); setShowAddContract(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showAddProduct ? '#7c3aed' : '#f3f4f6', color: showAddProduct ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              ➕ Add Product
            </button>
            <button onClick={() => { setShowResourceSwap(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showResourceSwap ? '#ea580c' : '#f3f4f6', color: showResourceSwap ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              🔄 Resource Swap
            </button>
            <button onClick={() => { setShowProductReplace(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showProductReplace ? '#9333ea' : '#f3f4f6', color: showProductReplace ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              🔀 Product Replace
            </button>
            <button onClick={() => { setShowTopUp(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showTopUp ? '#059669' : '#f3f4f6', color: showTopUp ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              💰 Balance Top-Up
            </button>
            <button onClick={() => { setShowBalanceAdj(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showBalanceAdj ? '#b45309' : '#f3f4f6', color: showBalanceAdj ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              💳 Balance Adjust
            </button>
            <button onClick={() => { setShowRecurring(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showRecurring ? '#0284c7' : '#f3f4f6', color: showRecurring ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              🔁 Recurring
            </button>
            <button onClick={() => { setShowProviderConsumer(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false); setShowUpdateEntity(false) }}
              style={{ background: showProviderConsumer ? '#dc2626' : '#f3f4f6', color: showProviderConsumer ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              🔗 Provider/Consumer
            </button>
            <button onClick={() => { setShowFinancial(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowUpdateEntity(false); if (!showFinancial) fetchFinancialData(financialTab) }}
              style={{ background: showFinancial ? '#0f766e' : '#f3f4f6', color: showFinancial ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              📊 Financial
            </button>
            <button onClick={() => { setShowUpdateEntity(v => !v); setShowAddContract(false); setShowAddProduct(false); setShowTopUp(false); setShowRecurring(false); setShowProviderConsumer(false); setShowResourceSwap(false); setShowBalanceAdj(false); setShowProductReplace(false); setShowFinancial(false) }}
              style={{ background: showUpdateEntity ? '#4338ca' : '#f3f4f6', color: showUpdateEntity ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontWeight: 500 }}>
              ✏️ Update Party/Customer
            </button>
          </div>

          {/* === ADD CONTRACT FORM === */}
          {showAddContract && (() => {
            const defaultContractExtId = newContractExtId || `CTR_${msisdnValue || searchValue || Date.now().toString(36)}`
            const defaultMsisdn = newContractMsisdn || msisdnValue || searchValue
            return (
            <div style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, background: '#eff6ff', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#1d4ed8' }}>📄 Add Contract to Customer: {custExtId}</h4>

              {/* Contract Spec & External ID */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Contract External ID *</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractExtId}
                    onChange={e => setNewContractExtId(e.target.value)} placeholder={defaultContractExtId}
                    onFocus={() => { if (!newContractExtId) setNewContractExtId(defaultContractExtId) }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Contract Specification</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractSpecExtId}
                    onChange={e => setNewContractSpecExtId(e.target.value)}>
                    <option value="">-- Select Spec --</option>
                    {contractSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                  </select>
                </div>
              </div>

              {/* Time Zone & Communication ID Spec */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Home Time Zone</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractTimeZone}
                    onChange={e => setNewContractTimeZone(e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Communication ID Spec</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractCommIdSpec}
                    onChange={e => setNewContractCommIdSpec(e.target.value)}>
                    <option value="">-- None --</option>
                    {commIdSpecs.map((s: any) => <option key={s.id || s.externalId} value={s.externalId}>{s.name || s.externalId}</option>)}
                  </select>
                </div>
              </div>

              {/* Resources: MSISDN & IMSI */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>MSISDN (Resource)</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractMsisdn}
                    onChange={e => setNewContractMsisdn(e.target.value)} placeholder={defaultMsisdn}
                    onFocus={() => { if (!newContractMsisdn) setNewContractMsisdn(defaultMsisdn) }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>IMSI (Optional)</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newContractImsi}
                    onChange={e => setNewContractImsi(e.target.value)} placeholder="14-15 digits" />
                </div>
              </div>

              {/* Product Offering for the contract */}
              <div style={{ marginBottom: 12, padding: '8px 10px', background: '#f0fdf4', borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>📦 Initial Product (Optional)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Product Offering</label>
                    <select style={{ width: '100%', padding: '4px 8px', fontSize: 11 }} value={newContractPO}
                      onChange={e => { setNewContractPO(e.target.value); setNewContractProductExtId(`${e.target.value}-${Date.now().toString(36)}`) }}>
                      <option value="">-- None --</option>
                      {poList.map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>Product External ID</label>
                    <input style={{ width: '100%', padding: '4px 8px', fontSize: 11 }} value={newContractProductExtId}
                      onChange={e => setNewContractProductExtId(e.target.value)} placeholder="Auto-generated" />
                  </div>
                </div>
                {newContractPO && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newContractBaRef} onChange={e => setNewContractBaRef(e.target.checked)} />
                      Link to Billing Account ({baExtId || 'none'})
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginTop: 4 }}>
                      <input type="checkbox" checked={newContractSharingProvider} onChange={e => setNewContractSharingProvider(e.target.checked)} />
                      Configure as Sharing Provider (technical product)
                    </label>
                  </div>
                )}
              </div>

              {/* Contract Characteristics */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Contract Characteristics</span>
                  <button onClick={() => setNewContractChars(prev => [...prev, { charSpecExternalId: '', value: '' }])}
                    style={{ fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}>+ Add</button>
                </div>
                {newContractChars.map((ch, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="charSpecExternalId"
                      value={ch.charSpecExternalId} onChange={e => {
                        const updated = [...newContractChars]; updated[i].charSpecExternalId = e.target.value; setNewContractChars(updated)
                      }} />
                    <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="value"
                      value={ch.value} onChange={e => {
                        const updated = [...newContractChars]; updated[i].value = e.target.value; setNewContractChars(updated)
                      }} />
                    <button onClick={() => setNewContractChars(prev => prev.filter((_, j) => j !== i))}
                      style={{ fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>

              {/* Submit */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={doCreateContract} disabled={actionLoading || !newContractExtId}
                  style={{ background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Creating...' : 'Create Contract'}
                </button>
                <button onClick={() => setShowAddContract(false)}
                  style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}

          {/* === ADD PRODUCT FORM === */}
          {showAddProduct && (
            <div style={{ border: '1px solid #e9d5ff', borderRadius: 8, padding: 16, background: '#faf5ff', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#7c3aed' }}>➕ Add Product to Contract</h4>

              {/* Product Offering Selection */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Product Offering *</label>
                <select style={{ width: '100%', padding: '6px 8px' }} value={newPO} onChange={e => setNewPO(e.target.value)}>
                  <option value="">-- Select Product Offering --</option>
                  {poList.map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                </select>
              </div>

              {newPO && (
                <>
                  {/* Basic Product Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Product External ID *</label>
                      <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newProductExtId}
                        onChange={e => setNewProductExtId(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Product Name</label>
                      <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={newProductName}
                        onChange={e => setNewProductName(e.target.value)} />
                    </div>
                  </div>

                  {/* Billing Account References */}
                  <div style={{ marginBottom: 12, padding: '8px 10px', background: '#eff6ff', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Billing Account References</div>
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>BA: {baExtId || '(none found)'}</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newProductBaRef} onChange={e => setNewProductBaRef(e.target.checked)} />
                      billingAccountReference
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 4 }}>
                      <input type="checkbox" checked={newProductBaRefRecurrence} onChange={e => setNewProductBaRefRecurrence(e.target.checked)} />
                      baRefForBillCycleAlignedRecurrence
                    </label>
                  </div>

                  {/* Product Status validFor */}
                  <div style={{ marginBottom: 12, padding: '8px 10px', background: '#fefce8', borderRadius: 6 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      <input type="checkbox" checked={newProductValidFor.enabled} onChange={e => setNewProductValidFor({...newProductValidFor, enabled: e.target.checked})} />
                      Product Status validFor
                    </label>
                    {newProductValidFor.enabled && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                        <label style={{ fontSize: 11 }}>Start DateTime<input type="datetime-local" style={{ width: '100%', padding: '4px 6px', fontSize: 11 }} value={newProductValidFor.startDateTime} onChange={e => setNewProductValidFor({...newProductValidFor, startDateTime: e.target.value})} /></label>
                        <label style={{ fontSize: 11 }}>End DateTime<input type="datetime-local" style={{ width: '100%', padding: '4px 6px', fontSize: 11 }} value={newProductValidFor.endDateTime} onChange={e => setNewProductValidFor({...newProductValidFor, endDateTime: e.target.value})} /></label>
                      </div>
                    )}
                  </div>

                  {/* Product Characteristics */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>Characteristics</span>
                      <button onClick={() => setNewProductChars(prev => [...prev, { charSpecExternalId: '', value: '' }])}
                        style={{ fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}>+ Custom</button>
                    </div>
                    {/* Spec-driven characteristics from PO */}
                    {(() => {
                      const po = poList.find((p: any) => p.externalId === newPO)
                      const chars = po?.characteristics || []
                      const personalizable = chars.filter((c: any) => c.valueRegulator === 'mustBePersonalized' || c.valueRegulator === 'canBePersonalized' || c.valueRegulator === 'selection')
                      return personalizable.length > 0 ? personalizable.map((c: any) => {
                        const charExtId = c.externalId || c.id
                        const idx = newProductChars.findIndex(ch => ch.charSpecExternalId === charExtId)
                        const val = idx >= 0 ? newProductChars[idx].value : ''
                        const possVals = c.possibleValues || []
                        const isMust = c.valueRegulator === 'mustBePersonalized'
                        const unit = c.unitOfMeasure || ''
                        return (
                          <div key={charExtId} style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                              <span style={{ fontSize: 11 }}>{c.name || charExtId}</span>
                              {isMust && <span style={{ fontSize: 9, background: '#c60', color: '#fff', borderRadius: 3, padding: '0 4px' }}>required</span>}
                              {!isMust && <span style={{ fontSize: 9, background: '#0a7', color: '#fff', borderRadius: 3, padding: '0 4px' }}>optional</span>}
                              {unit && <span style={{ fontSize: 9, color: '#888' }}>[{unit}]</span>}
                            </div>
                            {possVals.length > 0 ? (
                              <select style={{ width: '100%', padding: '3px 6px', fontSize: 11 }} value={val}
                                onChange={e => {
                                  const updated = [...newProductChars]
                                  if (idx >= 0) { updated[idx].value = e.target.value } else { updated.push({ charSpecExternalId: charExtId, value: e.target.value }) }
                                  setNewProductChars(updated)
                                }}>
                                <option value="">-- Select --</option>
                                {possVals.map((pv: any) => <option key={pv.value} value={pv.value}>{pv.name || pv.value}{pv.default ? ' ✓' : ''}</option>)}
                              </select>
                            ) : (
                              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder={c.defaultValue || `Enter ${c.name || charExtId}`}
                                  value={val} onChange={e => {
                                    const updated = [...newProductChars]
                                    if (idx >= 0) { updated[idx].value = e.target.value } else { updated.push({ charSpecExternalId: charExtId, value: e.target.value }) }
                                    setNewProductChars(updated)
                                  }} />
                                {unit && <span style={{ fontSize: 10, color: '#888' }}>{unit}</span>}
                              </div>
                            )}
                          </div>
                        )
                      }) : null
                    })()}
                    {/* Custom characteristics (manual add) */}
                    {newProductChars.filter(ch => {
                      const po = poList.find((p: any) => p.externalId === newPO)
                      const specChars = (po?.characteristics || []).map((c: any) => c.externalId || c.id)
                      return !specChars.includes(ch.charSpecExternalId)
                    }).map((ch, i) => (
                      <div key={`custom-${i}`} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="charSpecExternalId"
                          value={ch.charSpecExternalId} onChange={e => {
                            const allIdx = newProductChars.indexOf(ch)
                            const updated = [...newProductChars]; updated[allIdx].charSpecExternalId = e.target.value; setNewProductChars(updated)
                          }} />
                        <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="value"
                          value={ch.value} onChange={e => {
                            const allIdx = newProductChars.indexOf(ch)
                            const updated = [...newProductChars]; updated[allIdx].value = e.target.value; setNewProductChars(updated)
                          }} />
                        <button onClick={() => setNewProductChars(prev => prev.filter(p => p !== ch))}
                          style={{ fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Resources */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>Resources</span>
                      <button onClick={() => setNewProductResources(prev => [...prev, { specExternalId: '', resourceNumber: '', externalId: '' }])}
                        style={{ fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}>+ Add</button>
                    </div>
                    {newProductResources.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                        <select style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} value={r.specExternalId}
                          onChange={e => { const u = [...newProductResources]; u[i].specExternalId = e.target.value; setNewProductResources(u) }}>
                          <option value="">-- Resource Spec --</option>
                          {resourceSpecs.map((rs: any) => <option key={rs.id || rs.externalId} value={rs.externalId}>{rs.name || rs.externalId}</option>)}
                        </select>
                        <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="Resource Number (e.g. MSISDN)"
                          value={r.resourceNumber} onChange={e => { const u = [...newProductResources]; u[i].resourceNumber = e.target.value; setNewProductResources(u) }} />
                        <input style={{ width: 160, padding: '3px 6px', fontSize: 11 }} placeholder="External ID (auto)"
                          value={r.externalId} onChange={e => { const u = [...newProductResources]; u[i].externalId = e.target.value; setNewProductResources(u) }} />
                        <button onClick={() => setNewProductResources(prev => prev.filter((_, j) => j !== i))}
                          style={{ fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Sharing Configuration */}
                  <div style={{ marginBottom: 12, padding: '8px 10px', background: newProductSharingProvider ? '#fef9c3' : newProductSharingConsumer ? '#ede9fe' : '#f3f4f6', borderRadius: 6, border: `1px solid ${newProductSharingProvider ? '#fde047' : newProductSharingConsumer ? '#c4b5fd' : '#e5e7eb'}` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                      Sharing Configuration
                      {newProductSharingProvider && <span style={{ fontSize: 10, color: '#854d0e', marginLeft: 8, fontWeight: 400 }}>⚡ Auto-detected: Provider PO</span>}
                      {newProductSharingConsumer && <span style={{ fontSize: 10, color: '#5b21b6', marginLeft: 8, fontWeight: 400 }}>⚡ Auto-detected: Consumer PO</span>}
                      {!newProductSharingProvider && !newProductSharingConsumer && <span style={{ fontSize: 10, color: '#888', marginLeft: 8, fontWeight: 400 }}>Standard PO (no sharing)</span>}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newProductSharingProvider} onChange={e => { setNewProductSharingProvider(e.target.checked); if (e.target.checked) setNewProductSharingConsumer(false) }} />
                      This product is a Sharing Provider
                    </label>
                    {newProductSharingProvider && (
                      <div style={{ marginTop: 6, marginLeft: 20 }}>
                        <input style={{ width: '100%', padding: '3px 6px', fontSize: 11, marginBottom: 4 }} placeholder="Consumer List External ID"
                          value={newProductConsumerListExtId} onChange={e => setNewProductConsumerListExtId(e.target.value)} />
                      </div>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', marginTop: 6 }}>
                      <input type="checkbox" checked={newProductSharingConsumer} onChange={e => { setNewProductSharingConsumer(e.target.checked); if (e.target.checked) setNewProductSharingProvider(false) }} />
                      This product is a Sharing Consumer
                    </label>
                    {newProductSharingConsumer && (
                      <div style={{ marginTop: 6, marginLeft: 20, display: 'grid', gap: 4 }}>
                        <input style={{ width: '100%', padding: '3px 6px', fontSize: 11 }} placeholder="Provider Product External ID"
                          value={newProductProviderExtId} onChange={e => setNewProductProviderExtId(e.target.value)} />
                        <input style={{ width: '100%', padding: '3px 6px', fontSize: 11 }} placeholder="Consumer List Entry External ID"
                          value={newProductConsumerListExtId} onChange={e => setNewProductConsumerListExtId(e.target.value)} />
                      </div>
                    )}
                  </div>

                  {/* POP Price Personalization */}
                  {(popLoading || popPersonalization.length > 0) && (
                    <div style={{ marginBottom: 12, padding: '8px 10px', background: '#fdf4ff', borderRadius: 6, border: '1px solid #f0abfc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                          <input type="checkbox" checked={popEnabled} onChange={e => setPopEnabled(e.target.checked)} />
                          Personalize POP Prices ({popPersonalization.length} available)
                        </label>
                        {popLoading && <span style={{ fontSize: 10, color: '#999' }}>Loading...</span>}
                      </div>
                      {popEnabled && popPersonalization.map((pop: any) => (
                        <div key={pop.popId} style={{ border: '1px solid #e9d5ff', borderRadius: 4, padding: '6px 8px', marginBottom: 6, background: '#fff' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}>
                            <input type="checkbox" checked={!!popSelected[pop.popId]}
                              onChange={e => setPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked }))} />
                            {pop.popName || pop.popExternalId || pop.popId}
                          </label>
                          {popSelected[pop.popId] && (pop.rows || []).map((row: any) => (
                            <div key={row.rowId} style={{ marginLeft: 16, marginBottom: 4 }}>
                              {row.rowExternalId && <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Row: {row.rowExternalId}</div>}
                              {(row.chars || []).map((c: any) => {
                                const key = `${pop.popId}_${row.rowId}_${c.id}`
                                const val = popValues[key] || { value: '', unit: '' }
                                return (
                                  <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, minWidth: 100, color: '#555' }}>{c.name || c.externalId || c.id}</span>
                                    <input style={{ flex: 1, padding: '2px 4px', fontSize: 11 }} placeholder={c.defaultValue || 'value'}
                                      value={val.value} onChange={e => setPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } }))} />
                                    {c.units && c.units.length > 0 ? (
                                      <select style={{ padding: '2px 4px', fontSize: 10 }} value={val.unit}
                                        onChange={e => setPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } }))}>
                                        {c.units.map((u: string) => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    ) : val.unit ? (
                                      <span style={{ fontSize: 10, color: '#888' }}>{val.unit}</span>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Submit */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={purchaseProduct} disabled={actionLoading || !newProductExtId}
                      style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                      {actionLoading ? 'Adding...' : 'Add Product'}
                    </button>
                    <button onClick={() => setShowAddProduct(false)}
                      style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </>
              )}
            </div>
          )}


          {/* === BALANCE TOP-UP FORM === */}
          {showTopUp && (() => {
            const { billing } = flattenBuckets(balance)
            const knownUnits = [...new Set(billing.map((b: any) => b.unitOfMeasure).filter(Boolean))]
            return (
            <div style={{ border: '1px solid #a7f3d0', borderRadius: 8, padding: 16, background: '#ecfdf5', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#059669' }}>💰 Balance Top-Up</h4>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 10, padding: '6px 8px', background: '#fff', borderRadius: 4 }}>
                Customer: <b>{custExtId}</b> | Contract: <b>{contractExtId}</b> | MSISDN: <b>{msisdnValue || searchValue}</b>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Amount *</label>
                  <input type="number" style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={topUpAmount}
                    onChange={e => setTopUpAmount(e.target.value)} placeholder="e.g. 1000" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Unit of Measure</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={topUpUnit}
                    onChange={e => setTopUpUnit(e.target.value)}>
                    {knownUnits.length > 0
                      ? knownUnits.map(u => <option key={u} value={u}>{u}</option>)
                      : <>
                          <option value="euro">euro</option>
                          <option value="byte">byte</option>
                          <option value="second">second</option>
                          <option value="unit">unit</option>
                          <option value="SMS">SMS</option>
                          <option value="MMS">MMS</option>
                        </>
                    }
                  </select>
                  {knownUnits.length > 0 && <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>From loaded buckets</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Decimal Places</label>
                  <input type="number" style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={topUpDecimalPlaces}
                    onChange={e => setTopUpDecimalPlaces(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doBalanceTopUp} disabled={actionLoading || !topUpAmount}
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Processing...' : 'Top Up'}
                </button>
                <button onClick={() => setShowTopUp(false)}
                  style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}

          {/* === RUN RECURRING === */}
          {showRecurring && (
            <div style={{ border: '1px solid #bae6fd', borderRadius: 8, padding: 16, background: '#f0f9ff', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#0284c7' }}>🔄 Recurrence Enquiry</h4>
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 10px' }}>
                Query recurrence schedules for this subscriber. This fetches active recurring charges tied to MSISDN: <b>{msisdnValue || searchValue}</b>
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={doRunRecurring} disabled={actionLoading}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Querying...' : 'Query Recurrences'}
                </button>
                <button onClick={() => { setShowRecurring(false); setRecurringResult(null) }}
                  style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Close</button>
              </div>
              {recurringResult && (
                <pre style={{ fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(recurringResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* === PROVIDER / CONSUMER MANAGEMENT === */}
          {showProviderConsumer && (
            <div style={{ border: '1px solid #fecaca', borderRadius: 8, padding: 16, background: '#fef2f2', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#dc2626' }}>🔗 Sharing Provider / Consumer Management</h4>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Action</label>
                <select style={{ width: '100%', padding: '6px 8px', fontSize: 12 }} value={pcAction}
                  onChange={e => setPcAction(e.target.value as any)}>
                  <option value="viewConsumers">View Provider/Consumer Products</option>
                  <option value="addConsumer">Add Consumer to Provider</option>
                  <option value="removeConsumer">Remove Consumer from Provider</option>
                  <option value="setLimits">Set Sharing Limits</option>
                </select>
              </div>

              {pcAction === 'viewConsumers' && (
                <div>
                  <p style={{ fontSize: 11, color: '#666', margin: '0 0 10px' }}>
                    View sharing provider/consumer products for: <b>{custExtId}</b>
                  </p>
                </div>
              )}

              {(pcAction === 'addConsumer' || pcAction === 'removeConsumer') && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Provider Product External ID *</label>
                    <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={pcProviderProductExtId}
                      onChange={e => {
                        setPcProviderProductExtId(e.target.value)
                        setPcLinkedConsumerPO(null)
                        // Fetch provider PO spec to get linked consumer PO
                        const selProd = products.find((p: any) => p.externalId === e.target.value)
                        const poExtId = selProd?.productOfferingExternalId
                        if (poExtId) {
                          fetch(`${API}/spec/productOffering?externalId=${encodeURIComponent(poExtId)}`)
                            .then(r => r.ok ? r.json() : null)
                            .then((data: any) => {
                              const poSpec = Array.isArray(data) ? data[0] : data
                              // Find linked consumer PO from productOffering[type=PROVIDES_TO]
                              const linkedPOs = (poSpec?.productOffering || []).filter((po: any) => po.type === 'PROVIDES_TO')
                              if (linkedPOs.length > 0) {
                                const linked = linkedPOs[0]
                                setPcLinkedConsumerPO({ id: linked.id, externalId: linked.externalId, name: linked.name })
                                setPcConsumerPO(linked.externalId)
                                setPcConsumerProductExtId(`${linked.externalId}-${pcConsumerMsisdn || 'new'}`)
                                // Also fetch POP for the linked consumer PO
                                setPcPopLoading(true)
                                fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(linked.externalId)}`)
                                  .then(r => r.ok ? r.json() : [])
                                  .then((pops: any[]) => {
                                    setPcPopPersonalization(pops)
                                    const defaults: Record<string, { value: string; unit: string }> = {}
                                    const selectedAll: Record<string, boolean> = {}
                                    for (const pop of pops) {
                                      selectedAll[pop.popId] = true
                                      for (const row of (pop.rows || []))
                                        for (const c of (row.chars || []))
                                          defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
                                    }
                                    setPcPopValues(defaults)
                                    setPcPopSelected(selectedAll)
                                    if (pops.length > 0) setPcPopEnabled(true)
                                    setPcPopLoading(false)
                                  })
                                  .catch(() => setPcPopLoading(false))
                              }
                            })
                            .catch(() => {})
                        }
                      }}>
                      <option value="">-- Select provider product --</option>
                      {products.filter((p: any) => p.sharingProvider).map((p: any) => (
                        <option key={p.externalId} value={p.externalId}>{p.name || p.productOfferingExternalId} ({p.externalId})</option>
                      ))}
                      <option value="_custom">Enter manually...</option>
                    </select>
                    {pcProviderProductExtId === '_custom' && (
                      <input style={{ width: '100%', padding: '3px 6px', fontSize: 11, marginTop: 4 }} placeholder="Provider product external ID"
                        onChange={e => setPcProviderProductExtId(e.target.value)} />
                    )}
                  </div>

                  {pcAction === 'addConsumer' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Consumer MSISDN *</label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} value={pcConsumerMsisdn}
                            onChange={e => setPcConsumerMsisdn(e.target.value)} placeholder="Enter consumer MSISDN to lookup" />
                          <button onClick={() => lookupConsumerByMsisdn(pcConsumerMsisdn)} disabled={pcLookupLoading || !pcConsumerMsisdn}
                            style={{ fontSize: 11, padding: '4px 10px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' }}>
                            {pcLookupLoading ? '...' : '🔍 Lookup'}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Consumer Customer External ID {pcConsumerCustExtId ? '✓' : '*'}</label>
                        <input style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerCustExtId ? '#f0fff4' : '#fff' }} value={pcConsumerCustExtId}
                          onChange={e => setPcConsumerCustExtId(e.target.value)} placeholder="Auto-filled from lookup" />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Consumer Contract External ID {pcConsumerContractExtId ? '✓' : '*'}</label>
                        <input style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerContractExtId ? '#f0fff4' : '#fff' }} value={pcConsumerContractExtId}
                          onChange={e => setPcConsumerContractExtId(e.target.value)} placeholder="Auto-filled from lookup" />
                      </div>
                    </>
                  )}

                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Consumer Entry External ID {pcAction === 'removeConsumer' ? '*' : `${pcConsumerListExtId ? '✓' : '(auto: ConsumerEntry-<msisdn>)'}`}</label>
                    <input style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: pcConsumerListExtId ? '#f0fff4' : '#fff' }} value={pcConsumerListExtId}
                      onChange={e => setPcConsumerListExtId(e.target.value)} placeholder="ConsumerEntry-<consumerMsisdn>" />
                  </div>
                </div>
              )}

              {/* Consumer PO selection (only for addConsumer) */}
              {pcAction === 'addConsumer' && pcConsumerCustExtId && (
                <div style={{ padding: '8px 10px', background: '#f0fdf4', borderRadius: 6, border: '1px solid #bbf7d0', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>📦 Consumer Product Offering</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>
                        Consumer PO *
                        {pcLinkedConsumerPO && <span style={{ fontSize: 9, color: '#059669', marginLeft: 6 }}>⚡ Auto-detected from provider spec</span>}
                      </label>
                      {pcLinkedConsumerPO ? (
                        <div style={{ padding: '4px 8px', fontSize: 11, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4 }}>
                          {pcLinkedConsumerPO.name} ({pcLinkedConsumerPO.externalId})
                        </div>
                      ) : (
                      <select style={{ width: '100%', padding: '4px 8px', fontSize: 11 }} value={pcConsumerPO}
                        onChange={e => {
                          setPcConsumerPO(e.target.value)
                          setPcConsumerProductExtId(`${e.target.value}-${pcConsumerMsisdn}`)
                          setPcPopPersonalization([]); setPcPopValues({}); setPcPopEnabled(false); setPcPopSelected({}); setPcPopLoading(true)
                          if (e.target.value) {
                            fetch(`${API}/spec/productOffering/popPersonalization?externalId=${encodeURIComponent(e.target.value)}`)
                              .then(r => r.ok ? r.json() : [])
                              .then((pops: any[]) => {
                                setPcPopPersonalization(pops)
                                const defaults: Record<string, { value: string; unit: string }> = {}
                                const selectedAll: Record<string, boolean> = {}
                                for (const pop of pops) {
                                  selectedAll[pop.popId] = true
                                  for (const row of (pop.rows || []))
                                    for (const c of (row.chars || []))
                                      defaults[`${pop.popId}_${row.rowId}_${c.id}`] = { value: c.defaultValue || '', unit: c.defaultUnit || (c.units?.[0] || '') }
                                }
                                setPcPopValues(defaults)
                                setPcPopSelected(selectedAll)
                                if (pops.length > 0) setPcPopEnabled(true)
                                setPcPopLoading(false)
                              })
                              .catch(() => setPcPopLoading(false))
                          } else { setPcPopLoading(false) }
                        }}>
                        <option value="">-- Select Consumer PO --</option>
                        {poList.filter((p: any) => {
                          const types = (p.offeringTypes || []).map((t: string) => t.toUpperCase())
                          const name = (p.name || '').toLowerCase()
                          return types.includes('SHARING_CONSUMER') || types.includes('CONSUMER') || name.includes('consumer') || name.includes('sharing')
                        }).map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                        <option disabled>───── All POs ─────</option>
                        {poList.filter((p: any) => {
                          const types = (p.offeringTypes || []).map((t: string) => t.toUpperCase())
                          const name = (p.name || '').toLowerCase()
                          return !(types.includes('SHARING_CONSUMER') || types.includes('CONSUMER') || name.includes('consumer') || name.includes('sharing'))
                        }).map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                      </select>
                      )}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Product External ID</label>
                      <input style={{ width: '100%', padding: '4px 8px', fontSize: 11 }} value={pcConsumerProductExtId}
                        onChange={e => setPcConsumerProductExtId(e.target.value)} placeholder="Auto-generated" />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', marginBottom: 6 }}>
                    <input type="checkbox" checked={pcConsumerBaRef} onChange={e => setPcConsumerBaRef(e.target.checked)} />
                    Link to consumer's Billing Account
                  </label>

                  {/* POP Personalization for consumer limits */}
                  {(pcPopLoading || pcPopPersonalization.length > 0) && (
                    <div style={{ padding: '6px 8px', background: '#fff', borderRadius: 4, border: '1px solid #d1fae5' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', marginBottom: 4 }}>
                        <input type="checkbox" checked={pcPopEnabled} onChange={e => setPcPopEnabled(e.target.checked)} />
                        Set Consumer Limits ({pcPopPersonalization.length} POP{pcPopPersonalization.length !== 1 ? 's' : ''})
                        {pcPopLoading && <span style={{ fontSize: 10, color: '#999' }}>Loading...</span>}
                      </label>
                      {pcPopEnabled && pcPopPersonalization.map((pop: any) => (
                        <div key={pop.popId} style={{ border: '1px solid #e5e7eb', borderRadius: 4, padding: '4px 6px', marginBottom: 4 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', marginBottom: 3 }}>
                            <input type="checkbox" checked={!!pcPopSelected[pop.popId]}
                              onChange={e => setPcPopSelected(prev => ({ ...prev, [pop.popId]: e.target.checked }))} />
                            {pop.popName || pop.popExternalId || pop.popId}
                          </label>
                          {pcPopSelected[pop.popId] && (pop.rows || []).map((row: any) => (
                            <div key={row.rowId} style={{ marginLeft: 14 }}>
                              {(row.chars || []).map((c: any) => {
                                const key = `${pop.popId}_${row.rowId}_${c.id}`
                                const val = pcPopValues[key] || { value: '', unit: '' }
                                return (
                                  <div key={c.id} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, minWidth: 80, color: '#555' }}>{c.name || c.externalId || c.id}</span>
                                    <input style={{ flex: 1, padding: '2px 4px', fontSize: 10 }} placeholder={c.defaultValue || 'limit value'}
                                      value={val.value} onChange={e => setPcPopValues(prev => ({ ...prev, [key]: { ...val, value: e.target.value } }))} />
                                    {c.units && c.units.length > 0 ? (
                                      <select style={{ padding: '2px 4px', fontSize: 10 }} value={val.unit}
                                        onChange={e => setPcPopValues(prev => ({ ...prev, [key]: { ...val, unit: e.target.value } }))}>
                                        {c.units.map((u: string) => <option key={u} value={u}>{u}</option>)}
                                      </select>
                                    ) : val.unit ? <span style={{ fontSize: 9, color: '#888' }}>{val.unit}</span> : null}
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
              )}

              {/* Set Sharing Limits form */}
              {pcAction === 'setLimits' && (
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  {/* Common Limit (on provider) */}
                  <div style={{ padding: '8px 10px', background: '#fef9c3', borderRadius: 6, border: '1px solid #fde047' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Common Limit (all consumers collectively)</div>
                    <div style={{ fontSize: 10, color: '#666', marginBottom: 6 }}>Bucket: PBS_Data_Sharing_Limit_Common_CHT on provider product</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} value={limitCommonValue}
                        onChange={e => setLimitCommonValue(e.target.value)} placeholder="e.g. 5368709120 (5GB in bytes)" />
                      <select style={{ padding: '4px 8px', fontSize: 11 }} value={limitCommonUnit} onChange={e => setLimitCommonUnit(e.target.value)}>
                        <option value="byte">byte</option>
                        <option value="kilobyte">kilobyte</option>
                        <option value="megabyte">megabyte</option>
                        <option value="gigabyte">gigabyte</option>
                      </select>
                      <button onClick={() => doSetLimits('common')} disabled={actionLoading || !limitCommonValue}
                        style={{ fontSize: 10, padding: '4px 12px', background: '#b45309', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Set Common
                      </button>
                    </div>
                  </div>

                  {/* Individual Limit (on consumer) */}
                  <div style={{ padding: '8px 10px', background: '#ede9fe', borderRadius: 6, border: '1px solid #c4b5fd' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Individual Limit (per consumer)</div>
                    <div style={{ fontSize: 10, color: '#666', marginBottom: 6 }}>Bucket: PBS_Data_Sharing_Limit_CHT on consumer product</div>
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ display: 'block', fontSize: 10, marginBottom: 2 }}>Consumer MSISDN</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input style={{ flex: 1, padding: '4px 8px', fontSize: 11 }} value={limitConsumerMsisdn}
                          onChange={e => setLimitConsumerMsisdn(e.target.value)} placeholder="Consumer MSISDN" />
                        <button onClick={() => lookupConsumerForLimit(limitConsumerMsisdn)} disabled={!limitConsumerMsisdn}
                          style={{ fontSize: 10, padding: '3px 8px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' }}>🔍</button>
                      </div>
                      {limitConsumerProductExtId && (
                        <div style={{ fontSize: 10, color: '#059669', marginTop: 3 }}>
                          ✓ Product: {limitConsumerProductExtId}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }} value={limitIndividualValue}
                        onChange={e => setLimitIndividualValue(e.target.value)} placeholder="e.g. 1073741824 (1GB in bytes)" />
                      <select style={{ padding: '4px 8px', fontSize: 11 }} value={limitIndividualUnit} onChange={e => setLimitIndividualUnit(e.target.value)}>
                        <option value="byte">byte</option>
                        <option value="kilobyte">kilobyte</option>
                        <option value="megabyte">megabyte</option>
                        <option value="gigabyte">gigabyte</option>
                      </select>
                      <button onClick={() => doSetLimits('individual')} disabled={actionLoading || !limitIndividualValue || !limitConsumerProductExtId}
                        style={{ fontSize: 10, padding: '4px 12px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                        Set Individual
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <button onClick={doProviderConsumerAction} disabled={actionLoading || pcAction === 'setLimits'}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Processing...' : pcAction === 'viewConsumers' ? 'Fetch' : pcAction === 'addConsumer' ? 'Add Consumer' : pcAction === 'setLimits' ? 'Set Limits' : 'Remove Consumer'}
                </button>
                <button onClick={() => { setShowProviderConsumer(false); setPcResult(null) }}
                  style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Close</button>
              </div>

              {pcResult && (
                <pre style={{ fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(pcResult, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* === RESOURCE SWAP FORM === */}
          {showResourceSwap && (() => {
            // Extract current resources from contract
            const contractResources = (c?.resource || []).map((r: any) => ({
              number: r.resourceNumber,
              specExtId: r.resourceSpecificationExternalId || '',
              extId: r.externalId || '',
              specName: resourceSpecs.find((s: any) => s.externalId === r.resourceSpecificationExternalId)?.name || r.resourceSpecificationExternalId || 'Unknown'
            }))
            return (
            <div style={{ border: '1px solid #fed7aa', borderRadius: 8, padding: 16, background: '#fff7ed', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#ea580c' }}>🔄 Resource Swap (SIM/MSISDN Change)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Old Resource (from contract) *</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={rsOldResourceNumber}
                    onChange={e => {
                      setRsOldResourceNumber(e.target.value)
                      const res = contractResources.find((r: any) => r.number === e.target.value)
                      if (res) setRsResourceSpecExtId(res.specExtId)
                    }}>
                    <option value="">-- Select current resource --</option>
                    {contractResources.map((r: any, i: number) => <option key={i} value={r.number}>{r.number} ({r.specName})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>New Resource Number *</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={rsNewResourceNumber}
                    onChange={e => setRsNewResourceNumber(e.target.value)} placeholder="Enter new MSISDN/IMSI" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Resource Spec (auto-filled)</label>
                  <input style={{ width: '100%', padding: '4px 8px', fontSize: 12, background: '#f8f8f8' }} value={rsResourceSpecExtId} readOnly />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Product (optional scope)</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={rsProductExtId}
                    onChange={e => setRsProductExtId(e.target.value)}>
                    <option value="">-- All products --</option>
                    {products.map((p: any) => <option key={p.externalId} value={p.externalId}>{p.name || p.productOfferingExternalId} ({p.externalId})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>Customer: <b>{custExtId}</b> | Contract: <b>{contractExtId}</b></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doResourceSwap} disabled={actionLoading || !rsOldResourceNumber || !rsNewResourceNumber}
                  style={{ background: '#ea580c', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Swapping...' : 'Swap Resource'}
                </button>
                <button onClick={() => setShowResourceSwap(false)} style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}

          {/* === BALANCE ADJUSTMENT FORM === */}
          {showBalanceAdj && (() => {
            // Extract known bucket units from balance data
            const { billing, products: prodBuckets } = flattenBuckets(balance)
            const allBuckets = [...billing, ...Object.values(prodBuckets).flat()]
            const knownUnits = [...new Set(allBuckets.map((b: any) => b.unitOfMeasure).filter(Boolean))]
            return (
            <div style={{ border: '1px solid #fde68a', borderRadius: 8, padding: 16, background: '#fffbeb', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#b45309' }}>💳 Balance Adjustment (Credit / Debit)</h4>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 10, padding: '6px 8px', background: '#fff', borderRadius: 4 }}>
                Customer: <b>{custExtId}</b> | Contract: <b>{contractExtId}</b> | MSISDN: <b>{msisdnValue || searchValue}</b>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Adjustment Type</label>
                <select style={{ width: '100%', padding: '6px 8px', fontSize: 12 }} value={baAdjType}
                  onChange={e => setBaAdjType(e.target.value as any)}>
                  <option value="billing">Billing Account Adjustment ({baExtId || 'no BA'})</option>
                  <option value="product">Product Bucket Adjustment</option>
                </select>
              </div>
              {baAdjType === 'product' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Target Product</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={baAdjProductExtId}
                    onChange={e => setBaAdjProductExtId(e.target.value)}>
                    <option value="">-- Select product --</option>
                    {products.map((p: any) => <option key={p.externalId} value={p.externalId}>{p.name || p.productOfferingExternalId} ({p.externalId})</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Amount * (negative = debit)</label>
                  <input type="number" style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={baAdjAmount}
                    onChange={e => setBaAdjAmount(e.target.value)} placeholder="e.g. 500 or -200" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Unit of Measure</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={baAdjUnit}
                    onChange={e => setBaAdjUnit(e.target.value)}>
                    {knownUnits.length > 0
                      ? knownUnits.map(u => <option key={u} value={u}>{u}</option>)
                      : <>
                          <option value="euro">euro</option>
                          <option value="byte">byte</option>
                          <option value="second">second</option>
                          <option value="unit">unit</option>
                          <option value="SMS">SMS</option>
                          <option value="MMS">MMS</option>
                        </>
                    }
                  </select>
                  {knownUnits.length > 0 && <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>From loaded buckets</div>}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Decimal Places</label>
                  <input type="number" style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={baAdjDecimalPlaces}
                    onChange={e => setBaAdjDecimalPlaces(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Reason (optional)</label>
                <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={baAdjReason}
                  onChange={e => setBaAdjReason(e.target.value)} placeholder="e.g. Goodwill credit, Refund, Correction" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doBalanceAdjustment} disabled={actionLoading || !baAdjAmount}
                  style={{ background: '#b45309', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Adjusting...' : 'Apply Adjustment'}
                </button>
                <button onClick={() => setShowBalanceAdj(false)} style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}

          {/* === PRODUCT REPLACE FORM === */}
          {showProductReplace && (() => {
            const activeProducts = products.filter((p: any) => {
              const s = (getCurrentStatus(p.status) || '').toLowerCase()
              return !s.includes('terminat')
            })
            const selectedOld = activeProducts.find((p: any) => p.externalId === prOldProductExtId)
            return (
            <div style={{ border: '1px solid #e9d5ff', borderRadius: 8, padding: 16, background: '#faf5ff', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#9333ea' }}>🔀 Product Replace (Plan Change)</h4>
              <p style={{ fontSize: 11, color: '#666', margin: '0 0 12px' }}>Terminate old product and add a new one in a single contract update.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Old Product (to terminate) *</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={prOldProductExtId}
                    onChange={e => setPrOldProductExtId(e.target.value)}>
                    <option value="">-- Select current product --</option>
                    {activeProducts.map((p: any) => <option key={p.externalId} value={p.externalId}>{p.name || p.productOfferingExternalId} ({p.externalId})</option>)}
                  </select>
                  {selectedOld && (
                    <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>
                      Current PO: {selectedOld.productOfferingExternalId} | Status: {getCurrentStatus(selectedOld.status)}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>New Product Offering *</label>
                  <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={prNewPO}
                    onChange={e => { setPrNewPO(e.target.value); setPrNewProductExtId(`${e.target.value}-${Date.now().toString(36)}`) }}>
                    <option value="">-- Select new PO --</option>
                    {poList.map((p: any) => <option key={p.id || p.externalId} value={p.externalId}>{p.name} ({p.externalId})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>New Product External ID (auto-generated)</label>
                <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={prNewProductExtId}
                  onChange={e => setPrNewProductExtId(e.target.value)} />
              </div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 10 }}>BA Reference: <b>{baExtId}</b> | Contract: <b>{contractExtId}</b></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doProductReplace} disabled={actionLoading || !prOldProductExtId || !prNewPO}
                  style={{ background: '#9333ea', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Replacing...' : 'Replace Product'}
                </button>
                <button onClick={() => setShowProductReplace(false)} style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}

          {/* === FINANCIAL / BILLING VIEW === */}
          {showFinancial && (
            <div style={{ border: '1px solid #99f6e4', borderRadius: 8, padding: 16, background: '#f0fdfa', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#0f766e' }}>📊 Financial / Billing</h4>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['transactions', 'unbilled', 'bills', 'summary'] as const).map(t => (
                  <button key={t} onClick={() => { setFinancialTab(t); fetchFinancialData(t) }}
                    style={{ fontSize: 11, padding: '4px 10px', background: financialTab === t ? '#0f766e' : '#e0e0e0', color: financialTab === t ? '#fff' : '#333', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: financialTab === t ? 600 : 400 }}>
                    {t === 'transactions' ? 'Transactions' : t === 'unbilled' ? 'Unbilled Charges' : t === 'bills' ? 'Customer Bills' : 'Summary'}
                  </button>
                ))}
              </div>
              {financialLoading && <p style={{ fontSize: 12, color: '#666' }}>Loading...</p>}
              {financialData && (
                <pre style={{ fontSize: 11, background: '#fff', border: '1px solid #e0e0e0', borderRadius: 4, padding: 10, maxHeight: 400, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(financialData, null, 2)}
                </pre>
              )}
              <button onClick={() => { setShowFinancial(false); setFinancialData(null) }}
                style={{ marginTop: 10, background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>Close</button>
            </div>
          )}

          {/* === UPDATE PARTY / CUSTOMER FORM === */}
          {showUpdateEntity && (() => {
            const currentPartyStatus = getCurrentStatus(p0?.status) || ''
            const currentCustStatus = getCurrentStatus(cu?.status) || ''
            const currentPartyChars = p0?.characteristic || []
            const currentCustChars = cu?.characteristic || []
            return (
            <div style={{ border: '1px solid #c7d2fe', borderRadius: 8, padding: 16, background: '#eef2ff', marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px', color: '#4338ca' }}>✏️ Update Party / Customer</h4>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Target</label>
                <select style={{ width: '100%', padding: '6px 8px', fontSize: 12 }} value={updateTarget}
                  onChange={e => { setUpdateTarget(e.target.value as any); setUpdateChars([]) }}>
                  <option value="party">Party ({p0?.externalId || 'not loaded'}) — Current: {currentPartyStatus}</option>
                  <option value="customer">Customer ({cu?.externalId || 'not loaded'}) — Current: {currentCustStatus}</option>
                </select>
              </div>

              {updateTarget === 'party' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Given Name</label>
                      <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={updatePartyGivenName}
                        onChange={e => setUpdatePartyGivenName(e.target.value)} placeholder={p0?.givenName || 'Current value'} />
                      {p0?.givenName && <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>Current: {p0.givenName}</div>}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Family Name</label>
                      <input style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={updatePartyFamilyName}
                        onChange={e => setUpdatePartyFamilyName(e.target.value)} placeholder={p0?.familyName || 'Current value'} />
                      {p0?.familyName && <div style={{ fontSize: 10, color: '#999', marginTop: 1 }}>Current: {p0.familyName}</div>}
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Status</label>
                      <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={updatePartyStatus}
                        onChange={e => setUpdatePartyStatus(e.target.value)}>
                        <option value="">-- No change ({currentPartyStatus}) --</option>
                        <option value="PartyActive">PartyActive</option>
                        <option value="PartyInactive">PartyInactive</option>
                      </select>
                    </div>
                  </div>
                  {currentPartyChars.length > 0 && (
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 8, padding: '4px 8px', background: '#fff', borderRadius: 4 }}>
                      Current characteristics: {currentPartyChars.map((ch: any) => `${ch.charSpecExternalId}=${ch.value?.[0]?.value ?? ''}`).join(', ')}
                    </div>
                  )}
                </>
              )}

              {updateTarget === 'customer' && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Status</label>
                    <select style={{ width: '100%', padding: '4px 8px', fontSize: 12 }} value={updateCustStatus}
                      onChange={e => setUpdateCustStatus(e.target.value)}>
                      <option value="">-- No change ({currentCustStatus}) --</option>
                      <option value="CustomerActive">CustomerActive</option>
                      <option value="CustomerSuspended">CustomerSuspended</option>
                      <option value="CustomerInactive">CustomerInactive</option>
                    </select>
                  </div>
                  {currentCustChars.length > 0 && (
                    <div style={{ fontSize: 11, color: '#666', marginBottom: 8, padding: '4px 8px', background: '#fff', borderRadius: 4 }}>
                      Current characteristics: {currentCustChars.map((ch: any) => `${ch.charSpecExternalId || ch.name}=${ch.value?.[0]?.value ?? ''}`).join(', ')}
                    </div>
                  )}
                </>
              )}

              {/* Characteristics */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>Characteristics to Update</span>
                  <button onClick={() => setUpdateChars(prev => [...prev, { charSpecExternalId: '', value: '' }])}
                    style={{ fontSize: 10, padding: '1px 6px', background: '#eee', border: '1px solid #ccc', borderRadius: 3, cursor: 'pointer' }}>+ Add</button>
                  {(updateTarget === 'party' ? currentPartyChars : currentCustChars).length > 0 && (
                    <button onClick={() => setUpdateChars((updateTarget === 'party' ? currentPartyChars : currentCustChars).map((ch: any) => ({
                      charSpecExternalId: ch.charSpecExternalId || ch.name || '', value: ch.value?.[0]?.value ?? ''
                    })))}
                      style={{ fontSize: 10, padding: '1px 6px', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 3, cursor: 'pointer' }}>Load current</button>
                  )}
                </div>
                {updateChars.map((ch, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                    <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="charSpecExternalId"
                      value={ch.charSpecExternalId} onChange={e => {
                        const u = [...updateChars]; u[i].charSpecExternalId = e.target.value; setUpdateChars(u)
                      }} />
                    <input style={{ flex: 1, padding: '3px 6px', fontSize: 11 }} placeholder="value"
                      value={ch.value} onChange={e => {
                        const u = [...updateChars]; u[i].value = e.target.value; setUpdateChars(u)
                      }} />
                    <button onClick={() => setUpdateChars(prev => prev.filter((_, j) => j !== i))}
                      style={{ fontSize: 10, color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={doUpdateEntity} disabled={actionLoading}
                  style={{ background: '#4338ca', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 600 }}>
                  {actionLoading ? 'Updating...' : `Update ${updateTarget === 'party' ? 'Party' : 'Customer'}`}
                </button>
                <button onClick={() => setShowUpdateEntity(false)} style={{ background: '#f3f4f6', border: '1px solid #ddd', borderRadius: 6, padding: '8px 14px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
