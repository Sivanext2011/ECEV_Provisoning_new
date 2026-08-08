import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState } from 'react';
const API = '/api/v1';
// Execution helpers
const exec = async (apiKey, params, body, queryParams) => {
    const payload = body || {};
    if (Object.keys(params).length)
        payload._pathParams = params;
    if (queryParams && Object.keys(queryParams).length)
        payload._queryParams = queryParams;
    const r = await fetch(`${API}/execute/${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return r;
};
const execGet = async (apiKey, queryParams) => {
    const payload = { _queryParams: queryParams };
    const r = await fetch(`${API}/execute/${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    return r;
};
// Helper to create field definitions
const pathField = (name, label, required = true) => ({ name, label: label || name, type: 'path', required });
const queryField = (name, label, required = false) => ({ name, label: label || name, type: 'query', required });
// ============ BSSF OPERATIONS ============
const bssfPartyOps = [
    { id: 'party_create', name: 'Create Party', method: 'POST', apiKey: 'party_create', fields: [], hasJsonBody: true },
    { id: 'party_get', name: 'Get Party', method: 'GET', apiKey: 'party_get', fields: [pathField('partyId', 'Party ID')] },
    { id: 'party_update', name: 'Update Party', method: 'PATCH', apiKey: 'party_update', fields: [pathField('partyId', 'Party ID')], hasJsonBody: true },
    { id: 'party_delete', name: 'Delete Party', method: 'DELETE', apiKey: 'party_delete', fields: [pathField('partyId', 'Party ID')] },
    { id: 'party_move', name: 'Move Party', method: 'POST', apiKey: 'party_move', fields: [pathField('partyId', 'Party ID')], hasJsonBody: true },
];
const bssfCustomerOps = [
    { id: 'customer_create', name: 'Create Customer', method: 'POST', apiKey: 'customer_create', fields: [], hasJsonBody: true },
    { id: 'customer_get', name: 'Get Customer', method: 'GET', apiKey: 'customer_get', fields: [pathField('customerId', 'Customer ID')] },
    { id: 'customer_update', name: 'Update Customer', method: 'PATCH', apiKey: 'customer_update', fields: [pathField('customerId', 'Customer ID')], hasJsonBody: true },
    { id: 'customer_delete', name: 'Delete Customer', method: 'DELETE', apiKey: 'customer_delete', fields: [pathField('customerId', 'Customer ID')] },
];
const bssfContractOps = [
    { id: 'contract_create', name: 'Create Contract', method: 'POST', apiKey: 'contract_create', fields: [], hasJsonBody: true },
    { id: 'contract_get', name: 'Get Contract', method: 'GET', apiKey: 'contract_get', fields: [pathField('contractId', 'Contract ID')] },
    { id: 'contract_update', name: 'Update Contract', method: 'PATCH', apiKey: 'contract_update', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'contract_delete', name: 'Delete Contract', method: 'DELETE', apiKey: 'contract_delete', fields: [pathField('contractId', 'Contract ID')] },
    { id: 'contract_terminate', name: 'Terminate Contract', method: 'POST', apiKey: 'contract_terminate', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'contract_activate', name: 'Activate Contract', method: 'POST', apiKey: 'contract_activate', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
];
const bssfSubscriptionOps = [
    { id: 'subscription_change_status', name: 'Change Status', method: 'POST', apiKey: 'subscription_change_status', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'consumer_list_modify', name: 'Consumer List Modify', method: 'POST', apiKey: 'consumer_list_modify', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'consumer_list_terminate', name: 'Consumer List Terminate', method: 'POST', apiKey: 'consumer_list_terminate', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'modify_consumer_product', name: 'Modify Consumer Product', method: 'POST', apiKey: 'modify_consumer_product', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'modify_provider_product', name: 'Modify Provider Product', method: 'POST', apiKey: 'modify_provider_product', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'get_consumer_product', name: 'Get Consumer Product', method: 'GET', apiKey: 'get_consumer_product', fields: [pathField('contractId', 'Contract ID')] },
    { id: 'get_inherited_contracts', name: 'Get Inherited Contracts', method: 'GET', apiKey: 'get_inherited_contracts', fields: [pathField('contractId', 'Contract ID')] },
    { id: 'eligible_consumers', name: 'Eligible Consumers', method: 'GET', apiKey: 'eligible_consumers', fields: [pathField('contractId', 'Contract ID')] },
];
const bssfBalanceOps = [
    { id: 'balance_enquiry_msisdn', name: 'Enquiry by MSISDN', method: 'GET', apiKey: 'balance_enquiry_msisdn', fields: [queryField('msisdn', 'MSISDN', true)] },
    { id: 'balance_enquiry_imsi', name: 'Enquiry by IMSI', method: 'GET', apiKey: 'balance_enquiry_imsi', fields: [queryField('imsi', 'IMSI', true)] },
    { id: 'balance_enquiry_customer', name: 'Enquiry by Customer', method: 'GET', apiKey: 'balance_enquiry_customer', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'balance_enquiry_contract', name: 'Enquiry by Contract', method: 'GET', apiKey: 'balance_enquiry_contract', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'balance_enquiry_bucket', name: 'Enquiry by Bucket', method: 'GET', apiKey: 'balance_enquiry_bucket', fields: [queryField('bucketId', 'Bucket ID', true)] },
    { id: 'balance_topup', name: 'Topup', method: 'POST', apiKey: 'balance_topup', fields: [], hasJsonBody: true },
    { id: 'balance_product_adjustment', name: 'Product Adjustment', method: 'POST', apiKey: 'balance_product_adjustment', fields: [], hasJsonBody: true },
    { id: 'balance_billing_account_adjustment', name: 'Billing Account Adjustment', method: 'POST', apiKey: 'balance_billing_account_adjustment', fields: [], hasJsonBody: true },
    { id: 'balance_settlement_adjustment', name: 'Settlement Adjustment', method: 'POST', apiKey: 'balance_settlement_adjustment', fields: [], hasJsonBody: true },
    { id: 'balance_reset_fraud', name: 'Reset Fraud', method: 'POST', apiKey: 'balance_reset_fraud', fields: [], hasJsonBody: true },
    { id: 'balance_topup_details', name: 'Topup Details', method: 'GET', apiKey: 'balance_topup_details', fields: [queryField('contractId', 'Contract ID', true)] },
];
const bssfFinancialOps = [
    { id: 'financial_customer_bill', name: 'Customer Bill', method: 'GET', apiKey: 'financial_customer_bill', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'financial_applied_rate', name: 'Applied Rate', method: 'GET', apiKey: 'financial_applied_rate', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'financial_contract_view', name: 'Contract View', method: 'GET', apiKey: 'financial_contract_view', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'financial_on_demand', name: 'On Demand', method: 'POST', apiKey: 'financial_on_demand', fields: [], hasJsonBody: true },
    { id: 'financial_summary', name: 'Summary', method: 'GET', apiKey: 'financial_summary', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'financial_unbilled_charge', name: 'Unbilled Charge', method: 'GET', apiKey: 'financial_unbilled_charge', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'financial_customer_account', name: 'Customer Account', method: 'GET', apiKey: 'financial_customer_account', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'financial_header', name: 'Header', method: 'GET', apiKey: 'financial_header', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'financial_transaction', name: 'Transaction', method: 'GET', apiKey: 'financial_transaction', fields: [queryField('customerId', 'Customer ID', true)] },
    { id: 'financial_payment_instruction', name: 'Payment Instruction', method: 'POST', apiKey: 'financial_payment_instruction', fields: [], hasJsonBody: true },
    { id: 'financial_create_task', name: 'Create Task', method: 'POST', apiKey: 'financial_create_task', fields: [], hasJsonBody: true },
];
const bssfAgreementOps = [
    { id: 'agreement_get', name: 'Get Agreement', method: 'GET', apiKey: 'agreement_get', fields: [pathField('agreementId', 'Agreement ID')] },
    { id: 'agreement_create', name: 'Create Agreement', method: 'POST', apiKey: 'agreement_create', fields: [], hasJsonBody: true },
    { id: 'agreement_update', name: 'Update Agreement', method: 'PATCH', apiKey: 'agreement_update', fields: [pathField('agreementId', 'Agreement ID')], hasJsonBody: true },
    { id: 'agreement_delete', name: 'Delete Agreement', method: 'DELETE', apiKey: 'agreement_delete', fields: [pathField('agreementId', 'Agreement ID')] },
];
const bssfPartyRoleOps = [
    { id: 'partyrole_get', name: 'Get Party Role', method: 'GET', apiKey: 'partyrole_get', fields: [pathField('partyRoleId', 'Party Role ID')] },
    { id: 'partyrole_create', name: 'Create Party Role', method: 'POST', apiKey: 'partyrole_create', fields: [], hasJsonBody: true },
    { id: 'partyrole_update_id', name: 'Update by ID', method: 'PATCH', apiKey: 'partyrole_update_id', fields: [pathField('partyRoleId', 'Party Role ID')], hasJsonBody: true },
    { id: 'partyrole_update_extid', name: 'Update by ExtID', method: 'PATCH', apiKey: 'partyrole_update_extid', fields: [pathField('externalId', 'External ID')], hasJsonBody: true },
];
const bssfOrganizationOps = [
    { id: 'organization_get', name: 'Get Organization', method: 'GET', apiKey: 'organization_get', fields: [pathField('organizationId', 'Organization ID')] },
    { id: 'organization_create', name: 'Create Organization', method: 'POST', apiKey: 'organization_create', fields: [], hasJsonBody: true },
    { id: 'organization_update', name: 'Update Organization', method: 'PATCH', apiKey: 'organization_update', fields: [pathField('organizationId', 'Organization ID')], hasJsonBody: true },
    { id: 'organization_change_status_cascading', name: 'Change Status Cascading', method: 'POST', apiKey: 'organization_change_status_cascading', fields: [pathField('organizationId', 'Organization ID')], hasJsonBody: true },
];
const bssfPartnerOps = [
    { id: 'partner_get_contract', name: 'Get Partner Contract', method: 'GET', apiKey: 'partner_get_contract', fields: [pathField('contractId', 'Contract ID')] },
    { id: 'partner_create_contract', name: 'Create Partner Contract', method: 'POST', apiKey: 'partner_create_contract', fields: [], hasJsonBody: true },
    { id: 'partner_involvement_group', name: 'Involvement Group', method: 'GET', apiKey: 'partner_involvement_group', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'partner_settlement_note', name: 'Settlement Note', method: 'GET', apiKey: 'partner_settlement_note', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'partner_unsettled_charge', name: 'Unsettled Charge', method: 'GET', apiKey: 'partner_unsettled_charge', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'partner_applied_rate', name: 'Applied Rate', method: 'GET', apiKey: 'partner_applied_rate', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'partner_note_on_demand', name: 'Note On Demand', method: 'POST', apiKey: 'partner_note_on_demand', fields: [], hasJsonBody: true },
    { id: 'partner_contract_view', name: 'Contract View', method: 'GET', apiKey: 'partner_contract_view', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'partner_summary', name: 'Summary', method: 'GET', apiKey: 'partner_summary', fields: [queryField('contractId', 'Contract ID', true)] },
];
const bssfResourceProductOps = [
    { id: 'swap_resource', name: 'Swap Resource', method: 'POST', apiKey: 'swap_resource', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
    { id: 'replace_product', name: 'Replace Product', method: 'POST', apiKey: 'replace_product', fields: [pathField('contractId', 'Contract ID')], hasJsonBody: true },
];
const bssfPurchaseOps = [
    { id: 'purchase_rate_deduct', name: 'Rate and Deduct', method: 'POST', apiKey: 'purchase_rate_deduct', fields: [], hasJsonBody: true },
    { id: 'purchase_rate_reserve', name: 'Rate and Reserve', method: 'POST', apiKey: 'purchase_rate_reserve', fields: [], hasJsonBody: true },
    { id: 'purchase_cancel_reservation', name: 'Cancel Reservation', method: 'POST', apiKey: 'purchase_cancel_reservation', fields: [], hasJsonBody: true },
    { id: 'basket_rate_deduct', name: 'Basket Rate and Deduct', method: 'POST', apiKey: 'basket_rate_deduct', fields: [], hasJsonBody: true },
    { id: 'basket_rate_reserve', name: 'Basket Rate and Reserve', method: 'POST', apiKey: 'basket_rate_reserve', fields: [], hasJsonBody: true },
    { id: 'basket_execute', name: 'Basket Execute', method: 'POST', apiKey: 'basket_execute', fields: [], hasJsonBody: true },
    { id: 'basket_advice', name: 'Basket Advice', method: 'POST', apiKey: 'basket_advice', fields: [], hasJsonBody: true },
    { id: 'basket_cancel', name: 'Cancel Basket', method: 'POST', apiKey: 'basket_cancel', fields: [], hasJsonBody: true },
];
const bssfSessionOps = [
    { id: 'create_policy_session', name: 'Create Policy Session', method: 'POST', apiKey: 'create_policy_session', fields: [], hasJsonBody: true },
    { id: 'move_charging_session', name: 'Move Charging Session', method: 'POST', apiKey: 'move_charging_session', fields: [], hasJsonBody: true },
];
const bssfUserOps = [
    { id: 'user_get', name: 'Get User', method: 'GET', apiKey: 'user_get', fields: [pathField('userId', 'User ID')] },
    { id: 'user_create', name: 'Create User', method: 'POST', apiKey: 'user_create', fields: [], hasJsonBody: true },
    { id: 'user_update', name: 'Update User', method: 'PATCH', apiKey: 'user_update', fields: [pathField('userId', 'User ID')], hasJsonBody: true },
    { id: 'user_delete', name: 'Delete User', method: 'DELETE', apiKey: 'user_delete', fields: [pathField('userId', 'User ID')] },
];
const bssfRecurrenceOps = [
    { id: 'recurrence_enquiry', name: 'Recurrence Enquiry', method: 'GET', apiKey: 'recurrence_enquiry', fields: [queryField('contractId', 'Contract ID', true)] },
    { id: 'recurrence_create_job', name: 'Create Recurrence Job', method: 'POST', apiKey: 'recurrence_create_job', fields: [], hasJsonBody: true },
];
const bssfTestOps = [
    { id: 'create_entity_adjustment', name: 'Create Entity Adjustment', method: 'POST', apiKey: 'create_entity_adjustment', fields: [], hasJsonBody: true },
    { id: 'get_entity_adjustment', name: 'Get Entity Adjustment', method: 'GET', apiKey: 'get_entity_adjustment', fields: [queryField('entityId', 'Entity ID', true)] },
];
const bssfCommunicationOps = [
    { id: 'send_message', name: 'Send Message', method: 'POST', apiKey: 'send_message', fields: [], hasJsonBody: true },
    { id: 'get_communication_identity', name: 'Get Communication Identity', method: 'GET', apiKey: 'get_communication_identity', fields: [queryField('identityId', 'Identity ID', true)] },
];
// Spec Enquiry - all spec_ APIs
const specNames = [
    'individual', 'customer', 'contract', 'product', 'productOffering', 'productOfferingPrice',
    'billingCycle', 'billingAccount', 'contactMedium', 'communicationIdentifier', 'partyRole',
    'agreementItem', 'agreement', 'bucket', 'bucketDetermination', 'characteristicSet',
    'commonDimension', 'commonDimensionSpec', 'customerFacingService', 'customerList', 'entityList',
    'genericBusinessSetting', 'globalList', 'globalListData', 'organization', 'priceTaxCategory',
    'productPriorityList', 'referenceDataList', 'resource', 'rfss', 'scheduleDefinition',
    'settlementAccount', 'sharingProvider', 'tag', 'taxCodeDetail', 'taxConfiguration',
    'taxExemption', 'taxPackage', 'taxRuleTemplate'
];
const bssfSpecEnquiryOps = specNames.map(spec => ({
    id: `spec_${spec}`,
    name: `spec_${spec}`,
    method: 'GET',
    apiKey: `spec_${spec}`,
    fields: [queryField('specId', `${spec} Spec ID`)],
}));
// ============ RMCA OPERATIONS ============
const rmcaProductOfferingOps = [
    { id: 'rmca_product_offering_list', name: 'List Product Offerings', method: 'GET', apiKey: 'rmca_product_offering_list', fields: [] },
    { id: 'rmca_product_offering_read', name: 'Read Product Offering', method: 'GET', apiKey: 'rmca_product_offering_read', fields: [pathField('productOfferingId', 'Product Offering ID')] },
    { id: 'rmca_product_offering_create', name: 'Create Product Offering', method: 'POST', apiKey: 'rmca_product_offering_create', fields: [], hasJsonBody: true },
];
const rmcaSpecReadOps = [
    { id: 'rmca_party_spec', name: 'Party Spec', method: 'GET', apiKey: 'rmca_party_spec', fields: [queryField('specId', 'Spec ID')] },
    { id: 'rmca_contract_spec', name: 'Contract Spec', method: 'GET', apiKey: 'rmca_contract_spec', fields: [queryField('specId', 'Spec ID')] },
    { id: 'rmca_contact_medium_spec', name: 'Contact Medium Spec', method: 'GET', apiKey: 'rmca_contact_medium_spec', fields: [queryField('specId', 'Spec ID')] },
];
const rmcaExportImportOps = [
    { id: 'rmca_export', name: 'RMCA Export', method: 'POST', apiKey: 'rmca_export', fields: [], hasJsonBody: true },
    { id: 'rmca_import', name: 'RMCA Import', method: 'POST', apiKey: 'rmca_import', fields: [], hasJsonBody: true },
];
const rmcaGlobalListOps = [
    { id: 'rmca_global_list_create', name: 'Create Global List', method: 'POST', apiKey: 'rmca_global_list_create', fields: [], hasJsonBody: true },
    { id: 'rmca_global_list_read', name: 'Read Global List', method: 'GET', apiKey: 'rmca_global_list_read', fields: [pathField('listId', 'List ID')] },
    { id: 'rmca_global_list_spec_read', name: 'Spec Read', method: 'GET', apiKey: 'rmca_global_list_spec_read', fields: [queryField('specId', 'Spec ID')] },
];
// ============ CPM OPERATIONS ============
const cpmIdTranslationOps = [
    { id: 'cpm_id_translation_msisdn', name: 'ID Translation MSISDN', method: 'GET', apiKey: 'cpm_id_translation_msisdn', fields: [queryField('msisdn', 'MSISDN', true)] },
    { id: 'cpm_id_translation_imsi', name: 'ID Translation IMSI', method: 'GET', apiKey: 'cpm_id_translation_imsi', fields: [queryField('imsi', 'IMSI', true)] },
];
const cpmCommunicationIdentityOps = [
    { id: 'cpm_communication_identity', name: 'Communication Identity', method: 'GET', apiKey: 'cpm_communication_identity', fields: [queryField('identityValue', 'Identity Value', true)] },
];
const cpmMassDeviceOps = [
    { id: 'cpm_mass_device_create_job', name: 'Create Job', method: 'POST', apiKey: 'cpm_mass_device_create_job', fields: [], hasJsonBody: true },
    { id: 'cpm_mass_device_start_job', name: 'Start Job', method: 'POST', apiKey: 'cpm_mass_device_start_job', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_stop_job', name: 'Stop Job', method: 'POST', apiKey: 'cpm_mass_device_stop_job', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_restart_job', name: 'Restart Job', method: 'POST', apiKey: 'cpm_mass_device_restart_job', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_delete_job', name: 'Delete Job', method: 'DELETE', apiKey: 'cpm_mass_device_delete_job', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_job_status', name: 'Job Status', method: 'GET', apiKey: 'cpm_mass_device_job_status', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_job_result', name: 'Job Result', method: 'GET', apiKey: 'cpm_mass_device_job_result', fields: [pathField('jobId', 'Job ID')] },
    { id: 'cpm_mass_device_list_jobs', name: 'List Jobs', method: 'GET', apiKey: 'cpm_mass_device_list_jobs', fields: [] },
];
// ============ CATALOG OPERATIONS ============
const catalogProductOfferingOps = [
    { id: 'catalog_product_offering_get', name: 'Get Product Offering', method: 'GET', apiKey: 'catalog_product_offering_get', fields: [pathField('productOfferingId', 'Product Offering ID')] },
    { id: 'catalog_product_offering_create', name: 'Create Product Offering', method: 'POST', apiKey: 'catalog_product_offering_create', fields: [], hasJsonBody: true },
    { id: 'catalog_product_offering_update_id', name: 'Update by ID', method: 'PATCH', apiKey: 'catalog_product_offering_update_id', fields: [pathField('productOfferingId', 'Product Offering ID')], hasJsonBody: true },
    { id: 'catalog_product_offering_update_extid', name: 'Update by ExtID', method: 'PATCH', apiKey: 'catalog_product_offering_update_extid', fields: [pathField('externalId', 'External ID')], hasJsonBody: true },
];
// ============ TAB STRUCTURE ============
const systemTabs = [
    {
        name: 'BSSF',
        subTabs: [
            { name: 'Party', operations: bssfPartyOps },
            { name: 'Customer', operations: bssfCustomerOps },
            { name: 'Contract', operations: bssfContractOps },
            { name: 'Subscription', operations: bssfSubscriptionOps },
            { name: 'Balance', operations: bssfBalanceOps },
            { name: 'Financial', operations: bssfFinancialOps },
            { name: 'Agreement', operations: bssfAgreementOps },
            { name: 'Party Role', operations: bssfPartyRoleOps },
            { name: 'Organization', operations: bssfOrganizationOps },
            { name: 'Partner', operations: bssfPartnerOps },
            { name: 'Resource & Product', operations: bssfResourceProductOps },
            { name: 'Purchase', operations: bssfPurchaseOps },
            { name: 'Session', operations: bssfSessionOps },
            { name: 'User', operations: bssfUserOps },
            { name: 'Spec Enquiry', operations: bssfSpecEnquiryOps },
            { name: 'Recurrence', operations: bssfRecurrenceOps },
            { name: 'Test', operations: bssfTestOps },
            { name: 'Communication', operations: bssfCommunicationOps },
        ]
    },
    {
        name: 'RMCA',
        subTabs: [
            { name: 'Product Offering', operations: rmcaProductOfferingOps },
            { name: 'Spec Read', operations: rmcaSpecReadOps },
            { name: 'Export/Import', operations: rmcaExportImportOps },
            { name: 'Global List', operations: rmcaGlobalListOps },
        ]
    },
    {
        name: 'CPM',
        subTabs: [
            { name: 'ID Translation', operations: cpmIdTranslationOps },
            { name: 'Communication Identity', operations: cpmCommunicationIdentityOps },
            { name: 'Mass Device', operations: cpmMassDeviceOps },
        ]
    },
    {
        name: 'Catalog',
        subTabs: [
            { name: 'Product Offering', operations: catalogProductOfferingOps },
        ]
    },
];
// ============ STYLES ============
const styles = {
    container: {
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        maxWidth: '1400px',
        margin: '0 auto',
    },
    topTabsRow: {
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
    },
    topTab: {
        padding: '12px 28px',
        borderRadius: '24px',
        border: '2px solid #e0e0e0',
        background: '#fff',
        cursor: 'pointer',
        fontSize: '15px',
        fontWeight: 600,
        transition: 'all 0.2s',
        color: '#555',
    },
    topTabActive: {
        background: '#1976d2',
        color: '#fff',
        border: '2px solid #1976d2',
    },
    subTabsRow: {
        display: 'flex',
        gap: '8px',
        marginBottom: '16px',
        flexWrap: 'wrap',
        borderBottom: '1px solid #e0e0e0',
        paddingBottom: '12px',
    },
    subTab: {
        padding: '6px 16px',
        borderRadius: '16px',
        border: '1px solid #ddd',
        background: '#fafafa',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
        color: '#666',
        transition: 'all 0.2s',
    },
    subTabActive: {
        background: '#e3f2fd',
        color: '#1565c0',
        border: '1px solid #90caf9',
    },
    opsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '10px',
        marginBottom: '20px',
    },
    opCard: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 14px',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
        background: '#fff',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontSize: '13px',
        fontWeight: 500,
    },
    opCardActive: {
        border: '1px solid #1976d2',
        background: '#e3f2fd',
        boxShadow: '0 2px 8px rgba(25,118,210,0.15)',
    },
    methodBadge: {
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        color: '#fff',
        flexShrink: 0,
    },
    formContainer: {
        background: '#f8f9fa',
        borderRadius: '12px',
        border: '1px solid #e0e0e0',
        padding: '20px',
        marginBottom: '20px',
    },
    formTitle: {
        fontSize: '16px',
        fontWeight: 600,
        marginBottom: '16px',
        color: '#333',
    },
    fieldRow: {
        marginBottom: '12px',
    },
    fieldLabel: {
        display: 'block',
        fontSize: '12px',
        fontWeight: 600,
        color: '#555',
        marginBottom: '4px',
    },
    fieldInput: {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #ccc',
        fontSize: '14px',
        boxSizing: 'border-box',
    },
    textarea: {
        width: '100%',
        minHeight: '150px',
        padding: '10px 12px',
        borderRadius: '6px',
        border: '1px solid #ccc',
        fontSize: '13px',
        fontFamily: '"Fira Code", "Consolas", monospace',
        boxSizing: 'border-box',
        resize: 'vertical',
    },
    execBtn: {
        padding: '10px 24px',
        borderRadius: '6px',
        border: 'none',
        background: '#1976d2',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: '8px',
    },
    resultContainer: {
        background: '#1e1e1e',
        borderRadius: '8px',
        padding: '16px',
        marginTop: '16px',
        maxHeight: '400px',
        overflow: 'auto',
    },
    resultText: {
        color: '#d4d4d4',
        fontSize: '12px',
        fontFamily: '"Fira Code", "Consolas", monospace',
        whiteSpace: 'pre-wrap',
        margin: 0,
    },
    statusBadge: {
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        marginBottom: '8px',
    },
    loading: {
        color: '#90caf9',
        fontSize: '13px',
        fontStyle: 'italic',
    }
};
const methodColors = {
    GET: '#4caf50',
    POST: '#1976d2',
    PATCH: '#f57c00',
    DELETE: '#d32f2f',
    PUT: '#7b1fa2',
};
// ============ COMPONENT ============
export const OperationsPanel = () => {
    const [activeSystem, setActiveSystem] = useState(0);
    const [activeSubTab, setActiveSubTab] = useState(0);
    const [selectedOp, setSelectedOp] = useState(null);
    const [fieldValues, setFieldValues] = useState({});
    const [jsonBody, setJsonBody] = useState('{\n  \n}');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [statusCode, setStatusCode] = useState(null);
    const [specsCache, setSpecsCache] = useState(null);
    const [formMode, setFormMode] = useState('form');
    const [specFormValues, setSpecFormValues] = useState({});
    const [selectedSpec, setSelectedSpec] = useState('');
    const [fetchedEntity, setFetchedEntity] = useState(null);
    const [fetchLoading, setFetchLoading] = useState(false);
    // Auto-load specs on mount for templates
    React.useEffect(() => {
        fetch(`${API}/specs`).then(r => r.ok ? r.json() : null).then(setSpecsCache).catch(() => { });
    }, []);
    // Template generator for common operations
    const getTemplate = (apiKey, fields) => {
        const ts = new Date().toISOString().replace(/\.\d{3}Z/, '.000Z');
        switch (apiKey) {
            case 'create_party':
            case 'party_create': return {
                externalId: fields.partyExternalId || 'extID-party-<msisdn>',
                givenName: '<givenName>',
                familyName: '<familyName>',
                status: [{ status: 'PartyActive' }],
                individualSpecification: { externalId: (specsCache?.partySpecifications?.[0]?.externalId) || '<partySpecExternalId>' },
                contactMedium: [
                    { externalId: 'cm_SMS_<msisdn>', contactMediumSpecExternalId: '<cmSpecExtId>', characteristic: [{ charSpecExternalId: 'communicationId', value: [{ value: '<msisdn>' }] }, { charSpecExternalId: 'channelType', value: [{ value: 'SMS' }] }] }
                ]
            };
            case 'create_customer':
            case 'customer_create': return {
                externalId: fields.customerExternalId || 'extID-customer-<msisdn>',
                engagedParty: { externalId: '<partyExternalId>', '@referredType': 'Individual' },
                status: [{ status: 'CustomerActive' }],
                customerSpecification: { externalId: (specsCache?.customerSpecifications?.[0]?.externalId) || '<custSpecExternalId>' },
                account: [{
                        externalId: 'extID_BA-<msisdn>',
                        billingAccountSpecExternalId: (specsCache?.billingAccountSpecifications?.[0]?.externalId) || '<baSpecExternalId>',
                        status: [{ status: 'BillingAccountActive' }],
                    }],
                contactMediumAssociation: [{ contactRole: 'Notification', language: 'en', contactMediumExternalId: 'cm_SMS_<msisdn>', enabled: true }]
            };
            case 'create_contract':
            case 'contract_create': return {
                externalId: 'extID-contract-<msisdn>',
                contractSpecification: { externalId: (specsCache?.contractSpecifications?.[0]?.externalId) || '<contractSpecExternalId>' },
                status: [{ status: 'Active' }],
                homeTimeZone: [{ timeZone: 'Europe/Stockholm' }],
                product: [{
                        productOfferingExternalId: '<poExternalId>',
                        externalId: '<poExternalId>-<msisdn>',
                        correlationId: '1',
                        name: '<productName>',
                        status: [{ status: 'ProductCreated' }],
                        billingAccountReference: { externalId: 'extID_BA-<msisdn>' },
                        baRefForBillCycleAlignedRecurrence: { externalId: 'extID_BA-<msisdn>' },
                    }],
                resource: [{ resourceNumber: '<msisdn>', externalId: 'RS_MSISDN-<msisdn>', resourceSpecificationExternalId: 'RS_MSISDN', productCorrelationId: ['1'] }],
                contactMediumAssociation: [{ contactRole: 'Notification', language: 'en', contactMediumExternalId: 'cm_SMS_<msisdn>', enabled: true }]
            };
            case 'create_party_role':
            case 'party_role_create': return {
                externalId: 'PR_<customerExternalId>',
                name: 'ContractOwner',
                engagedParty: { externalId: '<partyExternalId>', '@referredType': 'Individual' },
                status: [{ status: 'Active', validFor: { startDateTime: ts } }],
                partyRoleSpecification: { externalId: (specsCache?.partyRoleSpecifications?.[0]?.externalId) || '<prSpecExternalId>' }
            };
            case 'create_agreement_by_party_external_id':
            case 'agreement_create': return {
                externalId: 'AGR_<msisdn>',
                validFor: { startDateTime: ts, endDateTime: '2099-12-31T00:00:00.000Z' },
                status: [{ status: 'Active', validFor: { startDateTime: ts } }],
            };
            case 'balance_topup':
            case 'topup': return {
                triggerTime: ts,
                relatedParty: { externalId: '<customerExternalId>', '@referredType': 'Customer' },
                contractExternalId: '<contractExternalId>',
                communicationIdType: 'E.164',
                communicationId: '<msisdn>',
                amount: { number: 0, decimalPlaces: 0 },
                unitOfMeasure: 'byte',
            };
            case 'product_bucket_adjustment':
            case 'product_adjust': return {
                relatedParty: { externalId: '<customerExternalId>', '@referredType': 'Customer' },
                contractExternalId: '<contractExternalId>',
                communicationIdType: 'E.164',
                communicationId: '<msisdn>',
                productExternalId: '<productExternalId>',
                bucketSpecExternalId: '<bucketSpecExternalId>',
                action: 'Relative',
                amount: { number: 0, decimalPlaces: 0 },
                unitOfMeasure: 'byte',
                validFor: { startDateTime: ts, endDateTime: '2026-12-31T23:59:59.000Z' },
            };
            case 'billing_account_bucket_adjustment':
            case 'ba_adjust': return {
                relatedParty: { externalId: '<customerExternalId>', '@referredType': 'Customer' },
                contractExternalId: '<contractExternalId>',
                communicationIdType: 'E.164',
                communicationId: '<msisdn>',
                billingAccountExternalId: '<baExternalId>',
                bucketSpecExternalId: '<bucketSpecExternalId>',
                action: 'Relative',
                amount: { number: 0, decimalPlaces: 0 },
                unitOfMeasure: 'byte',
            };
            case 'swap_logical_resource':
            case 'resource_swap': return {
                customerExternalId: '<customerExternalId>',
                contractExternalId: '<contractExternalId>',
                resource: [{ resourceSpecificationExternalId: 'RS_MSISDN', oldResourceNumber: '<oldMsisdn>', newResourceNumber: '<newMsisdn>' }]
            };
            case 'replace_product':
            case 'product_replace': return {
                customerExternalId: '<customerExternalId>',
                contractExternalId: '<contractExternalId>',
                currentProductExternalId: '<currentProductExternalId>',
                newProductOfferingExternalId: '<newPOExternalId>',
            };
            case 'update_contract':
            case 'contract_update':
            case 'update_contract_by_id': return {
                status: [{ status: 'Active' }],
                product: [{ externalId: '<productExternalId>', status: [{ status: 'ProductActive' }] }]
            };
            case 'update_party':
            case 'party_update': return {
                givenName: '<newGivenName>',
                familyName: '<newFamilyName>',
            };
            case 'update_customer':
            case 'customer_update': return {
                status: [{ status: 'CustomerActive' }],
            };
            case 'consumer_list_modify':
            case 'sharing_add_consumer': return {
                product: [{ externalId: '<providerProductExternalId>', sharingProvider: { consumerList: [{ externalId: 'ConsumerEntry-<consumerMsisdn>', consumerCustomerExternalId: '<consumerCustExtId>', consumerContractExternalId: '<consumerContractExtId>' }] } }]
            };
            case 'consumer_list_terminate':
            case 'sharing_remove_consumer': return {
                product: [{ externalId: '<providerProductExternalId>', sharingProvider: { consumerList: [{ externalId: 'ConsumerEntry-<consumerMsisdn>', status: [{ status: 'Terminated' }] }] } }]
            };
            case 'change_subscription_status':
            case 'status_change': return {
                customerExternalId: '<customerExternalId>',
                contractExternalId: '<contractExternalId>',
                communicationId: '<msisdn>',
                communicationIdType: 'E.164',
                status: [{ status: 'Active' }]
            };
            case 'send_communication_message':
            case 'send_message': return {
                communicationId: '<msisdn>',
                communicationIdType: 'E.164',
                message: '<message text>',
            };
            case 'create_organization_party':
            case 'org_create': return {
                externalId: 'extID-org-<name>',
                tradingName: '<Organization Name>',
                status: [{ status: 'PartyActive' }],
            };
            case 'terminate_party_cascade':
            case 'terminate_customer_cascade':
            case 'terminate_contract_cascade': return {
                status: [{ status: 'Terminated' }],
            };
            case 'settlement_account_bucket_adjustment': return {
                relatedParty: { externalId: '<customerExternalId>', '@referredType': 'Customer' },
                contractExternalId: '<contractExternalId>',
                settlementAccountExternalId: '<settlementAccountExternalId>',
                bucketSpecExternalId: '<bucketSpecExternalId>',
                action: 'Relative',
                amount: { number: 0, decimalPlaces: 0 },
                unitOfMeasure: 'byte',
            };
            case 'modify_consumer_product': return {
                providerCustomerExternalId: '<providerCustExtId>',
                providerContractExternalId: '<providerContractExtId>',
                providerProductExternalId: '<providerProductExtId>',
                consumerCustomerExternalId: '<consumerCustExtId>',
                consumerContractExternalId: '<consumerContractExtId>',
                action: 'ADD',
            };
            case 'create_recurrence_job': return {
                communicationId: '<msisdn>',
                communicationIdType: 'E.164',
            };
            case 'reset_balance_topup_fraud_counter': return {
                customerExternalId: '<customerExternalId>',
                communicationId: '<msisdn>',
                communicationIdType: 'E.164',
            };
            default: return { _comment: 'Fill in the request body for ' + apiKey };
        }
    };
    // Build JSON body from spec-driven form
    const buildBodyFromForm = (apiKey) => {
        const v = specFormValues;
        const ts = new Date().toISOString().replace(/\.\d{3}Z/, '.000Z');
        if (apiKey === 'party_create' || apiKey === 'create_party') {
            const body = {
                externalId: v.externalId || `extID-party-${v.msisdn || ''}`,
                status: [{ status: v.status || 'PartyActive' }],
            };
            if (v.givenName)
                body.givenName = v.givenName;
            if (v.familyName)
                body.familyName = v.familyName;
            if (selectedSpec)
                body.individualSpecification = { externalId: selectedSpec };
            if (v.msisdn) {
                body.contactMedium = [
                    { externalId: `cm_SMS_${v.msisdn}`, contactMediumSpecExternalId: v.cmSpec || '', characteristic: [{ charSpecExternalId: 'communicationId', value: [{ value: v.msisdn }] }, { charSpecExternalId: 'channelType', value: [{ value: 'SMS' }] }] },
                ];
            }
            // Add characteristics
            const chars = getSpecChars();
            const charEntries = chars.filter((c) => v[`char_${c.externalId}`]);
            if (charEntries.length)
                body.characteristic = charEntries.map((c) => ({ charSpecExternalId: c.externalId, value: [{ value: v[`char_${c.externalId}`] }] }));
            return body;
        }
        if (apiKey === 'customer_create' || apiKey === 'create_customer') {
            const body = {
                externalId: v.externalId || `extID-customer-${v.msisdn || ''}`,
                engagedParty: { externalId: v.partyExternalId || `extID-party-${v.msisdn || ''}`, '@referredType': 'Individual' },
                status: [{ status: v.status || 'CustomerActive' }],
            };
            if (selectedSpec)
                body.customerSpecification = { externalId: selectedSpec };
            if (v.baSpec) {
                body.account = [{ externalId: v.baExternalId || `extID_BA-${v.msisdn || ''}`, billingAccountSpecExternalId: v.baSpec, status: [{ status: 'BillingAccountActive' }] }];
            }
            if (v.msisdn) {
                body.contactMediumAssociation = [{ contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_SMS_${v.msisdn}`, enabled: true }];
            }
            const chars = getSpecChars();
            const charEntries = chars.filter((c) => v[`char_${c.externalId}`]);
            if (charEntries.length)
                body.characteristic = charEntries.map((c) => ({ charSpecExternalId: c.externalId, value: [{ value: v[`char_${c.externalId}`] }] }));
            return body;
        }
        if (apiKey === 'contract_create' || apiKey === 'create_contract') {
            const body = {
                externalId: v.externalId || `extID-contract-${v.msisdn || ''}`,
                status: [{ status: v.status || 'Active' }],
                homeTimeZone: [{ timeZone: v.timeZone || 'Europe/Stockholm' }],
            };
            if (selectedSpec)
                body.contractSpecification = { externalId: selectedSpec };
            if (v.poExternalId) {
                body.product = [{
                        productOfferingExternalId: v.poExternalId,
                        externalId: `${v.poExternalId}-${v.msisdn || 'new'}`,
                        correlationId: '1', name: v.poExternalId,
                        status: [{ status: 'ProductCreated' }],
                        billingAccountReference: { externalId: v.baExternalId || `extID_BA-${v.msisdn || ''}` },
                        baRefForBillCycleAlignedRecurrence: { externalId: v.baExternalId || `extID_BA-${v.msisdn || ''}` },
                    }];
            }
            if (v.msisdn) {
                body.resource = [{ resourceNumber: v.msisdn, externalId: `RS_MSISDN-${v.msisdn}`, resourceSpecificationExternalId: 'RS_MSISDN', productCorrelationId: ['1'] }];
                body.contactMediumAssociation = [{ contactRole: 'Notification', language: 'en', contactMediumExternalId: `cm_SMS_${v.msisdn}`, enabled: true }];
            }
            const chars = getSpecChars();
            const charEntries = chars.filter((c) => v[`char_${c.externalId}`]);
            if (charEntries.length)
                body.characteristic = charEntries.map((c) => ({ charSpecExternalId: c.externalId, value: [{ value: v[`char_${c.externalId}`] }] }));
            return body;
        }
        // Update operations - build PATCH body from form values
        if (apiKey.includes('update') || apiKey.includes('_update')) {
            const body = {};
            if (v.givenName && v.givenName !== fetchedEntity?.givenName)
                body.givenName = v.givenName;
            if (v.familyName && v.familyName !== fetchedEntity?.familyName)
                body.familyName = v.familyName;
            if (v.status)
                body.status = [{ status: v.status }];
            // Changed characteristics
            const charEntries = Object.entries(v).filter(([k, val]) => k.startsWith('char_') && val);
            if (charEntries.length) {
                body.characteristic = charEntries.map(([k, val]) => ({ charSpecExternalId: k.replace('char_', ''), value: [{ value: val }] }));
            }
            // Add _pathParams for the API
            if (apiKey.includes('party'))
                body._pathParams = { partyExternalId: v.externalId || v._fetchId };
            else if (apiKey.includes('customer'))
                body._pathParams = { customerExternalId: v.externalId || v._fetchId };
            else if (apiKey.includes('contract'))
                body._pathParams = { customerExternalId: v.customerExternalId || '', contractExternalId: v.externalId || v._fetchId };
            return body;
        }
        return null;
    };
    // Get characteristics for the selected spec
    const getSpecChars = () => {
        if (!specsCache || !selectedSpec)
            return [];
        const allSpecs = [...(specsCache.partySpecifications || []), ...(specsCache.customerSpecifications || []), ...(specsCache.contractSpecifications || [])];
        const spec = allSpecs.find((s) => s.externalId === selectedSpec);
        return (spec?.characteristics || []).filter((c) => c.externalId && (c.valueRegulator === 'mustBePersonalized' || c.valueRegulator === 'canBePersonalized'));
    };
    const currentSystem = systemTabs[activeSystem];
    const currentSubTab = currentSystem.subTabs[activeSubTab] || currentSystem.subTabs[0];
    const handleSystemChange = (idx) => {
        setActiveSystem(idx);
        setActiveSubTab(0);
        setSelectedOp(null);
        setResult(null);
        setStatusCode(null);
    };
    const handleSubTabChange = (idx) => {
        setActiveSubTab(idx);
        setSelectedOp(null);
        setResult(null);
        setStatusCode(null);
    };
    const handleSelectOp = (op) => {
        setSelectedOp(op);
        setFieldValues({});
        setJsonBody('{\n  \n}');
        setResult(null);
        setStatusCode(null);
        setSpecFormValues({});
        setSelectedSpec('');
        setFetchedEntity(null);
        // Auto-set form mode for spec-driven operations
        const specDrivenOps = ['party_create', 'create_party', 'customer_create', 'create_customer', 'contract_create', 'create_contract', 'party_update', 'update_party', 'customer_update', 'update_customer', 'contract_update', 'update_contract'];
        setFormMode(specDrivenOps.includes(op.apiKey) ? 'form' : 'json');
    };
    const handleFieldChange = (name, value) => {
        setFieldValues(prev => ({ ...prev, [name]: value }));
    };
    const handleExecute = async () => {
        if (!selectedOp)
            return;
        setLoading(true);
        setResult(null);
        setStatusCode(null);
        try {
            const pathParams = {};
            const queryParams = {};
            selectedOp.fields.forEach(f => {
                const val = fieldValues[f.name] || '';
                if (f.type === 'path')
                    pathParams[f.name] = val;
                else if (f.type === 'query')
                    queryParams[f.name] = val;
            });
            // Remove empty query params
            Object.keys(queryParams).forEach(k => {
                if (!queryParams[k])
                    delete queryParams[k];
            });
            let response;
            if (selectedOp.method === 'GET' && !selectedOp.hasJsonBody) {
                // GET with possible query params
                if (Object.keys(pathParams).length > 0) {
                    response = await exec(selectedOp.apiKey, pathParams, undefined, queryParams);
                }
                else {
                    response = await execGet(selectedOp.apiKey, queryParams);
                }
            }
            else {
                // POST/PATCH/DELETE/PUT with possible body
                let body = undefined;
                if (selectedOp.hasJsonBody) {
                    if (formMode === 'form') {
                        body = buildBodyFromForm(selectedOp.apiKey);
                        if (!body) {
                            setResult('ERROR: Could not generate body from form. Switch to JSON mode.');
                            setLoading(false);
                            return;
                        }
                    }
                    else {
                        try {
                            body = JSON.parse(jsonBody);
                        }
                        catch {
                            setResult('ERROR: Invalid JSON body');
                            setLoading(false);
                            return;
                        }
                    }
                }
                response = await exec(selectedOp.apiKey, pathParams, body, queryParams);
            }
            setStatusCode(response.status);
            const text = await response.text();
            try {
                const json = JSON.parse(text);
                setResult(JSON.stringify(json, null, 2));
            }
            catch {
                setResult(text);
            }
        }
        catch (err) {
            setResult(`ERROR: ${err.message || 'Request failed'}`);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { style: styles.container, children: [_jsx("div", { style: styles.topTabsRow, children: systemTabs.map((tab, idx) => (_jsx("button", { style: { ...styles.topTab, ...(activeSystem === idx ? styles.topTabActive : {}) }, onClick: () => handleSystemChange(idx), children: tab.name }, tab.name))) }), _jsx("div", { style: styles.subTabsRow, children: currentSystem.subTabs.map((sub, idx) => (_jsx("button", { style: { ...styles.subTab, ...(activeSubTab === idx ? styles.subTabActive : {}) }, onClick: () => handleSubTabChange(idx), children: sub.name }, sub.name))) }), _jsx("div", { style: styles.opsGrid, children: currentSubTab.operations.map(op => (_jsxs("div", { style: { ...styles.opCard, ...(selectedOp?.id === op.id ? styles.opCardActive : {}) }, onClick: () => handleSelectOp(op), children: [_jsx("span", { style: { ...styles.methodBadge, background: methodColors[op.method] }, children: op.method }), _jsx("span", { children: op.name })] }, op.id))) }), selectedOp && (_jsxs("div", { style: styles.formContainer, children: [_jsxs("div", { style: styles.formTitle, children: [_jsx("span", { style: { ...styles.methodBadge, background: methodColors[selectedOp.method], marginRight: '10px' }, children: selectedOp.method }), selectedOp.name, _jsxs("span", { style: { marginLeft: '12px', fontSize: '12px', color: '#888', fontWeight: 400 }, children: ["API Key: ", selectedOp.apiKey] })] }), selectedOp.fields.map(f => (_jsxs("div", { style: styles.fieldRow, children: [_jsxs("label", { style: styles.fieldLabel, children: [f.label, " ", f.required && _jsx("span", { style: { color: '#d32f2f' }, children: "*" }), _jsxs("span", { style: { color: '#999', fontWeight: 400, marginLeft: '6px' }, children: ["(", f.type, ")"] })] }), _jsx("input", { style: styles.fieldInput, value: fieldValues[f.name] || '', onChange: e => handleFieldChange(f.name, e.target.value), placeholder: `Enter ${f.label}` })] }, f.name))), selectedOp.hasJsonBody && (_jsxs("div", { style: styles.fieldRow, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }, children: [_jsx("button", { onClick: () => setFormMode('form'), style: { fontSize: 11, padding: '4px 12px', background: formMode === 'form' ? '#1d4ed8' : '#f3f4f6', color: formMode === 'form' ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontWeight: formMode === 'form' ? 600 : 400 }, children: "\uD83E\uDDD9 Form" }), _jsx("button", { onClick: () => setFormMode('json'), style: { fontSize: 11, padding: '4px 12px', background: formMode === 'json' ? '#1d4ed8' : '#f3f4f6', color: formMode === 'json' ? '#fff' : '#333', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontWeight: formMode === 'json' ? 600 : 400 }, children: "\uD83D\uDCDD JSON" }), formMode === 'form' && (_jsx("button", { onClick: () => {
                                            const body = buildBodyFromForm(selectedOp.apiKey);
                                            if (body)
                                                setJsonBody(JSON.stringify(body, null, 2));
                                            setFormMode('json');
                                        }, style: { fontSize: 10, padding: '3px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: "Generate JSON \u2192" })), formMode === 'json' && (_jsx("button", { onClick: () => {
                                            const tpl = getTemplate(selectedOp.apiKey, fieldValues);
                                            if (tpl)
                                                setJsonBody(JSON.stringify(tpl, null, 2));
                                        }, style: { fontSize: 10, padding: '3px 10px', background: '#dbeafe', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer' }, children: "\uD83D\uDCCB Load Template" }))] }), formMode === 'form' && (['party_create', 'create_party', 'customer_create', 'create_customer', 'contract_create', 'create_contract'].includes(selectedOp.apiKey)) && (_jsxs("div", { style: { padding: '12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 8 }, children: [_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }, children: [(selectedOp.apiKey.includes('party')) && _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Given Name *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.givenName || '', onChange: e => setSpecFormValues(p => ({ ...p, givenName: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Family Name *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.familyName || '', onChange: e => setSpecFormValues(p => ({ ...p, familyName: e.target.value })) })] })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "MSISDN *" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.msisdn || '', onChange: e => setSpecFormValues(p => ({ ...p, msisdn: e.target.value })), placeholder: "e.g. 46701234567" })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "External ID" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12, background: '#f0f9ff' }, value: specFormValues.externalId || '', onChange: e => setSpecFormValues(p => ({ ...p, externalId: e.target.value })), placeholder: "Auto-generated if empty" })] })] }), _jsxs("div", { style: { marginBottom: 10 }, children: [_jsxs("label", { style: { fontSize: 11, display: 'block', marginBottom: 2, fontWeight: 600 }, children: [selectedOp.apiKey.includes('party') ? 'Party' : selectedOp.apiKey.includes('customer') ? 'Customer' : 'Contract', " Specification"] }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: selectedSpec, onChange: e => setSelectedSpec(e.target.value), children: [_jsx("option", { value: "", children: "-- Select Spec --" }), (selectedOp.apiKey.includes('party') ? specsCache?.partySpecifications :
                                                        selectedOp.apiKey.includes('customer') ? specsCache?.customerSpecifications :
                                                            specsCache?.contractSpecifications || [])?.map((s) => (_jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.id || s.externalId)))] })] }), selectedOp.apiKey.includes('customer') && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Party External ID" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.partyExternalId || '', onChange: e => setSpecFormValues(p => ({ ...p, partyExternalId: e.target.value })), placeholder: "extID-party-<msisdn>" })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "BA Spec" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.baSpec || '', onChange: e => setSpecFormValues(p => ({ ...p, baSpec: e.target.value })), children: [_jsx("option", { value: "", children: "-- Select BA Spec --" }), (specsCache?.billingAccountSpecifications || []).map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.externalId))] })] })] })), selectedOp.apiKey.includes('contract') && (_jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }, children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Product Offering" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.poExternalId || '', onChange: e => setSpecFormValues(p => ({ ...p, poExternalId: e.target.value })), children: [_jsx("option", { value: "", children: "-- Select PO --" }), (specsCache?.productOfferings || []).map((s) => _jsxs("option", { value: s.externalId, children: [s.name, " (", s.externalId, ")"] }, s.externalId))] })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "BA External ID" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.baExternalId || '', onChange: e => setSpecFormValues(p => ({ ...p, baExternalId: e.target.value })), placeholder: "extID_BA-<msisdn>" })] })] })), getSpecChars().length > 0 && (_jsxs("div", { style: { marginTop: 8, padding: '8px', background: '#fff', borderRadius: 4, border: '1px solid #e5e7eb' }, children: [_jsxs("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6, color: '#555' }, children: ["Characteristics (", getSpecChars().length, ")"] }), getSpecChars().map((c) => (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }, children: [_jsxs("span", { style: { fontSize: 11, minWidth: 180, color: c.valueRegulator === 'mustBePersonalized' ? '#c60' : '#555' }, children: [c.name || c.externalId, " ", c.valueRegulator === 'mustBePersonalized' && '*'] }), c.possibleValues?.length > 0 ? (_jsxs("select", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, value: specFormValues[`char_${c.externalId}`] || '', onChange: e => setSpecFormValues(p => ({ ...p, [`char_${c.externalId}`]: e.target.value })), children: [_jsx("option", { value: "", children: "-- Select --" }), c.possibleValues.map((pv) => _jsx("option", { value: pv.value, children: pv.name || pv.value }, pv.value))] })) : (_jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, value: specFormValues[`char_${c.externalId}`] || '', onChange: e => setSpecFormValues(p => ({ ...p, [`char_${c.externalId}`]: e.target.value })), placeholder: c.defaultValue || c.valueType || '' }))] }, c.externalId)))] }))] })), formMode === 'form' && !(['party_create', 'create_party', 'customer_create', 'create_customer', 'contract_create', 'create_contract', 'party_update', 'update_party', 'customer_update', 'update_customer', 'contract_update', 'update_contract'].includes(selectedOp.apiKey)) && (_jsx("div", { style: { padding: '12px', background: '#fefce8', borderRadius: 6, border: '1px solid #fde047', marginBottom: 8, fontSize: 12, color: '#854d0e' }, children: "Spec-driven form not available for this operation. Use \"\uD83D\uDCCB Load Template\" in JSON mode for a pre-filled body structure." })), formMode === 'form' && (['party_update', 'update_party', 'customer_update', 'update_customer', 'contract_update', 'update_contract'].includes(selectedOp.apiKey)) && (_jsxs("div", { style: { padding: '12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', marginBottom: 8 }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }, children: [_jsx("input", { style: { flex: 1, padding: '6px 10px', fontSize: 12 }, placeholder: selectedOp.apiKey.includes('party') ? 'Party External ID (e.g. extID-party-46701234567)' : selectedOp.apiKey.includes('customer') ? 'Customer External ID' : 'MSISDN or Contract External ID', value: specFormValues._fetchId || '', onChange: e => setSpecFormValues(p => ({ ...p, _fetchId: e.target.value })) }), _jsx("button", { disabled: fetchLoading || !specFormValues._fetchId, onClick: async () => {
                                                    setFetchLoading(true);
                                                    setFetchedEntity(null);
                                                    try {
                                                        const id = specFormValues._fetchId;
                                                        let url = '';
                                                        if (selectedOp.apiKey.includes('party'))
                                                            url = `${API}/party?externalId=${encodeURIComponent(id)}`;
                                                        else if (selectedOp.apiKey.includes('customer'))
                                                            url = `${API}/customer?externalId=${encodeURIComponent(id)}`;
                                                        else
                                                            url = `${API}/contract?msisdn=${encodeURIComponent(id)}`;
                                                        const r = await fetch(url);
                                                        if (r.ok) {
                                                            const data = await r.json();
                                                            const entity = Array.isArray(data) ? data[0] : data;
                                                            setFetchedEntity(entity);
                                                            // Pre-fill form values from fetched entity
                                                            const vals = { _fetchId: id };
                                                            if (entity.givenName)
                                                                vals.givenName = entity.givenName;
                                                            if (entity.familyName)
                                                                vals.familyName = entity.familyName;
                                                            if (entity.externalId)
                                                                vals.externalId = entity.externalId;
                                                            const status = entity.status?.slice(-1)[0]?.status || '';
                                                            if (status)
                                                                vals.status = status;
                                                            // Extract characteristics
                                                            for (const ch of (entity.characteristic || [])) {
                                                                const key = ch.charSpecExternalId || ch.charSpecId || '';
                                                                const val = ch.value?.[0]?.value || '';
                                                                if (key && val)
                                                                    vals[`char_${key}`] = val;
                                                            }
                                                            setSpecFormValues(vals);
                                                        }
                                                    }
                                                    catch (e) { /* ignore */ }
                                                    setFetchLoading(false);
                                                }, style: { fontSize: 11, padding: '6px 14px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }, children: fetchLoading ? '...' : '🔍 Fetch' })] }), fetchedEntity && (_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 11, color: '#059669', marginBottom: 8 }, children: ["\u2713 Loaded: ", fetchedEntity.externalId, " (", fetchedEntity.givenName || fetchedEntity.tradingName || '', " ", fetchedEntity.familyName || '', ")"] }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }, children: [selectedOp.apiKey.includes('party') && _jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Given Name" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.givenName || '', onChange: e => setSpecFormValues(p => ({ ...p, givenName: e.target.value })) })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Family Name" }), _jsx("input", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.familyName || '', onChange: e => setSpecFormValues(p => ({ ...p, familyName: e.target.value })) })] })] }), _jsxs("div", { children: [_jsx("label", { style: { fontSize: 11, display: 'block', marginBottom: 2 }, children: "Status" }), _jsxs("select", { style: { width: '100%', padding: '4px 8px', fontSize: 12 }, value: specFormValues.status || '', onChange: e => setSpecFormValues(p => ({ ...p, status: e.target.value })), children: [_jsx("option", { value: "", children: "-- No change --" }), selectedOp.apiKey.includes('party') && _jsxs(_Fragment, { children: [_jsx("option", { value: "PartyActive", children: "PartyActive" }), _jsx("option", { value: "PartyInactive", children: "PartyInactive" })] }), selectedOp.apiKey.includes('customer') && _jsxs(_Fragment, { children: [_jsx("option", { value: "CustomerActive", children: "CustomerActive" }), _jsx("option", { value: "CustomerSuspended", children: "CustomerSuspended" }), _jsx("option", { value: "CustomerInactive", children: "CustomerInactive" })] }), selectedOp.apiKey.includes('contract') && _jsxs(_Fragment, { children: [_jsx("option", { value: "Active", children: "Active" }), _jsx("option", { value: "Halt", children: "Halt" }), _jsx("option", { value: "Terminated", children: "Terminated" })] })] })] })] }), (fetchedEntity.characteristic || []).length > 0 && (_jsxs("div", { style: { padding: '8px', background: '#fff', borderRadius: 4, border: '1px solid #e5e7eb' }, children: [_jsx("div", { style: { fontSize: 11, fontWeight: 600, marginBottom: 6 }, children: "Characteristics" }), (fetchedEntity.characteristic || []).map((ch, i) => {
                                                        const key = ch.charSpecExternalId || ch.charSpecId || `char_${i}`;
                                                        return (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }, children: [_jsx("span", { style: { fontSize: 11, minWidth: 160, color: '#555' }, children: key }), _jsx("input", { style: { flex: 1, padding: '3px 6px', fontSize: 11 }, value: specFormValues[`char_${key}`] || '', onChange: e => setSpecFormValues(p => ({ ...p, [`char_${key}`]: e.target.value })) })] }, i));
                                                    })] }))] }))] })), formMode === 'json' && (_jsx("textarea", { style: styles.textarea, value: jsonBody, onChange: e => setJsonBody(e.target.value), spellCheck: false }))] })), _jsx("button", { style: { ...styles.execBtn, opacity: loading ? 0.6 : 1 }, onClick: handleExecute, disabled: loading, children: loading ? 'Executing...' : 'Execute' }), loading && _jsx("p", { style: styles.loading, children: "Sending request..." }), result !== null && (_jsxs("div", { style: styles.resultContainer, children: [statusCode !== null && (_jsxs("span", { style: {
                                    ...styles.statusBadge,
                                    background: statusCode >= 200 && statusCode < 300 ? '#4caf50' : statusCode >= 400 ? '#d32f2f' : '#f57c00',
                                    color: '#fff',
                                }, children: ["HTTP ", statusCode] })), _jsx("pre", { style: styles.resultText, children: result })] }))] }))] }));
};
export default OperationsPanel;
