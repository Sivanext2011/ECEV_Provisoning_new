#!/usr/bin/env python
"""Generate the complete FamilyBucketSpecs rows from the CHT PPP PO catalog.

Rule set (from the catalog the customer provided):
- bill_cycle_aligned = Yes for ALL offers EXCEPT One-Time (155xxx) and
  Fixed-Expiry (156xxx) promos. Post-quota/bundle (255xxx, 281008/281108) have
  no POP but ARE bill-cycle-aligned -> Yes.
- Bucket spec naming: account = 6<offerId>, counter = 6<offerId>_CTR.
  Post-quota (bundle) offers use <base>_POSTACC / <base>_POST_CTR.
  Add-on families carry a carryover account + flag where the catalog defines one.
- pop_type: Regular (base/recurring/tethering/ToD-limited/speed), Initial
  (add-ons with carryover), Consumption (one-time/fixed-expiry/bundle/unlimited).
Each entry: [offer_id, family, po_external_id, pop_type, bill_cycle_aligned,
             account_bucket_spec, counter_bucket_spec,
             carryover_account_bucket_spec, carryover_flag_bucket_spec,
             flat_rate_default]
"""

rows = []

def add(oid, family, pop, bca, acc, ctr, co_acc="", co_flag="", flat=""):
    rows.append([oid, family, oid, pop, "Yes" if bca else "No", acc, ctr, co_acc, co_flag, flat])

def seq(base_list, family, pop, bca, acc_fmt, ctr_fmt, co_acc_fmt=None, co_flag_fmt=None, flat=""):
    for oid in base_list:
        acc = acc_fmt.format(o=oid) if acc_fmt else ""
        ctr = ctr_fmt.format(o=oid) if ctr_fmt else ""
        co_acc = co_acc_fmt.format(o=oid) if co_acc_fmt else ""
        co_flag = co_flag_fmt.format(o=oid) if co_flag_fmt else ""
        add(oid, family, pop, bca, acc, ctr, co_acc, co_flag, flat)

# ---- Basic (Regular, bill-cycle, FlatRate personalizable) ----
# Both Basic_1/Basic_2 share the basic bucket 6145000 (NOT 6+offerId).
add("145001", "Basic", "Regular", True, "6145000", "6145000_CTR")
add("145002", "Basic", "Regular", True, "6145000", "6145000_CTR")

# ---- Bundle / post-quota (Consumption, bill-cycle, LowBandwidth) ----
# share the basic post-quota buckets
for oid in ["255001", "255002"]:
    add(oid, "Bundle (post-quota)", "Consumption", True, "6145000_POSTACC", "6145000_POST_CTR")

# ---- Tethering base (Regular, bill-cycle) ----
add("281007", "Tethering", "Regular", True, "6281007", "6281007_CTR")
# Tethering policy / post-quota (Consumption, bill-cycle, LowBandwidth)
add("281008", "Tethering (post-quota)", "Consumption", True, "6281008_POSTACC", "6281008_POST_CTR")

# ---- Data Add-ons (Initial, bill-cycle, with carryover) ----
seq(["160006", "160106", "160206"], "Data Add-on", "Initial", True, "6{o}", "6{o}_CTR",
    "6169006", "6{o}_carryover")  # carryover companion family 6169006
add("160906", "VIP Add-on", "Initial", True, "6160906", "6160906_CTR", "", "6160906_carryover")

# ---- 21M Add-ons (Initial, bill-cycle, carryover; allocation N/A -> Initial) ----
seq(["162006", "162106", "162206", "162906"], "21M Add-on", "Initial", True, "6{o}", "6{o}_CTR",
    "", "6{o}_carryover")

# ---- Recurring (Regular, bill-cycle) ----
seq(["150006", "150106", "150206", "150306", "150406", "150506", "150606", "150706", "150806", "150906"],
    "Recurring", "Regular", True, "6{o}", "6{o}_CTR")

# ---- One-Time (Consumption, NOT bill-cycle) ----
seq(["155006", "155106", "155206", "155306", "155406"],
    "One-Time", "Consumption", False, "6{o}", "6{o}_CTR")

# ---- Fixed-Expiry (Consumption, NOT bill-cycle) ----
seq(["156006", "156106", "156206", "156306", "156406", "156506", "156606", "156706", "156806", "156906"],
    "Fixed-Expiry", "Consumption", False, "6{o}", "6{o}_CTR")

# ---- ToD Limited (Regular, bill-cycle) ----
seq(["157006", "157106", "157206", "157306", "157406", "157506", "157606", "157706", "157806", "157906"],
    "ToD Limited", "Regular", True, "6{o}", "6{o}_CTR")

# ---- ToD Unlimited (Consumption, bill-cycle) ----
seq(["159006", "159106", "159206", "159306", "159406"],
    "ToD Unlimited", "Consumption", True, "6{o}", "6{o}_CTR")

# ---- Speed add-ons (no bucket / policy override; bill-cycle) ----
add("281005", "MultiTier Speed", "Regular", True, "6281005", "6281005_CTR")
add("281006", "Unlimited Speed", "Consumption", True, "", "6281006_CTR")
add("281014", "Unlimited Teth Speed", "Consumption", True, "", "6281014_CTR")

# ---- Tethering Add-ons (14xxx bucket family, Initial, bill-cycle, carryover) ----
seq(["160014", "160114", "160214"], "Teth Add-on", "Initial", True, "14{o}", "14{o}_CTR",
    "14161014", "14{o}_carryover")

# ---- Tethering One-Time (NOT bill-cycle) ----
seq(["155014", "155114", "155214", "155314", "155414"],
    "Teth One-Time", "Consumption", False, "6{o}", "6{o}_CTR")

# ---- Tethering Fixed-Expiry (NOT bill-cycle) ----
seq(["156014", "156114", "156214", "156314", "156414"],
    "Teth Fixed-Expiry", "Consumption", False, "6{o}", "6{o}_CTR")

# ---- Tethering Recurring (Regular, bill-cycle) ----
seq(["150014", "150114", "150214", "150314", "150414", "150514", "150614", "150714", "150814", "150914"],
    "Teth Recurring", "Regular", True, "6{o}", "6{o}_CTR")

# ---- Carryover offers (Initial, bill-cycle, OCSG/PAM) ----
seq(["161006", "161106", "161206"], "Carryover", "Initial", True, "6{o}", "6{o}_CTR")
seq(["161014", "161114", "161214"], "Teth Carryover", "Initial", True, "14{o}", "14{o}_CTR")
seq(["163006", "163106", "163206"], "21M Carryover", "Initial", True, "6{o}", "6{o}_CTR")

# ---- MDVPN ----
add("20001", "MDVPN Basic", "Regular", True, "620001", "620001_CTR")
add("25001", "MDVPN Bundle (post-quota)", "Consumption", True, "620001_POSTACC", "620001_POST_CTR")
add("281107", "MDVPN Tethering", "Regular", True, "6281107", "6281107_CTR")
add("281108", "MDVPN Tethering (post-quota)", "Consumption", True, "6281108_POSTACC", "6281108_POST_CTR")

# emit as python literal rows for pasting into excel_template.py
def build_rows():
    return list(rows)


if __name__ == "__main__":
    for r in rows:
        print("            " + repr(r) + ",")
    print(f"# total rows: {len(rows)}")
