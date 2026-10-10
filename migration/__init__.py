"""Classic EC (SDP) -> CBEV (ECEV) subscriber migration tool.

New version of the ECEV provisioning tool that:
  1. Fetches a subscriber profile from Classic EC via UCIP/ACIP (SOAP/XML AIR).
  2. Applies user-supplied Excel-driven mapping + value-derivation rules.
  3. Provisions the subscriber on ECEV via BSSF REST (reusing the existing client).
  4. Verifies via Balance Enquiry and reconciles against the EC-derived values.
  5. Deletes the subscriber from Classic EC only after ECEV is VERIFIED.

See migration/README is covered by the top-level MIGRATION_README.md.
"""

__version__ = "1.0.0"
