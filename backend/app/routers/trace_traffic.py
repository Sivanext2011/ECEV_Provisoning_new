"""Trace & Traffic router - bamctl trace management + CHF/PCF traffic."""
from fastapi import APIRouter, HTTPException
from ..services.trace import trace_service
from ..services.traffic import traffic_service
from ..services.ericsson_client import load_config, CONFIG_PATH
import json
import re


router = APIRouter(prefix="/api/v1/trace", tags=["trace-traffic"])


def _derive_domains(cfg: dict) -> dict:
    """Derive OAM/TRF domains from existing config."""
    env = cfg.get("environment", {})
    auth = cfg.get("auth", {})
    # Extract domain from ROOT_BAE: https://bss-trf.<domain> → <domain>
    root_bae = env.get("ROOT_BAE", "")
    trf_domain = ""
    m = re.match(r"https?://[^.]+\.(.+)", root_bae)
    if m:
        trf_domain = m.group(1)
    # Extract OAM domain from token_endpoint: https://eric-sec-access-mgmt.<domain>/auth/...
    token_ep = auth.get("token_endpoint", "")
    oam_domain = ""
    m2 = re.match(r"https?://eric-sec-access-mgmt\.([^/]+)", token_ep)
    if m2:
        oam_domain = m2.group(1)
    return {
        "oam_domain": oam_domain,
        "trf_domain": trf_domain,
        "iam_url": f"https://eric-sec-access-mgmt.{oam_domain}" if oam_domain else "",
        "bam_fqdn": f"eric-bss-bam-cli.{oam_domain}" if oam_domain else "",
        "chf_fqdn": f"eric-bss-cha-chf-httpproxy.{trf_domain}" if trf_domain else "",
        "pcf_fqdn": f"eric-bss-cha-pcf-httpproxy.{trf_domain}" if trf_domain else "",
    }


# Load settings from config on import
try:
    _cfg = load_config()
    trace_service.load_from_config(_cfg)
    traffic_service.load_from_config(_cfg)
except Exception:
    pass


# === Setup ===

@router.get("/status")
async def trace_status():
    """Check trace service status."""
    cfg = load_config()
    tc = cfg.get("trace_traffic", {})
    derived = _derive_domains(cfg)
    return {
        "bamctlExists": trace_service.bamctl_exists,
        "loggedIn": trace_service._logged_in,
        "trafficConfigured": bool(traffic_service.config.get("chf_fqdn")),
        "settings": tc,
        "derived": derived,
    }


@router.put("/settings")
async def save_trace_settings(body: dict):
    """Save trace & traffic settings to config.json."""
    cfg = load_config()
    cfg["trace_traffic"] = {
        "bam_fqdn": body.get("bam_fqdn", ""),
        "bam_iam_url": body.get("bam_iam_url", ""),
        "bam_username": body.get("bam_username", ""),
        "chf_fqdn": body.get("chf_fqdn", ""),
        "chf_port": body.get("chf_port", 443),
        "pcf_fqdn": body.get("pcf_fqdn", ""),
        "pcf_port": body.get("pcf_port", 443),
        "traffic_cert_path": body.get("traffic_cert_path", ""),
        "traffic_key_path": body.get("traffic_key_path", ""),
        "traffic_ca_path": body.get("traffic_ca_path", ""),
    }
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)
    # Reload services
    trace_service.load_from_config(cfg)
    traffic_service.load_from_config(cfg)
    return {"status": "ok"}


@router.post("/setup/download")
async def download_bamctl(body: dict):
    """Download bamctl binary from OAM site."""
    oam_domain = body.get("oam_domain", "")
    bam_fqdn = body.get("bam_fqdn", "")
    if not oam_domain and not bam_fqdn:
        raise HTTPException(status_code=400, detail="Provide oam_domain or bam_fqdn")
    return await trace_service.download_bamctl(oam_domain, bam_fqdn)


