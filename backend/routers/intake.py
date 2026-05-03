"""
Intake API router.

Endpoints:
  POST /api/intake/extract   — OCR a paper form photo, return extracted fields
  POST /api/intake/save      — Append a reviewed IntakeRecord to Google Sheets
  GET  /api/intake/pending   — List sheet rows where wrmd_processed == "0"
  POST /api/intake/wrmd-submit — Submit a pending record to WRMD, mark processed
  GET  /api/taxa/search      — WRMD species-name autocomplete
"""

import logging
import os

import httpx
from fastapi import APIRouter, File, UploadFile, HTTPException, Body, Query
from fastapi.responses import JSONResponse

from models.intake import IntakeRecord, IntakeResponse, PendingRecord, TaxaCandidate
from services.ocr import extract_intake_fields
from services.sheets import append_intake_record, get_pending_records, mark_record_processed
from services.wrmd import search_taxa, best_match_label

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["intake"])

# Mirror the frontend limit so both layers agree on the ceiling.
_MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB


@router.post("/intake/extract", response_model=IntakeResponse)
async def extract_intake(image: UploadFile = File(...)) -> IntakeResponse:
    """
    Step 1: Receive an intake form photo and return extracted fields.
    The front-end presents these to the volunteer for review before saving.
    """
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Please upload an image (JPG, PNG, HEIC, etc.).",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(image_bytes) > _MAX_IMAGE_BYTES:
        mb = len(image_bytes) / (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Image is too large ({mb:.1f} MB). Maximum allowed size is 15 MB.",
        )

    try:
        record = extract_intake_fields(image_bytes)
    except RuntimeError as exc:
        logger.error("OCR extraction failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    warnings: list[str] = []
    if not record.common_name:
        warnings.append("Species / Common Name could not be read — please fill it in.")
    if not record.admitted_at:
        warnings.append("Intake date could not be read — please fill it in.")

    # ── WRMD taxa matching ────────────────────────────────────────────────────
    # Search WRMD for candidates matching the OCR'd species name. If there is
    # an exact (case-insensitive) match, promote it to the canonical spelling
    # automatically so volunteers see the correctly-cased WRMD label by default.
    taxa_candidates: list[TaxaCandidate] = []
    if record.common_name:
        raw_candidates = search_taxa(record.common_name)
        taxa_candidates = [TaxaCandidate(**c) for c in raw_candidates]
        matched = best_match_label(record.common_name, raw_candidates)
        if matched and matched != record.common_name:
            record = record.model_copy(update={"common_name": matched})

    return IntakeResponse(extracted=record, warnings=warnings, taxa_candidates=taxa_candidates)


# ── Taxa search ────────────────────────────────────────────────────────────────

@router.get("/taxa/search", response_model=list[TaxaCandidate])
async def taxa_search(q: str = Query(default="", alias="q")) -> list[TaxaCandidate]:
    """
    Search WRMD common-names for species matching *q*.
    Returns up to 20 candidates. Used by the front-end Autocomplete field.
    """
    candidates = search_taxa(q)
    return [TaxaCandidate(**c) for c in candidates]


@router.post("/intake/save", status_code=201)
async def save_intake(record: IntakeRecord = Body(...)) -> JSONResponse:
    """
    Step 2: Receive the volunteer-reviewed IntakeRecord and append it to
    the Google Sheet. Called after the volunteer confirms the data.
    """
    if not record.common_name or not record.common_name.strip():
        raise HTTPException(status_code=422, detail="common_name is required.")
    if not record.admitted_at or not record.admitted_at.strip():
        raise HTTPException(status_code=422, detail="admitted_at is required.")

    try:
        append_intake_record(record)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error("Failed to append to Google Sheets: %s", exc)
        raise HTTPException(
            status_code=502,
            detail="Could not save to Google Sheets. Please try again or contact staff.",
        )

    return JSONResponse(
        status_code=201,
        content={"success": True, "message": "Intake record saved successfully."},
    )


# ── Pending records (Chrome extension) ────────────────────────────────────────

@router.get("/intake/pending", response_model=list[PendingRecord])
async def list_pending() -> list[PendingRecord]:
    """
    Return all Google Sheet rows where wrmd_processed == "0", sorted oldest-first.
    Used by the Chrome extension to show records that still need to be sent to WRMD.
    Returns [] on sheet errors — never 500.
    """
    rows = get_pending_records()
    records = [PendingRecord(**r) for r in rows]
    records.sort(key=lambda r: r.admitted_at or "")
    return records


@router.post("/intake/wrmd-submit")
async def wrmd_submit(record: PendingRecord = Body(...)) -> JSONResponse:
    """
    Submit a pending record to WRMD via their REST API, then mark it as processed
    in Google Sheets.

    On WRMD success: returns { success: true, case_number: "YYYY-N", message: "..." }
    On WRMD failure: returns 502 with WRMD error detail; the sheet row is NOT marked.
    """
    wrmd_api_key = os.environ.get("WRMD_API_KEY", "").strip()
    if not wrmd_api_key:
        raise HTTPException(status_code=500, detail="WRMD_API_KEY is not configured on the server.")

    # Build the JSON:API payload.  Only send non-empty values.
    def _v(val: str | None) -> str | None:
        return val.strip() if val and val.strip() else None

    attributes: dict = {
        "commonName":           record.common_name,
        "admittedAt":           record.admitted_at,
        "admittedBy":           record.admitted_by,
    }
    optional_fields = {
        "referenceNumber":      _v(record.reference_number),
        "name":                 _v(record.name),
        "foundAt":              _v(record.found_at),
        "addressFound":         _v(record.address_found),
        "cityFound":            _v(record.city_found),
        "reasonsForAdmission":  _v(record.reasons_for_admission),
        "notesAboutRescue":     _v(record.notes_about_rescue),
        "careByRescuer":        _v(record.care_by_rescuer),
        "disposition":          _v(record.disposition),
        "rescuerFirstName":     _v(record.rescuer_first_name),
        "rescuerLastName":      _v(record.rescuer_last_name),
        "rescuerPhone":         _v(record.rescuer_phone),
        "rescuerAddress":       _v(record.rescuer_address),
        "rescuerCity":          _v(record.rescuer_city),
        "rescuerPostalCode":    _v(record.rescuer_postal_code),
    }
    attributes.update({k: v for k, v in optional_fields.items() if v is not None})

    payload = {"data": {"type": "patients", "attributes": attributes}}

    logger.info(
        "Submitting to WRMD: %s admitted %s (sheet row %d)",
        record.common_name, record.admitted_at, record.row_index,
    )

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.post(
                "https://www.wrmd.org/api/v3/patients/",
                json=payload,
                headers={
                    "Authorization": f"Bearer {wrmd_api_key}",
                    "Content-Type": "application/vnd.api+json",
                    "Accept": "application/vnd.api+json",
                },
            )
            logger.info("WRMD response %d: %s", response.status_code, response.text[:500])
    except httpx.RequestError as exc:
        logger.error("WRMD request failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Could not reach WRMD: {exc}")

    if not response.is_success:
        raise HTTPException(
            status_code=502,
            detail=f"WRMD returned {response.status_code}: {response.text[:300]}",
        )

    # Parse case number from JSON:API response (best-effort).
    case_number: str | None = None
    try:
        data = response.json().get("data", {})
        attrs = data.get("attributes", {})
        case_number = attrs.get("caseNumber") or data.get("id")
    except Exception:
        pass

    # Mark the sheet row as processed — log but don't fail if this step errors.
    try:
        mark_record_processed(record.row_index)
    except Exception as exc:
        logger.error(
            "WRMD submit succeeded but failed to mark row %d processed: %s",
            record.row_index, exc,
        )

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "case_number": case_number,
            "message": f"Admitted to WRMD{f' as case {case_number}' if case_number else ''}.",
        },
    )
