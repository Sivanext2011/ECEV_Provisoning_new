# Classic EC → CBEV Migration — Workflow Document

`python -m migration.cli` is a per-subscriber migration tool that moves prepaid
subscribers from **Classic EC (SDP / AIR-UCIP)** to **CBEV / ECEV (Ericsson
BSSF REST)**. It fetches the subscriber from the SDP, maps the data to a CBEV
provisioning plan using an Excel workbook, provisions CBEV, verifies the result,
and (only after verification) deletes the subscriber from Classic EC.

---

## 1. Component map

| Module | Role | Talks to |
|--------|------|----------|
| `cli.py` | Argument parsing, config load, orchestrator wiring, result printing | — |
| `ucip_client.py` | XML-RPC UCIP/ACIP client (SDP read + delete) | Classic EC (AIR, `/Air`) |
| `mapping_engine.py` | Excel-driven mapping: `SubscriberProfile` → `MigrationPlan` | Excel workbook |
| `bssf_migrator.py` | Builds + sends BSSF bodies (party/customer/contract/buckets) | CBEV BSSF (via `backend` EricssonClient) |
| `verifier.py` | Balance enquiry + reconciliation vs the plan | CBEV BSSF |
| `ec_delete.py` | Deletes offers from Classic EC | Classic EC |
| `orchestrator.py` | State machine + rollback + idempotency | all of the above |
| `state_store.py` | SQLite persistence (state + audit) | `migration/data/migration_state.db` |
| `models.py` | Dataclass contracts between stages | — |

---

## 2. CLI commands

```
python -m migration.cli init-template [--out mapping_template.xlsx]
python -m migration.cli migrate <msisdn> [--dry-run] [--no-ec-delete] [--force]
python -m migration.cli batch <file.txt | msisdn,msisdn,...> [--dry-run] [--no-ec-delete] [--force]
python -m migration.cli report
```

Global: `--config migration/config/migration_config.json`, `-v/--verbose`.
Exit codes: `0` success, `2` one or more subscribers `FAILED`.

| Flag | Effect |
|------|--------|
| `--dry-run` | Fetch + map only. No CBEV writes, no EC delete. Prints the planned external IDs and bucket adjustments. |
| `--no-ec-delete` | Provision + verify, but keep the subscriber in Classic EC. |
| `--force` | Re-run even if the subscriber is already in a terminal state (`VERIFIED` / `EC_DELETED`). |

---

## 3. State machine

```
PENDING ─► FETCHED ─►(map)─► PROVISIONED ─► VERIFIED ─► EC_DELETED
                 │                │             │
                 ▼                ▼             ▼
               FAILED        FAILED +       (delete fail →
                             ROLLED_BACK     keep CBEV,
                             (reverse-order  flag manual
                              compensation)  cleanup)
```

Key invariants:
- **Classic EC stays the source of truth until CBEV is `VERIFIED`.** EC delete
  runs last and only on success.
- **Idempotent**: a subscriber already in `VERIFIED` / `EC_DELETED` is skipped
  unless `--force`. External IDs are stable within a run (random `subRef`).
- **Rollback**: any failure before verification deletes the CBEV
  contract → customer → party (reverse order). A verified CBEV is never rolled
  back; a failed EC delete only flags manual cleanup.

---

## 4. End-to-end workflow (per subscriber)

### Stage 1 — FETCH (Classic EC read, `ucip_client.fetch_profile`)

Protocol: **XML-RPC over HTTP(S)** to the AIR `/Air` URI (HTTP Basic auth,
ports 10011/10012). Each call carries origin fields, a numeric
`originTransactionID`, an ISO `originTimeStamp`, `subscriberNumber`, and the
mandatory `negotiatedCapabilities` array.

| # | UCIP operation | Purpose | Data captured | Failure handling |
|---|----------------|---------|---------------|------------------|
| 1 | `GetAccountDetails` | account + offer + PAM flags | `master_msisdn`, `service_class`, `imsi`, `language`, `currency`, expiries, PAM (`pam_service_id`, `pam_schedule_id`, …) | fatal |
| 2 | `GetOffers` | offer list | offers + attributes + validity + carryover companion | fatal |
| 3 | `GetBalanceAndDate` | dedicated accounts (UT quota) | `dedicated_accounts` | **non-fatal** (pre-active → `responseCode=126`) |
| 4 | `GetAccumulators` | usage counters (UC consumed) | `accumulators` | non-fatal |
| 5 | `GetUsageThresholdsAndCounters` | UT/UC spending limits (bytes) | merges UT→`dedicated_accounts`, UC→`accumulators` keyed by counterID | non-fatal |
| 6 | `GetMultiSubscriberNumbers` | Multi-SIM / Apple Watch | `subordinates` (subordinate MSISDN/IMSI) | non-fatal |

