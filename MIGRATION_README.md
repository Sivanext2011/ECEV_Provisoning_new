# Classic EC → CBEV (ECEV) Subscriber Migration Tool

A new version of the ECEV provisioning tool that migrates existing CHT 5G PPP
subscribers from **Classic EC (SDP, UCIP/ACIP)** to **ECEV on CBEV 23.10 (BSSF
REST)**.

Give it a subscriber number; it fetches the subscriber from Classic EC via
UCIP/ACIP, applies **user-supplied mapping and value-derivation rules from an
Excel workbook**, provisions the subscriber on ECEV via BSSF, verifies the
result, and then deletes the subscriber from Classic EC.

> Direction: **fetch EC → map/derive → provision ECEV → verify → delete EC.**
> Classic EC stays the source of truth until ECEV is `VERIFIED`.

It lives in the `migration/` package of this repo and **reuses the existing
BSSF client** (`backend/app/services/ericsson_client.py`) so OAuth2, mTLS, the
`ERICSSON.Partition-Id` header, SOCKS proxy, logging and the config-driven API
registry all behave exactly like the production provisioning tool.

---

## 1. Architecture

```
                         migration/config/mapping_template.xlsx   (you edit this)
                                        │
MSISDN ─► ucip_client ─► SubscriberProfile ─► mapping_engine ─► MigrationPlan
            (SDP AIR)        (raw EC data)      (Excel rules)     (ECEV plan)
                                                                      │
                                   ┌──────────────────────────────────┘
                                   ▼
                          bssf_migrator ──► Party / Customer / Contract(all)
                                   │          + N× Product Bucket Adjustment
                                   ▼
                             verifier ──► Balance Enquiry + reconciliation
                                   │
                      pass? ───────┼─────── fail? ─► rollback (reverse order)
                                   ▼
                             ec_delete ──► UCIP DeleteOffer   (only after VERIFIED)

   orchestrator  = the state machine tying all stages together
   state_store   = aiosqlite persistence (idempotency, resume, reconciliation)
```

| Module | Responsibility |
|---|---|
| `models.py` | Dataclasses: `SubscriberProfile`, `ECOffer`, `MigrationPlan`, `DerivedProduct`, `BucketValue`, `MigrationState`, `MigrationResult` |
| `ucip_client.py` | Config-driven UCIP/ACIP (SOAP/XML AIR) client + response parsers |
| `mapping_engine.py` | Reads the Excel workbook; turns a profile into a `MigrationPlan` using the sheet-defined derivation expressions |
| `bssf_migrator.py` | Builds and sends the BSSF bodies via the existing `ericsson_client`; delete/rollback helpers |
| `verifier.py` | Balance Enquiry + reconciliation against the plan |
| `ec_delete.py` | Deletes offers from Classic EC after `VERIFIED` |
| `state_store.py` | `aiosqlite` state + audit tables; reconciliation report |
| `orchestrator.py` | Per-subscriber transaction state machine with rollback and idempotency |
| `excel_template.py` | Generates the editable mapping workbook |
| `cli.py` | Command-line entrypoint |

### Migration state machine

```
PENDING → FETCHED → PROVISIONED → VERIFIED → EC_DELETED
                         │             │
                         └── FAILED ───┴── ROLLED_BACK
```

External IDs are **deterministic** (`PARTY-<MSISDN>`, `CUST-<MSISDN>`,
`CTR-<MSISDN>`, `BA-<MSISDN>`), so re-running an already-migrated subscriber is
a safe no-op and an interrupted batch resumes cleanly.

---

## 2. The Excel mapping workbook (your control surface)

All mapping and value-derivation logic lives in a workbook — **no code changes
needed** to adjust the rules. Generate the template:

```bash
python -m migration.cli init-template --out migration/config/mapping_template.xlsx
```

It contains five sheets:

### `Settings`
Global constants as `key` / `value` pairs:

| key | meaning |
|---|---|
| `bytes_per_GB` / `_MB` / `_KB` | unit → bytes (default `1 GiB = 1073741824`) |
| `default_qos_info` | `QoS_info` characteristic default (`HIGH`; `LOW` for post-quota) |
| `partition_strategy` | `hash` \| `roundrobin` \| `fixed` — how a CP partition is chosen |
| `partition_values` | comma-separated partition ids to balance across (e.g. `1,2`) |
| `*_external_id_pattern` | deterministic externalId patterns, `{msisdn}` substituted |
| `*_spec_external_id` | ECEV catalog spec externalIds (contract/customer/BA/MSISDN resource) |
| `service_class_char_name` | contract characteristic carrying the service class |

