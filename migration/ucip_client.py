"""UCIP / ACIP (SDP AIR) client for Classic EC.

Protocol per CPI (AIR Programmer's Guide UCIP Version 5.0, LZN40101911):
UCIP/ACIP is **XML-RPC over HTTP/HTTPS** (NOT SOAP, NOT CORBA). Requests are
HTTP POST to the `/Air` URI with Content-Type text/xml and HTTP Basic auth.
Ports: 10011 (HTTP), 10012 (HTTPS); 10010 retained for older AIR-IP versions.
The internal SDP RPC port (default 8084) is NOT the external UCIP endpoint.

Request bodies are XML-RPC <methodCall> with a single <struct> parameter whose
members are the AIR request fields. Responses are <methodResponse> with a
<struct> (or <fault>). We normalise the response struct into a flat element
tree so the model parsers can read fields by name regardless of wire format.

Fetches the subscriber profile with these operations:
  GetAccountDetails         -> master MSISDN, serviceClass, imsi, language, expiry
  GetOffers                 -> offer list + attributes + validity + carryover companion
  GetBalanceAndDate         -> dedicated accounts (UT quota + expiry)
  GetAccumulators           -> usage counters (UC consumed)
  GetMultiSubscriberNumbers -> master + subordinate (Apple Watch) MSISDN/IMSI

Everything (endpoint, extra request members, auth) is driven from
migration_config.json so it can be adapted without code changes.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

import httpx

from .models import (
    ECAccumulator,
    ECDedicatedAccount,
    ECOffer,
    ECOfferAttribute,
    ECSubordinate,
    SubscriberProfile,
)

logger = logging.getLogger(__name__)


# Extra request members per operation (beyond the common origin* + subscriberNumber).
# Values can reference {offer_id} etc. Members are emitted as XML-RPC <string>.
OPERATION_EXTRA_MEMBERS: dict[str, dict[str, str]] = {
    "DeleteOffer": {"offerID": "{offer_id}"},
}

# All read operations in the fetch flow.
READ_OPERATIONS = (
    "GetAccountDetails",
    "GetOffers",
    "GetBalanceAndDate",
    "GetAccumulators",
    "GetMultiSubscriberNumbers",
)


def _localname(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _findall_local(root: ET.Element, name: str) -> list[ET.Element]:
    return [e for e in root.iter() if _localname(e.tag) == name]


def _first_text(root: ET.Element, name: str) -> Optional[str]:
    for e in root.iter():
        if _localname(e.tag) == name and e.text is not None:
            return e.text.strip()
    return None


class UcipError(Exception):
    pass


# ---------------------------------------------------------------------------
# XML-RPC helpers
# ---------------------------------------------------------------------------

class XmlRpcTyped:
    """Wrap a value to force a specific XML-RPC type tag (e.g. dateTime.iso8601).

    Used because AIR validates XML-RPC types strictly: originTimeStamp must be
    <dateTime.iso8601>, not <string> (sending a string yields UCIP
    responseCode=1002 'Illegal data type').
    """
    __slots__ = ("type_tag", "value")

    def __init__(self, type_tag: str, value: str):
        self.type_tag = type_tag
        self.value = value


class XmlRpcArray:
    """Wrap a list to force an XML-RPC <array> of typed scalars.

    AIR requires negotiatedCapabilities as an <array> of <i4>. The capability
    negotiation is mandatory for AIR 5.0; omitting it (or sending the wrong
    type) yields responseCode=1003 'Data out of bounds'. Example:
    XmlRpcArray("i4", [809828928, 1832]).
    """
    __slots__ = ("type_tag", "items")

    def __init__(self, type_tag: str, items: list):
        self.type_tag = type_tag
        self.items = items


class XmlRpcStruct:
    """Wrap a dict of {name: value} to force an XML-RPC <struct>.

    Values may be plain scalars, XmlRpcTyped, XmlRpcArray, XmlRpcStruct, or
    XmlRpcStructArray (nesting supported). Used for the dedicated-account,
    accumulator and offer sub-structures of UCIP update operations.
    """
    __slots__ = ("members",)

    def __init__(self, members: dict):
        self.members = members


class XmlRpcStructArray:
    """Wrap a list of dicts to force an XML-RPC <array> of <struct> elements.

    Used for list-valued UCIP parameters such as dedicatedAccountUpdateInformation,
    accumulatorUpdateInformation and offerUpdateInformationList.
    """
    __slots__ = ("structs",)

    def __init__(self, structs: list[dict]):
        self.structs = structs


def _xmlrpc_value(value: Any) -> str:
    """Render a Python value as an XML-RPC <value>."""
    if isinstance(value, XmlRpcArray):
        inner = "".join(
            f"<value><{value.type_tag}>{escape(str(i))}</{value.type_tag}></value>"
            for i in value.items
        )
        return f"<value><array><data>{inner}</data></array></value>"
    if isinstance(value, XmlRpcStruct):
        return f"<value>{_xmlrpc_struct(value.members)}</value>"
    if isinstance(value, XmlRpcStructArray):
        inner = "".join(
            f"<value>{_xmlrpc_struct(s)}</value>" for s in value.structs
        )
        return f"<value><array><data>{inner}</data></array></value>"
    if isinstance(value, XmlRpcTyped):
        return f"<value><{value.type_tag}>{escape(str(value.value))}</{value.type_tag}></value>"
    if isinstance(value, bool):
        return f"<value><boolean>{1 if value else 0}</boolean></value>"
    if isinstance(value, int):
        return f"<value><int>{value}</int></value>"
    if isinstance(value, float):
        return f"<value><double>{value}</double></value>"
    return f"<value><string>{escape(str(value))}</string></value>"


def _xmlrpc_struct(members: dict[str, Any]) -> str:
    parts = ["<struct>"]
    for name, val in members.items():
        parts.append(f"<member><name>{escape(name)}</name>{_xmlrpc_value(val)}</member>")
    parts.append("</struct>")
    return "".join(parts)


def _xmlrpc_method_call(method: str, struct_members: dict[str, Any]) -> str:
    return (
        '<?xml version="1.0"?>'
        "<methodCall>"
        f"<methodName>{escape(method)}</methodName>"
        "<params><param><value>"
        + _xmlrpc_struct(struct_members)
        + "</value></param></params>"
        "</methodCall>"
    )


def _dedicated_account_array(entries: list[dict], absolute_only: bool = False) -> "XmlRpcStructArray":
    """Build dedicatedAccountUpdateInformation array (UT).

    Each entry: {"id": int, "value": int} absolute (dedicatedAccountValueNew)
    or {"id": int, "relative": int} (adjustmentAmountRelative). During
    InstallSubscriber only the absolute form is allowed (absolute_only=True).
    """
    structs = []
    for e in entries:
        m: dict[str, Any] = {"dedicatedAccountID": XmlRpcTyped("i4", str(int(e["id"])))}
        if "value" in e and e["value"] is not None:
            # dedicatedAccountValueNew is a Unit = i8 (64-bit), NOT i4 (CPI 7.87).
            m["dedicatedAccountValueNew"] = XmlRpcTyped("i8", str(int(e["value"])))
        elif "relative" in e and not absolute_only:
            m["adjustmentAmountRelative"] = XmlRpcTyped("i8", str(int(e["relative"])))
        if "unitType" in e:
            m["dedicatedAccountUnitType"] = XmlRpcTyped("i4", str(int(e["unitType"])))
        if "expiryDate" in e and e["expiryDate"]:
            m["expiryDate"] = XmlRpcTyped("dateTime.iso8601", str(e["expiryDate"]))
        structs.append(m)
    return XmlRpcStructArray(structs)


def _accumulator_array(entries: list[dict]) -> "XmlRpcStructArray":
    """Build accumulatorUpdateInformation array (UC).

    Each entry: {"id": int, "value": int} absolute (accumulatorValueNew) or
    {"id": int, "relative": int} (accumulatorValueRelative).
    """
    structs = []
    for e in entries:
        m: dict[str, Any] = {"accumulatorID": XmlRpcTyped("i4", str(int(e["id"])))}
        if "value" in e and e["value"] is not None:
            # accumulator Unit value is i8 (64-bit), NOT i4 (CPI).
            m["accumulatorValueNew"] = XmlRpcTyped("i8", str(int(e["value"])))
        elif "relative" in e:
            m["accumulatorValueRelative"] = XmlRpcTyped("i8", str(int(e["relative"])))
        structs.append(m)
    return XmlRpcStructArray(structs)

def _usage_counter_array(entries: list[dict]) -> "XmlRpcStructArray":
    """Build usageCounterUpdateInformation array (UC = Usage Counter, consumed).

    Each entry: {"id": int, "value": int} absolute (usageCounterValueNew) or
    {"id": int, "relative": int} (usageCounterValueRelative). Values are i8.
    """
    structs = []
    for e in entries:
        m: dict[str, Any] = {"usageCounterID": XmlRpcTyped("i4", str(int(e["id"])))}
        if "value" in e and e["value"] is not None:
            m["usageCounterValueNew"] = XmlRpcTyped("i8", str(int(e["value"])))
        elif "relative" in e:
            # CPI UCIP 5.0 sec 7.28: adjustmentUsageCounterValueRelative (i8)
            m["adjustmentUsageCounterValueRelative"] = XmlRpcTyped("i8", str(int(e["relative"])))
        if "associated_party_id" in e:
            m["associatedPartyID"] = str(e["associated_party_id"])
        if "product_id" in e:
            m["productID"] = XmlRpcTyped("i4", str(int(e["product_id"])))
        structs.append(m)
    return XmlRpcStructArray(structs)


def _usage_threshold_array(entries: list[dict]) -> "XmlRpcStructArray":
    """Build usageThresholdUpdateInformation array (UT = Usage Threshold, quota).

    Each entry: {"id": int, "value": int} absolute (usageThresholdValueNew), i8.
    """
    structs = []
    for e in entries:
        m: dict[str, Any] = {"usageThresholdID": XmlRpcTyped("i4", str(int(e["id"])))}
        if "value" in e and e["value"] is not None:
            m["usageThresholdValueNew"] = XmlRpcTyped("i8", str(int(e["value"])))
        structs.append(m)
    return XmlRpcStructArray(structs)




def _offer_array(entries: list[dict]) -> "XmlRpcStructArray":
    """Build offerUpdateInformationList array.

    Each entry: {"offerID": int, "offerType": int, "startDate": str,
    "expiryDate": str}. Dates in UCIP dateTime.iso8601 form.
    """
    structs = []
    for e in entries:
        m: dict[str, Any] = {"offerID": XmlRpcTyped("i4", str(int(e["offerID"])))}
        if "offerType" in e and e["offerType"] is not None:
            m["offerType"] = XmlRpcTyped("i4", str(int(e["offerType"])))
        if e.get("startDate"):
            m["startDate"] = XmlRpcTyped("dateTime.iso8601", str(e["startDate"]))
        if e.get("expiryDate"):
            m["expiryDate"] = XmlRpcTyped("dateTime.iso8601", str(e["expiryDate"]))
        structs.append(m)
    return XmlRpcStructArray(structs)


def _normalise_xmlrpc_response(root: ET.Element) -> ET.Element:
    """Convert an XML-RPC <methodResponse> into a flat element tree whose tag
    names are the struct member names, so the model parsers can use
    find-by-local-name. Arrays become repeated elements. Nested structs recurse.

    A <fault> is converted into a <responseCode>/<faultString> pair so the
    existing response-code check still works.
    """
    out = ET.Element("response")

    # fault handling
    faults = _findall_local(root, "fault")
    if faults:
        members = _struct_members(faults[0])
        code = members.get("faultCode", "")
        string = members.get("faultString", "")
        ET.SubElement(out, "responseCode").text = str(code) if code != "" else "1"
        ET.SubElement(out, "faultString").text = str(string)
        return out

    # locate the top-level <value> under params/param
    params = _findall_local(root, "param")
    if not params:
        return out
    value_el = None
    for child in params[0]:
        if _localname(child.tag) == "value":
            value_el = child
            break
    if value_el is None:
        return out
    _emit_value(out, value_el)
    return out


def _emit_value(parent: ET.Element, value_el: ET.Element, grandparent: Optional[ET.Element] = None):
    """Emit an XML-RPC <value> into `parent`.

    - struct -> one child element per member, named after the member.
    - array  -> each element surfaces as a repeated element named like `parent`
                (attached to `grandparent`), so a member <offer> holding an
                array of 3 becomes 3 sibling <offer> elements.
    - scalar -> text on `parent`.
    """
    typed = None
    for child in value_el:
        typed = child
        break
    if typed is None:
        parent.text = (value_el.text or "").strip()
        return
    kind = _localname(typed.tag)
    if kind == "struct":
        _emit_struct(parent, typed)
    elif kind == "array":
        datas = [c for c in typed if _localname(c.tag) == "data"]
        data = datas[0] if datas else typed
        items = [c for c in data if _localname(c.tag) == "value"]
        tag = parent.tag
        for i, item in enumerate(items):
            if i == 0:
                target = parent
            elif grandparent is not None:
                target = ET.SubElement(grandparent, tag)
            else:
                target = ET.SubElement(parent, tag)
            _emit_value(target, item)
    else:
        parent.text = (typed.text or "").strip()


def _emit_struct(parent: ET.Element, struct_el: ET.Element):
    for member in struct_el:
        if _localname(member.tag) != "member":
            continue
        name = None
        mval = None
        for mc in member:
            ln = _localname(mc.tag)
            if ln == "name":
                name = (mc.text or "").strip()
            elif ln == "value":
                mval = mc
        if name is None:
            continue
        child_el = ET.SubElement(parent, name)
        if mval is not None:
            _emit_value(child_el, mval, grandparent=parent)


def _struct_members(container: ET.Element) -> dict[str, str]:
    """Shallow read of struct member name->text (for fault parsing)."""
    out: dict[str, str] = {}
    for struct in _findall_local(container, "struct"):
        for member in struct:
            if _localname(member.tag) != "member":
                continue
            name = txt = None
            for mc in member:
                ln = _localname(mc.tag)
                if ln == "name":
                    name = (mc.text or "").strip()
                elif ln == "value":
                    for vc in mc:
                        txt = (vc.text or "").strip()
                    if txt is None:
                        txt = (mc.text or "").strip()
            if name is not None:
                out[name] = txt or ""
        break
    return out


class UcipClient:
    """XML-RPC UCIP/ACIP client (per CPI). One instance per migration run."""

    def __init__(self, config: dict):
        self.cfg = config or {}
        ucip = self.cfg.get("ucip", {})
        self.endpoint: str = ucip.get("endpoint", "")
        self.origin_host: str = ucip.get("origin_host", "OCSG")
        self.origin_node_type: str = ucip.get("origin_node_type", "EXT")
        # Extra static members merged into every request struct (optional).
        self.common_members: dict[str, Any] = ucip.get("common_members", {}) or {}
        self.extra_members: dict[str, dict[str, str]] = {
            **OPERATION_EXTRA_MEMBERS, **(ucip.get("extra_members", {}) or {})}
        self.verify = ucip.get("ssl_verify", False)
        self.timeout = ucip.get("timeout_seconds", 30)
        proxy = ucip.get("socks5_proxy", "")
        self._proxy = proxy if ucip.get("socks5_enabled", False) else ""
        # HTTP Basic auth on the AIR endpoint (per CPI).
        self.username = ucip.get("username", "")
        self.password = ucip.get("password", "")
        # AIR requires a User-Agent of the form "<client>/<ucipVersion>/<clientVersion>"
        # e.g. "IVR/5.0/1.0" (CPI AIR Programmer's Guide UCIP 5.0, section 3.2).
        self.user_agent = ucip.get("user_agent", "ECEV-Migration/5.0/1.0")
        # subscriberNumberNAI (Number Addressing Indicator), i4. For the CHT lab
        # subscribers NAI=1. Configurable via ucip.subscriber_number_nai.
        self.subscriber_number_nai = int(ucip.get("subscriber_number_nai", 1))
        # negotiatedCapabilities: array of i4, MANDATORY for AIR 5.0. Default is
        # the server's availableServerCapabilities [809828928, 1832] observed on
        # this node. Override via ucip.negotiated_capabilities (list of ints);
        # set to [] / null to disable.
        nc = ucip.get("negotiated_capabilities", [809828928, 1832])
        self.negotiated_capabilities = [int(x) for x in nc] if nc else []
        self._txid = 0

    # -- transport --------------------------------------------------------
    def _next_txid(self, msisdn: str) -> str:
        # originTransactionID must be a NUMERIC value within bounds on this SDP:
        # an alphanumeric id (e.g. "MIG886...") yields responseCode=1003 'Data
        # out of bounds'. We emit an 18-digit numeric id (epoch-nanos, 18 chars)
        # plus a per-process counter in the low digits for uniqueness within the
        # same nanosecond.
        self._txid += 1
        base = int(datetime.now(timezone.utc).timestamp() * 1_000_000)  # microseconds
        # 16-digit micros + 2-digit rolling counter = 18 digits, always numeric
        return f"{base % 10**16:016d}{self._txid % 100:02d}"

    @staticmethod
    def _timestamp() -> str:
        # UCIP date-time format per CPI: YYYYMMDDThh:mm:ssTZ (timezone permitted).
        return datetime.now(timezone.utc).strftime("%Y%m%dT%H:%M:%S+0000")

    def _build_body(self, operation: str, msisdn: str, typed_members: dict | None = None, **extra) -> str:
        members: dict[str, Any] = {
            "originNodeType": self.origin_node_type,
            "originHostName": self.origin_host,
            "originTransactionID": self._next_txid(msisdn),
            "originTimeStamp": XmlRpcTyped("dateTime.iso8601", self._timestamp()),
            "subscriberNumberNAI": XmlRpcTyped("i4", str(self.subscriber_number_nai)),
            "subscriberNumber": msisdn,
        }
        members.update(self.common_members)
        for name, tmpl in self.extra_members.get(operation, {}).items():
            members[name] = str(tmpl).format(msisdn=msisdn, **extra)
        if typed_members:
            members.update(typed_members)
        # negotiatedCapabilities is MANDATORY for AIR 5.0 (array of i4). Omitting
        # it yields responseCode=1003 'Data out of bounds'. Emitted last so it is
        # always present regardless of per-operation members.
        if self.negotiated_capabilities:
            members["negotiatedCapabilities"] = XmlRpcArray("i4", self.negotiated_capabilities)
        return _xmlrpc_method_call(operation, members)

    def _client(self) -> httpx.Client:
        auth = (self.username, self.password) if self.username else None
        if self._proxy:
            try:
                import httpx_socks
                transport = httpx_socks.SyncProxyTransport.from_url(self._proxy, verify=self.verify)
                return httpx.Client(timeout=self.timeout, transport=transport, auth=auth)
            except ImportError:
                logger.warning("httpx_socks not installed; UCIP proxy ignored")
        return httpx.Client(timeout=self.timeout, verify=self.verify, auth=auth)

    def call(self, operation: str, msisdn: str, typed_members: dict | None = None, **extra) -> ET.Element:
        if not self.endpoint:
            raise UcipError("UCIP endpoint not configured (ucip.endpoint)")
        body = self._build_body(operation, msisdn, typed_members=typed_members, **extra)
        headers = {"Content-Type": "text/xml", "User-Agent": self.user_agent}
        with self._client() as c:
            r = c.post(self.endpoint, content=body.encode("utf-8"), headers=headers)
            r.raise_for_status()
            text = r.text
        try:
            raw_root = ET.fromstring(text)
        except ET.ParseError as e:
            raise UcipError(f"{operation}: invalid XML-RPC response: {e}") from e
        root = _normalise_xmlrpc_response(raw_root)
        self._check_response_code(operation, root)
        return root

    def install_subscriber(
        self,
        msisdn: str,
        service_class: int | None = None,
        language_id: int | None = None,
        account_group_id: int | None = None,
        supervision_expiry: str | None = None,
        service_fee_expiry: str | None = None,
        dedicated_accounts: list[dict] | None = None,
        offers: list[dict] | None = None,
        pam_service_id: int | None = None,
    ) -> ET.Element:
        """Create a prepaid subscriber via UCIP InstallSubscriber (CPI UCIP 5.0).

        Only subscriberNumber + origin fields are mandatory; the rest are
        optional and default from service-class/system config when omitted.
        WRITE operation - provisions the account toward the SDP.

        dedicated_accounts: list of {"id": int, "value": int} to set the initial
            UT (dedicated account) value absolutely (dedicatedAccountValueNew).
        offers: list of {"offerID": int, "offerType": int, "startDate": str,
            "expiryDate": str} base offers (<=10 per CPI).
        pam_service_id: PAM service id (i4, 0-99) selecting the bill-cycle /
            periodic-account-management configuration (CPI UCIP 5.0 sec 7.161).
        """
        typed: dict[str, Any] = {}
        if service_class is not None:
            # InstallSubscriber requires serviceClassNew (CPI UCIP 5.0 sec 6.17/7.202),
            # NOT serviceClassCurrent.
            typed["serviceClassNew"] = int(service_class)
        if language_id is not None:
            typed["languageIDCurrent"] = int(language_id)
        if account_group_id is not None:
            typed["accountGroupID"] = int(account_group_id)
        if pam_service_id is not None:
            # bill cycle via PAM service id (i4, 0-99)
            typed["pamServiceID"] = int(pam_service_id)
        if supervision_expiry:
            typed["supervisionExpiryDate"] = str(supervision_expiry)
        if service_fee_expiry:
            typed["serviceFeeExpiryDate"] = str(service_fee_expiry)
        if dedicated_accounts:
            typed["dedicatedAccountUpdateInformation"] = _dedicated_account_array(
                dedicated_accounts, absolute_only=True)
        if offers:
            typed["offerUpdateInformationList"] = _offer_array(offers)
        return self.call("InstallSubscriber", msisdn, typed_members=typed)

    def update_balance_and_date(self, msisdn: str, dedicated_accounts: list[dict],
                                service_class: int | None = None) -> ET.Element:
        """Set/adjust dedicated-account (UT) values via UpdateBalanceAndDate.

        dedicated_accounts: list of {"id": int, "value": int} (absolute new
        value) or {"id": int, "relative": int} (relative adjustment).
        """
        typed: dict[str, Any] = {
            "dedicatedAccountUpdateInformation": _dedicated_account_array(dedicated_accounts),
        }
        if service_class is not None:
            typed["serviceClassCurrent"] = int(service_class)
        return self.call("UpdateBalanceAndDate", msisdn, typed_members=typed)

    def update_accumulators(self, msisdn: str, accumulators: list[dict],
                            service_class: int | None = None) -> ET.Element:
        """Set/adjust accumulator (UC) values via UpdateAccumulators (CPI UCIP 5.0).

        accumulators: list of {"id": int, "value": int} (absolute new value) or
        {"id": int, "relative": int} (relative adjustment). Absolute 0 clears it.
        Accumulators are NOT read-only over UCIP.
        """
        typed: dict[str, Any] = {
            "accumulatorUpdateInformation": _accumulator_array(accumulators),
        }
        if service_class is not None:
            typed["serviceClassCurrent"] = int(service_class)
        return self.call("UpdateAccumulators", msisdn, typed_members=typed)

    def update_offer(self, msisdn: str, offers: list[dict]) -> ET.Element:
        """Add/update offers via UpdateOffer.

        offers: list of {"offerID": int, "offerType": int, "startDate": str,
        "expiryDate": str}.
        """
        typed = {"offerUpdateInformationList": _offer_array(offers)}
        return self.call("UpdateOffer", msisdn, typed_members=typed)

    def update_usage_thresholds_and_counters(
        self,
        msisdn: str,
        thresholds: list[dict] | None = None,
        counters: list[dict] | None = None,
        service_class: int | None = None,
    ) -> ET.Element:
        """Set UT (Usage Threshold = quota) and UC (Usage Counter = consumed) via
        UpdateUsageThresholdsAndCounters (CPI UCIP 5.0 sec 6.18.2).

        For CHT 5G PPP data buckets: UT is the total quota, UC is consumed.
        This is distinct from dedicated accounts and accumulators.

        thresholds: list of {"id": int, "value": int} (usageThresholdValueNew, i8)
        counters:   list of {"id": int, "value": int} absolute (usageCounterValueNew)
                    or {"id": int, "relative": int} (usageCounterValueRelative)
        """
        typed: dict[str, Any] = {}
        if thresholds:
            typed["usageThresholdUpdateInformation"] = _usage_threshold_array(thresholds)
        if counters:
            typed["usageCounterUpdateInformation"] = _usage_counter_array(counters)
        if service_class is not None:
            typed["serviceClassCurrent"] = int(service_class)
        return self.call("UpdateUsageThresholdsAndCounters", msisdn, typed_members=typed)

    def get_usage_thresholds_and_counters(self, msisdn: str) -> ET.Element:
        """Read UT/UC via GetUsageThresholdsAndCounters (CPI UCIP 5.0)."""
        return self.call("GetUsageThresholdsAndCounters", msisdn)


    @staticmethod
    def _check_response_code(operation: str, root: ET.Element):
        code = _first_text(root, "responseCode")
        if code is not None and code.strip() not in ("0", ""):
            msg = (_first_text(root, "responseMessage")
                   or _first_text(root, "faultString") or "")
            raise UcipError(f"{operation} returned responseCode={code} {msg}")

    # -- high level fetch -------------------------------------------------
    def fetch_profile(self, msisdn: str) -> SubscriberProfile:
        profile = SubscriberProfile(master_msisdn=msisdn)

        # GetAccountDetails requires at least one request*Flag; we ask for
        # subscriber + offer + PAM info so the mapping has what it needs.
        root = self.call("GetAccountDetails", msisdn, typed_members={
            "requestSubscriberInformationFlag": True,
            "requestOfferInformationFlag": True,
            "requestPamInformationFlag": True,
        })
        profile.raw["GetAccountDetails"] = ET.tostring(root, encoding="unicode")
        profile.master_msisdn = (
            _first_text(root, "accountID") or _first_text(root, "subscriberNumber") or msisdn)
        profile.service_class = _first_text(root, "serviceClassCurrent") or _first_text(root, "serviceClassID")
        profile.imsi = _first_text(root, "imsi")
        profile.language = _first_text(root, "languageIDCurrent")
        profile.currency = _first_text(root, "currency1")
        profile.account_flags = _first_text(root, "accountFlags")
        profile.supervision_expiry = _first_text(root, "supervisionExpiryDate")
        profile.service_fee_expiry = _first_text(root, "serviceFeeExpiryDate")
        # PAM schedule (bill-cycle PAM service) -> drives CBEV bill cycle.
        # In the normalised tree the fields sit under <pamInformationList>.
        pam = (next(iter(_findall_local(root, "pamInformationList")), None)
               or next(iter(_findall_local(root, "pamInformation")), None))
        if pam is not None:
            profile.pam_service_id = _first_text(pam, "pamServiceID")
            profile.pam_class_id = _first_text(pam, "pamClassID")
            profile.pam_schedule_id = _first_text(pam, "scheduleID")
            profile.pam_current_period = _first_text(pam, "currentPamPeriod")

        root = self.call("GetOffers", msisdn)
        profile.raw["GetOffers"] = ET.tostring(root, encoding="unicode")
        profile.offers = self._parse_offers(root)

        # GetBalanceAndDate / GetAccumulators require an ACTIVE account; a
        # pre-active subscriber returns responseCode=126 'Account not active'.
        # Treat as non-fatal: migrate offers/attributes with empty balances.
        try:
            root = self.call("GetBalanceAndDate", msisdn, typed_members={
                "requestDedicatedAccountInformationFlag": True,
            })
            profile.raw["GetBalanceAndDate"] = ET.tostring(root, encoding="unicode")
            profile.dedicated_accounts = self._parse_dedicated_accounts(root)
        except (UcipError, httpx.HTTPError) as e:
            logger.info(f"GetBalanceAndDate skipped for {msisdn} (likely pre-active): {e}")

        try:
            root = self.call("GetAccumulators", msisdn)
            profile.raw["GetAccumulators"] = ET.tostring(root, encoding="unicode")
            profile.accumulators = self._parse_accumulators(root)
        except (UcipError, httpx.HTTPError) as e:
            logger.info(f"GetAccumulators skipped for {msisdn} (likely pre-active): {e}")

        # UT/UC spending limits on this SDP live in usage counters/thresholds,
        # exposed by GetUsageThresholdsAndCounters (NOT GetBalanceAndDate). Values
        # are returned already in BYTES. This fills in dedicated_accounts (UT =
        # threshold total) and accumulators (UC = counter consumed) keyed by the
        # usageCounterID (e.g. 6145000). Works on pre-active accounts too.
        try:
            root = self.call("GetUsageThresholdsAndCounters", msisdn)
            profile.raw["GetUsageThresholdsAndCounters"] = ET.tostring(root, encoding="unicode")
            self._merge_usage_thresholds(profile, root)
        except (UcipError, httpx.HTTPError) as e:
            logger.info(f"GetUsageThresholdsAndCounters skipped for {msisdn}: {e}")

        try:
            root = self.call("GetMultiSubscriberNumbers", msisdn)
            profile.raw["GetMultiSubscriberNumbers"] = ET.tostring(root, encoding="unicode")
            profile.subordinates = self._parse_subordinates(root, profile.master_msisdn)
        except (UcipError, httpx.HTTPError) as e:
            logger.info(f"GetMultiSubscriberNumbers skipped for {msisdn}: {e}")

        return profile

    def delete_offer(self, msisdn: str, offer_id: str) -> ET.Element:
        return self.call("DeleteOffer", msisdn, offer_id=offer_id)

    # -- parsers (operate on the normalised element tree) -----------------
    def _parse_offers(self, root: ET.Element) -> list[ECOffer]:
        offers: list[ECOffer] = []
        # offers may appear as <offerInformation>/<offer>/<item> entries
        containers = (_findall_local(root, "offer")
                      or _findall_local(root, "offerInformation")
                      or _findall_local(root, "item"))
        for oe in containers:
            offer_id = (_first_text(oe, "offerID") or _first_text(oe, "offerId") or "")
            if not offer_id:
                continue
            is_carry = bool(re.search(r"_carryover$", offer_id, re.IGNORECASE))
            carried, unit = None, None
            for ca in _findall_local(oe, "carriedAmount"):
                if ca.text:
                    try:
                        carried = float(ca.text.strip())
                    except ValueError:
                        carried = None
                    unit = ca.get("unit")
                is_carry = True
            attrs = []
            for ae in _findall_local(oe, "offerAttribute"):
                name = ae.get("name") or _first_text(ae, "name")
                val = ae.get("value") or _first_text(ae, "value")
                if name is not None:
                    attrs.append(ECOfferAttribute(name=name, value=val or ""))
            offers.append(ECOffer(
                offer_id=offer_id,
                offer_type=_first_text(oe, "offerType"),
                start_date=_first_text(oe, "startDate"),
                expiry_date=_first_text(oe, "expiryDate"),
                attributes=attrs,
                is_carryover_companion=is_carry,
                carried_amount=carried,
                carried_unit=unit,
            ))
        return offers

    def _parse_dedicated_accounts(self, root: ET.Element) -> list[ECDedicatedAccount]:
        out: list[ECDedicatedAccount] = []
        for de in _findall_local(root, "dedicatedAccountInformation"):
            da_id = _first_text(de, "dedicatedAccountID")
            if not da_id:
                continue
            val_el = next(iter(_findall_local(de, "value")), None)
            value, unit = 0.0, "GB"
            if val_el is not None and val_el.text:
                try:
                    value = float(val_el.text.strip())
                except ValueError:
                    value = 0.0
                unit = val_el.get("unit") or "GB"
            out.append(ECDedicatedAccount(
                dedicated_account_id=da_id, value=value, unit=unit,
                expiry_date=_first_text(de, "expiryDate")))
        return out

    def _parse_accumulators(self, root: ET.Element) -> list[ECAccumulator]:
        out: list[ECAccumulator] = []
        for ae in _findall_local(root, "accumulator"):
            acc_id = _first_text(ae, "accumulatorID")
            if not acc_id:
                continue
            val_el = next(iter(_findall_local(ae, "value")), None)
            value, unit = 0.0, "GB"
            if val_el is not None and val_el.text:
                try:
                    value = float(val_el.text.strip())
                except ValueError:
                    value = 0.0
                unit = val_el.get("unit") or "GB"
            out.append(ECAccumulator(accumulator_id=acc_id, value=value, unit=unit))
        return out

    def _merge_usage_thresholds(self, profile: SubscriberProfile, root: ET.Element) -> None:
        """Parse GetUsageThresholdsAndCounters and merge into the profile.

        Structure (per CPI): usageCounterUsageThresholdInformation[] of
          { usageCounterID, usageCounterValue (UC consumed),
            usageThresholdInformation[] of { usageThresholdID, usageThresholdValue } }

        Values are already in BYTES. For each counter we record:
          - UC  -> ECAccumulator(accumulator_id=<counterID>, value=<UC bytes>, unit="B")
          - UT  -> ECDedicatedAccount(dedicated_account_id=<counterID>, value=<UT bytes>, unit="B")
        The UT is the threshold whose usageThresholdID == usageCounterID (the
        provisioned spending limit, e.g. 6145000=2147483648), ignoring auto/system
        thresholds such as the 50-prefixed ones (506145000).
        """
        for info in _findall_local(root, "usageCounterUsageThresholdInformation"):
            counter_id = _first_text(info, "usageCounterID")
            if not counter_id:
                continue
            uc_val = _first_text(info, "usageCounterValue")
            try:
                uc_bytes = float(uc_val) if uc_val not in (None, "") else 0.0
            except ValueError:
                uc_bytes = 0.0
            # don't duplicate if already present
            if not profile.accumulator(counter_id):
                profile.accumulators.append(
                    ECAccumulator(accumulator_id=counter_id, value=uc_bytes, unit="B"))

            # pick the threshold matching the counter id (the provisioned UT)
            ut_bytes = None
            fallback = None
            for te in _findall_local(info, "usageThresholdInformation"):
                tid = _first_text(te, "usageThresholdID")
                tval = _first_text(te, "usageThresholdValue")
                try:
                    tb = float(tval) if tval not in (None, "") else 0.0
                except ValueError:
                    tb = 0.0
                if tid == counter_id:
                    ut_bytes = tb
                elif fallback is None:
                    fallback = tb
            if ut_bytes is None:
                ut_bytes = fallback if fallback is not None else 0.0
            if not profile.dedicated_account(counter_id):
                profile.dedicated_accounts.append(
                    ECDedicatedAccount(dedicated_account_id=counter_id, value=ut_bytes, unit="B"))

    def _parse_subordinates(self, root: ET.Element, master: str) -> list[ECSubordinate]:
        out: list[ECSubordinate] = []
        for se in _findall_local(root, "subordinate"):
            num = _first_text(se, "subordinateNumber") or _first_text(se, "multiSubscriberNumber")
            if num and num != master:
                out.append(ECSubordinate(msisdn=num, imsi=_first_text(se, "imsi")))
        if not out:
            for num_el in _findall_local(root, "subordinateNumber"):
                if num_el.text and num_el.text.strip() != master:
                    out.append(ECSubordinate(msisdn=num_el.text.strip()))
        return out
