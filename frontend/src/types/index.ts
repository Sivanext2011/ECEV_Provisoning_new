// Shared TypeScript types for ECEV Provisioning UI

export type TabId = 'wizard' | 'crm' | 'catalog' | 'operations' | 'po_publish' | 'settings' | 'logs'

export type FieldDef = {
  key: string
  label: string
  type?: 'text' | 'select' | 'number'
  options?: string[]
  placeholder?: string
  required?: boolean
}

export interface Spec {
  id: string
  externalId: string
  name: string
  characteristics?: CharSpec[]
  paymentContext?: string
  offeringTypes?: string[]
  resourceSpecifications?: ResourceSpec[]
}

export interface CharSpec {
  id: string
  externalId: string
  name: string
  valueRegulator?: string
  defaultValue?: string
  valueType?: string
  possibleValues?: PossibleValue[]
  valueFrom?: string | number
  valueTo?: string | number
  unitOfMeasure?: string
  required?: boolean
}

export interface PossibleValue {
  value?: string
  name?: string
  default?: boolean
}

export interface ResourceSpec {
  id: string
  externalId: string
  name?: string
}

export interface SpecsData {
  partySpecifications?: Spec[]
  customerSpecifications?: Spec[]
  billingAccountSpecifications?: Spec[]
  contractSpecifications?: Spec[]
  productOfferings?: Spec[]
  communicationIdentifierSpecifications?: Spec[]
  contactMediumSpecifications?: Spec[]
  billingCycleSpecifications?: Spec[]
  agreementSpecifications?: Spec[]
  partyRoleSpecifications?: Spec[]
  bucketTags?: Spec[]
}

export interface AdditionalPO {
  poExtId: string
  formVals: Record<string, string>
  baRef: boolean
  baRefRecurrence: boolean
}

export interface CmSpecEntry {
  specExtId: string
  charVals: Record<string, string>
  externalId: string
}

export interface ResourceEntry {
  specExtId: string
  specId?: string
  value: string
}

export interface PopRow {
  rowId: string
  rowExternalId: string
  chars: any[]
}

export interface PopEntry {
  popId: string
  popExternalId: string
  popName: string
  rows: PopRow[]
}

export interface PopValue {
  value: string
  unit: string
}

export interface Language {
  id: string
  name: string
}
