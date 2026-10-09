"""
`ecev provision` — provision a single subscriber (Party -> Customer -> Contract+Product).

Reuses the SAME payload builder as the batch flow (batch_mod.build_batch_file +
_enrich_mandatory_chars) to guarantee identical behaviour, then submits the three
entity bodies via prov_svc.provision_raw (the same path the web wizard uses).
"""
import json
import click

from _common import (
    catalog_svc, prov_svc, batch_mod, run, emit, err, load_json_file,
)


def _specs():
    return catalog_svc.get_catalog()


def _find(group_key, ext):
    for s in (_specs().get(group_key) or []):
        if s.get("externalId") == ext:
            return s
    return {}


def _personalizable(chars):
    out = []
    for c in (chars or []):
        ext = (c.get("externalId") or "").strip()
        if not ext or " " in ext:
            continue
        if c.get("valueRegulator") not in ("canBePersonalized", "mustBePersonalized", "selection"):
            continue
        out.append(c)
    return out


def _bodies_from_batchfile(bf):
    """Extract party/customer/contract payloads from a single-record batch file."""
    rec = (bf.get("records") or [{}])[0]
    ents = {e.get("entity"): e.get("payload") for e in rec.get("entities", [])}
    return ents.get("party"), ents.get("customer"), ents.get("contract")


def _resolve_cross_refs(party, customer, contract):
    """The batch file uses bodyReplacers/uriReplacers (@PARTYEXTID@, {customerExternalId})
    for the batch engine. For direct REST submission we must substitute real externalIds."""
    pext = party.get("externalId")
    cext = customer.get("externalId")
    # customer.engagedParty references @PARTYEXTID@
    ep = customer.get("engagedParty")
    if isinstance(ep, dict) and ep.get("externalId") == "@PARTYEXTID@":
        ep["externalId"] = pext
    return pext, cext


def _build_body(opts):
    """Assemble a build_batch_file body dict from CLI options/dict."""
    return {
        "count": 1,
        "adjustment": False,
        "givenName": opts.get("givenName") or "CLI",
        "familyName": opts.get("familyName") or "User",
        "partySpecExternalId": opts.get("partySpec"),
        "customerSpecExternalId": opts.get("customerSpec"),
        "billingAccountSpecExternalId": opts.get("baSpec"),
        "billCycleSpecExternalId": opts.get("billCycleSpec"),
        "contractSpecExternalId": opts.get("contractSpec"),
        "productOfferingExternalId": opts.get("po"),
        "contractStatus": opts.get("contractStatus") or "Created",
        "productStatus": opts.get("productStatus") or "ProductCreated",
        "includeBaRef": opts.get("includeBaRef", True),
        "includeBaRefRecurrence": opts.get("includeBaRefRecurrence", True),
        "resources": opts.get("resources") or [],
        "partyCharacteristics": opts.get("partyCharacteristics") or [],
        "customerCharacteristics": opts.get("customerCharacteristics") or [],
        "contractCharacteristics": opts.get("contractCharacteristics") or [],
        "productCharacteristics": opts.get("productCharacteristics") or [],
        "productPrice": opts.get("productPrice") or [],
        "contactMedia": opts.get("contactMedia") or [],
        "includeContactMediumAssociation": opts.get("cma", False),
        "homeTimeZone": opts.get("homeTimeZone") or "",
    }


async def _do_provision(opts, dry_run):
    bf = batch_mod.build_batch_file(_build_body(opts))
    bf = await batch_mod._enrich_mandatory_chars(bf)
    party, customer, contract = _bodies_from_batchfile(bf)
    _resolve_cross_refs(party, customer, contract)
    if dry_run:
        return {"dryRun": True, "party": party, "customer": customer, "contract": contract}
    result = await prov_svc.provision_raw(party, customer, contract)
    return result


