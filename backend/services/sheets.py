"""
Google Sheets service — appends intake records to the WRMD export sheet.

Sheet structure:
  - 74 columns total: 1 empty index + 73 WRMD columns + 1 custom wrmd_processed column
  - Only intake-relevant columns are populated; the rest are left as empty strings
  - wrmd_processed (col 74) is always set to "0" on new intake append
  - Existing rows are never overwritten

Column index → IntakeRecord field mapping (0-based index, 1-based col number):
  index 1  (col 2)  common_name
  index 2  (col 3)  admitted_at
  index 5  (col 6)  found_at
  index 6  (col 7)  address_found
  index 7  (col 8)  city_found
  index 9  (col 10) reasons_for_admission
  index 10 (col 11) care_by_rescuer
  index 11 (col 12) notes_about_rescue
  index 15 (col 16) reference_number
  index 16 (col 17) name
  index 18 (col 19) disposition
  index 29 (col 30) rescuer_first_name
  index 30 (col 31) rescuer_last_name
  index 31 (col 32) rescuer_phone
  index 35 (col 36) rescuer_city
  index 36 (col 37) rescuer_address
  index 37 (col 38) rescuer_postal_code
  index 73 (col 74) wrmd_processed
"""

import json
import os
import logging

import gspread
from google.oauth2 import service_account

from models.intake import IntakeRecord

logger = logging.getLogger(__name__)

_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.readonly",
]


def _get_worksheet() -> gspread.Worksheet:
    """
    Authenticate and return the target worksheet.

    Credential resolution order:
      1. GOOGLE_SERVICE_ACCOUNT_JSON contains raw JSON (Cloud Run secret-as-env)
      2. GOOGLE_SERVICE_ACCOUNT_JSON is a file path (local dev)
    """
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    tab_name = os.environ.get("GOOGLE_SHEET_TAB", "daily-exams.csv")

    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON is not set.")
    if not sheet_id:
        raise RuntimeError("GOOGLE_SHEET_ID is not set.")

    if raw.startswith("{"):
        info = json.loads(raw)
        credentials = service_account.Credentials.from_service_account_info(info, scopes=_SCOPES)
    else:
        credentials = service_account.Credentials.from_service_account_file(raw, scopes=_SCOPES)

    client = gspread.authorize(credentials)
    spreadsheet = client.open_by_key(sheet_id)
    return spreadsheet.worksheet(tab_name)


def _build_row(record: IntakeRecord) -> list[str]:
    """
    Build a 74-element list matching the sheet's column order.

    Col 1:  empty index
    Col 2:  common_name           ✅ REQUIRED
    Col 3:  admitted_at           ✅ REQUIRED
    Col 4:  admitted_by           ✅ always "Linda Nichols"
    Col 5:  transported_by        (blank)
    Col 6:  found_at              ✅
    Col 7:  address_found         ✅ falls back to rescuer_address if empty
    Col 8:  city_found            ✅
    Col 9:  subdivision_found     (blank)
    Col 10: reasons_for_admission ✅
    Col 11: care_by_rescuer       ✅
    Col 12: notes_about_rescue    ✅
    Col 13–15: clinical fields         (blank)
    Col 16: reference_number          ✅
    Col 17: name                      ✅
    Col 18: keywords                  (blank)
    Col 19: disposition               ✅ always "Pending"
    Col 20–29: transfer/release fields (blank)
    Col 30: rescuer_first_name    ✅
    Col 31: rescuer_last_name     ✅
    Col 32: rescuer_phone         ✅
    Col 33: rescuer_alt_phone     (blank)
    Col 34: rescuer_email         (blank)
    Col 35: rescuer_subdivision   (blank)
    Col 36: rescuer_city          ✅
    Col 37: rescuer_address       ✅
    Col 38: rescuer_postal_code   ✅
    Col 39–73: clinical exam fields (blank)
    Col 74: wrmd_processed        ✅ always "0"
    """

    def v(value: str | None) -> str:
        return value.strip() if value and value.strip() else ""

    row: list[str] = [""] * 74  # initialise all 74 cols to empty string

    # Col 1 — empty index (leave as "")
    row[1]  = v(record.common_name)           # col 2
    row[2]  = v(record.admitted_at)           # col 3
    row[3]  = "Linda Nichols"                 # col 4  admitted_by
    # row[4]  transported_by        — blank
    row[5]  = v(record.found_at)              # col 6
    row[6]  = v(record.address_found) or v(record.rescuer_address)  # col 7  address_found
    row[7]  = v(record.city_found)            # col 8
    # row[8]  subdivision_found     — blank
    row[9]  = v(record.reasons_for_admission) # col 10
    row[10] = v(record.care_by_rescuer)       # col 11
    row[11] = v(record.notes_about_rescue)    # col 12
    # cols 13–15 (indices 12–14)   — blank (diagnosis, band, microchip)
    row[15] = v(record.reference_number)      # col 16
    row[16] = v(record.name)                  # col 17
    # row[17] keywords              — blank
    row[18] = v(record.disposition) or "Pending"  # col 19 disposition (REQUIRED)
    # cols 20–29 (indices 19–28)   — blank (transfer/release fields)
    row[29] = v(record.rescuer_first_name)    # col 30
    row[30] = v(record.rescuer_last_name)     # col 31
    row[31] = v(record.rescuer_phone)         # col 32
    # row[32] rescuer_alt_phone     — blank
    # row[33] rescuer_email         — blank
    # row[34] rescuer_subdivision   — blank
    row[35] = v(record.rescuer_city)          # col 36
    row[36] = v(record.rescuer_address)       # col 37
    row[37] = v(record.rescuer_postal_code)   # col 38
    # cols 39–73 (indices 38–72)   — blank (clinical exam fields)
    row[73] = "0"                             # col 74 — wrmd_processed

    return row


