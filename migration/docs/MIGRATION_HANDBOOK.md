# Classic EC → CBEV Subscriber Migration — Developer Handbook

**Audience:** engineering team building a *production-grade* migration service.
**Status:** implementation specification (vendor-neutral).
**Reference implementation:** the `migration/` Python package in this repository
is a working proof-of-concept. This handbook describes **what the system must
do and why**, so it can be re-implemented in any language/stack with production
concerns (HA, throughput, observability, rollback guarantees) designed in from
the start. Code snippets are illustrative, not prescriptive.

> How to read this handbook: Sections 1–4 are mandatory background (domain,
> contracts, state model). Sections 5–9 are the per-stage specifications you
> implement. Sections 10–14 cover the production concerns (idempotency,
> concurrency, observability, security, testing) that the PoC only partially
> addresses and that you MUST harden.

---

## Table of contents

1. Domain overview & terminology
2. Source and target system contracts
3. Canonical data model (the stage contracts)
4. Migration state machine & correctness invariants
5. Stage 1 — Fetch (Classic EC / UCIP read)
6. Stage 2 — Map (profile → provisioning plan)
7. Stage 3 — Provision (CBEV / BSSF write)
8. Stage 4 — Verify (reconciliation)
9. Stage 5 — Decommission (Classic EC delete)
10. Idempotency, resume & persistence
11. Concurrency, throughput & batch design
12. Error taxonomy, retry & rollback
13. Observability, audit & reconciliation reporting
14. Security & configuration
15. Testing & acceptance strategy
16. Production readiness checklist
17. Appendix A — UCIP operation reference
18. Appendix B — BSSF endpoint reference
19. Appendix C — Mapping workbook schema
20. Appendix D — Worked example (end-to-end)

---

## 1. Domain overview & terminology

The system migrates **prepaid/postpaid mobile subscribers** from a legacy
charging platform to a modern convergent one, one subscriber at a time, with
per-subscriber verification and rollback.

| Term | Meaning |
|------|---------|
| **Classic EC / SDP** | Legacy Ericsson Service Data Point (AIR). Source of truth *until* a subscriber is verified on the target. |
| **UCIP / ACIP** | AIR provisioning protocol. **XML-RPC over HTTP(S)** (not SOAP/CORBA). CPI: *AIR Programmer's Guide UCIP 5.0, LZN40101911*. |
| **CBEV / ECEV** | Target convergent platform. Provisioned via **BSSF REST** (TMF-style JSON APIs under `/bae/...`). |
| **BSSF** | The REST API suite on the target (party / customer / subscription / balance / specification management). |
| **MSISDN** | Subscriber phone number (E.164). The master is the main line; subordinates are companion devices (e.g. a watch). |
| **Service Class** | SDP account classification; maps to a CBEV contract characteristic. |
| **Offer** | SDP product/plan. Maps 1:1 to a CBEV **Product Offering (PO)**. |
| **UT (Usage Threshold)** | Total data allocation / quota (bytes). |
| **UC (Usage Counter / Accumulator)** | Consumed amount (bytes). |
| **Dedicated Account (DA)** | SDP quota container; carries UT. |
| **Bucket** | CBEV balance container on a product; set during migration. |
| **PAM** | Periodic Account Management — the SDP bill-cycle schedule; drives the CBEV bill cycle. |
| **Carryover** | Unused data rolled from one period to the next; modelled as a companion offer + flag. |
| **Partition** | Target platform shard; the subscriber's data lives on one partition. |
| **subRef** | A random per-subscriber reference used to build target external IDs (NOT the MSISDN). |
| **External ID** | Caller-assigned business key on CBEV entities, enabling idempotent create/lookup/delete without server-generated IDs. |

**The core transformation.** For each subscriber you read the full SDP profile
(account, offers, balances, counters, companions, bill-cycle), translate it into
a CBEV provisioning plan (party → customer → contract → products → buckets),
write it, verify the written balances equal the derived values, and only then
delete the subscriber from the SDP.

---

## 2. Source and target system contracts

### 2.1 Classic EC (UCIP/ACIP) — the source read/delete contract

- **Transport:** HTTP POST, `Content-Type: text/xml`, body is an XML-RPC
  `<methodCall>` with a single `<struct>` parameter. Response is a
  `<methodResponse>` `<struct>` or `<fault>`.
- **Endpoint:** `http(s)://<host>:<port>/Air`. Ports: **10011 (HTTP)**,
  **10012 (HTTPS)**; `10010` is legacy AIR-IP. The internal SDP RPC port (8084)
  is **not** the external UCIP endpoint.
- **Auth:** HTTP Basic.
- **User-Agent (mandatory format):** `<client>/<ucipVersion>/<clientVersion>`,
  e.g. `ECEV-Migration/5.0/1.0`.
- **Strict typing (critical).** AIR validates XML-RPC types strictly. Getting a
  type wrong yields hard faults you must get right from day one:
  - `originTimeStamp` must be `<dateTime.iso8601>` (a `<string>` → `responseCode=1002` *Illegal data type*).
  - `negotiatedCapabilities` must be an `<array>` of `<i4>` and is **mandatory**
    for AIR 5.0 (omit → `responseCode=1003` *Data out of bounds*).
  - `originTransactionID` must be **numeric** within bounds (an alphanumeric id → `1003`).
  - Monetary/data `Unit` values are `<i8>` (64-bit), not `<i4>`.
- **Common request members** (every call): `originNodeType`, `originHostName`,
  `originTransactionID`, `originTimeStamp`, `subscriberNumberNAI` (`<i4>`),
  `subscriberNumber`, and `negotiatedCapabilities`.
- **Response code convention:** member `responseCode == 0` → success. Any other
  value, or a `<fault>`, is an error. Note: some codes are **expected and
  non-fatal** during migration (see §5.3).

