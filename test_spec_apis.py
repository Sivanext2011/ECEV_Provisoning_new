#!/usr/bin/env python3.11
import urllib.request, json

BASE = "http://localhost:8000/api/v1"

def test(name, api_key, query_params=None):
    payload = {}
    if query_params: payload["_queryParams"] = query_params
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{BASE}/execute/{api_key}", data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        r = urllib.request.urlopen(req)
        return "✓", r.status
    except urllib.error.HTTPError as e:
        return "✗", e.code
    except: return "✗", 0

specs = [
    ("spec_product_offering", {"productOfferingExternalId": "POP_ReucrringTest"}),
    ("spec_product", {"productSpecificationExternalId": "POPTestProdutSpec"}),
    ("spec_individual", {"externalId": ""}),
    ("spec_customer", {"externalId": ""}),
    ("spec_contract", {"externalId": ""}),
    ("spec_billing_cycle", {"externalId": ""}),
    ("spec_communication_identifier", {"externalId": ""}),
    ("spec_party_role", {"externalId": ""}),
    ("spec_schedule_definition", {"externalId": ""}),
    ("spec_sharing_provider", {"externalId": ""}),
    ("spec_tag", {"externalId": ""}),
    ("spec_entity_list", {"specificationType": "contractSpecification"}),
    ("spec_bucket_determination", {"externalId": ""}),
]

print("SPEC ENQUIRY API TEST")
print("-" * 50)
for api_key, qp in specs:
    ok, status = test(api_key, api_key, qp)
    print(f"  {ok} [{status}] {api_key}")
