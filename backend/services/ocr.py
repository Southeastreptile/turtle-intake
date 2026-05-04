"""
OCR service — Gemini 3.1 Pro multimodal extraction.

Sends the intake form image directly to Gemini with a structured prompt.
Gemini reads the handwriting and returns a JSON object with all fields —
no regex parsing needed.
"""

import base64
import json
import logging
import os

import google.generativeai as genai

from models.intake import IntakeRecord
from utils.dates import parse_date

logger = logging.getLogger(__name__)

_PROMPT = """
You are processing a wildlife intake form photograph from SERC (Southeastern Reptile Conservation).

Extract the following fields from the handwritten and printed form. Return ONLY a valid JSON object — no markdown, no explanation, nothing else.

Fields:
- common_name: species or common name of the animal (e.g. "Eastern Box Turtle")
- admitted_at: intake/admission date in YYYY-MM-DD format
- rescuer_first_name: first name of the person who found or rescued the animal
- rescuer_last_name: last name of the rescuer
- rescuer_phone: rescuer's phone number
- rescuer_address: rescuer's street address
- rescuer_city: rescuer's city
- rescuer_postal_code: rescuer's ZIP/postal code
- address_found: street address where the animal was found (only if different from rescuer address)
- city_found: city where the animal was found (only if different from rescuer city)
- found_at: date the animal was found in YYYY-MM-DD format (only if different from admitted_at)
- reasons_for_admission: the checked/circled option — must be exactly one of: "Injured", "Orphaned", "Displaced", "Sick", "Other"
- notes_about_rescue: free text notes about the rescue circumstances
- care_by_rescuer: free text describing any care the rescuer provided before admission

Rules:
- Use null for any field that is blank, illegible, or not present on this form
- Dates must be in YYYY-MM-DD format
- For reasons_for_admission, look for a checkmark, X, circle, or tick mark next to one of the options
- common_name and admitted_at are the most important fields — do your best to read them even if handwriting is difficult
- Return only the raw JSON object, starting with { and ending with }
""".strip()

def extract_intake_fields(image_bytes: bytes) -> IntakeRecord:
    """
    Send the intake form image to Gemini 3.1 Pro and parse the response
    into an IntakeRecord. Raises RuntimeError on API failure.
    """
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-3.1-pro-preview")

    # Detect MIME type from magic bytes
    mime_type = _detect_mime(image_bytes)

    image_part = {
        "mime_type": mime_type,
        "data": base64.b64encode(image_bytes).decode("utf-8"),
    }

    try:
        response = model.generate_content([image_part, _PROMPT])
    except Exception as exc:
        raise RuntimeError(f"Gemini API error: {exc}") from exc

    raw = response.text.strip()
    logger.info("Gemini raw response:\n%s", raw)

    # Strip markdown fences if Gemini added them despite instructions
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse Gemini JSON: %s\nRaw: %s", exc, raw)
        raise RuntimeError(f"Gemini returned unparseable response: {exc}") from exc

    # Normalise dates through parse_date so format is always YYYY-MM-DD
    def _date(val: str | None) -> str | None:
        if not val:
            return None
        return parse_date(val) or val  # return as-is if already YYYY-MM-DD

    def _str(val) -> str | None:
        return str(val).strip() if val else None

    admitted_at = _date(data.get("admitted_at")) or ""

    return IntakeRecord(
        common_name=_str(data.get("common_name")) or "",
        admitted_at=admitted_at,
        rescuer_first_name=_str(data.get("rescuer_first_name")),
        rescuer_last_name=_str(data.get("rescuer_last_name")),
        rescuer_phone=_str(data.get("rescuer_phone")),
        rescuer_address=_str(data.get("rescuer_address")),
        rescuer_city=_str(data.get("rescuer_city")),
        rescuer_postal_code=_str(data.get("rescuer_postal_code")),
        found_at=_date(data.get("found_at")) or admitted_at or None,
        address_found=_str(data.get("address_found")),
        city_found=_str(data.get("city_found")),
        reasons_for_admission=_str(data.get("reasons_for_admission")),
        notes_about_rescue=_str(data.get("notes_about_rescue")),
        care_by_rescuer=_str(data.get("care_by_rescuer")),
    )


def _detect_mime(image_bytes: bytes) -> str:
    """Detect image MIME type from magic bytes."""
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if image_bytes[:4] in (b"GIF8", b"GIF9"):
        return "image/gif"
    if image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes[:4] == b"%PDF":
        return "application/pdf"
    # Default to JPEG for HEIC and unknowns
    return "image/jpeg"
