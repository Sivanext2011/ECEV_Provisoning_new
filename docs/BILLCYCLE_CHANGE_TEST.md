# Bill Cycle Change - Test Documentation

## Overview

This document demonstrates the bill cycle change procedure including:
1. Provisioning a subscriber with multiple POs
2. Changing the bill cycle with NO_PRORATE
3. Adding replacement POs with new cycle start date
4. Setting expiry on old POs at the new cycle boundary

**Test Date:** 2026-08-25  
**UUID Reference:** `ff3876d7`  
**MSISDN:** 9950099519  
**Initial Bill Cycle:** CHT_billcycle_01  
**New Bill Cycle:** bc_test  
**New Cycle Date:** 2026-09-01T00:00:00.000Z  

---

## Step 1: Provision Subscriber with 4 POs

Initial provisioning with POs: 145001, 255001, 160006, 150006

### Contract Request (relevant section)
```json
{
  "externalId": "contract-ff3876d7",
  "contractSpecification": {"externalId": "CHT_Contract_Postpaid"},
  "status": [{"status": "Active"}],
  "product": [
    {
      "productOfferingExternalId": "145001",
      "externalId": "145001-ff3876d7",
      "name": "145001",
      "status": [{"status": "ProductActive"}],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"},
      "characteristic": [{"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]}]
    },
    {
      "productOfferingExternalId": "255001",
      "externalId": "255001-ff3876d7",
      "name": "255001",
      "status": [{"status": "ProductActive"}],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"},
      "characteristic": [{"charSpecExternalId": "FlatRate", "value": [{"value": "No"}]}]
    },
    {
      "productOfferingExternalId": "160006",
      "externalId": "160006-ff3876d7",
      "name": "160006",
      "status": [{"status": "ProductActive"}],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"}
    },
    {
      "productOfferingExternalId": "150006",
      "externalId": "150006-ff3876d7",
      "name": "150006",
      "status": [{"status": "ProductActive"}],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"}
    }
  ],
  "resource": [
    {"externalId": "msisdn-ff3876d7", "resourceNumber": "9950099519", "resourceSpecificationExternalId": "ext_LRS_MSISDN", "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549"},
    {"externalId": "imsi-ff3876d7", "resourceNumber": "995009950099519", "resourceSpecificationExternalId": "ext_LRS_IMSI", "resourceSpecificationId": "a35baba8-c815-4c2b-b418-09f8a161bff1"}
  ],
  "homeTimeZone": [{"timeZone": "Europe/Stockholm"}]
}
```

### Response: 200 OK ✅
- Contract ID: `4C54F8E256FD49A0875199978EF00762`
- 4 products provisioned
- 2 resources active

---

## Step 2: Update Bill Cycle (NO_PRORATE)

Change bill cycle on the billing account. This is a **Customer PATCH** operation.

### API
```
PATCH /bae/bssfCustomerManagement/v1/customer/{customerExternalId}
```

### Request
```json
{
  "account": [
    {
      "externalId": "ba-ff3876d7",
      "customerBillCycleSpecification": [
        {
          "externalId": "cbcs-ff3876d7",
          "billCycleSpecExternalId": "bc_test",
          "billCycleChangeType": "NO_PRORATE"
        }
      ]
    }
  ]
}
```

### Response: 200 OK ✅

**billCycleChangeType options:**
| Value | Description |
|-------|-------------|
| `NO_PRORATE` | No prorating — switch at boundary |
| `PRORATE_POS_START_NEW` | Prorate positive, start new cycle immediately |
| `PRORATE_NEG_START_NEW` | Prorate negative, start new cycle immediately |

---

## Step 3: Add New POs (145002, 255002) with New Cycle Start Date

Add replacement products with `validFor.startDateTime` set to the new bill cycle date.

### API
```
PATCH /bae/bssfSubscriptionManagement/v1/customer/{customerExternalId}/contract/{contractExternalId}
```

