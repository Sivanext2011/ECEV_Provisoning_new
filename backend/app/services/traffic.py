"""
Traffic Service - Send N28 (CHF) and N40 (PCF) traffic to CHA.
Simplified from TrafficSimulator for single-session use.
"""
import httpx
import ssl
import time
import uuid
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)


class TrafficService:
    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self.config: dict = {}

    def configure(self, chf_fqdn: str, chf_port: int = 443,
                  pcf_fqdn: str = "", pcf_port: int = 443,
                  cert_path: str = "", key_path: str = "", ca_path: str = "",
                  verify_ssl: bool = False):
        """Configure the traffic endpoints and TLS."""
        self.config = {
            "chf_fqdn": chf_fqdn, "chf_port": chf_port,
            "pcf_fqdn": pcf_fqdn or chf_fqdn, "pcf_port": pcf_port,
            "cert_path": cert_path, "key_path": key_path, "ca_path": ca_path,
            "verify_ssl": verify_ssl,
        }
        self._client = None  # Reset client on config change

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client:
            return self._client

        verify: any = False
        cert_path = self.config.get("cert_path", "")
        key_path = self.config.get("key_path", "")

        if cert_path and Path(cert_path).exists():
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            ctx.load_cert_chain(cert_path, key_path if key_path and Path(key_path).exists() else None)
            verify = ctx

        self._client = httpx.AsyncClient(timeout=30, verify=verify, http2=True)
        return self._client

    # === N28 (CHF - Nchf_ConvergedCharging) ===

    async def chf_create(self, msisdn: str, imsi: str = "", rating_group: int = 100,
                         requested_units: int = 1048576, unit_type: str = "totalVolume",
                         dnn: str = "internet", slice_sst: int = 1) -> dict:
        """Send CHF Initial (Create ChargingData)."""
        client = await self._get_client()
        fqdn = self.config["chf_fqdn"]
        port = self.config["chf_port"]
        url = f"https://{fqdn}:{port}/nchf-convergedcharging/v3/chargingData"

        payload = {
            "subscriberIdentifier": f"imsi-{imsi or msisdn}",
            "nfConsumerIdentification": {
                "nfName": "smf-provisioning-tool",
                "nfIPv4Address": "10.0.0.1",
                "nfPLMNID": {"mcc": "466", "mnc": "01"},
            },
            "invocationTimeStamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "invocationSequenceNumber": 0,
            "multipleUnitUsage": [{
                "ratingGroup": rating_group,
                "requestedUnit": {unit_type: requested_units},
            }],
            "pDUSessionChargingInformation": {
                "chargingId": int(uuid.uuid4().int % 2147483647),
                "userInformation": {
                    "servedGPSI": f"msisdn-{msisdn}",
                    "servedPEI": f"imeisv-{msisdn}0000000",
                },
                "pduSessionInformation": {
                    "networkSlicingInfo": {"sNSSAI": {"sst": slice_sst}},
                    "pduType": "IPV4",
                    "servingNodeID": [{"plmnId": {"mcc": "466", "mnc": "01"}, "amfId": "010001"}],
                    "dnnId": dnn,
                },
            },
        }

        try:
            r = await client.post(url, json=payload)
            # Extract chargingDataRef from Location header
            location = r.headers.get("location", "")
            ref = location.split("/")[-1] if location else ""
            return {
                "status": r.status_code,
                "chargingDataRef": ref,
                "response": r.json() if r.text else {},
                "location": location,
            }
        except Exception as e:
            return {"status": "error", "error": str(e)}

    async def chf_update(self, charging_data_ref: str, msisdn: str, rating_group: int = 100,
                         used_units: int = 524288, requested_units: int = 1048576,
                         unit_type: str = "totalVolume") -> dict:
        """Send CHF Update."""
        client = await self._get_client()
        fqdn = self.config["chf_fqdn"]
        port = self.config["chf_port"]
        url = f"https://{fqdn}:{port}/nchf-convergedcharging/v3/chargingData/{charging_data_ref}/update"

        payload = {
            "subscriberIdentifier": f"imsi-{msisdn}",
            "invocationTimeStamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "invocationSequenceNumber": 1,
            "multipleUnitUsage": [{
                "ratingGroup": rating_group,
                "usedUnitContainer": [{"totalVolume": used_units}],
                "requestedUnit": {unit_type: requested_units},
            }],
        }

        try:
            r = await client.post(url, json=payload)
            return {"status": r.status_code, "response": r.json() if r.text else {}}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    async def chf_release(self, charging_data_ref: str, msisdn: str, rating_group: int = 100,
                          used_units: int = 524288, unit_type: str = "totalVolume") -> dict:
        """Send CHF Release (Terminate session)."""
        client = await self._get_client()
        fqdn = self.config["chf_fqdn"]
        port = self.config["chf_port"]
        url = f"https://{fqdn}:{port}/nchf-convergedcharging/v3/chargingData/{charging_data_ref}/release"

        payload = {
            "subscriberIdentifier": f"imsi-{msisdn}",
            "invocationTimeStamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
            "invocationSequenceNumber": 2,
            "multipleUnitUsage": [{
                "ratingGroup": rating_group,
                "usedUnitContainer": [{"totalVolume": used_units}],
            }],
        }

        try:
            r = await client.post(url, json=payload)
            return {"status": r.status_code, "response": r.json() if r.text else {}}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    # === N40 (PCF - Npcf_SMPolicyControl) ===

    async def pcf_create(self, msisdn: str, imsi: str = "", dnn: str = "internet",
                         slice_sst: int = 1) -> dict:
        """Send PCF SM Policy Create."""
        client = await self._get_client()
        fqdn = self.config["pcf_fqdn"]
        port = self.config["pcf_port"]
        url = f"https://{fqdn}:{port}/npcf-smpolicycontrol/v1/sm-policies"

        payload = {
            "supi": f"imsi-{imsi or msisdn}",
            "gpsi": f"msisdn-{msisdn}",
            "pduSessionId": 1,
            "pduSessionType": "IPV4",
            "dnn": dnn,
            "notificationUri": "http://localhost:8080/callback",
            "sliceInfo": {"sst": slice_sst},
            "servingNetwork": {"mcc": "466", "mnc": "01"},
            "ratType": "NR",
            "accessType": "3GPP_ACCESS",
        }

        try:
            r = await client.post(url, json=payload)
            location = r.headers.get("location", "")
            policy_id = location.split("/")[-1] if location else ""
            return {"status": r.status_code, "policyId": policy_id, "response": r.json() if r.text else {}, "location": location}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    async def pcf_delete(self, policy_id: str) -> dict:
        """Send PCF SM Policy Delete."""
        client = await self._get_client()
        fqdn = self.config["pcf_fqdn"]
        port = self.config["pcf_port"]
        url = f"https://{fqdn}:{port}/npcf-smpolicycontrol/v1/sm-policies/{policy_id}/delete"

        try:
            r = await client.post(url, json={})
            return {"status": r.status_code, "response": r.json() if r.text else {}}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    async def close(self):
        if self._client:
            await self._client.aclose()
            self._client = None


# Singleton
traffic_service = TrafficService()
