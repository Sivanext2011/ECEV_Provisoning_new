"""Integration test: orchestrator dry-run (fetch+map only, no live BSSF).

Uses a mocked UcipClient that returns the sample profile, so we exercise the
state store, mapping engine, and dry-run path without any network access.
"""

from xml.etree import ElementTree as ET

import pytest

from migration import excel_template
from migration.bssf_migrator import BssfMigrator
from migration.mapping_engine import load_engine
from migration.models import MigrationState, SubscriberProfile
from migration.orchestrator import Orchestrator
from migration.state_store import StateStore
from migration.ucip_client import UcipClient, _normalise_xmlrpc_response
from migration.verifier import Verifier
from migration.tests import sample_ucip_responses as fx

MASTER = "886912345678"
GB = 1073741824


def _norm(xml_rpc_text):
    return _normalise_xmlrpc_response(ET.fromstring(xml_rpc_text))


class FakeUcip(UcipClient):
    def __init__(self):
        super().__init__({"ucip": {"endpoint": "http://fake"}})
        self.deleted = []

    def fetch_profile(self, msisdn):
        prof = SubscriberProfile(master_msisdn=msisdn)
        acct = _norm(fx.GET_ACCOUNT_DETAILS)
        prof.service_class = acct.find("serviceClassCurrent").text
        prof.imsi = acct.find("imsi").text
        prof.offers = self._parse_offers(_norm(fx.GET_OFFERS))
        prof.dedicated_accounts = self._parse_dedicated_accounts(_norm(fx.GET_BALANCE_AND_DATE))
        prof.accumulators = self._parse_accumulators(_norm(fx.GET_ACCUMULATORS))
        prof.subordinates = self._parse_subordinates(_norm(fx.GET_MULTI), msisdn)
        return prof

    def delete_offer(self, msisdn, offer_id):
        self.deleted.append(offer_id)
        return ET.fromstring("<response><responseCode>0</responseCode></response>")


@pytest.fixture(scope="module")
def workbook(tmp_path_factory):
    path = tmp_path_factory.mktemp("wb") / "mapping.xlsx"
    excel_template.generate(path)
    return path


def test_orchestrator_dry_run(workbook, tmp_path):
    import asyncio

    async def _run():
        engine = load_engine(workbook)
        migrator = BssfMigrator(defaults={})
        store = StateStore(db_path=tmp_path / "state.db")
        await store.init()
        orch = Orchestrator(FakeUcip(), engine, migrator, Verifier(migrator),
                            store, do_ec_delete=False, dry_run=True)

        result = await orch.migrate(MASTER)
        assert result.state == MigrationState.FETCHED
        ids = result.ecev_ids
        assert ids["party"].startswith("party-") and MASTER not in ids["party"]
        assert ids["contract"].startswith("contract-") and MASTER not in ids["contract"]
        assert len(ids["bucket_adjustments"]) == 6
        # persisted
        assert await store.get_state(MASTER) == MigrationState.FETCHED
        rep = await store.report()
        assert rep["counts"].get("FETCHED") == 1

    asyncio.run(_run())