@router.post("/setup/login")
async def trace_login(body: dict):
    """Login bamctl."""
    username = body.get("username", "")
    password = body.get("password", "")
    iam_url = body.get("iam_url", "")
    if not username or not password or not iam_url:
        raise HTTPException(status_code=400, detail="Provide username, password, iam_url")
    return await trace_service.login(username, password, iam_url)


# === Trace Management ===

@router.post("/jobs/create")
async def create_trace(body: dict):
    """Create a trace job."""
    criteria_type = body.get("criteriaType", "CustomerId")
    criteria_value = body.get("criteriaValue", "")
    interface = body.get("interface", "CHA-ALL")
    trace_level = body.get("traceLevel", 1)
    description = body.get("description", "")
    if not criteria_value:
        raise HTTPException(status_code=400, detail="criteriaValue is required")
    return await trace_service.create_trace_job(criteria_type, criteria_value, interface, trace_level, description)


@router.get("/jobs")
async def list_traces():
    """List all active trace jobs."""
    result = await trace_service.list_trace_jobs()
    # Return data array or empty list
    if result.get("status") == "success" and result.get("data"):
        data = result["data"]
        return data if isinstance(data, list) else [data]
    return []


@router.get("/jobs/{trace_id}")
async def get_trace(trace_id: str):
    """Get trace job details/results."""
    return await trace_service.get_trace_job(trace_id)


@router.get("/jobs/{trace_id}/result")
async def get_trace_result(trace_id: str):
    """Get trace results (collected data)."""
    return await trace_service.get_trace_result(trace_id)


@router.delete("/jobs/{trace_id}")
async def delete_trace(trace_id: str):
    """Delete a trace job."""
    return await trace_service.delete_trace_job(trace_id)


# === Traffic Configuration ===

@router.post("/traffic/configure")
async def configure_traffic(body: dict):
    """Configure traffic endpoints (CHF/PCF FQDN, certs)."""
    traffic_service.configure(
        chf_fqdn=body.get("chf_fqdn", ""),
        chf_port=body.get("chf_port", 443),
        pcf_fqdn=body.get("pcf_fqdn", ""),
        pcf_port=body.get("pcf_port", 443),
        cert_path=body.get("cert_path", ""),
        key_path=body.get("key_path", ""),
        ca_path=body.get("ca_path", ""),
        verify_ssl=body.get("verify_ssl", False),
    )
    return {"status": "ok", "config": traffic_service.config}


# === CHF (N28) Traffic ===

@router.post("/traffic/chf/create")
async def chf_create(body: dict):
    """Send CHF Initial (Nchf_ConvergedCharging Create)."""
    if not traffic_service.config.get("chf_fqdn"):
        raise HTTPException(status_code=400, detail="Configure traffic endpoints first")
    return await traffic_service.chf_create(
        msisdn=body.get("msisdn", ""),
        imsi=body.get("imsi", ""),
        rating_group=body.get("ratingGroup", 100),
        requested_units=body.get("requestedUnits", 1048576),
        unit_type=body.get("unitType", "totalVolume"),
        dnn=body.get("dnn", "internet"),
        slice_sst=body.get("sliceSst", 1),
    )


@router.post("/traffic/chf/update")
async def chf_update(body: dict):
    """Send CHF Update."""
    if not body.get("chargingDataRef"):
        raise HTTPException(status_code=400, detail="chargingDataRef is required")
    return await traffic_service.chf_update(
        charging_data_ref=body["chargingDataRef"],
        msisdn=body.get("msisdn", ""),
        rating_group=body.get("ratingGroup", 100),
        used_units=body.get("usedUnits", 524288),
        requested_units=body.get("requestedUnits", 1048576),
    )


@router.post("/traffic/chf/release")
async def chf_release(body: dict):
    """Send CHF Release (Terminate)."""
    if not body.get("chargingDataRef"):
        raise HTTPException(status_code=400, detail="chargingDataRef is required")
    return await traffic_service.chf_release(
        charging_data_ref=body["chargingDataRef"],
        msisdn=body.get("msisdn", ""),
        rating_group=body.get("ratingGroup", 100),
        used_units=body.get("usedUnits", 524288),
    )