### Request
```json
{
  "product": [
    {
      "productOfferingExternalId": "145002",
      "externalId": "145002-ff3876d7",
      "name": "145002",
      "status": [
        {
          "status": "ProductActive",
          "validFor": {
            "startDateTime": "2026-09-01T00:00:00.000Z"
          }
        }
      ],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"}
    },
    {
      "productOfferingExternalId": "255002",
      "externalId": "255002-ff3876d7",
      "name": "255002",
      "status": [
        {
          "status": "ProductActive",
          "validFor": {
            "startDateTime": "2026-09-01T00:00:00.000Z"
          }
        }
      ],
      "billingAccountReference": {"externalId": "ba-ff3876d7"},
      "baRefForBillCycleAlignedRecurrence": {"externalId": "ba-ff3876d7"}
    }
  ]
}
```

### Response: 200 OK ✅
- Total products now: 6 (4 original + 2 new)

---

## Step 4: Set Expiry on Old POs (145001, 255001)

Expire old products at the new bill cycle boundary.

### API
```
PATCH /bae/bssfSubscriptionManagement/v1/customer/{customerExternalId}/contract/{contractExternalId}
```

### Request
```json
{
  "product": [
    {
      "externalId": "145001-ff3876d7",
      "status": [
        {
          "status": "ProductActive",
          "validFor": {
            "endDateTime": "2026-09-01T00:00:00.000Z"
          }
        }
      ]
    },
    {
      "externalId": "255001-ff3876d7",
      "status": [
        {
          "status": "ProductActive",
          "validFor": {
            "endDateTime": "2026-09-01T00:00:00.000Z"
          }
        }
      ]
    }
  ]
}
```

### Response: 200 OK ✅

---

## Step 5: Remaining POs (160006, 150006)

**No additional update required** for 160006 and 150006.

These products already have `baRefForBillCycleAlignedRecurrence` pointing to `ba-ff3876d7`. Since the bill cycle change was applied on the billing account itself (Step 2), all products referencing that BA will automatically align to the new cycle.

---

## Final State Summary

| Product | External ID | Status | Valid From | Valid To |
|---------|-------------|--------|------------|----------|
| 145001 | `145001-ff3876d7` | ProductActive | (original) | **2026-09-01** (expiring) |
| 255001 | `255001-ff3876d7` | ProductActive | (original) | **2026-09-01** (expiring) |
| 160006 | `160006-ff3876d7` | ProductActive | (original) | (open) |
| 150006 | `150006-ff3876d7` | ProductActive | (original) | (open) |
| 145002 | `145002-ff3876d7` | ProductActive | **2026-09-01** | (open) |
| 255002 | `255002-ff3876d7` | ProductActive | **2026-09-01** | (open) |

| Entity | Value |
|--------|-------|
| Bill Cycle Spec | `bc_test` (changed from `CHT_billcycle_01`) |
| Change Type | NO_PRORATE |
| Cycle Boundary | 2026-09-01 |
| BA Reference | `ba-ff3876d7` (unchanged) |

---

## Sequence Diagram

```
1. Provision:       Party + Customer(BA + BillCycle:CHT_billcycle_01) + Contract(4 POs)
                                    |
2. Bill Cycle:      PATCH Customer → BA.billCycleSpec = bc_test (NO_PRORATE)
                                    |
3. Add New POs:     PATCH Contract → Add 145002, 255002 (startDate = 2026-09-01)
                                    |
4. Expire Old POs:  PATCH Contract → 145001, 255001 endDate = 2026-09-01
                                    |
5. No-op:           160006, 150006 automatically align via BA ref
```

---

## Notes

- Bill cycle change is a **Customer-level** operation (not contract-level)
- All products referencing the same BA get the new cycle automatically
- Use `validFor.startDateTime` on new products to delay activation to cycle boundary
- Use `validFor.endDateTime` on old products to expire them at cycle boundary
- `billCycleChangeType: "NO_PRORATE"` means no mid-cycle adjustment — clean switch at boundary
- The `baRefForBillCycleAlignedRecurrence` on products doesn't need updating — it points to the same BA
