import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
const API = '/api/v1';
function StructuredForm({ formDef, values, onChange }) {
    const set = (k, v) => onChange({ ...values, [k]: v });
    return (_jsx("div", { style: { display: 'grid', gap: 6 }, children: formDef.map(f => (_jsxs("label", { style: { fontSize: 13 }, children: [f.label, f.required && _jsx("span", { style: { color: 'red' }, children: " *" }), f.type === 'select'
                    ? _jsxs("select", { style: { width: '100%' }, value: values[f.key] || '', onChange: e => set(f.key, e.target.value), children: [_jsx("option", { value: "", children: "-- Select --" }), (f.options || []).map(o => _jsx("option", { value: o, children: o }, o))] })
                    : _jsx("input", { type: f.type === 'number' ? 'number' : 'text', style: { width: '100%' }, placeholder: f.placeholder || f.label, value: values[f.key] ?? '', onChange: e => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value) })] }, f.key))) }));
}
function buildBody(op, v) {
    const amt = { number: Number(v.amount || 0), decimalPlaces: Number(v.decimalPlaces || 0) };
    const commId = v.communicationId ? { communicationId: v.communicationId, communicationIdType: v.communicationIdType || 'E.164' } : {};
    switch (op) {
        case 'balance_topup': return {
            ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            ...commId, amount: amt,
            ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }),
        };
        case 'balance_adj': return {
            ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            ...commId,
            billingAccountAdjustments: [{ billingAccountRef: { externalId: v.billingAccountExternalId },
                    billingAccountBuckets: [{ billingAccountBucketSpecExternalId: v.bucketSpecExternalId,
                            action: v.action || 'Relative', amount: amt, ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }), ...(v.reason && { reason: v.reason }) }] }],
        };
        case 'balance_billing_adj': return {
            ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            billingAccountAdjustments: [{ billingAccountRef: { externalId: v.billingAccountExternalId },
                    billingAccountBuckets: [{ billingAccountBucketSpecExternalId: v.bucketSpecExternalId,
                            action: v.action || 'Relative', amount: amt, ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }), ...(v.reason && { reason: v.reason }) }] }],
        };
        case 'balance_product_adj': return {
            ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            ...commId,
            productAdjustments: [{ productRef: { externalId: v.productExternalId },
                    productBuckets: [{ bucketSpecExternalId: v.bucketSpecExternalId,
                            action: v.action || 'Relative', amount: amt, ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }), ...(v.reason && { reason: v.reason }) }] }],
        };
        case 'balance_settlement_adj': return {
            ...(v.customerExternalId && { relatedParty: { externalId: v.customerExternalId, '@referredType': 'Customer' } }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            settlementAccountAdjustments: [{ settlementAccountRef: { externalId: v.settlementAccountExternalId },
                    settlementAccountBuckets: [{ bucketSpecExternalId: v.bucketSpecExternalId,
                            action: v.action || 'Relative', amount: amt, ...(v.unitOfMeasure && { unitOfMeasure: v.unitOfMeasure }), ...(v.reason && { reason: v.reason }) }] }],
        };
        case 'balance_reset_fraud': return { ...(v.customerExternalId && { customerExternalId: v.customerExternalId }), ...commId };
        case 'swap_resource': return {
            ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            resourceType: v.resourceType || 'E.164',
            fromResourceNumber: v.fromResourceNumber, toResourceNumber: v.toResourceNumber,
        };
        case 'replace_product': return {
            customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId,
            currentProductExternalId: v.currentProductExternalId, newProductOfferingExternalId: v.newProductOfferingExternalId,
        };
        case 'change_sub_status': return {
            ...(v.customerExternalId && { customerExternalId: v.customerExternalId }),
            ...(v.contractExternalId && { contractExternalId: v.contractExternalId }),
            ...commId, contract: { status: [{ status: v.status }] },
        };
        case 'terminate_party': return { _params: { partyExternalId: v.partyExternalId }, status: [{ status: 'Terminated' }] };
        case 'terminate_customer': return { _params: { customerExternalId: v.customerExternalId }, status: [{ status: 'CustomerTerminated' }] };
        case 'terminate_contract': return { _params: { customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId }, status: [{ status: 'Terminated' }], product: [{ status: [{ status: 'ProductTerminated' }] }] };
        case 'activate_contract': return { _params: { customerExternalId: v.customerExternalId, contractExternalId: v.contractExternalId }, status: [{ status: 'Active' }], product: [{ status: [{ status: 'ProductActive' }] }] };
        case 'modify_consumer_product': return {
            providerCustomerExternalId: v.providerCustomerExternalId, providerContractExternalId: v.providerContractExternalId,
            providerProductExternalId: v.providerProductExternalId, consumerCustomerExternalId: v.consumerCustomerExternalId,
            consumerContractExternalId: v.consumerContractExternalId, action: v.action || 'ADD',
        };
        default: return null;
    }
}
const FORM_DEFS = {
    balance_topup: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'communicationId', label: 'MSISDN' },
        { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164', 'E.212'] },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { key: 'unitOfMeasure', label: 'Unit of Measure', placeholder: 'e.g. MB, MIN, EUR' },
    ],
    balance_adj: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'communicationId', label: 'MSISDN' },
        { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164', 'E.212'] },
        { key: 'billingAccountExternalId', label: 'Billing Account External ID', required: true },
        { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
        { key: 'action', label: 'Action', type: 'select', options: ['Relative', 'Set'], required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { key: 'unitOfMeasure', label: 'Unit of Measure' },
        { key: 'reason', label: 'Reason' },
    ],
    balance_billing_adj: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'billingAccountExternalId', label: 'Billing Account External ID', required: true },
        { key: 'bucketSpecExternalId', label: 'Billing Account Bucket Spec External ID', required: true },
        { key: 'action', label: 'Action', type: 'select', options: ['Relative', 'Set'], required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { key: 'unitOfMeasure', label: 'Unit of Measure' },
        { key: 'reason', label: 'Reason' },
    ],
    balance_product_adj: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'communicationId', label: 'MSISDN' },
        { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164', 'E.212'] },
        { key: 'productExternalId', label: 'Product External ID', required: true },
        { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
        { key: 'action', label: 'Action', type: 'select', options: ['Relative', 'Set'], required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { key: 'unitOfMeasure', label: 'Unit of Measure' },
        { key: 'reason', label: 'Reason' },
    ],
    balance_settlement_adj: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'settlementAccountExternalId', label: 'Settlement Account External ID', required: true },
        { key: 'bucketSpecExternalId', label: 'Bucket Spec External ID', required: true },
        { key: 'action', label: 'Action', type: 'select', options: ['Relative', 'Set'], required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
        { key: 'decimalPlaces', label: 'Decimal Places', type: 'number' },
        { key: 'unitOfMeasure', label: 'Unit of Measure' },
        { key: 'reason', label: 'Reason' },
    ],
    balance_reset_fraud: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'communicationId', label: 'MSISDN' },
        { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164', 'E.212'] },
    ],
    swap_resource: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'resourceType', label: 'Resource Type', type: 'select', options: ['E.164', 'E.212'] },
        { key: 'fromResourceNumber', label: 'From Resource Number (current)', required: true },
        { key: 'toResourceNumber', label: 'To Resource Number (new)', required: true },
    ],
    replace_product: [
        { key: 'customerExternalId', label: 'Customer External ID', required: true },
        { key: 'contractExternalId', label: 'Contract External ID', required: true },
        { key: 'currentProductExternalId', label: 'Current Product External ID', required: true },
        { key: 'newProductOfferingExternalId', label: 'New Product Offering External ID', required: true },
    ],
    change_sub_status: [
        { key: 'customerExternalId', label: 'Customer External ID' },
        { key: 'contractExternalId', label: 'Contract External ID' },
        { key: 'communicationId', label: 'MSISDN' },
        { key: 'communicationIdType', label: 'Communication ID Type', type: 'select', options: ['E.164', 'E.212'] },
        { key: 'status', label: 'New Contract Status', type: 'select', options: ['Active', 'Halt', 'Terminated', 'Created'], required: true },
    ],
    terminate_party: [{ key: 'partyExternalId', label: 'Party External ID', required: true }],
    terminate_customer: [{ key: 'customerExternalId', label: 'Customer External ID', required: true }],
    terminate_contract: [
        { key: 'customerExternalId', label: 'Customer External ID', required: true },
        { key: 'contractExternalId', label: 'Contract External ID', required: true },
    ],
    activate_contract: [
        { key: 'customerExternalId', label: 'Customer External ID', required: true },
        { key: 'contractExternalId', label: 'Contract External ID', required: true },
    ],
    modify_consumer_product: [
        { key: 'providerCustomerExternalId', label: 'Provider Customer External ID', required: true },
        { key: 'providerContractExternalId', label: 'Provider Contract External ID', required: true },
        { key: 'providerProductExternalId', label: 'Provider Product External ID', required: true },
        { key: 'consumerCustomerExternalId', label: 'Consumer Customer External ID', required: true },
        { key: 'consumerContractExternalId', label: 'Consumer Contract External ID', required: true },
        { key: 'action', label: 'Action', type: 'select', options: ['ADD', 'REMOVE'], required: true },
    ],
};
const operations = {
    read_party_ext: { label: 'Get Party - ExternalId', method: 'GET', path: '/party', fields: ['externalId'], queryParams: ['externalId'] },
    read_party_id: { label: 'Get Party - Id', method: 'GET', path: '/party', fields: ['id'], queryParams: ['id'] },
    delete_party_ext: { label: 'Delete Party - ExternalId', method: 'DELETE', path: '/party/{externalId}', fields: ['externalId'] },
    delete_party_id: { label: 'Delete Party - Id', method: 'DELETE', path: '/party/{id}?by=id', fields: ['id'] },
    read_customer_ext: { label: 'Get Customer - ExternalId', method: 'GET', path: '/customer', fields: ['externalId'], queryParams: ['externalId'] },
    read_customer_id: { label: 'Get Customer - Id', method: 'GET', path: '/customer', fields: ['id'], queryParams: ['id'] },
    read_customer_msisdn: { label: 'Get Customer - MSISDN', method: 'GET', path: '/customer', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_customer_ext: { label: 'Delete Customer - ExternalId', method: 'DELETE', path: '/customer/{externalId}', fields: ['externalId'] },
    read_contract_ext: { label: 'Get Contract - ExternalId', method: 'GET', path: '/contract', fields: ['customerExternalId', 'contractExternalId'], queryParams: ['customerExternalId', 'contractExternalId'] },
    read_contract_id: { label: 'Get Contract - Id', method: 'GET', path: '/contract', fields: ['customerId', 'contractId'], queryParams: ['customerId', 'contractId'] },
    read_contract_msisdn: { label: 'Get Contract - MSISDN', method: 'GET', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    delete_contract_ext: { label: 'Delete Contract - ExternalId', method: 'DELETE', path: '/contract', fields: ['customerExternalId', 'contractExternalId'], queryParams: ['customerExternalId', 'contractExternalId'] },
    delete_contract_msisdn: { label: 'Delete Contract - MSISDN', method: 'DELETE', path: '/contract', fields: ['msisdn'], queryParams: ['msisdn'] },
    balance_customer: { label: 'Balance Enquiry - Customer', method: 'GET', path: '/balance', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    balance_msisdn: { label: 'Balance Enquiry - MSISDN', method: 'GET', path: '/balance', fields: ['msisdn'], queryParams: ['msisdn'] },
    balance_adj: { label: 'Balance Adjustment', method: 'POST', path: '/balance/adjust', fields: [] },
    swap_resource: { label: 'Swap Logical Resource (MSISDN/IMSI)', method: 'POST', path: '/resource/swap', fields: [] },
    replace_product: { label: 'Replace Product', method: 'POST', path: '/product/replace', fields: [] },
    eligible_consumers: { label: 'Get Eligible Consumers', method: 'GET', path: '/sharing/eligible-consumers', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    recurrence: { label: 'Recurrence Enquiry - MSISDN', method: 'GET', path: '/recurrence', fields: ['communicationId'], queryParams: ['communicationId'] },
    terminate_party: { label: 'Terminate Party Cascade', method: 'POST', path: '/execute/terminate_party_cascade', fields: [] },
    terminate_customer: { label: 'Terminate Customer Cascade', method: 'POST', path: '/execute/terminate_customer_cascade', fields: [] },
    terminate_contract: { label: 'Terminate Contract Cascade', method: 'POST', path: '/execute/terminate_contract_cascade', fields: [] },
    activate_contract: { label: 'Activate Contract', method: 'POST', path: '/execute/activate_contract', fields: ['customerExternalId', 'contractExternalId'] },
    read_customer_imsi: { label: 'Get Customer - IMSI', method: 'GET', path: '/execute/get_customer_by_imsi', fields: ['imsi'] },
    read_contract_imsi: { label: 'Get Contract - IMSI', method: 'GET', path: '/execute/get_contract_by_imsi', fields: ['imsi'] },
    read_contract_msisdn_product: { label: 'Get Contract - MSISDN + Product', method: 'GET', path: '/execute/get_contract_by_msisdn_product', fields: ['msisdn', 'productExternalId'] },
    balance_imsi: { label: 'Balance Enquiry - IMSI', method: 'GET', path: '/execute/balance_enquiry_imsi', fields: ['imsi'] },
    balance_contract: { label: 'Balance Enquiry - Contract', method: 'GET', path: '/execute/balance_enquiry_contract', fields: ['customerExternalId', 'contractExternalId'] },
    balance_bucket: { label: 'Balance Enquiry - MSISDN + Bucket', method: 'GET', path: '/execute/balance_enquiry_msisdn_bucket', fields: ['msisdn', 'bucketSpecExternalId'] },
    delete_user_ext: { label: 'Delete User - ExternalId', method: 'GET', path: '/execute/delete_user_by_external_id', fields: ['userExternalId'] },
    get_user_id: { label: 'Get User - Id', method: 'GET', path: '/execute/get_user_by_id', fields: ['userId'] },
    cpm_translate_msisdn: { label: 'CPM ID Translation - MSISDN', method: 'GET', path: '/execute/cpm_id_translation_msisdn', fields: ['msisdn'] },
    cpm_translate_imsi: { label: 'CPM ID Translation - IMSI', method: 'GET', path: '/execute/cpm_id_translation_imsi', fields: ['imsi'] },
    cpm_comm_identity: { label: 'CPM Communication Identity', method: 'GET', path: '/execute/cpm_communication_identity', fields: ['msisdn'] },
    mass_create_job: { label: 'Mass Device - Create Job', method: 'POST', path: '/execute/mass_device_create_job', fields: [] },
    mass_start_job: { label: 'Mass Device - Start Job', method: 'POST', path: '/execute/mass_device_start_job', fields: ['jobId'] },
    mass_stop_job: { label: 'Mass Device - Stop Job', method: 'POST', path: '/execute/mass_device_stop_job', fields: ['jobId'] },
    mass_restart_job: { label: 'Mass Device - Restart Job', method: 'POST', path: '/execute/mass_device_restart_job', fields: ['jobId'] },
    mass_delete_job: { label: 'Mass Device - Delete Job', method: 'DELETE', path: '/execute/mass_device_delete_job', fields: ['jobId'] },
    mass_job_status: { label: 'Mass Device - Job Status', method: 'GET', path: '/execute/mass_device_job_status', fields: ['jobId'] },
    mass_job_result: { label: 'Mass Device - Job Result', method: 'GET', path: '/execute/mass_device_job_result', fields: ['jobId'] },
    mass_list_jobs: { label: 'Mass Device - List Jobs', method: 'GET', path: '/execute/mass_device_list_jobs', fields: [] },
    rmca_list_po: { label: 'RMCA - List Product Offerings', method: 'GET', path: '/execute/rmca_list_product_offerings', fields: [] },
    rmca_read_po: { label: 'RMCA - Read Product Offering', method: 'GET', path: '/execute/rmca_read_product_offering', fields: ['specExternalId'] },
    rmca_create_po: { label: 'RMCA - Create Product Offering', method: 'POST', path: '/execute/rmca_create_product_offering', fields: [] },
    rmca_read_party_spec: { label: 'RMCA - Read Party Spec', method: 'GET', path: '/execute/rmca_entity_read_party_spec', fields: ['specExternalId'] },
    rmca_read_contract_spec: { label: 'RMCA - Read Contract Spec', method: 'GET', path: '/execute/rmca_entity_read_contract_spec', fields: ['specExternalId'] },
    rmca_read_cms: { label: 'RMCA - Read Contact Medium Spec', method: 'GET', path: '/execute/rmca_entity_read_contact_medium_spec', fields: ['specExternalId'] },
    spec_contract: { label: 'Read Contract Specification', method: 'GET', path: '/spec/contract', fields: ['externalId'], queryParams: ['externalId'] },
    spec_product: { label: 'Read Product Specification', method: 'GET', path: '/spec/product', fields: ['externalId'], queryParams: ['externalId'] },
    spec_offering: { label: 'Read Product Offering', method: 'GET', path: '/spec/productOffering', fields: ['externalId'], queryParams: ['externalId'] },
    spec_cfss: { label: 'Read Customer Facing Service Spec', method: 'GET', path: '/spec/customerFacingService', fields: ['externalId'], queryParams: ['externalId'] },
    spec_bucket: { label: 'Read Bucket Specification', method: 'GET', path: '/spec/bucket', fields: ['externalId'], queryParams: ['externalId'] },
    spec_billing: { label: 'Read Billing Account Spec', method: 'GET', path: '/spec/billing_account', fields: ['externalId'], queryParams: ['externalId'] },
    get_settlement_account: { label: 'Get Settlement Account', method: 'GET', path: '/account/settlement', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    create_settlement_account: { label: 'Create Settlement Account', method: 'POST', path: '/account/settlement', fields: [] },
    get_agreement: { label: 'Get Agreement', method: 'GET', path: '/agreement', fields: ['partyExternalId', 'agreementExternalId'], queryParams: ['partyExternalId', 'agreementExternalId'] },
    create_agreement: { label: 'Create Agreement', method: 'POST', path: '/agreement/partyExternalId/{partyExternalId}', fields: ['partyExternalId'] },
    update_agreement: { label: 'Update Agreement', method: 'PATCH', path: '/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}', fields: ['partyExternalId', 'agreementExternalId'] },
    delete_agreement: { label: 'Delete Agreement', method: 'DELETE', path: '/agreement/partyExternalId/{partyExternalId}/{agreementExternalId}', fields: ['partyExternalId', 'agreementExternalId'] },
    balance_topup_details: { label: 'Balance TopUp Details', method: 'GET', path: '/balance/topupDetails', fields: ['communicationId'], queryParams: ['communicationId'] },
    balance_topup: { label: 'Balance TopUp', method: 'POST', path: '/balance/topup', fields: [] },
    balance_reset_fraud: { label: 'Reset Balance Fraud Counter', method: 'POST', path: '/balance/resetFraudCounter', fields: [] },
    balance_billing_adj: { label: 'Billing Account Bucket Adjustment', method: 'POST', path: '/balance/billingAccountAdjustment', fields: [] },
    balance_product_adj: { label: 'Product Bucket Adjustment', method: 'POST', path: '/balance/productAdjustment', fields: [] },
    balance_settlement_adj: { label: 'Settlement Account Bucket Adjustment', method: 'POST', path: '/balance/settlementAccountAdjustment', fields: [] },
    get_comm_identity: { label: 'Get Communication Identity', method: 'GET', path: '/communicationIdentity', fields: ['communicationId'], queryParams: ['communicationId'] },
    get_customer_bill: { label: 'Get Customer Bill', method: 'GET', path: '/bill/customerBill', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_applied_rate: { label: 'Get Applied Billing Rate', method: 'GET', path: '/bill/appliedBillingRate', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_contract_view: { label: 'Get Bill Contract View', method: 'GET', path: '/bill/contractView', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_on_demand: { label: 'Get Bill On Demand', method: 'GET', path: '/bill/onDemand', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_bill_summary: { label: 'Get Bill Summary', method: 'GET', path: '/bill/summary', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_unbilled_charge: { label: 'Get Unbilled Charge', method: 'GET', path: '/bill/unbilledCharge', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_financial_account: { label: 'Get Financial Customer Account', method: 'GET', path: '/financial/customerAccount', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_financial_header: { label: 'Get Financial Header', method: 'GET', path: '/financial/header', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_financial_tx: { label: 'Get Financial Transaction', method: 'GET', path: '/financial/transaction', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    get_payment_instruction: { label: 'Get Payment Instruction', method: 'GET', path: '/financial/paymentInstruction', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    create_financial_task: { label: 'Create Financial Task', method: 'POST', path: '/financial/task', fields: [] },
    get_org_party: { label: 'Get Organization Party', method: 'GET', path: '/organizationParty', fields: ['externalId'], queryParams: ['externalId'] },
    create_org_party: { label: 'Create Organization Party', method: 'POST', path: '/organizationParty', fields: [] },
    update_org_party: { label: 'Update Organization Party', method: 'PATCH', path: '/organizationParty/externalId/{organizationPartyExternalId}', fields: ['organizationPartyExternalId'] },
    get_partner_contract: { label: 'Get Partner Contract', method: 'GET', path: '/partnerSettlement/contract', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    create_partner_contract: { label: 'Create Partner Contract', method: 'POST', path: '/partnerSettlement/partyRoleExternalId/{partyRoleExternalId}/contract', fields: ['partyRoleExternalId'] },
    get_involvement_group: { label: 'Get Party Role Involvement Group', method: 'GET', path: '/partnerSettlement/involvementGroup', fields: ['partyRoleInvolvementGroupRef'], queryParams: ['partyRoleInvolvementGroupRef'] },
    create_involvement_group: { label: 'Create Party Role Involvement Group', method: 'POST', path: '/partnerSettlement/involvementGroup', fields: [] },
    get_settlement_note: { label: 'Get Partner Settlement Note', method: 'GET', path: '/partnerSettling/note', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    get_unsettled_charge: { label: 'Get Unsettled Charge', method: 'GET', path: '/partnerSettling/unsettledCharge', fields: ['partyRoleExternalId'], queryParams: ['partyRoleExternalId'] },
    create_settlement_note_demand: { label: 'Create Settlement Note On Demand', method: 'POST', path: '/partnerSettling/noteOnDemand', fields: [] },
    send_message: { label: 'Send Communication Message', method: 'POST', path: '/communication/send', fields: [] },
    get_party_role: { label: 'Get Party Role', method: 'GET', path: '/partyRole', fields: ['externalId'], queryParams: ['externalId'] },
    create_party_role: { label: 'Create Party Role', method: 'POST', path: '/partyRole', fields: [] },
    update_party_role: { label: 'Update Party Role', method: 'PATCH', path: '/partyRole/externalId/{partyRoleExternalId}', fields: ['partyRoleExternalId'] },
    catalog_get_po: { label: 'Catalog - Get Product Offering', method: 'GET', path: '/catalog/productOffering', fields: ['externalId'], queryParams: ['externalId'] },
    catalog_create_po: { label: 'Catalog - Create Product Offering', method: 'POST', path: '/catalog/productOffering', fields: [] },
    catalog_update_po: { label: 'Catalog - Update Product Offering', method: 'PATCH', path: '/catalog/productOffering/externalId/{externalId}/version/{version}', fields: ['externalId', 'version'] },
    purchase_rate_deduct: { label: 'Purchase - Rate and Deduct', method: 'POST', path: '/purchase/rateAndDeduct', fields: [] },
    purchase_rate_reserve: { label: 'Purchase - Rate and Reserve', method: 'POST', path: '/purchase/rateAndReserve', fields: [] },
    purchase_cancel_res: { label: 'Purchase - Cancel Reservation', method: 'POST', path: '/purchase/cancelReservation', fields: [] },
    purchase_basket_deduct: { label: 'Purchase - Basket Rate and Deduct', method: 'POST', path: '/purchase/basketRateAndDeduct', fields: [] },
    purchase_basket_reserve: { label: 'Purchase - Basket Rate and Reserve', method: 'POST', path: '/purchase/basketRateAndReserve', fields: [] },
    purchase_basket_execute: { label: 'Purchase - Basket Rate and Execute', method: 'POST', path: '/purchase/basketRateAndExecute', fields: [] },
    purchase_basket_advice: { label: 'Purchase - Basket Rate and Advice', method: 'POST', path: '/purchase/basketRateAndAdvice', fields: [] },
    purchase_cancel_basket: { label: 'Purchase - Cancel Basket Reservation', method: 'POST', path: '/purchase/cancelBasketReservation', fields: [] },
    create_policy_session: { label: 'Create Policy Session', method: 'POST', path: '/session/createPolicySession', fields: [] },
    move_charging_session: { label: 'Move Charging Session', method: 'POST', path: '/session/moveChargingSession', fields: [] },
    spec_individual: { label: 'Spec - Individual', method: 'GET', path: '/spec/individual', fields: ['externalId'], queryParams: ['externalId'] },
    spec_customer: { label: 'Spec - Customer', method: 'GET', path: '/spec/customer', fields: ['externalId'], queryParams: ['externalId'] },
    spec_contact_medium: { label: 'Spec - Contact Medium', method: 'GET', path: '/spec/contactMedium', fields: ['externalId'], queryParams: ['externalId'] },
    spec_billing_cycle: { label: 'Spec - Billing Cycle', method: 'GET', path: '/spec/billingCycle', fields: ['externalId'], queryParams: ['externalId'] },
    spec_party_role: { label: 'Spec - Party Role', method: 'GET', path: '/spec/partyRole', fields: ['externalId'], queryParams: ['externalId'] },
    spec_schedule: { label: 'Spec - Schedule Definition', method: 'GET', path: '/spec/scheduleDefinition', fields: ['externalId'], queryParams: ['externalId'] },
    spec_sharing_provider: { label: 'Spec - Sharing Provider', method: 'GET', path: '/spec/sharingProvider', fields: ['externalId'], queryParams: ['externalId'] },
    spec_tag: { label: 'Spec - Tag', method: 'GET', path: '/spec/tag', fields: ['externalId'], queryParams: ['externalId'] },
    spec_agreement_spec: { label: 'Spec - Agreement', method: 'GET', path: '/spec/agreement', fields: ['externalId'], queryParams: ['externalId'] },
    spec_generic_setting: { label: 'Spec - Generic Business Setting', method: 'GET', path: '/spec/genericBusinessSetting', fields: ['externalId'], queryParams: ['externalId'] },
    get_consumer_product: { label: 'Get Consumer Product', method: 'GET', path: '/subscription/consumerProduct', fields: ['communicationId'], queryParams: ['communicationId'] },
    get_inherited_contracts: { label: 'Get Inherited Contract List', method: 'GET', path: '/subscription/inheritedContractList', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    change_sub_status: { label: 'Change Subscription Status', method: 'POST', path: '/subscription/changeStatus', fields: [] },
    modify_consumer_product: { label: 'Modify Consumer Product', method: 'POST', path: '/subscription/consumerProduct/modify', fields: [] },
    modify_provider_product: { label: 'Modify Provider Product', method: 'PATCH', path: '/subscription/providerProduct/modify', fields: [] },
    create_entity_adj: { label: 'Test - Create Entity Adjustment', method: 'POST', path: '/test/entityAdjustment/externalId/{customerExternalId}', fields: ['customerExternalId'] },
    get_entity_adj: { label: 'Test - Get Entity Adjustment', method: 'GET', path: '/test/entityAdjustment', fields: ['customerExternalId'], queryParams: ['customerExternalId'] },
    update_user: { label: 'Update User', method: 'PATCH', path: '/user/externalId/{userExternalId}', fields: ['userExternalId'] },
};
const CATEGORIES = [
    { key: 'party', label: 'Party', ops: ['read_party_ext', 'read_party_id', 'delete_party_ext', 'delete_party_id'] },
    { key: 'customer', label: 'Customer', ops: ['read_customer_ext', 'read_customer_id', 'read_customer_msisdn', 'read_customer_imsi', 'delete_customer_ext'] },
    { key: 'contract', label: 'Contract', ops: ['read_contract_ext', 'read_contract_id', 'read_contract_msisdn', 'read_contract_imsi', 'read_contract_msisdn_product', 'delete_contract_ext', 'delete_contract_msisdn'] },
    { key: 'balance', label: 'Balance', ops: ['balance_customer', 'balance_msisdn', 'balance_imsi', 'balance_contract', 'balance_bucket', 'balance_topup', 'balance_topup_details', 'balance_adj', 'balance_billing_adj', 'balance_product_adj', 'balance_settlement_adj', 'balance_reset_fraud'] },
    { key: 'product', label: 'Product', ops: ['replace_product', 'swap_resource', 'get_consumer_product', 'get_inherited_contracts', 'modify_consumer_product', 'modify_provider_product', 'eligible_consumers', 'recurrence'] },
    { key: 'lifecycle', label: 'Lifecycle', ops: ['terminate_party', 'terminate_customer', 'terminate_contract', 'activate_contract', 'change_sub_status'] },
    { key: 'financial', label: 'Financial', ops: ['get_customer_bill', 'get_bill_applied_rate', 'get_bill_contract_view', 'get_bill_on_demand', 'get_bill_summary', 'get_unbilled_charge', 'get_financial_account', 'get_financial_header', 'get_financial_tx', 'get_payment_instruction', 'create_financial_task', 'get_settlement_account', 'create_settlement_account', 'get_agreement', 'create_agreement', 'update_agreement', 'delete_agreement'] },
    { key: 'catalog', label: 'Catalog/Spec', ops: ['spec_contract', 'spec_product', 'spec_offering', 'spec_cfss', 'spec_bucket', 'spec_billing', 'spec_individual', 'spec_customer', 'spec_contact_medium', 'spec_billing_cycle', 'spec_party_role', 'spec_schedule', 'spec_sharing_provider', 'spec_tag', 'spec_agreement_spec', 'spec_generic_setting', 'catalog_get_po', 'catalog_create_po', 'catalog_update_po', 'rmca_list_po', 'rmca_read_po', 'rmca_create_po', 'rmca_read_party_spec', 'rmca_read_contract_spec', 'rmca_read_cms'] },
    { key: 'partner', label: 'Partner', ops: ['get_partner_contract', 'create_partner_contract', 'get_involvement_group', 'create_involvement_group', 'get_settlement_note', 'get_unsettled_charge', 'create_settlement_note_demand', 'get_party_role', 'create_party_role', 'update_party_role'] },
    { key: 'purchase', label: 'Purchase', ops: ['purchase_rate_deduct', 'purchase_rate_reserve', 'purchase_cancel_res', 'purchase_basket_deduct', 'purchase_basket_reserve', 'purchase_basket_execute', 'purchase_basket_advice', 'purchase_cancel_basket'] },
    { key: 'other', label: 'Other', ops: ['create_policy_session', 'move_charging_session', 'mass_create_job', 'mass_start_job', 'mass_stop_job', 'mass_restart_job', 'mass_delete_job', 'mass_job_status', 'mass_job_result', 'mass_list_jobs', 'cpm_translate_msisdn', 'cpm_translate_imsi', 'cpm_comm_identity', 'get_comm_identity', 'send_message', 'get_org_party', 'create_org_party', 'update_org_party', 'delete_user_ext', 'get_user_id', 'update_user', 'create_entity_adj', 'get_entity_adj'] },
];
function getMethodColor(method) {
    switch (method) {
        case 'GET': return { bg: '#e8f5e9', text: '#2e7d32' };
        case 'POST': return { bg: '#e3f2fd', text: '#1565c0' };
        case 'DELETE': return { bg: '#fce4ec', text: '#c62828' };
        case 'PATCH': return { bg: '#fff3e0', text: '#e65100' };
        case 'PUT': return { bg: '#f3e5f5', text: '#6a1b9a' };
        default: return { bg: '#f5f5f5', text: '#333' };
    }
}
export function OperationsPanel() {
    const [activeTab, setActiveTab] = useState('party');
    const [op, setOp] = useState(null);
    const [params, setParams] = useState({});
    const [formVals, setFormVals] = useState({});
    const [body, setBody] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showJson, setShowJson] = useState(false);
    const selectOp = (key) => {
        setOp(key);
        setParams({});
        setFormVals({});
        setBody('');
        setResult(null);
        setError('');
        setShowJson(false);
    };
    const exec = async () => {
        if (!op)
            return;
        setLoading(true);
        setError('');
        setResult(null);
        const cfg = operations[op];
        let url = `${API}${cfg.path}`;
        for (const f of cfg.fields)
            url = url.replace(`{${f}}`, params[f] || '');
        if (cfg.queryParams?.length) {
            const qp = cfg.queryParams.filter(f => params[f]).map(f => `${f}=${encodeURIComponent(params[f])}`).join('&');
            if (qp)
                url += `?${qp}`;
        }
        try {
            const opts = { method: cfg.method, headers: { 'Content-Type': 'application/json' } };
            const structured = buildBody(op, formVals);
            if (url.includes('/execute/')) {
                opts.method = 'POST';
                const execBody = structured || (body ? JSON.parse(body) : {});
                execBody._params = { ...params };
                opts.body = JSON.stringify(execBody);
            }
            else if (cfg.method === 'POST' || cfg.method === 'PUT' || cfg.method === 'PATCH') {
                if (structured) {
                    const { _params, ...rest } = structured;
                    if (_params) {
                        url = `${API}/execute/${op}`;
                        opts.method = 'POST';
                    }
                    opts.body = JSON.stringify(_params ? { ...rest, _params } : rest);
                }
                else {
                    opts.body = body || '{}';
                }
            }
            const r = await fetch(url, opts);
            const text = await r.text();
            let data;
            try {
                data = JSON.parse(text);
            }
            catch {
                data = { raw: text };
            }
            if (!r.ok)
                throw new Error(data.detail || data.raw || `HTTP ${r.status}`);
            setResult(data);
        }
        catch (e) {
            setError(e.message);
        }
        setLoading(false);
    };
    const cfg = op ? operations[op] : null;
    const formDef = op ? FORM_DEFS[op] : null;
    const builtBody = formDef ? buildBody(op, formVals) : null;
    const activeCategory = CATEGORIES.find(c => c.key === activeTab);
    return (_jsxs("div", { style: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }, children: [_jsx("h2", { style: { margin: '0 0 16px 0', fontSize: 20, fontWeight: 600, color: '#1a1a2e' }, children: "Operations" }), _jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid #e8e8e8' }, children: CATEGORIES.map(cat => (_jsxs("button", { onClick: () => { setActiveTab(cat.key); setOp(null); setResult(null); setError(''); }, style: {
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: activeTab === cat.key ? 600 : 400,
                        border: activeTab === cat.key ? '1px solid #4361ee' : '1px solid #ddd',
                        borderRadius: 20,
                        background: activeTab === cat.key ? '#4361ee' : '#fff',
                        color: activeTab === cat.key ? '#fff' : '#555',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                    }, children: [cat.label, _jsxs("span", { style: { marginLeft: 5, fontSize: 10, opacity: 0.7 }, children: ["(", cat.ops.length, ")"] })] }, cat.key))) }), activeCategory && (_jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 20 }, children: activeCategory.ops.map(opKey => {
                    const opDef = operations[opKey];
                    if (!opDef)
                        return null;
                    const mc = getMethodColor(opDef.method);
                    const isSelected = op === opKey;
                    return (_jsxs("button", { onClick: () => selectOp(opKey), style: {
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 14px',
                            border: isSelected ? '2px solid #4361ee' : '1px solid #e0e0e0',
                            borderRadius: 8,
                            background: isSelected ? '#f0f4ff' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.12s ease',
                            boxShadow: isSelected ? '0 2px 8px rgba(67,97,238,0.15)' : '0 1px 3px rgba(0,0,0,0.04)',
                        }, children: [_jsx("span", { style: {
                                    padding: '3px 7px',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    borderRadius: 4,
                                    background: mc.bg,
                                    color: mc.text,
                                    fontFamily: 'monospace',
                                    minWidth: 46,
                                    textAlign: 'center',
                                    flexShrink: 0,
                                }, children: opDef.method }), _jsx("span", { style: { fontSize: 12, color: '#333', lineHeight: 1.3 }, children: opDef.label })] }, opKey));
                }) })), op && cfg && (_jsxs("div", { style: { border: '1px solid #e0e0e0', borderRadius: 10, padding: 20, background: '#fafbfc', marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }, children: [_jsx("span", { style: {
                                    padding: '3px 8px', fontSize: 11, fontWeight: 700, borderRadius: 4,
                                    background: getMethodColor(cfg.method).bg, color: getMethodColor(cfg.method).text, fontFamily: 'monospace'
                                }, children: cfg.method }), _jsx("span", { style: { fontSize: 14, fontWeight: 600, color: '#1a1a2e' }, children: cfg.label }), _jsx("span", { style: { fontSize: 11, color: '#888', marginLeft: 'auto', fontFamily: 'monospace' }, children: cfg.path })] }), _jsxs("div", { style: { display: 'grid', gap: 8, maxWidth: 480, marginBottom: 12 }, children: [cfg.fields.map(f => (_jsx("input", { placeholder: f, style: { padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none' }, value: params[f] || '', onChange: e => setParams({ ...params, [f]: e.target.value }) }, f))), formDef ? (_jsxs(_Fragment, { children: [_jsx(StructuredForm, { formDef: formDef, values: formVals, onChange: setFormVals }), _jsxs("button", { type: "button", style: { fontSize: 11, padding: '4px 10px', background: '#eee', border: '1px solid #ddd', borderRadius: 4, width: 'fit-content', cursor: 'pointer' }, onClick: () => setShowJson(s => !s), children: [showJson ? 'Hide' : 'Preview', " JSON"] }), showJson && builtBody && (_jsx("pre", { style: { fontSize: 11, background: '#f0f0f0', padding: 10, borderRadius: 6, maxHeight: 200, overflow: 'auto', border: '1px solid #e0e0e0' }, children: JSON.stringify(builtBody, null, 2) }))] })) : (cfg.method === 'POST' || cfg.method === 'PUT' || cfg.method === 'PATCH') && (_jsx("textarea", { placeholder: "JSON body", rows: 6, style: { fontFamily: 'monospace', fontSize: 12, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, resize: 'vertical' }, value: body, onChange: e => setBody(e.target.value) }))] }), _jsx("button", { onClick: exec, disabled: loading, style: {
                            padding: '9px 22px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 6,
                            background: loading ? '#94a3b8' : '#4361ee', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer',
                            transition: 'background 0.15s ease',
                        }, children: loading ? 'Executing...' : 'Execute' })] })), error && _jsx("div", { style: { padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13, wordBreak: 'break-all', marginBottom: 12 }, children: error }), result && (_jsx("pre", { style: { background: '#f8fafc', border: '1px solid #e2e8f0', padding: 14, borderRadius: 8, maxHeight: 400, overflow: 'auto', fontSize: 12, lineHeight: 1.5 }, children: JSON.stringify(result, null, 2) }))] }));
}
