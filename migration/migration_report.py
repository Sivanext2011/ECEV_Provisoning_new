#!/usr/bin/env python
"""Migration HTML report.

Captures, for one migrated subscriber, everything needed to audit the run:
  1. SDP FETCH   - every UCIP request/response (from the UcipClient.recorder)
  2. MAPPING     - the derived plan: per-product balance_mechanism, POPs,
                   buckets, Initial char, carryover, service class, ids
  3. CBEV PROVISION - every BSSF request/response (from ericsson_client.api_logs)
  4. VALIDATION  - the reconciliation report (expected vs actual per bucket)

Usage: build an MigrationReport, pass it the recorder list + api_logs snapshot
+ the MigrationResult, then call .render_html(path).
"""
from __future__ import annotations

import html
import json
from datetime import datetime
from typing import Any, Optional


def _esc(x: Any) -> str:
    return html.escape(str(x)) if x is not None else ""


def _pretty(obj: Any) -> str:
    try:
        if isinstance(obj, (dict, list)):
            return json.dumps(obj, indent=2, ensure_ascii=False)
        if isinstance(obj, str):
            s = obj.strip()
            # pretty-print JSON strings
            if s[:1] in "{[":
                return json.dumps(json.loads(s), indent=2, ensure_ascii=False)
            # pretty-print XML / XML-RPC strings (UCIP requests/responses)
            if s[:1] == "<":
                return _pretty_xml(s)
    except Exception:
        pass
    return str(obj) if obj is not None else ""


def _pretty_xml(xml_str: str) -> str:
    """Indent an XML string for readable multi-line display."""
    try:
        import xml.dom.minidom as _md
        dom = _md.parseString(xml_str.encode("utf-8"))
        pretty = dom.toprettyxml(indent="  ")
        # drop blank lines minidom inserts
        lines = [ln for ln in pretty.splitlines() if ln.strip()]
        # drop the <?xml ...?> declaration line for compactness
        if lines and lines[0].startswith("<?xml"):
            lines = lines[1:]
        return "\n".join(lines)
    except Exception:
        return xml_str