def get_pending_records() -> list[dict]:
    """
    Return all rows where wrmd_processed == "0" (not yet submitted to WRMD).

    Each dict contains all IntakeRecord fields plus ``row_index`` (1-based sheet
    row number used by mark_record_processed).  Rows with an empty common_name
    are skipped.  Returns [] on any sheet error so callers never see a 500.
    """
    try:
        worksheet = _get_worksheet()
        all_rows = worksheet.get_all_values()
    except Exception as exc:
        logger.error("get_pending_records: could not read sheet — %s", exc)
        return []

    pending: list[dict] = []
    for i, row in enumerate(all_rows):
        if i == 0:
            continue  # skip header

        # Pad short rows to avoid index errors
        if len(row) < 74:
            row = row + [""] * (74 - len(row))

        if row[73] != "0":
            continue
        if not row[1].strip():
            continue

        sheet_row = i + 1  # gspread update_cell uses 1-based row numbers

        pending.append({
            "row_index":            sheet_row,
            "common_name":          row[1].strip(),
            "admitted_at":          row[2].strip(),
            "found_at":             row[5].strip() or None,
            "address_found":        row[6].strip() or None,
            "city_found":           row[7].strip() or None,
            "reasons_for_admission": row[9].strip() or None,
            "care_by_rescuer":      row[10].strip() or None,
            "notes_about_rescue":   row[11].strip() or None,
            "reference_number":     row[15].strip() or None,
            "name":                 row[16].strip() or None,
            "disposition":          row[18].strip() or "Pending",
            "rescuer_first_name":   row[29].strip() or None,
            "rescuer_last_name":    row[30].strip() or None,
            "rescuer_phone":        row[31].strip() or None,
            "rescuer_city":         row[35].strip() or None,
            "rescuer_address":      row[36].strip() or None,
            "rescuer_postal_code":  row[37].strip() or None,
        })

    return pending


def mark_record_processed(row_index: int) -> None:
    """
    Set wrmd_processed (col 74) to "1" for the given 1-based sheet row index.
    Raises on failure so callers can decide whether to surface the error.
    """
    worksheet = _get_worksheet()
    worksheet.update_cell(row_index, 74, "1")
    logger.info("Marked sheet row %d as processed (wrmd_processed=1)", row_index)


def append_intake_record(record: IntakeRecord) -> None:
    """
    Append a single intake record as a new row in the Google Sheet.
    Never overwrites existing rows.
    """
    if not record.common_name or not record.admitted_at:
        raise ValueError("common_name and admitted_at are required before saving.")

    worksheet = _get_worksheet()
    row = _build_row(record)

    worksheet.append_row(
        row,
        value_input_option="USER_ENTERED",  # lets Sheets parse dates naturally
        insert_data_option="OVERWRITE",     # writes to next empty row; never inserts/shifts rows
        table_range="A1",
    )
    logger.info(
        "Appended intake record: %s on %s", record.common_name, record.admitted_at
    )
