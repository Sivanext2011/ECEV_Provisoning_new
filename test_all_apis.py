#!/usr/bin/env python3.11
"""Final test - fix truncation and verify core APIs work."""
import urllib.request, json

BASE = "http://localhost:8000/api/v1"
MSISDN = "4455667741"
PARTY_EXT = "extID-party-4455667741"
CUST_EXT = "extID-customer-4455667741"
CONTRACT_EXT = "extID-contract-4455667741"

def call(api_key, path_params=None, query_params=None):
    payload = {}
    if path_params: payload["_pathParams"] = path_params
    if query_params: payload["_queryParams"] = query_params
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{BASE}/execute/{api_key}", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = urllib.request.urlopen(req)
        return r.status, "OK"
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:150]
    except Exception as e:
        return -1, str(e)[:100]

results = []
def t(name, api_key, pp=None, qp=None):
    s, msg = call(api_key, pp, qp)
    ok = "✓" if 200 <= s < 300 else "✗"
    results.append((ok, name, api_key, s))
    print(f"  {ok} [{s}] {name}")
    if ok == "✗" and s not in (404, 403, 503, 500): print(f"     {msg[:120]}")

print("CORE API TEST (using execute/{apiKey})")
print("-" * 50)

print("\n[PARTY]")
t("Get Party (extId)", "get_party_by_external_id", pp={"partyExternalId": PARTY_EXT})

print("\n[CUSTOMER]")
t("Get Customer (extId)", "get_customer_by_external_id", pp={"customerExternalId": CUST_EXT})
t("Get Customer (msisdn)", "get_customer_by_msisdn", pp={"msisdn": MSISDN})

print("\n[CONTRACT]")
t("Get Contract (msisdn)", "get_contract_by_msisdn", pp={"msisdn": MSISDN})
t("Get Contract (extId)", "get_contract_by_external_id", pp={"customerExternalId": CUST_EXT, "contractExternalId": CONTRACT_EXT})

print("\n[BALANCE]")
t("Balance (msisdn)", "balance_enquiry_msisdn", pp={"msisdn": MSISDN})
t("Balance (customer)", "balance_enquiry", pp={"customerExternalId": CUST_EXT})

print("\n[RECURRENCE]")
t("Recurrence (commId)", "recurrence_enquiry", qp={"communicationId": MSISDN, "communicationIdType": "E.164"})

print("\n[SPEC ENQUIRY]")
t("Spec PO", "spec_product_offering", qp={"productOfferingExternalId": "PO_Data_Sharing_Provider_CHT"})
t("Spec Product", "spec_product", qp={"productSpecificationExternalId": "PS_Data_Sharing_Provider_CHT"})
t("Spec Entity List (contract)", "spec_entity_list", qp={"specificationType": "contractSpecification"})
t("Spec Entity List (individual)", "spec_entity_list", qp={"specificationType": "individualPartySpecification"})
t("Spec Schedule Def", "spec_schedule_definition", qp={"externalId": ""})
t("Spec Billing Cycle", "spec_billing_cycle", qp={"externalId": ""})

print("\n[SUBSCRIPTION]")
t("Eligible Consumers (custExtId)", "get_eligible_consumers", qp={"customerExternalId": CUST_EXT})
t("Consumer Product (commId)", "get_consumer_product", qp={"communicationId": MSISDN, "communicationIdType": "E.164"})

print("\n[FINANCIAL]")
t("Customer Bill", "get_customer_bill", qp={"communicationId": MSISDN, "communicationIdType": "E.164"})
t("Financial Account", "get_financial_customer_account", qp={"communicationId": MSISDN, "communicationIdType": "E.164"})

print("\n[AGREEMENT]")
t("Get Agreement (partyExt)", "get_agreement", qp={"partyExternalId": PARTY_EXT})

print("\n[COMMUNICATION]")
t("Comm Identity", "get_communication_identity", qp={"communicationId": MSISDN, "communicationIdType": "E.164"})

print("\n" + "=" * 50)
passed = sum(1 for r in results if r[0] == "✓")
total = len(results)
print(f"PASSED: {passed}/{total}")
print("\nFailed (excluding 404/403/503/500 = system/data issues):")
for r in results:
    if r[0] == "✗" and r[3] == 400:
        print(f"  {r[1]} ({r[2]}) → {r[3]}")