> Implementation note: because the wire format can vary (member order, nesting,
> namespacing), normalise every response into a flat, name-addressable tree
> before parsing. The PoC converts the `<struct>`/`<array>`/`<fault>` tree into
> elements named after their members so parsers read by field name regardless
> of wire quirks. Reproduce this normalisation layer — it is the single most
> fragile part of the integration.

### 2.2 CBEV (BSSF REST) — the target write/read contract

- **Transport:** HTTPS JSON, TMF-style resources under `/bae/<domain>/v1/...`.
- **Auth:** OAuth2 **password grant**. POST form
  (`grant_type, client_id, username, password, scope`) to the token endpoint;
  use `Bearer <access_token>`. Cache the token until `expires_in` (minus a
  safety margin, e.g. 30 s). The token endpoint does **not** require mTLS.
- **mTLS:** the API calls themselves use mutual TLS (client cert + key; CA for
  server verification). Some routes (e.g. CPM batch) use a *different* client
  cert — support per-route TLS profiles.
- **Partition routing header:** send `ERICSSON.Partition-Id: <id>` on every
  request (required by balance/charging APIs, harmless elsewhere).
- **401 handling:** on `401`, invalidate the cached token, re-fetch once, retry.
- **External-ID addressing:** create/read/delete entities by caller-assigned
  `externalId` so operations are idempotent and resumable without
  server-generated IDs.
- **Idempotent DELETE semantics:** `204`/empty body → success.

> Implementation note: drive endpoints from a **config-based API registry**
> (`{api_key → {method, url_template}}`) with `{{ENV}}` and `{{pathParam}}`
> substitution, rather than hardcoding URLs. This lets you retarget
> environments and API versions without code changes. See Appendix B.

---

## 3. Canonical data model (the stage contracts)

Define explicit, serializable data structures as the contract between stages.
Serializing the plan and the verification report into the state store is what
makes the pipeline resumable and auditable.

**Source profile (output of Fetch):**
```
SubscriberProfile
  master_msisdn, service_class, imsi, language, currency, account_flags
  supervision_expiry, service_fee_expiry
  pam_service_id, pam_class_id, pam_schedule_id, pam_current_period
  offers:            [ Offer{ offer_id, offer_type, start_date, expiry_date,
                              attributes[], is_carryover_companion,
                              carried_amount, carried_unit } ]
  dedicated_accounts:[ DedicatedAccount{ id, value, unit, expiry_date } ]   # UT
  accumulators:      [ Accumulator{ id, value, unit } ]                     # UC
  subordinates:      [ Subordinate{ msisdn, imsi } ]
  raw:               { <operation> : <raw response payload> }               # audit
```

**Provisioning plan (output of Map):**
```
MigrationPlan
  master_msisdn, partition_id, sub_ref
  party_external_id, customer_external_id, contract_external_id, billing_account_external_id
  bill_cycle_spec_external_id, pam_schedule_id
  service_class_ecev
  contract_characteristics: { charName : value }
  products: [ DerivedProduct{ product_offering_external_id, pop_type,
                              bill_cycle_aligned, flat_rate, valid_to,
                              characteristics{}, buckets:[ BucketValue{ spec, amount_bytes, reason } ] } ]
  additional_msisdns: [ Subordinate ]
  warnings: [ str ]
```

**Result (persisted per subscriber):**
```
MigrationResult{ msisdn, state, error, failed_step, failed_assertion,
                 plan, verify_report, ecev_ids, profile }
```

Keep `raw` source payloads and the full `verify_report` — they are your audit
trail and your post-incident debugging material.

---

## 4. Migration state machine & correctness invariants

```
          ┌─────────┐  fetch   ┌─────────┐   map    (in-memory)   provision   ┌─────────────┐
          │ PENDING │ ───────▶ │ FETCHED │ ─────────────────────────────────▶ │ PROVISIONED │
          └─────────┘          └─────────┘                                     └─────────────┘
                │                   │                                                 │
          fetch │ err         map   │ err                               provision err │ (rollback)
                ▼                   ▼                                                  ▼
             FAILED              FAILED                                    FAILED / ROLLED_BACK
                                                                                      ▲
   ┌──────────┐  verify ok   ┌──────────┐   ec-delete ok   ┌────────────┐  verify err│
   │PROVISIONED│ ──────────▶ │ VERIFIED │ ───────────────▶ │ EC_DELETED │  (rollback)─┘
   └──────────┘              └──────────┘                   └────────────┘
```

**Invariants that must hold in production (do not relax these):**

1. **Source-of-truth ordering.** The SDP subscriber is deleted **only after**
   CBEV is `VERIFIED`. Until then the SDP remains authoritative. If anything
   fails before `VERIFIED`, the SDP is untouched.
2. **Verified data is never rolled back.** Rollback (delete CBEV
   contract→customer→party) applies **only** to failures *before/at* verify. A
   failure in the SDP-delete step after `VERIFIED` must **keep** CBEV and flag
   the subscriber for *manual SDP cleanup* — never destroy verified target data.
3. **Idempotency.** Re-running a subscriber already in `VERIFIED` or
   `EC_DELETED` is a no-op unless explicitly forced. External IDs are
   deterministic within a run so retries don't create duplicates.
4. **Atomic-ish contract creation.** Create the contract with all products,
   characteristics and resources in a **single** call so a half-built contract
   is not left behind on partial failure.
5. **Compensation order.** Rollback deletes in strict reverse creation order:
   contract → customer → party. Best-effort, collecting per-step errors.
6. **Every transition is persisted and audited** before the next begins, so an
   interrupted batch resumes safely.

**States:** `PENDING, FETCHED, PROVISIONED, VERIFIED, EC_DELETED, FAILED,
ROLLED_BACK`.


---

## 5. Stage 1 — Fetch (Classic EC / UCIP read)

**Goal:** produce a complete `SubscriberProfile`. Fail fast on identity/offer
reads; tolerate balance reads that are unavailable for pre-active accounts.

### 5.1 Operation sequence