class MigrationReport:
    def __init__(self, msisdn: str):
        self.msisdn = msisdn
        self.ucip_calls: list[dict] = []       # from UcipClient.recorder
        self.bssf_calls: list[dict] = []        # from ericsson_client.api_logs
        self.plan: Optional[Any] = None
        self.result: Optional[Any] = None
        self.profile: Optional[Any] = None

    # ---- section builders ------------------------------------------------
    def _mapping_rows(self) -> str:
        if not self.plan:
            return "<p>No mapping plan.</p>"
        rows = []
        for p in self.plan.products:
            pops = (p.pop_price or {}).get("pop_external_ids", []) if p.pop_price else []
            buckets = "<br>".join(
                f"{b.bucket_spec_external_id} = {b.amount:,} ({b.reason})" for b in p.buckets)
            price = _pretty((p.pop_price or {}).get("price_entries", [])) if p.pop_price else ""
            rows.append(f"""
            <tr>
              <td>{_esc(p.product_offering_external_id)}</td>
              <td><span class="mech mech-{_esc(p.balance_mechanism)}">{_esc(p.balance_mechanism)}</span></td>
              <td>{_esc(p.pop_type)}</td>
              <td>{_esc(p.characteristics.get('Initial') or '-')}</td>
              <td>{_esc(', '.join(pops) or '-')}</td>
              <td class="code">{buckets or '-'}</td>
              <td><details><summary>price</summary><pre>{_esc(price)}</pre></details></td>
            </tr>""")
        chars = "<br>".join(f"{k} = {v}" for k, v in (self.plan.contract_characteristics or {}).items())
        return f"""
        <table>
          <tr><th>Product</th><th>balance_mechanism</th><th>pop_type</th>
              <th>Initial char</th><th>balance POPs</th><th>buckets (set)</th><th>price JSON</th></tr>
          {''.join(rows)}
        </table>
        <h3>Contract</h3>
        <table>
          <tr><th>service class (ECEV)</th><td>{_esc(getattr(self.plan,'service_class_ecev',''))}</td></tr>
          <tr><th>contract characteristics</th><td class="code">{chars or '-'}</td></tr>
          <tr><th>party / customer / contract externalId</th>
              <td class="code">{_esc(getattr(self.plan,'party_external_id',''))} /
              {_esc(getattr(self.plan,'customer_external_id',''))} /
              {_esc(getattr(self.plan,'contract_external_id',''))}</td></tr>
        </table>"""

    def _calls_section(self, calls: list[dict], kind: str) -> str:
        if not calls:
            return f"<p>No {kind} calls captured.</p>"
        blocks = []
        for i, c in enumerate(calls, 1):
            if kind == "UCIP":
                op = c.get("operation"); status = c.get("responseCode")
                req = _pretty(c.get("request")); resp = _pretty(c.get("response"))
                err = c.get("error")
                title = f"{i}. UCIP {op}  (rc={status})" + (f"  ERROR: {err}" if err else "")
            else:
                op = c.get("url", "").split("/bae/")[-1][:60] or c.get("method")
                status = c.get("status")
                req = _pretty(c.get("request_body")); resp = _pretty(c.get("response_body"))
                title = f"{i}. {c.get('method')} {op}  ({status})"
            ok = "ok" if (str(status).startswith("2") or status in (0, "0")) else "err"
            blocks.append(f"""
            <details class="call {ok}">
              <summary>{_esc(title)}</summary>
              <div class="rr">
                <div><h4>Request</h4><pre>{_esc(req)}</pre></div>
                <div><h4>Response</h4><pre>{_esc(resp)}</pre></div>
              </div>
            </details>""")
        return "".join(blocks)

    def _validation_section(self) -> str:
        rep = getattr(self.result, "verify_report", None) if self.result else None
        if not rep:
            return "<p>No validation report.</p>"
        rows = []
        for chk in rep.get("checks", []):
            if "bucket" in chk:
                ok = chk.get("passed")
                rows.append(f"""<tr class="{'ok' if ok else 'err'}">
                  <td>{_esc(chk.get('product'))}</td><td>{_esc(chk.get('bucket'))}</td>
                  <td>{int(chk.get('expected') or 0):,}</td>
                  <td>{int(chk.get('actual') or 0):,}</td>
                  <td>{'PASS' if ok else 'FAIL'}</td></tr>""")
            else:
                ok = chk.get("passed")
                rows.append(f"""<tr class="{'ok' if ok else 'err'}">
                  <td colspan=2>subordinate {_esc(chk.get('subordinate'))}</td>
                  <td colspan=2>resolves={_esc(chk.get('resolves_to_contract'))}</td>
                  <td>{'PASS' if ok else 'FAIL'}</td></tr>""")
        overall = "PASSED" if rep.get("passed") else "FAILED"
        return f"""
        <p>Overall: <span class="mech mech-{overall}">{overall}</span></p>
        <table>
          <tr><th>Product</th><th>Bucket</th><th>Expected (bytes)</th><th>Actual (bytes)</th><th>Result</th></tr>
          {''.join(rows)}
        </table>"""

    # ---- render ----------------------------------------------------------
    def render_html(self, path: str) -> str:
        state = getattr(self.result, "state", "") if self.result else ""
        ids = getattr(self.result, "ecev_ids", {}) if self.result else {}
        offers = [o.offer_id for o in self.profile.offers] if self.profile else []
        css = """
        body{font-family:-apple-system,Segoe UI,Arial,sans-serif;margin:0;background:#f4f6fb;color:#1b2733}
        header{background:#0b3d91;color:#fff;padding:18px 28px}
        header h1{margin:0;font-size:20px} header .sub{opacity:.85;font-size:13px;margin-top:4px}
        .wrap{padding:20px 28px;max-width:1200px;margin:0 auto}
        section{background:#fff;border:1px solid #dfe5ee;border-radius:8px;margin:16px 0;padding:16px 20px}
        section h2{margin:0 0 12px;font-size:16px;color:#0b3d91;border-bottom:2px solid #eef2f8;padding-bottom:8px}
        table{border-collapse:collapse;width:100%;font-size:13px}
        th,td{border:1px solid #e3e8f0;padding:6px 9px;text-align:left;vertical-align:top}
        th{background:#f0f4fa}
        .code{font-family:Consolas,monospace;font-size:12px;color:#334}
        pre{background:#0f1b2d;color:#d6e2f0;padding:10px;border-radius:6px;overflow:auto;max-height:360px;font-size:12px}
        details.call{border:1px solid #e3e8f0;border-radius:6px;margin:6px 0}
        details.call>summary{padding:8px 10px;cursor:pointer;font-size:13px;font-weight:600}
        details.call.ok>summary{background:#edf9f0;color:#1a7f37}
        details.call.err>summary{background:#fdecec;color:#b42318}
        .rr{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px}
        .rr h4{margin:0 0 4px;font-size:12px;color:#667}
        .mech{display:inline-block;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:600;background:#e7eefc;color:#0b3d91}
        .mech-InitialChar{background:#fff3d6;color:#8a5a00}
        .mech-PASSED{background:#d7f5df;color:#1a7f37}.mech-FAILED{background:#fde0df;color:#b42318}
        tr.ok td:last-child{color:#1a7f37;font-weight:600}tr.err td:last-child{color:#b42318;font-weight:600}
        """
        doc = f"""<!doctype html><html><head><meta charset="utf-8">
        <title>Migration Report {_esc(self.msisdn)}</title><style>{css}</style></head>
        <body>
        <header>
          <h1>EC &rarr; CBEV Migration Report</h1>
          <div class="sub">MSISDN {_esc(self.msisdn)} &nbsp;|&nbsp; state: {_esc(state)}
          &nbsp;|&nbsp; SDP offers: {_esc(', '.join(offers))}
          &nbsp;|&nbsp; generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</div>
        </header>
        <div class="wrap">
          <section><h2>1. SDP Fetch &mdash; UCIP requests / responses</h2>{self._calls_section(self.ucip_calls,'UCIP')}</section>
          <section><h2>2. Mapping &mdash; derived plan</h2>{self._mapping_rows()}</section>
          <section><h2>3. CBEV Provision &mdash; BSSF requests / responses</h2>{self._calls_section(self.bssf_calls,'BSSF')}</section>
          <section><h2>4. Final Validation &mdash; reconciliation</h2>{self._validation_section()}</section>
          <section><h2>CBEV ids</h2><pre>{_esc(_pretty(ids))}</pre></section>
        </div></body></html>"""
        with open(path, "w", encoding="utf-8") as f:
            f.write(doc)
        return path