def _interactive_opts():
    """Spec-driven interactive prompt: pick specs, PO, resources, characteristics."""
    cat = _specs()

    def pick(group_key, label, default_ext=None):
        items = cat.get(group_key) or []
        if not items:
            return None
        click.echo(f"\n{label}:")
        for idx, s in enumerate(items, 1):
            mark = " (default)" if s.get("externalId") == default_ext else ""
            click.echo(f"  {idx}. {s.get('externalId')}  [{s.get('name','')}]{mark}")
        raw = click.prompt(f"  select 1-{len(items)} (enter=skip)", default="", show_default=False)
        if not raw.strip():
            return None
        try:
            return items[int(raw) - 1].get("externalId")
        except Exception:
            return raw.strip()

    def fill_chars(group_key, ext, prefix_label):
        spec = _find(group_key, ext) if ext else {}
        chars = _personalizable(spec.get("characteristics", []))
        out = []
        for c in chars:
            key = c["externalId"]
            must = c.get("valueRegulator") == "mustBePersonalized"
            unit = ""
            for pv in (c.get("possibleValues") or c.get("specCharacteristicValue") or []):
                if pv.get("unitOfMeasure"):
                    unit = pv["unitOfMeasure"]; break
            unit = unit or c.get("unitOfMeasure") or ""
            label = f"  {prefix_label} char '{c.get('name') or key}'{' *REQUIRED' if must else ''}" + (f" [{unit}]" if unit else "")
            val = click.prompt(label + " (enter=skip)", default="", show_default=False)
            if val.strip():
                v = {"value": val.strip()}
                if unit:
                    v["unitOfMeasure"] = unit
                out.append({"charSpecExternalId": key, "value": [v]})
        return out

    opts = {}
    opts["givenName"] = click.prompt("Given name", default="CLI")
    opts["familyName"] = click.prompt("Family name", default="User")
    d = load_config_defaults()
    opts["partySpec"] = pick("individualPartySpecifications", "Party spec", d.get("partySpecExternalId"))
    opts["customerSpec"] = pick("customerSpecifications", "Customer spec", d.get("customerSpecExternalId"))
    opts["baSpec"] = pick("billingAccountSpecifications", "Billing account spec", d.get("billingAccountSpecExternalId"))
    opts["billCycleSpec"] = pick("billingCycleSpecifications", "Bill cycle spec", d.get("billCycleSpecExternalId"))
    opts["contractSpec"] = pick("contractSpecifications", "Contract spec", d.get("contractSpecExternalId"))
    opts["po"] = pick("productOfferings", "Product offering", d.get("basePlanProductOfferingExternalId"))

    # resources from PO or manual
    resources = []
    po_spec = _find("productOfferings", opts["po"]) if opts["po"] else {}
    po_rs = po_spec.get("resourceSpecifications") or []
    if po_rs:
        for rs in po_rs:
            num = click.prompt(f"  resource {rs.get('externalId')} number (enter=skip)", default="", show_default=False)
            if num.strip():
                resources.append({"resourceSpecificationExternalId": rs.get("externalId"),
                                  "resourceNumber": num.strip(),
                                  "resourceSpecificationId": rs.get("id") or ""})
    else:
        while click.confirm("  Add an identification resource (MSISDN/IMSI)?", default=False):
            rext = pick("communicationIdentifierSpecifications", "  resource/CommID spec")
            num = click.prompt("  resource number", default="")
            if rext and num.strip():
                rs = _find("communicationIdentifierSpecifications", rext)
                resources.append({"resourceSpecificationExternalId": rext, "resourceNumber": num.strip(),
                                  "resourceSpecificationId": rs.get("id") or ""})
    opts["resources"] = resources

    opts["partyCharacteristics"] = fill_chars("individualPartySpecifications", opts["partySpec"], "party")
    opts["customerCharacteristics"] = fill_chars("customerSpecifications", opts["customerSpec"], "customer")
    opts["contractCharacteristics"] = fill_chars("contractSpecifications", opts["contractSpec"], "contract")
    opts["productCharacteristics"] = fill_chars("productOfferings", opts["po"], "product")

    opts["includeBaRef"] = click.confirm("Include product billingAccountReference?", default=True)
    opts["includeBaRefRecurrence"] = click.confirm("Include baRefForBillCycleAlignedRecurrence?", default=True)
    opts["contractStatus"] = click.prompt("Contract initial status", default="Created")
    opts["productStatus"] = click.prompt("Product initial status", default="ProductCreated")
    return opts


def load_config_defaults():
    from _common import load_config
    return load_config().get("defaults", {})


