from pydantic import BaseModel


class TaxaCandidate(BaseModel):
    """A species name candidate returned by the WRMD taxa search."""

    value: int
    label: str


class IntakeRecord(BaseModel):
    """
    Fields extracted from a SERC paper intake form.
    Maps to the WRMD export column schema (cols 2–38 of the Google Sheet).
    All optional except common_name and admitted_at.
    """

    common_name: str                    # REQUIRED — e.g. "Eastern Box Turtle"
    admitted_at: str                    # REQUIRED — YYYY-MM-DD
    name: str | None = None             # optional patient name / identifier
    reference_number: str | None = None # optional internal reference number
    rescuer_first_name: str | None = None
    rescuer_last_name: str | None = None
    rescuer_phone: str | None = None
    rescuer_address: str | None = None
    rescuer_city: str | None = None
    rescuer_postal_code: str | None = None
    found_at: str | None = None         # YYYY-MM-DD, only if different from admitted_at
    address_found: str | None = None
    city_found: str | None = None
    reasons_for_admission: str | None = None   # Injured | Orphaned | Displaced | Sick | Other
    notes_about_rescue: str | None = None
    care_by_rescuer: str | None = None
    disposition: str = "Pending"               # Pending | Released | Transferred | Euthanized | Died in Care | DOA


class IntakeResponse(BaseModel):
    """Response returned to the front-end after extraction."""

    extracted: IntakeRecord
    warnings: list[str] = []
    taxa_candidates: list[TaxaCandidate] = []