| # | UCIP operation | Mandatory? | Produces | On error |
|---|----------------|-----------|----------|----------|
| 1 | `GetAccountDetails` (flags: subscriber + offer + PAM) | **Yes** | identity, service class, IMSI, language, currency, expiries, PAM schedule | **fatal** |
| 2 | `GetOffers` | **Yes** | offers + attributes + validity + carryover companions | **fatal** |
| 3 | `GetBalanceAndDate` (dedicated-account flag) | No | dedicated accounts (UT) | non-fatal |
| 4 | `GetAccumulators` | No | accumulators (UC) | non-fatal |
| 5 | `GetUsageThresholdsAndCounters` | No | UT/UC spending limits in **bytes** (merged into DA/accumulators keyed by counter id) | non-fatal |
| 6 | `GetMultiSubscriberNumbers` | No | subordinate MSISDN/IMSI | non-fatal |

### 5.2 Request & response per operation

Every request POSTs to `/Air` and shares the same **common members** (origin
fields, `originTimeStamp`, `subscriberNumber`, `subscriberNumberNAI`) plus the
mandatory `negotiatedCapabilities` array. Only the **operation-specific
members** change. Operation 1 shows the common envelope in full; the rest
abbreviate it as `<!-- common members -->`.

#### Op 1 — `GetAccountDetails`
Op-specific members: the three `request*InformationFlag` booleans.
```xml
<?xml version="1.0"?>
<methodCall>
  <methodName>GetAccountDetails</methodName>
  <params><param><value><struct>
    <member><name>originNodeType</name><value><string>EXT</string></value></member>
    <member><name>originHostName</name><value><string>OCSG</string></value></member>
    <member><name>originTransactionID</name><value><string>000179846512340027</string></value></member>
    <member><name>originTimeStamp</name>
      <value><dateTime.iso8601>20261010T05:35:06+0000</dateTime.iso8601></value></member>
    <member><name>subscriberNumberNAI</name><value><i4>1</i4></value></member>
    <member><name>subscriberNumber</name><value><string>886912345678</string></value></member>
    <!-- op-specific -->
    <member><name>requestSubscriberInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>requestOfferInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>requestPamInformationFlag</name><value><boolean>1</boolean></value></member>
    <!-- mandatory for AIR 5.0 -->
    <member><name>negotiatedCapabilities</name><value><array><data>
      <value><i4>809828928</i4></value><value><i4>1832</i4></value>
    </data></array></value></member>
  </struct></value></param></params>
</methodCall>
```
Response:
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>accountID</name><value><string>886912345678</string></value></member>
  <member><name>serviceClassCurrent</name><value><string>5101</string></value></member>
  <member><name>imsi</name><value><string>466920000000001</string></value></member>
  <member><name>languageIDCurrent</name><value><string>2</string></value></member>
  <member><name>supervisionExpiryDate</name><value><string>20270131120000</string></value></member>
  <member><name>pamInformationList</name><value><struct>
    <member><name>pamServiceID</name><value><string>5</string></value></member>
    <member><name>scheduleID</name><value><string>1</string></value></member>
  </struct></value></member>
</struct></value></param></params></methodResponse>
```

#### Op 2 — `GetOffers`
No op-specific members beyond the common envelope.
```xml
<methodCall>
  <methodName>GetOffers</methodName>
  <params><param><value><struct>
    <!-- common members (origin*, timestamp, subscriberNumber, NAI) -->
    <member><name>negotiatedCapabilities</name><value><array><data>
      <value><i4>809828928</i4></value><value><i4>1832</i4></value>
    </data></array></value></member>
  </struct></value></param></params>
</methodCall>
```
Response (array of offer structs; a `*_CARRYOVER` offer carries `carriedAmount`):
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>offer</name><value><array><data>
    <value><struct>
      <member><name>offerID</name><value><string>145001</string></value></member>
      <member><name>offerType</name><value><string>1</string></value></member>
      <member><name>expiryDate</name><value><string>20270131</string></value></member>
      <member><name>offerAttribute</name><value><array><data>
        <value><struct><member><name>name</name><value><string>HighBandwidth</string></value></member>
          <member><name>value</name><value><string>Speed1.5G</string></value></member></struct></value>
        <value><struct><member><name>name</name><value><string>FlatRate</string></value></member>
          <member><name>value</name><value><string>No</string></value></member></struct></value>
      </data></array></value></member>
    </struct></value>
    <value><struct>
      <member><name>offerID</name><value><string>160006</string></value></member>
    </struct></value>
    <value><struct>
      <member><name>offerID</name><value><string>160006_CARRYOVER</string></value></member>
      <member><name>carriedAmount</name><value><string>5</string></value></member>
    </struct></value>
  </data></array></value></member>
</struct></value></param></params></methodResponse>
```

#### Op 3 — `GetBalanceAndDate`
Op-specific member: `requestDedicatedAccountInformationFlag`.
```xml
<methodCall>
  <methodName>GetBalanceAndDate</methodName>
  <params><param><value><struct>
    <!-- common members -->
    <member><name>requestDedicatedAccountInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>negotiatedCapabilities</name><value><array><data>
      <value><i4>809828928</i4></value><value><i4>1832</i4></value></data></array></value></member>
  </struct></value></param></params>
</methodCall>
```
Response (pre-active accounts instead return `responseCode=126` → non-fatal):
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>dedicatedAccountInformation</name><value><array><data>
    <value><struct>
      <member><name>dedicatedAccountID</name><value><string>6145000</string></value></member>
      <member><name>value</name><value><string>50</string></value></member>
      <member><name>expiryDate</name><value><string>20270131</string></value></member>
    </struct></value>
    <value><struct>
      <member><name>dedicatedAccountID</name><value><string>6160006</string></value></member>
      <member><name>value</name><value><string>50</string></value></member>
    </struct></value>
  </data></array></value></member>
