#!/usr/bin/env python3
"""
ECEV Provisioning CLI (lite) — a command-line front-end that REUSES the
existing backend logic (app.services / app.routers.batch). No web server.

Usage:
    python -m cli.ecev --help
    python cli/ecev.py <group> <command> [options]

Groups:
    config     view / edit configuration (environment, auth, tls, batch_tls, network)
    catalog    load a BusinessConfig zip; list specs & characteristics
    provision  provision a single subscriber (flags, --input, or --interactive)
    batch      build / excel / submit / lifecycle for CPM Batch
    logs       show captured API request/response logs
"""
import json
import click

from _common import (
    ericsson_client, load_config, api_logs, CONFIG_PATH, LOG_FILE,
    catalog_svc, prov_svc, batch_mod, run, emit, table, err,
    load_json_file, reinit_client,
)
from _provision import provision as provision_cmd
from _batch import batch as batch_group


@click.group(context_settings={"help_option_names": ["-h", "--help"]})
@click.option("--json", "as_json", is_flag=True, help="Output machine-readable JSON.")
@click.pass_context
def cli(ctx, as_json):
    """ECEV Provisioning CLI — reuses the web tool's backend logic."""
    ctx.ensure_object(dict)
    ctx.obj["json"] = as_json


cli.add_command(provision_cmd)
cli.add_command(batch_group)


# ============================================================ config
@cli.group()
def config():
    """View / edit configuration."""


@config.command("show")
@click.option("--section", help="Only show one section (environment|auth|tls|batch_tls|network|defaults|apis).")
@click.pass_context
def config_show(ctx, section):
    """Show the current config (auth password masked)."""
    cfg = load_config()
    view = dict(cfg)
    # mask secrets
    if "auth" in view and isinstance(view["auth"], dict):
        view["auth"] = {**view["auth"], "password": "***" if view["auth"].get("password") else ""}
    if section:
        view = view.get(section, {})
    emit(view, ctx.obj["json"])


@config.command("get")
@click.argument("dotted_key")
@click.pass_context
def config_get(ctx, dotted_key):
    """Get a single value by dotted key, e.g. environment.ROOT_CPM_BATCH."""
    cfg = load_config()
    cur = cfg
    for part in dotted_key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            err(f"key not found: {dotted_key}")
            raise SystemExit(1)
        cur = cur[part]
    emit({dotted_key: cur}, ctx.obj["json"], lambda d: print(cur))


@config.command("set")
@click.argument("dotted_key")
@click.argument("value")
@click.option("--json-value", is_flag=True, help="Parse VALUE as JSON (for bools/numbers/objects).")
@click.pass_context
def config_set(ctx, dotted_key, value, json_value):
    """Set a config value by dotted key, e.g. network.socks5_enabled true --json-value."""
    cfg = load_config()
    val = json.loads(value) if json_value else value
    cur = cfg
    parts = dotted_key.split(".")
    for part in parts[:-1]:
        cur = cur.setdefault(part, {})
    cur[parts[-1]] = val
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    reinit_client()
    emit({"updated": dotted_key, "value": val, "configPath": str(CONFIG_PATH)}, ctx.obj["json"],
         lambda d: print(f"Set {dotted_key} = {val}  ({CONFIG_PATH})"))


# ============================================================ catalog
@cli.group()
def catalog():
    """Load / inspect the specification catalog."""


# raw catalog key -> friendly name used in CLI
_SPEC_GROUPS = {
    "party": "individualPartySpecifications",
    "customer": "customerSpecifications",
    "contract": "contractSpecifications",
    "billingaccount": "billingAccountSpecifications",
    "billcycle": "billingCycleSpecifications",
    "po": "productOfferings",
    "product": "productSpecifications",
    "resource": "resourceSpecifications",
    "commid": "communicationIdentifierSpecifications",
    "contactmedium": "contactMediumSpecifications",
    "organization": "organizationSpecifications",
}