@click.command("provision")
@click.option("--input", "input_file", type=click.Path(exists=True), help="JSON file: either {partyBody,customerBody,contractBody} or build options.")
@click.option("--interactive", is_flag=True, help="Interactive spec-driven prompts.")
@click.option("--given-name", help="Party given name.")
@click.option("--family-name", help="Party family name.")
@click.option("--party-spec", help="Party spec externalId.")
@click.option("--customer-spec", help="Customer spec externalId.")
@click.option("--ba-spec", help="Billing account spec externalId.")
@click.option("--bill-cycle-spec", help="Bill cycle spec externalId.")
@click.option("--contract-spec", help="Contract spec externalId.")
@click.option("--po", help="Product offering externalId.")
@click.option("--msisdn", help="MSISDN (uses RS_MSISDN resource spec).")
@click.option("--imsi", help="IMSI 15 digits (uses RS_IMSI resource spec).")
@click.option("--resource", "resource_pairs", multiple=True, help="Resource as SPEC:NUMBER[:specId] (repeatable).")
@click.option("--contract-status", default="Created", show_default=True)
@click.option("--product-status", default="ProductCreated", show_default=True)
@click.option("--no-ba-ref", is_flag=True, help="Omit product billingAccountReference.")
@click.option("--no-ba-ref-recurrence", is_flag=True, help="Omit baRefForBillCycleAlignedRecurrence.")
@click.option("--dry-run", is_flag=True, help="Build & show the 3 bodies, do not submit.")
@click.pass_context
def provision(ctx, input_file, interactive, given_name, family_name, party_spec, customer_spec,
              ba_spec, bill_cycle_spec, contract_spec, po, msisdn, imsi, resource_pairs,
              contract_status, product_status, no_ba_ref, no_ba_ref_recurrence, dry_run):
    """Provision a single subscriber (party -> customer -> contract + product)."""
    as_json = ctx.obj["json"]

    # Path A: raw bodies supplied directly
    if input_file:
        data = load_json_file(input_file)
        if all(k in data for k in ("partyBody", "customerBody", "contractBody")):
            if dry_run:
                emit({"dryRun": True, **data}, as_json)
                return
            res = run(prov_svc.provision_raw(data["partyBody"], data["customerBody"], data["contractBody"]))
            emit(res, as_json, lambda d: _print_result(d))
            return
        opts = data  # treat as build options
    elif interactive:
        opts = _interactive_opts()
    else:
        opts = {
            "givenName": given_name, "familyName": family_name,
            "partySpec": party_spec, "customerSpec": customer_spec, "baSpec": ba_spec,
            "billCycleSpec": bill_cycle_spec, "contractSpec": contract_spec, "po": po,
            "contractStatus": contract_status, "productStatus": product_status,
            "includeBaRef": not no_ba_ref, "includeBaRefRecurrence": not no_ba_ref_recurrence,
            "resources": [],
        }
        # resources from --msisdn/--imsi and --resource
        if msisdn:
            rs = _find("communicationIdentifierSpecifications", "RS_MSISDN")
            opts["resources"].append({"resourceSpecificationExternalId": "RS_MSISDN", "resourceNumber": msisdn,
                                      "resourceSpecificationId": rs.get("id") or ""})
        if imsi:
            rs = _find("communicationIdentifierSpecifications", "RS_IMSI")
            opts["resources"].append({"resourceSpecificationExternalId": "RS_IMSI", "resourceNumber": imsi,
                                      "resourceSpecificationId": rs.get("id") or ""})
        for pair in resource_pairs:
            parts = pair.split(":")
            if len(parts) >= 2:
                opts["resources"].append({"resourceSpecificationExternalId": parts[0], "resourceNumber": parts[1],
                                          "resourceSpecificationId": parts[2] if len(parts) > 2 else ""})

    res = run(_do_provision(opts, dry_run))
    emit(res, as_json, lambda d: _print_result(d))


def _print_result(d):
    if d.get("dryRun"):
        print("DRY RUN — bodies that would be submitted:\n")
        for k in ("party", "customer", "contract"):
            print(f"--- {k} ---")
            print(json.dumps(d.get(k), indent=2))
        return
    for ent in ("party", "customer", "contract"):
        r = d.get(ent)
        if isinstance(r, dict):
            print(f"{ent}: id={r.get('id','?')} externalId={r.get('externalId','?')}")
        else:
            print(f"{ent}: {r}")