</struct></value></param></params></methodResponse>
```

#### Op 4 — `GetAccumulators`
No op-specific members.
```xml
<methodCall>
  <methodName>GetAccumulators</methodName>
  <params><param><value><struct>
    <!-- common members + negotiatedCapabilities -->
  </struct></value></param></params>
</methodCall>
```
Response:
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>accumulator</name><value><array><data>
    <value><struct>
      <member><name>accumulatorID</name><value><string>6145000</string></value></member>
      <member><name>value</name><value><string>20</string></value></member>
    </struct></value>
    <value><struct>
      <member><name>accumulatorID</name><value><string>6160006</string></value></member>
      <member><name>value</name><value><string>30</string></value></member>
    </struct></value>
  </data></array></value></member>
</struct></value></param></params></methodResponse>
```

#### Op 5 — `GetUsageThresholdsAndCounters`
No op-specific members. Values are already in **bytes**. The parser merges
UT → dedicated accounts and UC → accumulators keyed by `usageCounterID`; the
threshold whose `usageThresholdID == usageCounterID` is the provisioned UT
(system thresholds such as the 50-prefixed ones are ignored).
```xml
<methodCall>
  <methodName>GetUsageThresholdsAndCounters</methodName>
  <params><param><value><struct>
    <!-- common members + negotiatedCapabilities -->
  </struct></value></param></params>
</methodCall>
```
Response:
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>usageCounterUsageThresholdInformation</name><value><array><data>
    <value><struct>
      <member><name>usageCounterID</name><value><string>6145000</string></value></member>
      <member><name>usageCounterValue</name><value><i8>21474836480</i8></value></member>
      <member><name>usageThresholdInformation</name><value><array><data>
        <value><struct>
          <member><name>usageThresholdID</name><value><string>6145000</string></value></member>
          <member><name>usageThresholdValue</name><value><i8>53687091200</i8></value></member>
        </struct></value>
      </data></array></value></member>
    </struct></value>
  </data></array></value></member>
</struct></value></param></params></methodResponse>
```

#### Op 6 — `GetMultiSubscriberNumbers`
No op-specific members.
```xml
<methodCall>
  <methodName>GetMultiSubscriberNumbers</methodName>
  <params><param><value><struct>
    <!-- common members + negotiatedCapabilities -->
  </struct></value></param></params>
</methodCall>
```
Response:
```xml
<methodResponse><params><param><value><struct>
  <member><name>responseCode</name><value><int>0</int></value></member>
  <member><name>masterNumber</name><value><string>886912345678</string></value></member>
  <member><name>subordinate</name><value><array><data>
    <value><struct>
      <member><name>subordinateNumber</name><value><string>886955550000</string></value></member>
      <member><name>imsi</name><value><string>466920000009999</string></value></member>
    </struct></value>
  </data></array></value></member>
