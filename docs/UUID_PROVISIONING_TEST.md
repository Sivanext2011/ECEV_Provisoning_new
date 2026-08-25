# UUID-Based Provisioning & MSISDN Swap - Test Documentation

## Overview

This document demonstrates the UUID-based external ID approach for subscriber provisioning. All entity external IDs use a random UUID reference (`sub_ref`) instead of MSISDN, making them stable across MSISDN swaps.

**Test Date:** 2026-08-25  
**UUID Reference:** `34337ff6`  
**MSISDN:** 9950099507 → swapped to 9950099508  
**IMSI:** 995009950099507  

---

## External ID Mapping

| Entity | Pattern | Example |
|--------|---------|---------|
| Party | `party-{uuid}` | `party-34337ff6` |
| Customer | `customer-{uuid}` | `customer-34337ff6` |
| Contract | `contract-{uuid}` | `contract-34337ff6` |
| Billing Account | `ba-{uuid}` | `ba-34337ff6` |
| Contact Medium | `cm_CMS_SocialMedia_NTF_{uuid}` | `cm_CMS_SocialMedia_NTF_34337ff6` |
| Product | `{poExternalId}-{uuid}` | `255001-34337ff6` |
| MSISDN Resource | `msisdn-{uuid}` | `msisdn-34337ff6` |
| IMSI Resource | `imsi-{uuid}` | `imsi-34337ff6` |
| Bill Cycle Spec | `cbcs-{uuid}` | `cbcs-34337ff6` |

---

## Step 1: Create Party

### Request
```
POST /bae/bssfIndividualPartyManagement/v1/individualParty
```

```json
{
  "externalId": "party-34337ff6",
  "givenName": "Test",
  "familyName": "Sub_34337ff6",
  "individualSpecification": {
    "externalId": "Party_Individual_CHT"
  },
  "status": [
    {
      "status": "PartyActive"
    }
  ],
  "contactMedium": [
    {
      "contactMediumSpecExternalId": "CMS_SocialMedia_NTF",
      "externalId": "cm_CMS_SocialMedia_NTF_34337ff6",
      "validFor": {
        "startDateTime": "2026-08-25T03:54:47.000Z"
      },
      "characteristic": [
        {
          "charSpecExternalId": "SocialMedia",
          "value": [
            {
              "value": "SocialMedia"
            }
          ]
        },
        {
          "charSpecExternalId": "socialMediaId",
          "value": [
            {
              "value": "9950099507"
            }
          ]
        }
      ]
    }
  ]
}
```

### Response: 200 OK
```json
{
  "id": "11079BA29A1041B393F40D76984AC407",
  "externalId": "party-34337ff6",
  "status": [{"status": "PartyActive"}]
}
```

---

## Step 2: Create Customer + Billing Account

### Request
```
POST /bae/bssfCustomerManagement/v1/customer/
```

```json
{
  "externalId": "customer-34337ff6",
  "customerSpecification": {
    "externalId": "CHT_Customer_Postpaid"
  },
  "status": [
    {
      "status": "CustomerActive"
    }
  ],
  "account": [
    {
      "externalId": "ba-34337ff6",
      "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
      "status": [
        {
          "status": "BillingAccountActive"
        }
      ],
      "customerBillCycleSpecification": [
        {
          "externalId": "cbcs-34337ff6",
          "billCycleSpecExternalId": "CHT_billcycle_01",
          "billCycleChangeType": "PRORATE_POS_START_NEW"
        }
      ],
      "contactMediumAssociation": [
        {
          "contactRole": "Notification",
          "language": "en",
          "contactMediumExternalId": "cm_CMS_SocialMedia_NTF_34337ff6",
          "enabled": true,
          "validFor": {
            "startDateTime": "2026-08-25T03:54:47.000Z"
          }
        }
      ]
    }
  ],
  "engagedParty": {
    "externalId": "party-34337ff6",
    "@referredType": "Individual"
  },
  "contactMediumAssociation": [
    {
      "contactRole": "Notification",
      "language": "en",
      "contactMediumExternalId": "cm_CMS_SocialMedia_NTF_34337ff6",
      "enabled": true,
      "validFor": {
        "startDateTime": "2026-08-25T03:54:47.000Z"
      }
    }
  ]
}
```

### Response: 200 OK
```json
{
  "id": "08B34B6FF89442F394FA86D221C96436",
  "externalId": "customer-34337ff6"
}
```

---

## Step 3: Create Contract (with PO 255001 + Resources)

### Request
```
POST /bae/bssfSubscriptionManagement/v1/customer/{customerExternalId}/contract
```

```json
{
  "externalId": "contract-34337ff6",
  "contractSpecification": {
    "externalId": "CHT_Contract_Postpaid"
  },
  "status": [
    {
      "status": "Active"
    }
  ],
  "product": [
    {
      "productOfferingExternalId": "255001",
      "externalId": "255001-34337ff6",
      "correlationId": "1",
      "name": "255001",
      "status": [
        {
          "status": "ProductActive"
        }
      ],
      "billingAccountReference": {
        "externalId": "ba-34337ff6"
      },
      "baRefForBillCycleAlignedRecurrence": {
        "externalId": "ba-34337ff6"
      },
      "characteristic": [
        {
          "charSpecExternalId": "FlatRate",
          "value": [
            {
              "value": "No"
            }
          ]
        }
      ]
    }
  ],
  "resource": [
    {
      "externalId": "msisdn-34337ff6",
      "resourceNumber": "9950099507",
      "resourceSpecificationExternalId": "ext_LRS_MSISDN",
      "productCorrelationId": ["1"],
      "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549"
    },
    {
      "externalId": "imsi-34337ff6",
      "resourceNumber": "995009950099507",
      "resourceSpecificationExternalId": "ext_LRS_IMSI",
      "productCorrelationId": ["1"],
      "resourceSpecificationId": "a35baba8-c815-4c2b-b418-09f8a161bff1"
    }
  ],
  "homeTimeZone": [
    {
      "timeZone": "Europe/Stockholm"
    }
  ],
  "contactMediumAssociation": [
    {
      "contactRole": "Notification",
      "language": "en",
      "contactMediumExternalId": "cm_CMS_SocialMedia_NTF_34337ff6",
      "enabled": true
    }
  ]
}
```