@catalog.command("load")
@click.argument("zip_path", type=click.Path(exists=True))
@click.pass_context
def catalog_load(ctx, zip_path):
    """Parse a BusinessConfig .zip and store it as the active catalog."""
    with open(zip_path, "rb") as f:
        data = f.read()
    result = catalog_svc.parse_business_config(data)
    counts = {k: len(v) for k, v in result.items() if isinstance(v, list)}
    emit({"loaded": zip_path, "counts": counts}, ctx.obj["json"],
         lambda d: (print(f"Loaded {zip_path}"),
                    table([[k, c] for k, c in counts.items() if c], ["spec group", "count"])))


@catalog.command("reload")
@click.pass_context
def catalog_reload(ctx):
    """Reload the catalog from disk."""
    cat = catalog_svc.reload_catalog()
    counts = {k: len(v) for k, v in cat.items() if isinstance(v, list)}
    emit({"counts": counts}, ctx.obj["json"],
         lambda d: table([[k, c] for k, c in counts.items() if c], ["spec group", "count"]))


@catalog.command("list")
@click.argument("group", type=click.Choice(sorted(_SPEC_GROUPS.keys())))
@click.pass_context
def catalog_list(ctx, group):
    """List specs in a group: party|customer|contract|billingaccount|billcycle|po|product|resource|commid|contactmedium|organization."""
    cat = catalog_svc.get_catalog()
    items = cat.get(_SPEC_GROUPS[group], []) or []
    rows = [[s.get("externalId", ""), s.get("name", "")] for s in items]
    emit([{"externalId": s.get("externalId"), "name": s.get("name")} for s in items],
         ctx.obj["json"], lambda d: table(rows, ["externalId", "name"]) if rows else print("(none)"))


@catalog.command("show")
@click.argument("group", type=click.Choice(sorted(_SPEC_GROUPS.keys())))
@click.argument("external_id")
@click.option("--chars", is_flag=True, help="Only list characteristics.")
@click.pass_context
def catalog_show(ctx, group, external_id, chars):
    """Show one spec and its characteristics."""
    cat = catalog_svc.get_catalog()
    items = cat.get(_SPEC_GROUPS[group], []) or []
    spec = next((s for s in items if s.get("externalId") == external_id), None)
    if not spec:
        err(f"{group} spec not found: {external_id}")
        raise SystemExit(1)
    if chars:
        clist = spec.get("characteristics", []) or []
        rows = [[c.get("externalId") or c.get("name"), c.get("valueRegulator"),
                 c.get("minCardinality"), c.get("maxCardinality"), c.get("unitOfMeasure") or ""]
                for c in clist]
        emit(clist, ctx.obj["json"],
             lambda d: table(rows, ["externalId", "regulator", "min", "max", "unit"]) if rows else print("(no chars)"))
    else:
        emit(spec, ctx.obj["json"])


# ============================================================ logs
@cli.group()
def logs():
    """Show / manage captured API request-response logs."""


@logs.command("show")
@click.option("--limit", type=int, default=20, show_default=True)
@click.option("--grep", help="Only show entries whose URL contains this substring.")
@click.pass_context
def logs_show(ctx, limit, grep):
    """Show recent API call logs (from the in-memory + persisted store)."""
    entries = list(api_logs)
    # also read persisted file tail if memory is empty
    if not entries and LOG_FILE.exists():
        try:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entries.append(json.loads(line))
                        except Exception:
                            pass
        except Exception:
            pass
    if grep:
        entries = [e for e in entries if grep in (e.get("url") or "")]
    entries = entries[-limit:]
    emit(entries, ctx.obj["json"],
         lambda d: table([[e.get("timestamp", "")[11:19], e.get("method"), e.get("status"),
                           (e.get("url") or "")[-60:]] for e in entries],
                         ["time", "method", "status", "url"]))


@logs.command("clear")
@click.pass_context
def logs_clear(ctx):
    """Clear the in-memory log buffer."""
    api_logs.clear()
    emit({"cleared": True}, ctx.obj["json"], lambda d: print("cleared in-memory logs"))


if __name__ == "__main__":
    cli(obj={})