</struct></value></param></params></methodResponse>
```

> **Fault shape.** On error AIR returns a `<fault>` with `faultCode`/`faultString`
> instead of a struct. Normalise it to the same `responseCode`/`faultString`
> fields so one check path handles both success and failure.

### 5.3 Error handling rules

- **`responseCode != 0` or `<fault>`** → raise a typed error. Normalise faults
  into the same `responseCode`/`faultString` shape as struct responses so one
  check path handles both.
- **`responseCode=126` (*Account not active*)** on `GetBalanceAndDate` /
  `GetAccumulators` is **expected** for pre-active subscribers → log at INFO,
  continue with empty balances. Do **not** fail the migration.
- **`1002` / `1003`** indicate a request-construction bug (wrong XML-RPC type) —
  these should never occur in a correct implementation; treat as a hard defect.

### 5.4 Data to capture and why

- **Identity:** `accountID`/`subscriberNumber`, `imsi` — the master line.
- **Service class** → target contract characteristic.
- **PAM `scheduleID`** → target bill cycle (per-schedule mapping, §6).
- **Offers + attributes** → target products + characteristics; detect
  `*_CARRYOVER` companions and fold them into their base offer.
- **UT (dedicated account / usage threshold)** and **UC (accumulator / usage
  counter)** — both normalised to **bytes**. `GetUsageThresholdsAndCounters`
  returns bytes directly; `GetBalanceAndDate`/`GetAccumulators` return unit
  values you convert using the configured bytes-per-unit constants.
- **Subordinates** → additional MSISDN resources on the same contract.

> Byte normalisation is the backbone of correctness: everything downstream
> (buckets, verification) compares **bytes**. Decide the GiB convention
> (`1 GB = 1073741824 B`) once, in config, and apply it everywhere.

---

## 6. Stage 2 — Map (profile → provisioning plan)

**Goal:** deterministically transform a `SubscriberProfile` into a
`MigrationPlan`. **All business rules must be data-driven**, not hardcoded, so
operations can adapt mappings without a code release.

### 6.1 Externalised rules (the mapping workbook)

The PoC loads an Excel workbook; in production prefer a versioned, reviewable
artifact (workbook, YAML, or a config service) with the same logical sheets.
See Appendix C for the exact schema.

| Rule set | Drives |
|----------|--------|
| Settings | byte constants, external-id patterns, partition strategy, default QoS, global bill cycle, char names |
| ServiceClassMap | SDP service class → CBEV ServiceClass value |
| ScheduleBillCycleMap | SDP PAM schedule id → CBEV `billCycleSpecExternalId` |
| FamilyBucketSpecs | per offer: PO external id, POP type, bill-cycle-aligned flag, account/counter/carryover bucket specs, flat-rate default |
| OfferAttributeMap | SDP offer attribute → CBEV characteristic (target product/contract, value transform) |
| ParameterMapping | derivation expressions for bucket values and product fields |

### 6.2 Derivation logic (what data is considered)

1. **External IDs** use a random 8-char `subRef` (e.g. first 8 of a UUID4):
   `party-<subRef>`, `customer-<subRef>`, `contract-<subRef>`, `ba-<subRef>`.
   The MSISDN is carried **only** on the MSISDN resource and the `accountID`
   characteristic — never embedded in these keys. (Patterns are configurable.)
2. **Partition** selection strategy: `fixed` | `roundrobin` (deterministic by
   last digit) | `hash` (stable SHA-1 of MSISDN modulo partition count). Hash is
   the default because it is stable across retries.
3. **Bill cycle:** map the subscriber's PAM `scheduleID` → `billCycleSpecExternalId`
   via ScheduleBillCycleMap; fall back to the global setting if unmapped.
4. **Service class:** map via ServiceClassMap; pass through unmapped values but
   record a `warning` so operations can complete the map.
5. **Per offer** (skip carryover companions here — they fold into their base):
   - If no FamilyBucketSpecs row → **skip with a warning** (never guess a PO).
   - **FlatRate** (offer attribute wins, else family default) → **unlimited,
     emit no bucket**, carry the `FlatRate=Yes` characteristic.
   - Otherwise emit buckets (values in **bytes**):
     - **account bucket = `UT − UC`** (remaining quota, floored at 0),
     - **counter bucket = `UC`** (consumed),
     - **carryover account = carried bytes**, **carryover flag = 1** (if a
       companion is present).
   - UT comes from the dedicated account matching the account bucket spec's
     numeric id; UC from the matching accumulator. Convert to bytes.
   - Product `valid_to` = offer `expiry_date` for fixed-expiry offers.
6. **Characteristics:** apply OfferAttributeMap (per-attribute transform:
   `asis` | `upper` | `lower` | `map:A=X;B=Y`). Always set `accountID` =
   master MSISDN and a default `QoS_info`.
7. **Bill-cycle-aligned flag** (per catalog rule): offers that have a Product
   Offering Price (POP) carry `baRefForBillCycleAlignedRecurrence`; offers
   without a POP must **not**. Driven by the FamilyBucketSpecs flag — getting
   this wrong causes CBEV catalog/validation errors.

### 6.3 Safe expression evaluation (security requirement)

Derivation expressions come from an operations-controlled file. They must run in
a **sandbox with no access to language builtins** — expose only an explicit
whitelist of names (`UT, UC, carried, offer_id, service_class, …`) and a small
set of math helpers (`abs, min, max, round, int, float, floor, ceil,
to_bytes, map_service_class`). Treat the workbook as **untrusted input**: a
mapping file must never be able to execute arbitrary code or reach the
filesystem/network. (The PoC uses a restricted `eval`; in other stacks use a
proper expression evaluator, not the language's native eval.)

### 6.4 Dry-run

Support a **dry-run** that stops after Map and emits the plan (external IDs +
bucket adjustments). This is the primary pre-migration validation tool for
operations; make its output machine-readable (JSON) as well as human-readable.

---

## 7. Stage 3 — Provision (CBEV / BSSF write)

**Goal:** create the subscriber on CBEV from the plan. Minimal call set, each
body deterministic for idempotency.

### 7.1 Call sequence

| # | API (registry key) | Purpose | Key body elements |
|---|--------------------|---------|-------------------|
| 1 | `create_party` | Individual party | `externalId`, `partitionId`, name, `individualSpecification.externalId` |
| 2 | `create_customer` | Customer + embedded billing account | `engagedParty` ref, `customerSpecification`, `account[]` with `billingAccountSpecExternalId` + `customerBillCycleSpecification` |
| 3 | `create_contract` | **One call**: contract + all products + characteristics + resources | `contractSpecification`, `status:[{Active}]` (no `validFor`), contract chars, `resource[]` (master + subordinates), `product[]` |
| 4 | `product_bucket_adjustment` × N | Set each bucket to the migrated value | `action:Set`, `unitOfMeasure:byte`, amount, container `validFor` |

### 7.2 Spec external-ID resolution (avoid 404s)

Merge target spec external IDs from the environment config (validated against
the live catalog) first, then let migration-specific overrides apply **only**
what they explicitly set. Posting a placeholder/non-existent spec external id
(party/customer/contract/billing-account/MSISDN-resource) returns **404** — so
never ship default placeholder spec ids into a request.

### 7.3 Contract body — hard-won rules

- Use a **bare** `status:[{"status":"Active"}]` with **no `validFor`**. Adding a
  future `startDateTime` makes CPM treat it as future-dated and demand a
  `preInitializationState` → **403 BusinessLogicForbids**.
- `baRefForBillCycleAlignedRecurrence` is present **iff** the offer is
  bill-cycle-aligned (has a POP). Mismatches fail catalog validation.
- Resources: one MSISDN resource per master + each subordinate, referencing the
  resource spec by `resourceSpecificationExternalId` (preferred) or
  `resourceSpecificationId`.

### 7.4 Bucket adjustment — the time-slice trap (read carefully)

A CBEV `Set` on a bucket is **time-sliced**: naively setting a value opens a
*new* value container starting "now", leaving the old (0) container as the
current one for the rest of the current second. Two consequences:

1. **Target the existing container.** Before adjusting, do a **balance enquiry**
   to read the bucket's existing value container (`validFor.startDateTime` +
   `bucketSpecId`) and send those in the `Set` so it updates **in place**.
2. **Never send the unsettable sentinel start** `0001-01-01T...` — CBEV rejects
   it with **403**. If the real start is unknown, fall back to a wide window
   (`0001` is invalid as a *start*; use the real creation time or the active
   container's real start).

Example request:
```json
{
  "triggerTime": "2026-10-10T05:35:10.000Z",
  "customerExternalId": "customer-1a2b3c4d",
  "contractExternalId": "contract-1a2b3c4d",
  "productExternalId": "extID_145001-1a2b3c4d",
  "bucketSpecExternalId": "6145000",
  "reason": "MIGRATION",
  "amount": { "number": 32212254720, "decimalPlaces": 0 },
  "validFor": { "startDateTime": "2026-10-01T00:00:00.000Z",
                "endDateTime": "9999-12-31T12:00:00.001+00:00" },
  "unitOfMeasure": "byte",
  "action": "Set"
}
```

### 7.5 Failure → rollback

Any failure in this stage triggers **reverse-order compensation**: delete
contract → customer → party (best-effort, collect per-step errors), set state
`FAILED`, persist the error and the compensation outcome.

---

## 8. Stage 4 — Verify (reconciliation)

**Goal:** prove the CBEV state equals the plan before the SDP is deleted. This
is the gate that makes the whole migration safe.

### 8.1 Procedure

1. **Settle delay** (e.g. ~5 s). Because of time-slicing, a balance enquiry in
   the same second as the `Set` can still see the old container as current.
   Wait so "now" is clearly inside the new container window.
2. **Balance enquiry** by MSISDN.
3. **Flatten buckets** reading each bucket's **top-level effective `amount`**.
   Do **not** descend into `valueContainer` (time-sliced history) — a `Set`
   leaves a stale expired `0` container there that would mask the real value.
4. **Assert** for every planned bucket: `|actual − expected| ≤ tolerance_bytes`
   (tolerance configurable; default 0).
5. **Subordinates:** assert every additional MSISDN resolves to the contract.

### 8.2 Retry ladder

If the first reconciliation fails: settle again → re-verify → (if still failing)
**re-apply the bucket adjustments once** → settle → re-verify. Only after the
ladder is exhausted do you treat it as a real mismatch: record the
`first_failing_assertion`, **roll back CBEV**, set state `ROLLED_BACK`.

### 8.3 Output

Produce a structured reconciliation report (`passed`, per-check
expected/actual/passed, `actual_buckets`). On success, a human-readable
**source↔target comparison** (field / offer / bucket, with OK/DIFF markers) is
valuable for operations sign-off.

---

## 9. Stage 5 — Decommission (Classic EC delete)

**Goal:** remove the subscriber from the SDP — **only after `VERIFIED`**.

- Delete each offer from the SDP (UCIP `DeleteOffer` per offer, which requires an
  `offerID` member in addition to the common members).
- **All offers deleted** → state `EC_DELETED`.
- **Partial / any error** → **keep the verified CBEV**, leave state at
  `VERIFIED`, and flag the subscriber for **manual SDP cleanup**. Do **not**
  roll back CBEV — the target is already correct and authoritative.
- Support a `--no-ec-delete` mode (provision + verify only) for phased cutovers
  where SDP decommissioning happens later in bulk.


---

## 10. Idempotency, resume & persistence

The PoC uses a local SQLite file. **For production this is a critical design
area** — a single-file store is not safe for concurrent workers or HA.

**Requirements:**
- **Per-subscriber state record:** `msisdn (PK), state, error, failed_step,
  failed_assertion, plan_json, verify_json, ecev_ids_json, updated_at`.
- **Append-only audit log:** `(msisdn, step, status, detail, timestamp)` — one
  row per transition/attempt. This is your legal/operational record.
- **Idempotency gate:** before processing, read the current state; skip terminal
  states (`VERIFIED`, `EC_DELETED`) unless `force`. Determinism of external IDs
  within a run makes mid-stage retries safe.
- **Write-before-advance:** persist each state transition *before* starting the
  next stage so a crash resumes correctly.

**Production hardening:**
- Use a transactional, concurrently-accessible datastore (PostgreSQL or
  equivalent) with row-level locking / `SELECT … FOR UPDATE SKIP LOCKED` so
  multiple workers can claim subscribers without collision.
- Store a **lease/owner + heartbeat** on each in-flight record so a crashed
  worker's subscribers can be reclaimed after a timeout.
- Keep `plan_json` and `verify_json` for every subscriber for audit and
  re-verification; never overwrite audit history.
- Consider an **outbox** pattern if emitting events to downstream systems.

---

## 11. Concurrency, throughput & batch design

The PoC processes a batch **sequentially**. Production will need throughput.

- **Parallelism unit = one subscriber.** Subscribers are independent; parallelise
  across them, never within a single subscriber's stages (the stages are
  ordered and stateful).
- **Bounded worker pool** with a configurable concurrency limit. Size it to the
  **slowest dependency**, usually the SDP/AIR node and the CBEV token/mTLS
  throughput.
- **Rate limiting / backpressure** toward both platforms; respect any AIR
  per-node session limits and CBEV API quotas.
- **Shared token cache** across workers (with the single-flight lock pattern so
  only one worker refreshes an expired token).
- **Partition-aware batching:** if partitions have independent capacity,
  schedule to spread load across them (ties into the partition strategy in §6).
- **Chunked input:** accept large MSISDN lists (file or queue), checkpoint
  progress, and make the whole batch **resumable** from the state store rather
  than from the input file position.
- **Graceful shutdown:** on SIGTERM, stop claiming new subscribers, let in-flight
  ones reach a persisted state, then exit.

---

## 12. Error taxonomy, retry & rollback

Classify every failure so you can decide retry vs. rollback vs. manual queue.

| Class | Examples | Handling |
|-------|----------|----------|
| **Transient** | network timeout, 5xx, token expiry (401), AIR socket reset | retry with capped exponential backoff + jitter; idempotent via external IDs |
| **Expected non-fatal (source)** | UCIP `126` account-not-active on balance reads | continue with empty balances |
| **Request-construction defect** | UCIP `1002`/`1003`, CBEV `400` schema errors | do not retry; alert — it's a code/config bug |
| **Business/validation** | CBEV `403 BusinessLogicForbids`, `404` missing spec, reconciliation mismatch | no blind retry; fix input/mapping; mismatch → rollback |
| **Partial decommission** | some SDP `DeleteOffer` fail after VERIFIED | keep CBEV, flag manual SDP cleanup |

**Rollback contract (repeat of the invariant, because it's the highest risk):**
- Pre-verify failure → delete CBEV contract→customer→party (best-effort).
- Post-verify SDP-delete failure → **never** touch CBEV; route to a
  manual-cleanup queue.
- Record compensation results in the audit log; surface them in the report.

**Dead-letter queue:** subscribers that exhaust retries land in `FAILED` with a
captured error + `failed_step`; the report lists them for operator action.

---

## 13. Observability, audit & reconciliation reporting

- **Structured logs** (JSON) per subscriber/stage with a correlation id
  (the MSISDN or a run id). Mask secrets: never log the OAuth token (log
  `Bearer ***`), SDP Basic credentials, or full PII; keep routing headers
  (`ERICSSON.Partition-Id`) visible for debugging.
- **Request/response capture:** keep the raw SDP payloads and the CBEV
  request/response bodies (bounded size) for a retention window — essential for
  disputed migrations and defect triage.
- **Metrics:** counts by state, per-stage latency (SDP read, CBEV write, verify
  settle), throughput, retry rate, rollback rate, reconciliation pass rate.
  Export to your monitoring stack; alert on rollback-rate and failure-rate
  thresholds.
- **Reconciliation report:** on demand and at batch end — counts by state plus
  the list of failed subscribers (`msisdn`, `failed_step`, `error`). Add a
  per-subscriber source↔target comparison for sign-off.
- **Progress/resumability:** expose how far a batch has progressed and which
  subscribers remain, driven by the state store (not the input file).

---

## 14. Security & configuration

- **Secrets:** SDP Basic credentials, CBEV OAuth2 password-grant credentials,
  and TLS private keys must come from a secret manager / mounted secrets — never
  committed. The repo's config templates ship with empty/placeholder values on
  purpose.
- **mTLS:** support per-route client-cert profiles (e.g. a distinct cert for the
  CPM batch route). Validate server certs in production (`ssl_verify=true` with
  a real CA bundle) — the PoC disables verification for lab use; do **not** carry
  that into production.
- **Least privilege:** the migration service's SDP and CBEV accounts should have
  exactly the operations it needs (read + the specific writes/deletes), nothing
  more.
- **Config-as-data:** environment roots, API registry, auth, TLS, network/proxy,
  and spec defaults are all externalised config. Version and review it.
  Validate config at startup (fail fast on missing endpoints/specs).
- **Untrusted mapping input:** the mapping rules file is operator-editable;
  evaluate derivations in a sandbox (§6.3) and validate the file's schema before
  a run.
- **Input validation:** validate MSISDN format before any call; reject/quarantine
  malformed input rather than sending it to the SDP.

---

## 15. Testing & acceptance strategy

- **Unit tests** for the two riskiest pure functions:
  - the **UCIP response normaliser + parsers** (feed recorded `<methodResponse>`
    fixtures, including `<fault>` and pre-active `126` cases),
  - the **mapping engine** (profile → plan: UT−UC math, FlatRate→no-bucket,
    carryover, service-class/bill-cycle mapping, external-id patterns).
- **Body-builder tests:** assert the exact JSON for party/customer/contract/
  bucket-adjustment bodies (characteristics, resources, bill-cycle-aligned flag,
  bare `Active` status, byte amounts).
- **Contract/integration tests** against SDP and CBEV test environments or
  recorded fixtures (golden request/response pairs).
- **State-machine tests:** force failures at each stage and assert the correct
  terminal state and compensation (rollback vs. keep-and-flag).
- **Idempotency tests:** re-run a `VERIFIED`/`EC_DELETED` subscriber → no-op;
  re-run a `FAILED` subscriber → clean retry with no duplicate CBEV entities.
- **Acceptance gates:** reconciliation pass rate = 100% on a representative
  sample; zero verified-data rollbacks; dry-run output reviewed by operations;
  rollback and manual-cleanup paths exercised in a game-day.

---

## 16. Production readiness checklist

- [ ] UCIP strict typing verified (`dateTime.iso8601`, `i8` units, numeric txid,
      mandatory `negotiatedCapabilities`).
- [ ] Response normaliser handles struct, array, nested struct, and fault.
- [ ] Pre-active (`126`) handled as non-fatal.
- [ ] Byte normalisation consistent across fetch, map, verify.
- [ ] Mapping rules externalised, schema-validated, sandboxed evaluation.
- [ ] Spec external IDs sourced from validated env config (no placeholder 404s).
- [ ] Contract created in one call; bare `Active` status; correct
      bill-cycle-aligned flag.
- [ ] Bucket `Set` targets existing container; never sends `0001-…` start.
- [ ] Verify reads top-level `amount`, not `valueContainer`; settle delay +
      retry ladder in place.
- [ ] SDP delete only after `VERIFIED`; post-verify failures keep CBEV + flag.
- [ ] Rollback = reverse order, best-effort, audited.
- [ ] Concurrent-safe state store with leases; write-before-advance.
- [ ] Bounded concurrency, rate limiting, shared token cache, graceful shutdown.
- [ ] OAuth2 token caching + 401 retry; per-route mTLS; server-cert verification on.
- [ ] Secrets from a secret manager; no secrets/PII/tokens in logs.
- [ ] Metrics, structured logs, audit log, reconciliation report, dead-letter queue.
- [ ] Dry-run reviewed; game-day for rollback & manual-cleanup paths.

---

## 17. Appendix A — UCIP operation reference

| Operation | Direction | Purpose | Notable members |
|-----------|-----------|---------|-----------------|
| `GetAccountDetails` | read | identity, service class, PAM | `request{Subscriber,Offer,Pam}InformationFlag` |
| `GetOffers` | read | offer list + attributes | — |
| `GetBalanceAndDate` | read | dedicated accounts (UT) | `requestDedicatedAccountInformationFlag` |
| `GetAccumulators` | read | accumulators (UC) | — |
| `GetUsageThresholdsAndCounters` | read | UT/UC in bytes | returns `usageCounterUsageThresholdInformation[]` |
| `GetMultiSubscriberNumbers` | read | master + subordinates | — |
| `DeleteOffer` | write/delete | remove offer from SDP | `offerID` |
| `InstallSubscriber` | write | (available) create prepaid sub | `serviceClassNew`, `pamServiceID`, `dedicatedAccountUpdateInformation` (absolute only) |
| `UpdateBalanceAndDate` | write | set/adjust UT | `dedicatedAccountUpdateInformation` |
| `UpdateAccumulators` | write | set/adjust UC | `accumulatorUpdateInformation` |
| `UpdateUsageThresholdsAndCounters` | write | set UT (`i8`) + UC | `usageThreshold/CounterUpdateInformation` |
| `UpdateOffer` | write | add/update offers | `offerUpdateInformationList` |

XML-RPC typing cheatsheet: `string` (default), `i4` (ids/enums), `i8`
(Unit/data/money values), `boolean` (flags), `dateTime.iso8601` (timestamps),
`array` of `i4` (`negotiatedCapabilities`), `struct`/array-of-struct (update
information lists).

---

## 18. Appendix B — BSSF endpoint reference (migration subset)

Endpoints are templated with `{{ROOT_BAE}}` and path params. Full registry in
`config/config.template.json`.

| Registry key | Method | Path (under `{{ROOT_BAE}}`) |
|--------------|--------|------------------------------|
| `create_party` | POST | `/bae/bssfIndividualPartyManagement/v1/individualParty` |
| `delete_party_by_external_id` | DELETE | `/bae/bssfIndividualPartyManagement/v1/individualPartyExternalId/{{partyExternalId}}` |
| `create_customer` | POST | `/bae/bssfCustomerManagement/v1/customer/` |
| `delete_customer_by_external_id` | DELETE | `/bae/bssfCustomerManagement/v1/customerExternalId/{{customerExternalId}}` |
| `create_contract` | POST | `/bae/bssfSubscriptionManagement/v1/customerExternalId/{{customerExternalId}}/contractExternalId` |
| `delete_contract_by_external_id` | DELETE | `/bae/bssfSubscriptionManagement/v1/customerExternalId/{{customerExternalId}}/contractExternalId/{{contractExternalId}}` |
| `product_bucket_adjustment` | POST | `/bae/bssfBalanceManagement/v1/productBucketAdjustment/adjust` |
| `balance_enquiry_msisdn` | GET | `/bae/bssfBalanceEnquiry/v1/balance?communicationId={{msisdn}}&communicationIdType=E.164&balanceType=ALL` |
| `spec_bill_cycle` | GET | `/bae/bssfSpecificationEnquiry/v1/billingCycleSpecification?...` |

**Request contract reminders:** OAuth2 Bearer (password grant, cached);
`ERICSSON.Partition-Id` header; mTLS (per-route cert); 401→refresh→retry once;
`204`/empty → treat as success.

---

## 19. Appendix C — Mapping workbook schema

| Sheet | Columns |
|-------|---------|
| `Settings` | `key, value, description` — keys: `bytes_per_GB/MB/KB`, `default_qos_info`, `partition_strategy`, `partition_values`, `*_external_id_pattern`, `*_spec_external_id`, `service_class_char_name` |
| `ServiceClassMap` | `sdp_service_class, sdp_plan_description, ecev_service_class_value` |
| `ScheduleBillCycleMap` | `sdp_schedule_id, sdp_schedule_name, ecev_bill_cycle_spec_external_id` |
| `FamilyBucketSpecs` | `offer_id, family, po_external_id, pop_type, bill_cycle_aligned, account_bucket_spec, counter_bucket_spec, carryover_account_bucket_spec, carryover_flag_bucket_spec, flat_rate_default` |
| `OfferAttributeMap` | `sdp_attribute_name, ecev_char_name, target(product\|contract), value_transform(asis\|upper\|lower\|map:A=X;…), description` |
| `ParameterMapping` | `sdp_source, ecev_target, target_scope(product_char\|contract_char\|product\|bucket), derivation, description` |

Derivation context exposes: `master_msisdn, service_class, offer_id,
offer_expiry, offer_start, UT, UC, carried, carried_raw, flat_rate,
to_bytes(x[,unit]), map_service_class(x), bytes_per_unit(unit)` plus the math
whitelist. **No builtins.**

Default derivations: account bucket `to_bytes(UT - UC)`, counter bucket
`to_bytes(UC)`, carryover account `to_bytes(carried)`, carryover flag `1`.

---

## 20. Appendix D — Worked example (end-to-end)

Master `886912345678` + watch `886955550000`, Service Class `5101`, PAM
schedule `1`.

- Offer `145001` (Basic): UT 50 GB, UC 20 GB, `HighBandwidth=Speed1.5G`,
  `FlatRate=No`.
- Offer `160006` (Add-on): UT 50 GB, UC 30 GB, + carryover companion
  `160006_CARRYOVER` carrying 5 GB.

**Fetch** → profile with two offers (+1 companion), DAs `{6145000:50GB,
6160006:50GB}`, accumulators `{6145000:20GB, 6160006:30GB}`, one subordinate.

**Map** →
- `subRef = 1a2b3c4d`; ids `party-1a2b3c4d`, `customer-1a2b3c4d`,
  `contract-1a2b3c4d`, `ba-1a2b3c4d`.
- bill cycle from schedule `1` → `CHT_billcycle_01`.
- Basic → account bucket `6145000 = (50−20) GB = 32212254720 B`,
  counter bucket `20 GB`.
- Add-on → account bucket `6160006 = (50−30) GB = 21474836480 B`,
  counter `30 GB`, carryover account `5 GB`, carryover flag `1`.

**Provision** → create party → customer(+BA on `CHT_billcycle_01`) →
contract(2 products, chars, 2 MSISDN resources) → 6 bucket adjustments.

**Verify** → settle, balance enquiry, assert each bucket's effective `amount`
equals the derived bytes, assert the watch resolves to the contract → `VERIFIED`.

**Decommission** → `DeleteOffer` for `145001`, `160006`,
`160006_CARRYOVER` → `EC_DELETED`.