### `ServiceClassMap`
SDP `serviceClassCurrent` → ECEV `ServiceClass` contract characteristic value.
One row per service class.

### `FamilyBucketSpecs`
One row per offer family. `offer_id` (1:1 with ECEV PO externalId), `pop_type`
(`Regular` / `Initial` / `Consumption`), and the bucket spec externalIds for
account, counter, and carryover. Pre-filled from the LLD lab catalog.

### `OfferAttributeMap`
SDP `offerAttribute` name → ECEV characteristic (`HighBandwidth`, `FlatRate`,
`TimeOfDayPlan`, `InstallerID`, `QoS_info`), target (`product`/`contract`), and
a `value_transform` (`asis` / `upper` / `lower` / `map:From=To;...`).

### `ParameterMapping`
Top-level field mapping with **derivation expressions**. The default rows encode
the LLD logic:

| sdp_source | derivation |
|---|---|
| `account_bucket` | `to_bytes(UT - UC)` |
| `counter_bucket` | `to_bytes(UC)` |
| `carryover_account` | `to_bytes(carried)` |
| `carryover_flag` | `1` |

Expressions are evaluated in a **restricted sandbox** (no builtins, no imports)
with these names available:
`master_msisdn, service_class, offer_id, offer_expiry, offer_start, UT, UC,
carried, flat_rate, to_bytes(x), map_service_class(x), bytes_per_unit(unit)`
plus `abs/min/max/round/int/float/floor/ceil`.

`UT` and `UC` are already resolved to **bytes** before the expression runs.

#### Derivation rules (from the LLD)

- Account bucket = **UT − UC**, Counter bucket = **UC** (in bytes; 1 GiB = 1 073 741 824).
- `FlatRate = Yes` → **unlimited, no bucket set** (keeps the POP default).
- Carryover companion → carried bytes into the carryover account bucket + flag = 1.
- `Regular` / `Initial` POP: activation sets the full allocation, so buckets are
  **overridden after** activation. `Consumption`-only POP: initial bucket set directly.
- `accountID` characteristic = master MSISDN on **every** product.
- Multi-SIM (Apple Watch): subordinate MSISDN added as a second
  `ext_LRS_MSISDN` resource on the **same** contract.

---

## 3. Configuration

Two config files are used:

1. **ECEV / BSSF connection** — the existing `config/config.json` of this repo
   (OAuth2 token endpoint, `ROOT_BAE`, TLS/mTLS certs, SOCKS proxy, the `apis`
   registry). The migrator reuses `create_party`, `create_customer`,
   `create_contract`, `balance_adjustment`, `balance_enquiry_msisdn`,
   `delete_*_by_external_id`.

2. **Migration config** — `migration/config/migration_config.json`
   (copy from `migration_config.template.json`):

   ```jsonc
   {
     "ucip": {
       "endpoint": "https://sdp-air.example.net:10080/Air",
       "origin_host": "OCSG",
       "use_soap_envelope": false,      // true to wrap in a SOAP 1.1 envelope
       "ssl_verify": false,
       "socks5_enabled": false,
       "socks5_proxy": "socks5://127.0.0.1:1234",
       "templates": {}                   // override any AIR request template here
     },
     "mapping_workbook": "migration/config/mapping_template.xlsx",
     "ecev_defaults": {                   // ECEV catalog spec externalIds
       "contractSpecExternalId": "CHT_Contract_Postpaid",
       "customerSpecExternalId": "CHT_Customer_Postpaid",
       "billingAccountSpecExternalId": "BAS_CHT_Postpaid",
       "msisdnResourceSpecExternalId": "ext_LRS_MSISDN"
     },
     "options": { "do_ec_delete": true, "verify_tolerance_bytes": 0 }
   }
   ```