**Request example (`GetAccountDetails`)**
```xml
<methodCall>
  <methodName>GetAccountDetails</methodName>
  <params><param><value><struct>
    <member><name>originNodeType</name><value><string>EXT</string></value></member>
    <member><name>originHostName</name><value><string>OCSG</string></value></member>
    <member><name>originTransactionID</name><value><string>000179...27</string></value></member>
    <member><name>originTimeStamp</name><value><dateTime.iso8601>20261010T05:35:06+0000</dateTime.iso8601></value></member>
    <member><name>subscriberNumberNAI</name><value><i4>1</i4></value></member>
    <member><name>subscriberNumber</name><value><string>886900000001</string></value></member>
    <member><name>requestSubscriberInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>requestOfferInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>requestPamInformationFlag</name><value><boolean>1</boolean></value></member>
    <member><name>negotiatedCapabilities</name><value><array><data>
      <value><i4>809828928</i4></value><value><i4>1832</i4></value>
    </data></array></value></member>
  </struct></value></param></params>
</methodCall>
```

**Response (normalised, abbreviated)** — `responseCode=0` means success:
```
responseCode = 0
serviceClassCurrent = 10
imsi = 466920000000001
pamInformationList: pamServiceID=5, scheduleID=1, ...
offer: offerID=DATA_5G_30GB, offerType=..., expiryDate=20261108T...
```

Non-zero `responseCode` (or `<fault>`) raises `UcipError`; the normaliser flattens
both `<struct>` members and `<fault>` into a uniform tree so parsers read by name.

---

### Stage 2 — MAP (`mapping_engine.build_plan`)

All business logic lives in the **Excel workbook** (`init-template` generates it),
not in code. Sheets:

| Sheet | Drives |
|-------|--------|
| `Settings` | key/value: `bytes_per_GB/MB/KB`, external-id patterns, partition strategy, default QoS, global bill cycle |
| `ServiceClassMap` | SDP `serviceClass` → CBEV ServiceClass value |
| `ScheduleBillCycleMap` | SDP PAM `scheduleID` → CBEV `billCycleSpecExternalId` (per bill cycle) |
| `FamilyBucketSpecs` | per `offer_id`: PO external id, POP type, bill-cycle-aligned flag, account/counter/carryover bucket specs, flat-rate default |
| `OfferAttributeMap` | SDP offer attribute → CBEV characteristic (target product/contract, transform) |
| `ParameterMapping` | derivation expressions (safe-eval) for bucket values |

**Derivation logic / what data is considered:**
- **External IDs** use a random 8-char `subRef` (UUID4), *not* the MSISDN:
  `party-<subRef>`, `customer-<subRef>`, `contract-<subRef>`, `ba-<subRef>`.
  The MSISDN only lives on the resource. (Matches the production ProvisionWizard.)
- **Partition** chosen by strategy: `fixed`, `roundrobin` (last digit), or
  `hash` (SHA-1 of MSISDN — stable across runs).
- **Bill cycle** resolved per PAM schedule (`ScheduleBillCycleMap`), else global.
- **Service class** mapped (pass-through + warning if unmapped).
- **Per offer** (carryover companions folded into their base offer):
  - skipped with a warning if no `FamilyBucketSpecs` row;
  - **FlatRate** (offer attr wins, else family default) → *unlimited, no bucket*;
  - otherwise two buckets (values in **bytes**):
    - account bucket = `to_bytes(UT - UC)` (remaining quota),
    - counter bucket = `to_bytes(UC)` (consumed),
    - carryover account = `to_bytes(carried)`, carryover flag = `1` (if present).
  - UT comes from the dedicated account; UC from the accumulator, both matched
    by the bucket spec's numeric id, converted to bytes via `Settings`.
- Expressions run in a **restricted `eval`** (no builtins; only `abs/min/max/
  round/int/float/floor/ceil` + the context) so a workbook cannot execute code.

Output: a `MigrationPlan` (party/customer/contract/BA external ids, partition,
bill cycle, contract characteristics, list of `DerivedProduct` with
characteristics + `BucketValue`s, additional MSISDNs, warnings).

With `--dry-run` the flow stops here and prints the plan.

---

### Stage 3 — PROVISION (`bssf_migrator`, CBEV BSSF REST)

Reuses the backend `EricssonClient` (OAuth2 + mTLS + partition header + logging).
Spec external IDs are merged: backend `config.json` defaults first, then
`migration_config.json ecev_defaults` overrides — so placeholder spec ids that
would 404 are never posted.

