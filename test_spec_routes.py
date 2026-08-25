import urllib.request, json

BASE = "http://localhost:8001/api/v1"

endpoints = [
    "productOffering", "product", "individual", "customer", "contract",
    "billing_account", "billingCycle", "contactMedium", "communicationIdentifier",
    "partyRole", "agreementItem", "agreement", "bucket", "bucketDetermination",
    "characteristicSet", "commonDimension", "commonDimensionSpec",
    "customerFacingService", "customerList", "entityList", "genericBusinessSetting",
    "globalList", "globalListData", "organization", "priceTaxCategory",
    "productOfferingPrice", "productPriorityList", "referenceDataList",
    "resource", "scheduleDefinition", "settlementAccount", "sharingProvider",
    "tag", "taxCodeDetail", "taxConfiguration", "taxExemption", "taxPackage",
    "taxRuleTemplate"
]

print("Testing %d spec endpoints against %s/spec/..." % (len(endpoints), BASE))
print("")
passed = 0
failed = []

for ep in endpoints:
    url = "%s/spec/%s" % (BASE, ep)
    try:
        r = urllib.request.urlopen(url, timeout=5)
        code = r.status
        print("  OK  %-30s -> %d" % (ep, code))
        passed += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:80]
        # 404 from tool = route missing; 4xx/5xx from BSSF = route exists but API error
        if "Not Found" in body and e.code == 404:
            print("  FAIL %-30s -> %d ROUTE NOT FOUND" % (ep, e.code))
            failed.append(ep)
        else:
            # Route exists, BSSF returned error (expected without valid externalId)
            print("  OK  %-30s -> %d (BSSF error - route exists)" % (ep, e.code))
            passed += 1
    except Exception as e:
        print("  ERR %-30s -> %s" % (ep, str(e)[:60]))
        failed.append(ep)

print("")
print("=" * 50)
print("Results: %d/%d routes exist, %d missing" % (passed, len(endpoints), len(failed)))
if failed:
    print("\nMissing routes:")
    for ep in failed:
        print("  - /spec/%s" % ep)
