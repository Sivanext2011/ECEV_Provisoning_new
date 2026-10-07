"""CPM Batch (eric-bss-cpm-batch) router.

Builds a generic batch JSON file (HEADER / RECORD / TRAILER) for
party -> customer(+billing account) -> contract(+product) -> balance adjustment,
and proxies the batch job lifecycle (create / start / status / result / list / delete)
through ericsson_client (which handles auth, mTLS, partition header, logging).
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone
import uuid

from ..services.ericsson_client import ericsson_client, load_config

router = APIRouter(prefix="/api/v1/batch", tags=["cpm-batch"])


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


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

    now = _now()

    header = {
        "batchJobId": body.get("batchJobId") or f"ECEV_BATCH_{_short()}",
        "creationDate": now,
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

        entities = [
            {"entity": "party", "operation": "create",
             "responseKeys": {"partyId": "id", "partyExternalId": "externalId"},
             "payload": {"resource": {
                 "externalId": party_ext, "partitionId": partition,
                 "givenName": given, "familyName": f"{family}{i+1}",
                 "individualSpecification": {"externalId": party_spec},
                 "status": [{"status": "PartyActive", "validFor": {"startDateTime": now}}],
             }}},
            {"entity": "customer", "operation": "create",
             "responseKeys": {"customerId": "id", "customerExternalId": "externalId"},
             "bodyReplacers": {"@PARTYEXTID@": "partyExternalId"},
             "payload": {"resource": {
                 "externalId": cust_ext,
                 "customerSpecification": {"externalId": cust_spec},
                 "engagedParty": {"externalId": "@PARTYEXTID@", "@referredType": "Individual"},
                 "status": [{"status": "CustomerActive", "validFor": {"startDateTime": now}}],
                 "account": [{
                     "externalId": ba_ext,
                     "billingAccountSpecExternalId": ba_spec,
                     "status": [{"status": "BillingAccountActive", "validFor": {"startDateTime": now}}],
                     "customerBillCycleSpecification": [{
                         "externalId": bcs_ext, "billCycleSpecExternalId": bc_spec,
                         "validFor": {"startDateTime": now}}],
                 }],
             }}},
            {"entity": "contract", "operation": "create",
             "responseKeys": {"contractId": "id"},
             "uriReplacers": {"{customerExternalId}": "customerExternalId"},
             "payload": {"resource": {
                 "externalId": contract_ext,
                 **({"contractSpecification": {"externalId": contract_spec}} if contract_spec else {}),
                 "status": [{"status": "Active", "validFor": {"startDateTime": now}}],
                 "product": [{
                     "externalId": prod_ext,
                     "productOfferingExternalId": po_ext,
                     "status": [{"status": "ProductCreated"}],
                     "billingAccountReference": {"externalId": ba_ext},
                     "baRefForBillCycleAlignedRecurrence": {"externalId": ba_ext},
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
    return {"header": header, "records": records, "trailer": trailer}


@router.post("/build")
async def build(body: dict = None):
    """Build and return the batch file JSON (preview, no submit)."""
    return build_batch_file(body or {})


@router.post("/jobs/create")
async def create_job(body: dict = None):
    """Build (if raw file not supplied) and submit a batch job -> returns jobId."""
    body = body or {}
    batch_file = body.get("batchFile") or build_batch_file(body)
    try:
        return await ericsson_client.request("batch_create_job", body=batch_file)
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
        return await ericsson_client.request("batch_job_result", path_params={"jobId": job_id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/jobs")
async def list_jobs():
    try:
        return await ericsson_client.request("batch_list_jobs")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    try:
        return await ericsson_client.request("batch_delete_job", path_params={"jobId": job_id})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