| # | Call (registry key) | Body highlights |
|---|---------------------|-----------------|
| 1 | `create_party` | `externalId`, `partitionId`, placeholder `givenName`/`familyName` (MSISDN), `individualSpecification.externalId` |
| 2 | `create_customer` | `engagedParty` ref, `customerSpecification`, embedded billing account (`billingAccountSpecExternalId`, `customerBillCycleSpecification`) |
| 3 | `create_contract` | **one call**: `contractSpecification`, status `Active` (no `validFor`), contract characteristics, resources (master + subordinate MSISDNs), all products (each with chars; `baRefForBillCycleAlignedRecurrence` only if the offer has a POP) |
| 4 | `product_bucket_adjustment` × N | one per bucket, `action: Set`, `unitOfMeasure: byte`, targeting the bucket's existing value container |

**Bucket adjustment detail (the tricky part):** before adjusting, the migrator
does a **balance enquiry** to find each bucket's *existing* value container
(`validFor.startDateTime` + `bucketSpecId`) so the `Set` updates it **in place**
rather than opening a new time slice. It avoids the unsettable `0001-01-01`
container start (which the API rejects with 403).

**Bucket adjustment request example**
```json
{
  "triggerTime": "2026-10-10T05:35:10.000Z",
  "customerExternalId": "customer-1a2b3c4d",
  "contractExternalId": "contract-1a2b3c4d",
  "productExternalId": "extID_DATA_5G_30GB-1a2b3c4d",
  "bucketSpecExternalId": "6145000",
  "reason": "MIGRATION",
  "amount": { "number": 21474836480, "decimalPlaces": 0 },
  "validFor": { "startDateTime": "2026-10-01T00:00:00.000Z",
                "endDateTime": "9999-12-31T12:00:00.001+00:00" },
  "unitOfMeasure": "byte",
  "action": "Set"
}
```

On any error here → **rollback** (`delete_contract` → `delete_customer` →
`delete_party`, best-effort) and state → `FAILED`.

---

### Stage 4 — VERIFY (`verifier.verify`)

1. **Settle delay** (~5s): a CPM `Set` time-slices the bucket; a balance enquiry
   in the same second still sees the old (0) container as current, so the tool
   waits before reconciling.
2. Balance enquiry → `_flatten_buckets` reads each bucket's **top-level effective
   `amount`** (deliberately *not* descending into `valueContainer`, which holds
   the stale expired 0).
3. For every planned bucket: `|actual − expected| ≤ tolerance_bytes`.
4. Every additional MSISDN must resolve to the same contract.

Retry ladder if not passed: settle again → re-apply bucket adjustments once →
settle → re-verify. Still failing → **rollback** CBEV, state → `ROLLED_BACK`,
record `first_failing_assertion`.

Pass → state `VERIFIED` and (on success) the CLI prints a **SDP ↔ CBEV
comparison table** per field/offer/bucket with `OK`/`DIFF` markers.

---

### Stage 5 — EC DELETE (`ec_delete.delete_from_ec`) — only after `VERIFIED`

`DeleteOffer` per offer against Classic EC.
- All deleted → state `EC_DELETED`.
- Partial / error → **keep the verified CBEV**, state stays `VERIFIED`, flagged
  for manual EC cleanup (never rolls back CBEV). Suppressed entirely with
  `--no-ec-delete`.

---

## 5. Persistence & reconciliation (`state_store.py`)

SQLite at `migration/data/migration_state.db` (separate from the main tool):
- `migration` table: one row per MSISDN (state, error, failed step, plan JSON,
  verify JSON, CBEV ids, timestamp) — upserted at each stage.
- `migration_audit` table: append-only (msisdn, step, status, detail, ts).
- `report` command / batch summary: counts by state + list of failed MSISDNs.

---

## 6. Data lineage summary (what maps to what)

| Classic EC (SDP) source | Captured as | CBEV (BSSF) target |
|-------------------------|-------------|--------------------|
| `GetAccountDetails.serviceClassCurrent` | `profile.service_class` | contract `ServiceClass` characteristic (mapped) |
| PAM `scheduleID` | `pam_schedule_id` | `billCycleSpecExternalId` (per schedule) |
| `GetOffers` offers + attributes | `profile.offers` | contract `product[]` + characteristics |
| offer attributes | `ECOfferAttribute` | product/contract characteristics (transformed) |
| UT (dedicated account / usage threshold, bytes) | `dedicated_accounts` | account bucket = `UT − UC` |
| UC (accumulator / usage counter, bytes) | `accumulators` | counter bucket = `UC` |
| carryover companion `carriedAmount` | `ECOffer.carried_amount` | carryover account bucket + flag |
| `GetMultiSubscriberNumbers` | `subordinates` | extra `resource[]` on the contract |
| master MSISDN | `master_msisdn` | MSISDN resource + `accountID` characteristic |
| (new, random) | `subRef` | party/customer/contract/BA external ids |
```