The UCIP request envelopes default to the LLD samples (`GetAccountDetails`,
`GetOffers`, `GetBalanceAndDate`, `GetAccumulators`, `GetMultiSubscriberNumbers`,
`DeleteOffer`). Override any of them per SDP install under `ucip.templates`
without touching code — field names/xpaths are parsed by local name, so minor
schema differences are tolerated. **Confirm the operation names and fields
against the CHT SDP interface specification before production use.**

---

## 4. Usage

```bash
# 1. Generate and edit the mapping workbook
python -m migration.cli init-template
#    → edit migration/config/mapping_template.xlsx

# 2. Copy and edit the migration config
#    migration/config/migration_config.template.json → migration_config.json

# 3. Dry run a single subscriber (fetch + map only, NO writes to ECEV or EC)
python -m migration.cli migrate 886912345678 --dry-run

# 4. Real migration of one subscriber
python -m migration.cli migrate 886912345678

# 5. Migrate without deleting from EC (provision + verify only)
python -m migration.cli migrate 886912345678 --no-ec-delete

# 6. Batch migrate from a file (one MSISDN per line) or a comma list
python -m migration.cli batch msisdns.txt
python -m migration.cli batch 886912345678,886912345679

# 7. Re-run a subscriber even if already migrated (idempotent otherwise)
python -m migration.cli migrate 886912345678 --force

# 8. Reconciliation report (counts by state + failed MSISDNs)
python -m migration.cli report
```

`--config <path>` overrides the migration config location. `-v` enables debug
logging. Exit code is `2` when any subscriber ends in `FAILED`.

Migration state is persisted in `migration/data/migration_state.db` (SQLite).

---

## 5. Worked example (from the LLD)

Master `886912345678` + Apple Watch `886955550000`; `ServiceClass 5101`;
Basic `145001` (UT 50 GB, UC 20 GB, `HighBandwidth=Speed1.5G`, `FlatRate=No`);
Data Add-on `160006` (UT 50 GB, UC 30 GB) + 5 GB carryover.

Derived and provisioned (verified by the test suite):

| Product | Bucket | Value |
|---|---|---|
| 145001 | `6145000` (account) | 30 GB = `32212254720` |
| 145001 | `6145000_CTR` (counter) | 20 GB = `21474836480` |
| 160006 | `6160006` (account) | 20 GB = `21474836480` |
| 160006 | `6160006_CTR` (counter) | 30 GB = `32212254720` |
| 160006 | `6169006` (carryover) | 5 GB = `5368709120` |
| 160006 | `6160006_carryover` (flag) | `1` |

→ 3 provisioning calls (Party, Customer, Contract-with-everything) + **6 bucket
adjustments**, then Balance Enquiry verification, then EC delete. The watch
MSISDN resolves to the same contract.

---

## 6. Error handling & reconciliation

- **Fetch failure**: retry/skip; never touch ECEV or EC.
- **Provision failure**: compensate by deleting in reverse order
  (Contract → Customer → Party), mark `FAILED`.
- **Verify mismatch**: one bucket re-apply attempt, then roll back ECEV and mark
  `ROLLED_BACK`, recording the first failing assertion.
- **EC delete failure**: ECEV is already `VERIFIED`, so it is **kept** and the
  subscriber is flagged for manual EC cleanup (no ECEV rollback).

The reconciliation report (`migration.cli report`) gives counts by state and the
list of failed MSISDNs with the failing step.

---

## 7. Tests

```bash
python -m pytest migration/tests/ -q
```

13 tests cover UCIP XML parsing, Excel-driven derivation (exact byte values,
carryover, FlatRate skip, Multi-SIM), the sandbox rejecting malicious
expressions, BSSF body building, and an orchestrator dry-run against the LLD
worked example. The tests require no live backend — the BSSF client is imported
lazily and the UCIP client is mocked.

---

## 8. Notes & limitations

- `openpyxl` and `httpx` are already repo dependencies. The async orchestrator
  test uses `asyncio.run` so `pytest-asyncio` is **not** required.
- UCIP operation names, request envelopes and response field names **must be
  confirmed against the CHT SDP interface specification**; they are fully
  configurable via `ucip.templates`.
- Bucket spec externalIds and the ServiceClass map are authoritative in the
  CHT Resource Specification sheet — complete the workbook from it before a
  production run.
- Only the MSISDN identification resource (`ext_LRS_MSISDN`) is provisioned;
  CHT does not provide IMSI on the ECEV side.
```
