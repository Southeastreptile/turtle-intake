"""
POST /api/intake

Accepts a multipart image upload of the SERC paper intake form.
Returns extracted fields for volunteer review (GET-style response),
and on confirm, appends the record to Google Sheets.
"""

import logging

from fastapi import APIRouter, File, UploadFile, HTTPException, Body, Query
from fastapi.responses import JSONResponse

from models.intake import IntakeRecord, IntakeResponse, TaxaCandidate
from services.ocr import extract_intake_fields
from services.sheets import append_intake_record
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
