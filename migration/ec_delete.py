"""Delete the subscriber from Classic EC after ECEV verification succeeds.

Per LLD: EC delete is the final step and runs ONLY after ECEV is VERIFIED, so
Classic EC remains the source of truth until then. If the delete fails, ECEV is
kept and the subscriber is flagged for manual EC cleanup (we do NOT roll back
the verified ECEV side).
"""

from __future__ import annotations

import logging

from .models import SubscriberProfile
from .ucip_client import UcipClient, UcipError

logger = logging.getLogger(__name__)


def delete_from_ec(ucip: UcipClient, profile: SubscriberProfile) -> dict:
    """Delete each offer from EC via UCIP DeleteOffer. Returns a per-offer result."""
    results: dict[str, str] = {}
    all_ok = True
    for offer in profile.offers:
        try:
            ucip.delete_offer(profile.master_msisdn, offer.offer_id)
            results[offer.offer_id] = "deleted"
        except (UcipError, Exception) as e:  # noqa: BLE001
            results[offer.offer_id] = f"error: {e}"
            all_ok = False
            logger.warning(f"EC DeleteOffer {offer.offer_id} failed for "
                           f"{profile.master_msisdn}: {e}")
    return {"all_deleted": all_ok, "offers": results}