# === PCF (N40) Traffic ===

@router.post("/traffic/pcf/create")
async def pcf_create(body: dict):
    """Send PCF SM Policy Create."""
    if not traffic_service.config.get("pcf_fqdn"):
        raise HTTPException(status_code=400, detail="Configure traffic endpoints first")
    return await traffic_service.pcf_create(
        msisdn=body.get("msisdn", ""),
        imsi=body.get("imsi", ""),
        dnn=body.get("dnn", "internet"),
        slice_sst=body.get("sliceSst", 1),
    )


@router.post("/traffic/pcf/delete")
async def pcf_delete(body: dict):
    """Send PCF SM Policy Delete."""
    if not body.get("policyId"):
        raise HTTPException(status_code=400, detail="policyId is required")
    return await traffic_service.pcf_delete(body["policyId"])


# === Full Workflow: Trace + Traffic + Collect ===

@router.post("/workflow/run")
async def run_trace_workflow(body: dict):
    """
    Full workflow: Set trace → Send traffic → Collect → Delete trace.
    Body: { msisdn, imsi, customerId, trafficType: "chf"|"pcf", ratingGroup, ... }
    """
    msisdn = body.get("msisdn", "")
    customer_id = body.get("customerId", "")
    traffic_type = body.get("trafficType", "chf")
    results = {"steps": []}

    # Step 1: Create trace
    criteria_type = "CustomerId" if customer_id else "MSISDN"
    criteria_value = customer_id or msisdn
    trace_result = await trace_service.create_trace_job(
        criteria_type=criteria_type,
        criteria_value=criteria_value,
        interface="CHA-ALL",
    )
    results["steps"].append({"step": "create_trace", "result": trace_result})
    trace_id = trace_result.get("data", {}).get("traceId", "")
    if not trace_id and trace_result.get("status") != "success":
        results["status"] = "failed"
        results["error"] = "Failed to create trace"
        return results

    # Step 2: Send traffic
    if traffic_type == "chf":
        traffic_result = await traffic_service.chf_create(
            msisdn=msisdn,
            imsi=body.get("imsi", ""),
            rating_group=body.get("ratingGroup", 100),
            requested_units=body.get("requestedUnits", 1048576),
        )
        results["steps"].append({"step": "chf_create", "result": traffic_result})

        # CHF Update + Release for full session
        ref = traffic_result.get("chargingDataRef", "")
        if ref:
            upd = await traffic_service.chf_update(ref, msisdn, used_units=body.get("usedUnits", 524288))
            results["steps"].append({"step": "chf_update", "result": upd})
            rel = await traffic_service.chf_release(ref, msisdn, used_units=body.get("usedUnits", 524288))
            results["steps"].append({"step": "chf_release", "result": rel})
    elif traffic_type == "pcf":
        traffic_result = await traffic_service.pcf_create(
            msisdn=msisdn, imsi=body.get("imsi", ""), dnn=body.get("dnn", "internet"),
        )
        results["steps"].append({"step": "pcf_create", "result": traffic_result})
        policy_id = traffic_result.get("policyId", "")
        if policy_id:
            del_r = await traffic_service.pcf_delete(policy_id)
            results["steps"].append({"step": "pcf_delete", "result": del_r})

    # Step 3: Wait a moment then collect trace
    import asyncio
    await asyncio.sleep(2)
    collect_result = await trace_service.get_trace_job(trace_id)
    results["steps"].append({"step": "collect_trace", "result": collect_result})

    # Step 4: Delete trace
    delete_result = await trace_service.delete_trace_job(trace_id)
    results["steps"].append({"step": "delete_trace", "result": delete_result})

    results["status"] = "success"
    results["traceId"] = trace_id
    return results