### Response: 200 OK
```json
{
  "id": "0398EE1402B9402B93E84680E89D1BB0",
  "externalId": "contract-34337ff6",
  "product": [
    {
      "id": "...",
      "externalId": "255001-34337ff6",
      "productOfferingExternalId": "255001"
    }
  ],
  "resource": [
    {
      "externalId": "msisdn-34337ff6",
      "resourceNumber": "9950099507",
      "status": [{"status": "ResourceActive"}]
    },
    {
      "externalId": "imsi-34337ff6",
      "resourceNumber": "995009950099507",
      "status": [{"status": "ResourceActive"}]
    }
  ]
}
```

---

## Step 4: Add Product 145001 (Contract Update)

### Request
```
PATCH /bae/bssfSubscriptionManagement/v1/customer/{customerExternalId}/contract/{contractExternalId}
```

```json
{
  "product": [
    {
      "productOfferingExternalId": "145001",
      "externalId": "145001-34337ff6",
      "name": "145001",
      "status": [
        {
          "status": "ProductActive"
        }
      ],
      "billingAccountReference": {
        "externalId": "ba-34337ff6"
      },
      "baRefForBillCycleAlignedRecurrence": {
        "externalId": "ba-34337ff6"
      },
      "characteristic": [
        {
          "charSpecExternalId": "FlatRate",
          "value": [
            {
              "value": "No"
            }
          ]
        }
      ]
    }
  ]
}
```

### Response: 200 OK
```json
{
  "product": [
    {"externalId": "255001-34337ff6", "productOfferingExternalId": "255001"},
    {"externalId": "145001-34337ff6", "productOfferingExternalId": "145001"}
  ]
}
```

---

## Step 5: MSISDN Swap (9950099507 → 9950099508)

### Request
```
PATCH /bae/bssfSubscriptionManagement/v1/customer/{customerExternalId}/contract/{contractExternalId}
```

```json
{
  "resource": [
    {
      "externalId": "msisdn-34337ff6",
      "resourceNumber": "9950099507",
      "resourceSpecificationExternalId": "ext_LRS_MSISDN",
      "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549",
      "status": [
        {
          "status": "ResourceInactive"
        }
      ]
    },
    {
      "externalId": "msisdn2-34337ff6",
      "resourceNumber": "9950099508",
      "resourceSpecificationExternalId": "ext_LRS_MSISDN",
      "productCorrelationId": ["1"],
      "resourceSpecificationId": "8aabb378-affe-4bda-8ba6-55a53ccf4549",
      "status": [
        {
          "status": "ResourceActive"
        }
      ]
    }
  ]
}
```

### Response: 200 OK
```json
{
  "resource": [
    {
      "externalId": "imsi-34337ff6",
      "resourceNumber": "995009950099507",
      "status": [{"status": "ResourceActive"}]
    },
    {
      "externalId": "msisdn-34337ff6",
      "resourceNumber": "9950099507",
      "status": [{"status": "ResourceInactive"}]
    },
    {
      "externalId": "msisdn2-34337ff6",
      "resourceNumber": "9950099508",
      "status": [{"status": "ResourceActive"}]
    }
  ]
}
```

---

## Verification: Post-Swap State

After MSISDN swap, all external IDs remain unchanged:

| Entity | External ID | Status |
|--------|-------------|--------|
| Party | `party-34337ff6` | PartyActive |
| Customer | `customer-34337ff6` | CustomerActive |
| Contract | `contract-34337ff6` | Active |
| BA | `ba-34337ff6` | BillingAccountActive |
| Product 255001 | `255001-34337ff6` | ProductActive |
| Product 145001 | `145001-34337ff6` | ProductActive |
| MSISDN (old) | `msisdn-34337ff6` = 9950099507 | **ResourceInactive** |
| MSISDN (new) | `msisdn2-34337ff6` = 9950099508 | **ResourceActive** |
| IMSI | `imsi-34337ff6` = 995009950099507 | ResourceActive |

**Key Point:** No entity external IDs changed during the MSISDN swap. Only the resource status changed. This eliminates the problem of broken references when MSISDN changes.

---

## Implementation Notes

- UUID is generated as first 8 chars of `crypto.randomUUID()` (e.g., `34337ff6`)
- Contact Medium is created on the Party with `socialMediaId` = MSISDN
- Customer and Contract both reference the Contact Medium via `contactMediumAssociation`
- Resources use `resourceSpecificationId` (internal UUID) + `resourceSpecificationExternalId`
- MSISDN swap deactivates old resource and adds new resource with new externalId
- All billing/product/contract references use the UUID — never the MSISDN
