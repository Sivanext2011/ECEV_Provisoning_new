# ECEV Provisioning CLI (lite)

A command-line front-end that **reuses the web tool's backend logic**
(`backend/app/services` + `backend/app/routers/batch.py`). No web server, no
duplicated logic — the CLI imports the same modules the web app uses, so
behaviour is identical.

## Requirements
- Python 3.11+
- The repo's `backend/requirements.txt` installed (fastapi/httpx/openpyxl/click…)
  - `click` and `openpyxl` are the only extras the CLI itself needs.
- A populated `config/config.json` (same file the web app uses).

## Run
```bash
# from the repo root
python cli/ecev.py --help
# or
cd cli && python ecev.py --help
```
`--json` is a GROUP-level flag — put it **before** the subcommand:
```bash
python cli/ecev.py --json batch list
```

## Commands

### config
```bash
python cli/ecev.py config show                      # full config (password masked)
python cli/ecev.py config show --section environment
python cli/ecev.py config get environment.ROOT_CPM_BATCH
python cli/ecev.py config set network.socks5_enabled true --json-value
```

### catalog
```bash
python cli/ecev.py catalog load /path/BusinessConfig.zip
python cli/ecev.py catalog list po                  # party|customer|contract|billingaccount|billcycle|po|product|resource|commid|contactmedium|organization
python cli/ecev.py catalog show customer Test_Customer --chars
```

### provision (single subscriber)
```bash
# flags
python cli/ecev.py provision --given-name Siva --family-name R \
  --party-spec Party_Individual_CHT --customer-spec Test_Customer \
  --ba-spec CHT_BillingAccount_Spec --bill-cycle-spec BillCycle_01 \
  --contract-spec CONTRACT_1399_5G --po po_notiftesting \
  --msisdn 46700000001 --imsi 460010000000001

# interactive spec-driven prompts
python cli/ecev.py provision --interactive

# from a JSON file (raw bodies OR build options)
python cli/ecev.py provision --input bodies.json
python cli/ecev.py provision --input bodies.json --dry-run
```
`--input` with `{ "partyBody":…, "customerBody":…, "contractBody":… }` submits
those bodies directly; otherwise the file is treated as build options.

### batch
```bash
# build a single-record batch file
python cli/ecev.py batch build --po po_notiftesting --out batch.json

# bulk Excel: generate template -> fill -> build
python cli/ecev.py batch excel-template --combos combos.json --out template.xlsx
python cli/ecev.py batch excel-build --input filled.xlsx --out built.json --submit --start

# submit a prebuilt file
python cli/ecev.py batch submit --input batch.json --start

# lifecycle
python cli/ecev.py batch list --sort created_desc --limit 20
python cli/ecev.py batch status  <jobId>
python cli/ecev.py batch result  <jobId>
python cli/ecev.py batch failures <jobId>
python cli/ecev.py batch delete  <jobId>
```

**combos.json** is a list of spec combinations, e.g.:
```json
[{ "comboName": "voice",
   "partySpecExternalId": "Party_Individual_CHT",
   "customerSpecExternalId": "Test_Customer",
   "billingAccountSpecExternalId": "CHT_BillingAccount_Spec",
   "billCycleSpecExternalId": "BillCycle_01",
   "contractSpecExternalId": "CONTRACT_1399_5G",
   "productOfferingExternalId": "po_notiftesting",
   "resourceSpecs": [{"externalId":"RS_MSISDN","id":"…"},{"externalId":"RS_IMSI","id":"…"}],
   "includeBaRef": true, "includeBaRefRecurrence": true }]
```
The Excel **Entries** sheet gets `party.* / customer.* / contract.* / cm.* / product.*`
characteristic columns derived from each combo's specs, plus one filled sample
row per combo. `comboName` on each row selects the combo. IMSI must be 15 digits.

### logs
```bash
python cli/ecev.py logs show --limit 20 --grep batch/v1/job
python cli/ecev.py logs clear
```

## Notes
- The CLI shares `config/config.json` and the API log store with the web app.
- `config set` reloads the client immediately (incl. the batch mTLS client).
- Batch create uses the cert-based mTLS route (octet-stream) exactly as the web app.
