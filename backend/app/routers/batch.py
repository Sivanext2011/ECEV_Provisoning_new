"""CPM Batch (eric-bss-cpm-batch) router.

Builds a generic batch JSON file (HEADER / RECORD / TRAILER) for
party -> customer(+billing account) -> contract(+product) -> balance adjustment,
and proxies the batch job lifecycle (create / start / status / result / list / delete)
through ericsson_client (which handles auth, mTLS, partition header, logging).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File
from datetime import datetime, timezone
import uuid
import json
import asyncio
import logging

from ..services.ericsson_client import ericsson_client, load_config
from ..services import catalog_fetch as _cf

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/batch", tags=["cpm-batch"])

# In-memory registry of scheduled jobs: {schedule_id: {...}}
_scheduled: dict = {}


async def _fetch_required_chars(api_key: str, ext_param: str, ext_id: str) -> list:
    """Fetch a spec by externalId and return its REQUIRED characteristics as
    batch characteristic entries: [{charSpecExternalId, value:[{value,unitOfMeasure?}]}].
    A required char with no usable value is still included with its default/first
    possible value so the batch satisfies minCardinality."""
    if not ext_id:
        return []
    try:
        raw = await _cf._fetch_spec(api_key, ext_param, ext_id, "")
    except Exception as e:
        logger.warning(f"char fetch failed for {ext_id}: {e}")
        return []
    if not raw:
        return []
    raw_chars = raw.get("specCharacteristic") or raw.get("characteristic") or []
    out = []
    _PERSONALIZABLE = {"CAN_BE_PERSONALIZED", "MUST_BE_PERSONALIZED", "SELECTION",
                       "canBePersonalized", "mustBePersonalized", "selection"}
    for c in raw_chars:
        try:
            mn = int(c.get("minCardinality") or 0)
        except (TypeError, ValueError):
            mn = 0
        if mn < 1:
            continue  # not mandatory
        # Only client-settable chars: must be personalizable AND have a real
        # externalId. NO_PERSONALIZATION/fixed chars are set by the system; chars
        # without an externalId cannot be addressed via charSpecExternalId and
        # rely on the spec's own default to satisfy minCardinality.
        if c.get("valueRegulator") not in _PERSONALIZABLE:
            continue
        key = (c.get("externalId") or "").strip()
        if not key:
            continue
        # choose a value from the spec: default value, else first possible value
        val = None
        uom = c.get("unitOfMeasure") or ""
        for pv in (c.get("specCharacteristicValue") or []):
            if pv.get("value") is None:
                continue
            if pv.get("isDefault") or pv.get("default"):
                val = str(pv["value"])
                uom = uom or pv.get("unitOfMeasure") or ""
                break
            if val is None:
                val = str(pv["value"])
                uom = uom or pv.get("unitOfMeasure") or ""
        if val in (None, ""):
            # Required char with no spec default/possible value: inject a
            # type-appropriate placeholder so minCardinality is satisfied.
            # (User can edit the value in the downloaded template.)
            vtype = (c.get("valueType") or "").lower()
            if any(t in vtype for t in ("int", "number", "numeric", "float", "decimal")):
                val = "1"
            elif "bool" in vtype:
                val = "true"
            else:
                val = "1"
            logger.info(f"required char {key} on {ext_id} has no spec default; injecting placeholder '{val}'")
        entry = {"charSpecExternalId": key, "value": [{"value": val}]}
        if uom:
            entry["value"][0]["unitOfMeasure"] = uom
        out.append(entry)
    return out


async def _enrich_mandatory_chars(bf: dict) -> dict:
    """Populate mandatory characteristics on the customer entity (and others)
    by reading the spec characteristics from the catalog, so the batch satisfies
    minCardinality constraints. Modifies and returns bf.

    The spec externalIds are taken from the BUILT entities (not config defaults)
    so enrichment always matches the spec the batch actually uses.
    """
    # discover the actual spec externalIds used in the built batch
    cust_spec = party_spec = ""
    for rec in bf.get("records", []):
        for ent in rec.get("entities", []):
            pl = ent.get("payload") or {}
            if ent.get("entity") == "customer" and not cust_spec:
                cust_spec = (pl.get("customerSpecification") or {}).get("externalId", "")
            if ent.get("entity") == "party" and not party_spec:
                party_spec = (pl.get("individualSpecification") or {}).get("externalId", "")
    cust_chars = await _fetch_required_chars("spec_customer", "customerSpecificationExternalId", cust_spec)
    party_chars = await _fetch_required_chars("spec_individual", "individualSpecificationExternalId", party_spec)

    def _entity_start(ent: dict) -> str:
        """The entity's validity start (from its status[0].validFor) so each
        characteristic value can carry a validFor that covers the entity."""
        pl = ent.get("payload") or {}
        for st in (pl.get("status") or []):
            vf = st.get("validFor") or {}
            if vf.get("startDateTime"):
                return vf["startDateTime"]
        return _now()

    def _stamp(chars: list, start: str) -> list:
        """Deep-copy chars and add validFor (on the characteristic object, per the
        BAE customer schema) covering the entity validity so CPM's
        entityTimePeriodNotCoveredByCharacteristicValues check passes."""
        out = []
        for ch in chars:
            nc = {**ch, "value": [dict(v) for v in ch.get("value", [])]}
            nc.setdefault("validFor", {"startDateTime": start})
            out.append(nc)
        return out

    for rec in bf.get("records", []):
        for ent in rec.get("entities", []):
            pl = ent.get("payload") or {}
            if ent.get("entity") == "customer" and cust_chars and "characteristic" not in pl:
                pl["characteristic"] = _stamp(cust_chars, _entity_start(ent))
            if ent.get("entity") == "party" and party_chars and "characteristic" not in pl:
                pl["characteristic"] = _stamp(party_chars, _entity_start(ent))
    return bf


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def _now_header():
    # Batch HEADER creationDate: yyyy-MM-dd'T'HH:mm:ss.SSSZ with numeric offset, no colon
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+0000"


def _short():
    return uuid.uuid4().hex[:8]


def _defaults() -> dict:
    return load_config().get("defaults", {})


def build_batch_file(body: dict) -> dict:
    """Build a CPM Batch v1.1 file for party+customer+contract+adjustment.

    body may override: count, givenName, familyName, productOfferingExternalId,
    adjustmentAmount, adjustmentUnit, bucketSpecExternalId, partitionId, and spec externalIds.
    """
    d = _defaults()
    partition = str(body.get("partitionId") or d.get("partitionId") or "1")
    party_spec = body.get("partySpecExternalId") or d.get("partySpecExternalId", "")
    cust_spec = body.get("customerSpecExternalId") or d.get("customerSpecExternalId", "")
    ba_spec = body.get("billingAccountSpecExternalId") or d.get("billingAccountSpecExternalId", "")
    bc_spec = body.get("billCycleSpecExternalId") or d.get("billCycleSpecExternalId", "")
    contract_spec = body.get("contractSpecExternalId") or d.get("contractSpecExternalId", "")
    po_ext = body.get("productOfferingExternalId") or d.get("basePlanProductOfferingExternalId", "")

    count = int(body.get("count") or 1)
    given = body.get("givenName") or "Batch"
    family = body.get("familyName") or "Test"
    do_adjust = bool(body.get("adjustment", True))
    adj_amount = body.get("adjustmentAmount", 1024)
    adj_unit = body.get("adjustmentUnit", "byte")
    bucket_spec = body.get("bucketSpecExternalId", "")

    # Entity statuses (defaults match the provisioning flow). Contract initial
    # status MUST be a valid initial status for the spec — "Created", not "Active".
    party_status = body.get("partyStatus") or "PartyActive"
    customer_status = body.get("customerStatus") or "CustomerActive"
    ba_status = body.get("billingAccountStatus") or "BillingAccountActive"
    contract_status = body.get("contractStatus") or "Created"
    product_status = body.get("productStatus") or "ProductCreated"

    # User-supplied characteristics (spec-driven wizard). Each is a list of
    # {charSpecExternalId, value:[{value, unitOfMeasure?}], validFor?}.
    user_party_chars = body.get("partyCharacteristics") or []
    user_cust_chars = body.get("customerCharacteristics") or []
    user_contract_chars = body.get("contractCharacteristics") or []

    # Identification/logical resources for the contract product (MSISDN/IMSI).
    # Each: {resourceSpecificationExternalId, resourceNumber, resourceSpecificationId?}
    resources_in = body.get("resources") or []
    # Communication identifier spec externalId + optional id (uses first resourceNumber as communicationId)
    comm_id_spec = body.get("communicationIdentifierSpecExternalId") or ""
    comm_id_value = body.get("communicationId") or ""
    # Contact medium specs for the party. Each: {contactMediumSpecExternalId, characteristics:[{charSpecExternalId,value:[...]}], externalId?}
    contact_media = body.get("contactMedia") or []
    # Contact medium association (customer + contract)
    include_cma = bool(body.get("includeContactMediumAssociation", False))
    cma_language = body.get("contactMediumAssociationLanguage") or "en"
    home_time_zone = body.get("homeTimeZone") or ""

    now = _now()

    header = {
        "batchJobId": body.get("batchJobId") or f"ECEV_BATCH_{_short()}",
        "creationDate": _now_header(),
        "interfaceVersion": "1.1",
        "readTimeout": "30",
        "entityTypes": [
            {"entityType": "party"}, {"entityType": "customer"},
            {"entityType": "contract"},
        ] + ([{"entityType": "bucketAdjustment"}] if do_adjust else []),
        "serviceDefs": [
            {"serviceGroupName": "bae-rest", "name": "BSSF_Individual_Party_Management",
             "ServiceRegistry": {"serviceType": "REST", "environment": "PROD",
                                 "serviceName": "BSSF_Individual_Party_Management", "version": "2"},
             "routingAlgorithm": "roundrobin"},
            {"serviceGroupName": "bae-rest", "name": "BSSF_Customer_Management",
             "ServiceRegistry": {"serviceType": "REST", "environment": "PROD",
                                 "serviceName": "BSSF_Customer_Management", "version": "2"},
             "routingAlgorithm": "roundrobin"},
            {"serviceGroupName": "bae-rest", "name": "BSSF_Subscription_Management",
             "ServiceRegistry": {"serviceType": "REST", "environment": "PROD",
                                 "serviceName": "BSSF_Subscription_Management", "version": "2"},
             "routingAlgorithm": "roundrobin"},
            {"serviceGroupName": "bae-rest", "name": "BSSF_Balance_Management",
             "ServiceRegistry": {"serviceType": "REST", "environment": "PROD",
                                 "serviceName": "BSSF_Balance_Management", "version": "2"},
             "routingAlgorithm": "roundrobin"},
        ],
        "endpoints": [
            {"HTTP-Headers": [{"name": "Content-Type", "value": "application/json"},
                              {"name": "ERICSSON.Partition-Id", "value": partition}],
             "path": "individualParty/", "HTTP-operation": "POST",
             "service": "BSSF_Individual_Party_Management", "entity.operation": "party.create"},
            {"HTTP-Headers": [{"name": "Content-Type", "value": "application/json"},
                              {"name": "ERICSSON.Partition-Id", "value": partition}],
             "path": "customer/", "HTTP-operation": "POST",
             "service": "BSSF_Customer_Management", "entity.operation": "customer.create"},
            {"HTTP-Headers": [{"name": "Content-Type", "value": "application/json"},
                              {"name": "ERICSSON.Partition-Id", "value": partition}],
             "path": "customerExternalId/{customerExternalId}/contractExternalId/", "HTTP-operation": "POST",
             "service": "BSSF_Subscription_Management", "entity.operation": "contract.create"},
            {"HTTP-Headers": [{"name": "Content-Type", "value": "application/json"},
                              {"name": "ERICSSON.Partition-Id", "value": partition}],
             "path": "bucketAdjustment/adjust", "HTTP-operation": "POST",
             "service": "BSSF_Balance_Management", "entity.operation": "bucketAdjustment.create"},
        ],
    }

    records = []
    for i in range(count):
        ref = _short()
        party_ext = f"party-{ref}"
        cust_ext = f"customer-{ref}"
        ba_ext = f"ba-{ref}"
        bcs_ext = f"bcs-{ref}"
        contract_ext = f"contract-{ref}"
        prod_ext = f"product-{ref}"
        corr_id = "1"  # base-plan product correlation id; resources link via productCorrelationId

        # ----- Contact media for the party -----
        party_contact_medium = []
        for idx, cm in enumerate(contact_media):
            spec = cm.get("contactMediumSpecExternalId")
            if not spec:
                continue
            cm_ext = cm.get("externalId") or f"cm_{idx}_{ref}"
            entry = {
                "contactMediumSpecExternalId": spec,
                "externalId": cm_ext,
                "validFor": {"startDateTime": now},
            }
            chars = cm.get("characteristics") or []
            if chars:
                entry["characteristic"] = chars
            party_contact_medium.append(entry)

        # ----- Contact medium associations (customer + contract) -----
        def _cma_list():
            out = []
            for idx, cm in enumerate(contact_media):
                spec = cm.get("contactMediumSpecExternalId")
                if not spec:
                    continue
                cm_ext = cm.get("externalId") or f"cm_{idx}_{ref}"
                out.append({
                    "contactRole": "Notification",
                    "language": cma_language,
                    "contactMediumExternalId": cm_ext,
                    "enabled": True,
                    "validFor": {"startDateTime": now},
                })
            return out

        # ----- Identification/logical resources for the contract -----
        contract_resources = []
        first_resource_number = ""
        for ridx, rs in enumerate(resources_in):
            rspec = rs.get("resourceSpecificationExternalId")
            rnum = (rs.get("resourceNumber") or "").strip()
            if not rspec or not rnum:
                continue
            if not first_resource_number:
                first_resource_number = rnum
            rlabel = "".join(c for c in rspec if c.isalnum() or c in "_-")
            res = {
                "externalId": f"{rlabel}-{ref}",
                "resourceNumber": rnum,
                "resourceSpecificationExternalId": rspec,
                "productCorrelationId": [corr_id],
            }
            if rs.get("resourceSpecificationId"):
                res["resourceSpecificationId"] = rs["resourceSpecificationId"]
            contract_resources.append(res)

        entities = [
            {"entity": "party", "operation": "create",
             "responseKeys": {"partyId": "id", "partyExternalId": "externalId"},
             "payload": {"resource": {
                 "externalId": party_ext, "partitionId": partition,
                 "givenName": given, "familyName": f"{family}{i+1}",
                 "individualSpecification": {"externalId": party_spec},
                 "status": [{"status": party_status, "validFor": {"startDateTime": now}}],
                 **({"contactMedium": party_contact_medium} if party_contact_medium else {}),
             }}},
            {"entity": "customer", "operation": "create",
             "responseKeys": {"customerId": "id", "customerExternalId": "externalId"},
             "bodyReplacers": {"@PARTYEXTID@": "partyExternalId"},
             "payload": {"resource": {
                 "externalId": cust_ext,
                 "customerSpecification": {"externalId": cust_spec},
                 "engagedParty": {"externalId": "@PARTYEXTID@", "@referredType": "Individual"},
                 "status": [{"status": customer_status, "validFor": {"startDateTime": now}}],
                 "account": [{
                     "externalId": ba_ext,
                     "billingAccountSpecExternalId": ba_spec,
                     "status": [{"status": ba_status, "validFor": {"startDateTime": now}}],
                     "customerBillCycleSpecification": [{
                         "externalId": bcs_ext, "billCycleSpecExternalId": bc_spec,
                         "validFor": {"startDateTime": now}}],
                     **({"contactMediumAssociation": _cma_list()} if include_cma and _cma_list() else {}),
                 }],
                 **({"contactMediumAssociation": _cma_list()} if include_cma and _cma_list() else {}),
             }}},
            {"entity": "contract", "operation": "create",
             "responseKeys": {"contractId": "id"},
             "uriReplacers": {"{customerExternalId}": "customerExternalId"},
             "payload": {"resource": {
                 "externalId": contract_ext,
                 **({"contractSpecification": {"externalId": contract_spec}} if contract_spec else {}),
                 "status": [{"status": contract_status, "validFor": {"startDateTime": now}}],
                 **({"resource": contract_resources} if contract_resources else {}),
                 **({"communicationIdentifier": [{
                        "communicationIdentifierSpecExternalId": comm_id_spec,
                        "communicationId": comm_id_value or first_resource_number,
                    }]} if comm_id_spec and (comm_id_value or first_resource_number) else {}),
                 **({"homeTimeZone": [{"timeZone": home_time_zone}]} if home_time_zone else {}),
                 **({"contactMediumAssociation": _cma_list()} if include_cma and _cma_list() else {}),
                 "product": [{
                     "externalId": prod_ext,
                     "productOfferingExternalId": po_ext,
                     "correlationId": corr_id,
                     "name": po_ext,
                     "status": [{"status": product_status}],
                     # Match the verified successful provisioning pattern: these
                     # BA references are OFF by default (sending baRefForBillCycleAlignedRecurrence
                     # triggers CPM's "Missing BillCycleAlignedStrategy" on envs without
                     # featureBillingAccountChangeSupport). Opt in only when needed.
                     **({"billingAccountReference": {"externalId": ba_ext}} if body.get("includeBaRef", False) else {}),
                     **({"baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext,
                         **({"isProratingRequired": bool(body["isProratingRequired"])} if "isProratingRequired" in body else {})}}
                        if body.get("includeBaRefRecurrence", False) else {}),
                 }],
             }}},
        ]
        if do_adjust:
            entities.append(
                {"entity": "bucketAdjustment", "operation": "create",
                 "payload": {"resource": {
                     "triggerTime": now,
                     "relatedParty": {"@referredType": "Customer", "externalId": cust_ext},
                     "contractExternalId": contract_ext,
                     "productAdjustments": [{
                         "productRef": {"externalId": prod_ext},
                         "productBuckets": [{
                             **({"bucketSpecExternalId": bucket_spec} if bucket_spec else {}),
                             "amount": {"number": int(adj_amount), "decimalPlaces": 0},
                             "action": "Relative",
                             "unitOfMeasure": adj_unit,
                         }],
                     }],
                 }}}
            )
        records.append({"recordNumber": i + 1, "entities": entities})

    trailer = {"numberOfRecords": count}
    bf = {"header": header, "records": records, "trailer": trailer}

    # Batch REST Interface 1.1: the standard /job API expects each entity's
    # body directly under "payload" (the {"resource": {...}} wrapper is only for
    # the massResource endpoint). Unwrap payload.resource -> payload.
    for rec in bf["records"]:
        for ent in rec.get("entities", []):
            pl = ent.get("payload")
            if isinstance(pl, dict) and set(pl.keys()) == {"resource"} and isinstance(pl["resource"], dict):
                ent["payload"] = pl["resource"]

    # Apply user-supplied characteristics (spec-driven wizard). These are merged
    # onto the entity payload and take precedence over auto-enrichment.
    _char_map = {"party": user_party_chars, "customer": user_cust_chars, "contract": user_contract_chars}
    for rec in bf["records"]:
        for ent in rec.get("entities", []):
            chars = _char_map.get(ent.get("entity"))
            if chars:
                ent.setdefault("payload", {})["characteristic"] = chars
    return bf


def serialize_batch_file(bf: dict) -> str:
    """Serialize {header, records, trailer} into the CPM Batch raw format:
    concatenated JSON objects — HEADER, then each RECORD, then TRAILER
    (NOT a single wrapping object). This is what the batch parser expects.
    Accepts either the wrapped {header,records,trailer} form or an already-raw string.
    """
    if isinstance(bf, str):
        return bf
    parts = []
    if "header" in bf and "records" in bf:
        parts.append(json.dumps(bf["header"]))
        for rec in bf.get("records", []):
            parts.append(json.dumps(rec))
        if bf.get("trailer") is not None:
            parts.append(json.dumps(bf["trailer"]))
    else:
        # already in some other shape; best-effort
        parts.append(json.dumps(bf))
    return "\n".join(parts)


async def _submit_raw(batch_file: dict) -> dict:
    """POST the batch file to CPM Batch with Content-Type application/octet-stream
    and the concatenated raw body (per Batch REST Interface 1.1)."""
    import httpx
    batch_client = await ericsson_client._ensure_batch_client()
    url, _ = ericsson_client._resolve_url("batch_create_job")
    # Cert-based batch route is mTLS-only; sending a bearer token causes 401.
    headers = {"Content-Type": "application/octet-stream", "Accept": "application/json"}
    if not (ericsson_client.apis.get("batch_create_job", {}) or {}).get("no_auth"):
        token = await ericsson_client._get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
    partition_id = (ericsson_client.defaults or {}).get("partitionId", "")
    if partition_id:
        headers["ERICSSON.Partition-Id"] = str(partition_id)
    raw = serialize_batch_file(batch_file).encode("utf-8")
    try:
        r = await batch_client.post(url, content=raw, headers=headers)
    except Exception as e:
        ericsson_client._log("POST", url, "ERROR", {"octet-stream": True, "bytes": len(raw)}, str(e), headers=headers)
        raise
    ericsson_client._log("POST", url, r.status_code, {"octet-stream": True, "bytes": len(raw)}, r.text, headers=headers)
    r.raise_for_status()
    if r.status_code == 204 or not r.text:
        return {"status": "ok"}
    try:
        return r.json()
    except Exception:
        return {"raw": r.text}


def _parse_json_stream(text: str) -> list:
    """Parse a stream of concatenated JSON objects (CPM batch result format)
    into a list of dicts."""
    dec = json.JSONDecoder()
    out, idx, n = [], 0, len(text)
    while idx < n:
        while idx < n and text[idx] in " \t\r\n":
            idx += 1
        if idx >= n:
            break
        try:
            obj, end = dec.raw_decode(text, idx)
        except ValueError:
            break
        out.append(obj)
        idx = end
    return out


async def _fetch_result_stream(job_id: str) -> dict:
    """GET the batch job result (a stream of concatenated JSON objects) and
    return a structured summary: {records:[...], summary:{...}}."""
    batch_client = await ericsson_client._ensure_batch_client()
    url, _ = ericsson_client._resolve_url("batch_job_result", path_params={"jobId": job_id})
    headers = {"Accept": "application/json"}
    if not (ericsson_client.apis.get("batch_job_result", {}) or {}).get("no_auth"):
        token = await ericsson_client._get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
    partition_id = (ericsson_client.defaults or {}).get("partitionId", "")
    if partition_id:
        headers["ERICSSON.Partition-Id"] = str(partition_id)
    r = await batch_client.get(url, headers=headers)
    ericsson_client._log("GET", url, r.status_code, None, r.text[:2000], headers=headers)
    r.raise_for_status()
    objs = _parse_json_stream(r.text)
    return {"objects": objs, "count": len(objs)}


@router.post("/build")
async def build(body: dict = None):
    """Build and return the batch file JSON (preview, no submit)."""
    bf = build_batch_file(body or {})
    return await _enrich_mandatory_chars(bf)


@router.get("/template")
async def template(count: int = 1, adjustment: bool = True):
    """Return a ready-to-edit batch file TEMPLATE (party->customer->contract->adjustment).

    The user can download this, edit the resource payloads/externalIds, and upload it.
    Mandatory spec characteristics are auto-populated from the catalog.
    """
    bf = build_batch_file({"count": count, "adjustment": adjustment})
    return await _enrich_mandatory_chars(bf)


@router.post("/upload")
async def upload_batch(file: UploadFile = File(...)):
    """Validate an uploaded batch JSON file and return it parsed (no submit).

    Accepts the generic batch file with header/records/trailer.
    """
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        parsed = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    # light structural validation
    missing = [k for k in ("header", "records") if k not in parsed]
    if missing:
        raise HTTPException(status_code=400, detail=f"Batch file missing section(s): {', '.join(missing)}")
    recs = parsed.get("records") or []
    return {"valid": True, "recordCount": len(recs), "batchFile": parsed,
            "batchJobId": (parsed.get("header") or {}).get("batchJobId")}


async def _run_schedule(schedule_id: str, batch_file: dict, delay_seconds: int, auto_start: bool):
    """Background task: wait delay, create job, optionally start it, record status."""
    sched = _scheduled.get(schedule_id)
    try:
        if delay_seconds > 0:
            sched["state"] = "WAITING"
            await asyncio.sleep(delay_seconds)
        sched["state"] = "CREATING"
        created = await _submit_raw(batch_file)
        job_id = created.get("jobId") or created.get("id") or (created.get("job") or {}).get("jobId")
        sched["jobId"] = job_id
        sched["createResponse"] = created
        if auto_start and job_id:
            sched["state"] = "STARTING"
            start_resp = await ericsson_client.request("batch_start_job", path_params={"jobId": job_id})
            sched["startResponse"] = start_resp
            sched["state"] = "STARTED"
        else:
            sched["state"] = "CREATED"
    except Exception as e:
        sched["state"] = "ERROR"
        sched["error"] = str(e)
        logger.error(f"Scheduled batch {schedule_id} failed: {e}")


@router.post("/schedule")
async def schedule_batch(body: dict = None):
    """Schedule a batch job: create (+optionally start) now or after a delay.

    body: { batchFile?: {...}, delaySeconds?: int, autoStart?: bool, ...builder params }
    Returns a scheduleId to poll via GET /batch/schedule/{id}.
    """
    body = body or {}
    batch_file = body.get("batchFile") or build_batch_file(body)
    if not body.get("batchFile"):
        batch_file = await _enrich_mandatory_chars(batch_file)
    delay = int(body.get("delaySeconds") or 0)
    auto_start = bool(body.get("autoStart", True))
    schedule_id = uuid.uuid4().hex[:12]
    _scheduled[schedule_id] = {
        "scheduleId": schedule_id,
        "state": "SCHEDULED",
        "delaySeconds": delay,
        "autoStart": auto_start,
        "batchJobId": (batch_file.get("header") or {}).get("batchJobId"),
        "createdAt": _now(),
        "jobId": None,
    }
    asyncio.create_task(_run_schedule(schedule_id, batch_file, delay, auto_start))
    return {"scheduleId": schedule_id, "state": "SCHEDULED", "delaySeconds": delay, "autoStart": auto_start}


@router.get("/schedule")
async def list_schedules():
    return list(_scheduled.values())


@router.get("/schedule/{schedule_id}")
async def schedule_status(schedule_id: str):
    s = _scheduled.get(schedule_id)
    if not s:
        raise HTTPException(status_code=404, detail="Unknown scheduleId")
    # if a job exists, enrich with live job status
    if s.get("jobId"):
        try:
            live = await ericsson_client.request("batch_job_status", path_params={"jobId": s["jobId"]})
            s["jobStatus"] = live
        except Exception as e:
            s["jobStatusError"] = str(e)
    return s


@router.post("/jobs/create")
async def create_job(body: dict = None):
    """Build (if raw file not supplied) and submit a batch job -> returns jobId."""
    body = body or {}
    batch_file = body.get("batchFile") or build_batch_file(body)
    if not body.get("batchFile"):
        batch_file = await _enrich_mandatory_chars(batch_file)
    try:
        return await _submit_raw(batch_file)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/jobs/{job_id}/start")
async def start_job(job_id: str):
    try:
        return await ericsson_client.request("batch_start_job", path_params={"jobId": job_id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/jobs/{job_id}/status")
async def job_status(job_id: str):
    try:
        return await ericsson_client.request("batch_job_status", path_params={"jobId": job_id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/jobs/{job_id}/result")
async def job_result(job_id: str):
    try:
        return await _fetch_result_stream(job_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


def _extract_failure_reason(resp_text: str) -> str:
    """Pull a concise, human-readable reason out of a CPM/BSSF error response
    (which is a JSON string possibly nested several levels deep)."""
    if not resp_text:
        return ""
    reason = resp_text
    # unwrap nested JSON-in-string up to a few levels, collecting the deepest "details"/"message"
    for _ in range(6):
        try:
            obj = json.loads(reason) if isinstance(reason, str) else reason
        except Exception:
            break
        if isinstance(obj, dict):
            msgs = obj.get("messages")
            if isinstance(msgs, list) and msgs:
                # Prefer the message carrying the real cause: one that has a
                # 'source' (e.g. CPM) or whose details reference a downstream
                # system; fall back to the last message with details.
                def _score(m):
                    det = m.get("details") or ""
                    s = 0
                    if m.get("source"):
                        s += 2
                    if "downstream" in det or "Missing" in det or "Details:" in det:
                        s += 3
                    s += min(len(det), 300) / 300.0
                    return s
                with_details = [m for m in msgs if m.get("details") or m.get("message")]
                detailed = max(with_details, key=_score) if with_details else msgs[-1]
                reason = detailed.get("details") or detailed.get("message") or json.dumps(detailed)
                continue
            nxt = obj.get("details") or obj.get("message")
            if nxt and nxt != reason:
                reason = nxt
                continue
            break
        else:
            break
    if isinstance(reason, str) and reason.strip().startswith("Unexpected response received from downstream system. Details:"):
        reason = reason.split("Details:", 1)[1].strip()
    return reason if isinstance(reason, str) else json.dumps(reason)


@router.get("/jobs/{job_id}/failures")
async def job_failures(job_id: str):
    """Return a readable per-entity failure summary for a job: which record/entity
    failed and the extracted reason. Also returns overall counts."""
    try:
        data = await _fetch_result_stream(job_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    objects = data.get("objects", [])
    records, failures, total, ok = [], [], 0, 0
    for o in objects:
        if "entities" not in o:
            continue
        rec_no = o.get("recordNumber")
        for en in o.get("entities", []):
            total += 1
            etype = en.get("entityType") or en.get("entity") or f"entity {en.get('entityNumber')}"
            if en.get("success"):
                ok += 1
                continue
            reason = _extract_failure_reason(en.get("response") or "") or en.get("errorMessage") or ""
            failures.append({
                "recordNumber": rec_no,
                "entityNumber": en.get("entityNumber"),
                "entity": etype,
                "responseCode": en.get("responseCode"),
                "reason": reason,
            })
    return {
        "jobId": job_id,
        "total": total,
        "success": ok,
        "failed": len(failures),
        "failures": failures,
    }


@router.get("/jobs")
async def list_jobs(sort: str = "created_desc"):
    """List batch jobs. sort options:
    created_desc (default, newest first), created_asc, name_asc, name_desc,
    status_asc, status_desc."""
    try:
        jobs = await ericsson_client.request("batch_list_jobs")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not isinstance(jobs, list):
        return jobs
    # parse creationDate (e.g. "Jul 23, 2026, 7:54:52 AM") into a sortable epoch
    import time as _time
    def _epoch(j):
        s = j.get("creationDate") or ""
        for fmt in ("%b %d, %Y, %I:%M:%S %p", "%b %d, %Y, %H:%M:%S",
                    "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S"):
            try:
                return _time.mktime(_time.strptime(s.replace("\u202f", " ").strip(), fmt))
            except Exception:
                continue
        return 0.0
    for j in jobs:
        j["_createdEpoch"] = _epoch(j)
    key_map = {
        "created_desc": (lambda j: j["_createdEpoch"], True),
        "created_asc": (lambda j: j["_createdEpoch"], False),
        "name_asc": (lambda j: (j.get("batchName") or "").lower(), False),
        "name_desc": (lambda j: (j.get("batchName") or "").lower(), True),
        "status_asc": (lambda j: (j.get("status") or "").lower(), False),
        "status_desc": (lambda j: (j.get("status") or "").lower(), True),
    }
    keyfn, rev = key_map.get(sort, key_map["created_desc"])
    try:
        jobs.sort(key=keyfn, reverse=rev)
    except Exception:
        pass
    return jobs


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    try:
        return await ericsson_client.request("batch_delete_job", path_params={"jobId": job_id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
