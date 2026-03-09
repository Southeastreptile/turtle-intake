"""
OCR service — Google Cloud Vision API integration.

Sends an intake form image to Vision API using DOCUMENT_TEXT_DETECTION,
then parses the raw text into an IntakeRecord using regex and keyword matching.

The SERC intake form layout has labels and values on adjacent lines, e.g.:
  Species/Common Name:
  Eastern Box Turtle

This parser handles both same-line and next-line value layouts.
"""

import json
import os
import re
import logging

from google.cloud import vision
from google.oauth2 import service_account

from models.intake import IntakeRecord
from utils.dates import parse_date

logger = logging.getLogger(__name__)

# ── Admission reason keywords (ordered — checked first) ──────────────────────
_REASON_KEYWORDS = [
    ("displaced", "Displaced"),
    ("injured", "Injured"),
    ("orphaned", "Orphaned"),
    ("sick", "Sick"),
    ("other", "Other"),
]


def _get_vision_client() -> vision.ImageAnnotatorClient:
    """
    Build a Vision API client.

    Credential resolution order:
      1. GOOGLE_SERVICE_ACCOUNT_JSON contains raw JSON (Cloud Run secret-as-env)
      2. GOOGLE_SERVICE_ACCOUNT_JSON is a file path (local dev)
      3. Application Default Credentials (Cloud Run with attached service account)
    """
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]

    if raw.startswith("{"):
        # Inline JSON string
        info = json.loads(raw)
        credentials = service_account.Credentials.from_service_account_info(info, scopes=scopes)
        return vision.ImageAnnotatorClient(credentials=credentials)

    if raw:
        # File path
        credentials = service_account.Credentials.from_service_account_file(raw, scopes=scopes)
        return vision.ImageAnnotatorClient(credentials=credentials)

    # Fall back to Application Default Credentials
    return vision.ImageAnnotatorClient()


def _extract_raw_text(image_bytes: bytes) -> str:
    """Send image bytes to Vision API and return the full raw text."""
    client = _get_vision_client()
    image = vision.Image(content=image_bytes)
    response = client.document_text_detection(image=image)

    if response.error.message:
        raise RuntimeError(f"Vision API error: {response.error.message}")

    return response.full_text_annotation.text


def _is_label_line(s: str) -> bool:
    """Return True if the string looks like a form label line (e.g. 'Full Name: value').
    Commas are allowed so multi-part labels like
    'Care given (Food, water, medications, treatments:' are correctly identified."""
    return bool(re.match(r"^[A-Za-z][A-Za-z /\(\),]*\s*:", s))


def _find_field(text: str, *labels: str, next_line: bool = False) -> str | None:
    """
    Find the value following any of the given label strings in OCR text.

    Tries two strategies for each label:
      1. Same-line: "Label: value"
      2. Next-line: label on one line, value on the next (next_line=True)

    Returns the first non-empty match.
    """
    lines = text.splitlines()

    for label in labels:
        escaped = re.escape(label)

        # Strategy 1: same-line  "Label: value"
        pattern = rf"{escaped}\s*[:\-]?\s*(.+)"
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = match.group(1).strip()
            # Remove bleed-through from next label on same line.
            # First try the 3-space split (works when OCR preserves table spacing).
            value = re.split(r"\s{3,}|\n", value)[0].strip()
            # If that didn't help, strip any trailing "CapWord CapWord: rest" sequence
            # that indicates an adjacent field's label bled into this value
            # (e.g. "Linda Nichols Phone Number: 757…" → "Linda Nichols").
            value = re.sub(
                r"\s+[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)+\s*:.*$", "", value
            ).strip()
            # Skip if value looks like another label
            if value and not _is_label_line(value):
                return value

        # Strategy 2: next-line — label alone on a line, value follows
        for i, line in enumerate(lines):
            if re.search(escaped, line, re.IGNORECASE) and i + 1 < len(lines):
                next = lines[i + 1].strip()
                if next and not _is_label_line(next):
                    return next

    return None


def _find_field_after(text: str, label: str, max_lines: int = 4) -> str | None:
    """
    More aggressive next-line search: find the first non-empty, non-label
    line that appears after the given label anywhere in the text.
    """
    lines = text.splitlines()
    escaped = re.escape(label)
    for i, line in enumerate(lines):
        if re.search(escaped, line, re.IGNORECASE):
            for j in range(i + 1, min(i + max_lines + 1, len(lines))):
                candidate = lines[j].strip()
                if candidate and not _is_label_line(candidate):
                    return candidate
    return None


def _find_field_before(text: str, label: str, max_lines: int = 3) -> str | None:
    """
    Look for a value in lines immediately BEFORE the given label.

    Handles OCR output where handwritten values appear above/before the printed
    label — common when a volunteer writes the species in the top-right corner
    before Vision API reads the label text on the row below.

    Collects adjacent non-label, non-header lines and joins them.
    """
    lines = text.splitlines()
    escaped = re.escape(label)
    for i, line in enumerate(lines):
        if re.search(escaped, line, re.IGNORECASE) and i > 0:
            parts: list[str] = []
            for j in range(i - 1, max(-1, i - max_lines - 1), -1):
                candidate = lines[j].strip()
                if not candidate:
                    break
                if _is_label_line(candidate):
                    break
                if re.search(r"Wildlife Intake Form", candidate, re.IGNORECASE):
                    break
                parts.insert(0, candidate)
            if parts:
                return " ".join(parts)
    return None


def _find_continuation(text: str, value: str) -> str:
    """
    If *value* appears as a complete standalone line and the very next
    non-empty line is a plausible word-only continuation (no digits,
    at most 3 words, not a label), append it and return the joined string.

    Handles multi-line handwriting such as:
      "Eastern Box"   ← line N
      "Turtle"        ← line N+1
    → joined to "Eastern Box Turtle"
    """
    if not value:
        return value
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.strip() == value.strip() and i + 1 < len(lines):
            nxt = lines[i + 1].strip()
            if (
                nxt
                and not _is_label_line(nxt)
                and not re.search(r"\d", nxt)
                and len(nxt.split()) <= 3
            ):
                return f"{value} {nxt}"
            break
    return value


def _parse_name(full_name: str | None) -> tuple[str | None, str | None]:
    """Split 'First Last' into (first, last). Handles middle names/initials."""
    if not full_name:
        return None, None
    # Remove parenthetical nicknames e.g. "Migdalia (micky) Blair"
    cleaned = re.sub(r"\(.*?\)", "", full_name).strip()
    parts = cleaned.split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[-1]


_STREET_SUFFIX = (
    r"(?:Street|St|Avenue|Ave|Drive|Dr|Road|Rd|Boulevard|Blvd|"
    r"Way|Court|Ct|Lane|Ln|Place|Pl|Circle|Cir|"
    r"Highway|Hwy|Parkway|Pkwy|Loop|Run|Terrace|Ter|Terr)\b\.?"
)


def _parse_address(raw: str | None) -> tuple[str | None, str | None, str | None]:
    """
    Attempt to split a raw address string into (street, city, postal_code).
    Handles formats like:
      "825 Graydon Ave Norfolk"
      "825 Military Hwy Virginia Beach"
      "123 Main St, CityName 23456"
      "Plum Point Park"           → (street="Plum Point Park", city=None, zip=None)
    Returns (street, city, postal_code) — any may be None.
    """
    if not raw:
        return None, None, None

    raw = raw.strip()

    # If the string doesn't start with a digit it may contain a person's name
    # prepended by OCR (e.g. "Linda Nichols 825 Graydon Ave Norfolk").
    # Extract any embedded numeric street address and use that instead.
    if not re.match(r"^\d", raw):
        embedded = re.search(r"(?<!\d)(\d+\s+[A-Za-z].+)$", raw)
        if embedded:
            raw = embedded.group(1).strip()

    # Extract ZIP (5-digit)
    zip_match = re.search(r"\b(\d{5})(?:-\d{4})?\b", raw)
    postal_code = zip_match.group(1) if zip_match else None

    # Remove ZIP and preceding 2-letter state abbrev
    cleaned = re.sub(r"\b[A-Z]{2}\b\s*\d{5}(?:-\d{4})?", "", raw).strip().rstrip(",").strip()
    cleaned = re.sub(r"\b\d{5}(?:-\d{4})?\b", "", cleaned).strip().rstrip(",").strip()

    # Split on comma: "street, city"
    if "," in cleaned:
        parts = [p.strip() for p in cleaned.split(",", 1)]
        return parts[0] or None, parts[1] or None, postal_code

    # Split at a known street-type suffix: handles single and multi-word cities.
    # e.g. "825 Graydon Ave Norfolk" → ("825 Graydon Ave", "Norfolk")
    # e.g. "825 Military Hwy Virginia Beach" → ("825 Military Hwy", "Virginia Beach")
    sfx_match = re.search(
        rf"^(\d+\s+.+?\b{_STREET_SUFFIX})\s+([A-Za-z].+)$", cleaned, re.IGNORECASE
    )
    if sfx_match:
        return sfx_match.group(1).strip() or None, sfx_match.group(2).strip() or None, postal_code

    # Fallback: city is the last single capitalised word
    street_match = re.match(r"(\d+\s+.+?)(?:\s{2,}|\s+[A-Z][a-z]+\s*$)", cleaned)
    if street_match:
        street = street_match.group(1).strip()
        city = cleaned[len(street):].strip() or None
        return street or None, city, postal_code

    return cleaned or None, None, postal_code


def _parse_reason(text: str) -> str | None:
    """
    Detect which admission reason checkbox was ticked.

    The form label is "Reason for intake" followed by options:
    "Injured ( ) Orphaned ( ) Displaced (✓) Sick ( ) Other (Specify)"
    Vision OCR may render the checkmark as ✓, √, x, X, or similar.

    Strategy:
      1. Find checkmark adjacent to a keyword anywhere in the full text
      2. Build a window starting at "Reason for intake" label and search that block
    """
    checkmark = r"[✓✗√xX\*]"

    # Strategy 1: checkmark adjacent to keyword anywhere in full text
    for keyword, value in _REASON_KEYWORDS:
        pattern = rf"{keyword}\s*\({checkmark}|{checkmark}\s*\)?\s*{keyword}|{keyword}\s*{checkmark}|\({checkmark}\)\s*{keyword}"
        if re.search(pattern, text, re.IGNORECASE):
            return value

    # Build a reason window starting at the "Reason for intake" label,
    # spanning up to 4 lines to capture multi-line OCR output
    lines = text.splitlines()
    reason_window = []
    for i, line in enumerate(lines):
        if re.search(r"reason\s+for\s+intake", line, re.IGNORECASE):
            reason_window = lines[i : min(i + 4, len(lines))]
            break

    # Fall back to any line containing a reason keyword if label not found
    if not reason_window:
        for i, line in enumerate(lines):
            if re.search(r"injured|orphaned|displaced|sick", line, re.IGNORECASE):
                reason_window = lines[i : min(i + 3, len(lines))]
                break

    if not reason_window:
        return None

    reason_block = " ".join(reason_window)
    logger.debug("Reason block: %s", reason_block)

    # Strategy 2: checkmark near keyword in the joined block
    for keyword, value in _REASON_KEYWORDS:
        pattern = rf"{keyword}\s*\({checkmark}|{checkmark}\s*\)?\s*{keyword}|{keyword}\s*{checkmark}|\({checkmark}\)\s*{keyword}"
        if re.search(pattern, reason_block, re.IGNORECASE):
            return value

    # Strategy 3: when OCR drops the checkmark entirely, unchecked boxes appear
    # as "()" after their keyword; the CHECKED keyword has no trailing "(…".
    # e.g. "Injured () Orphaned () Displaced" → Displaced is checked.
    _reason_lines = "\n".join(
        ln for ln in text.splitlines()
        if re.search(r"\b(?:injured|orphaned|displaced|sick)\b", ln, re.IGNORECASE)
        and not re.search(r"other relevant|information", ln, re.IGNORECASE)
    )
    if _reason_lines:
        for keyword, value in _REASON_KEYWORDS:
            if keyword == "other":
                continue  # "Other (Specify)" always has "(" — unreliable for this heuristic
            if (
                re.search(rf"\b{keyword}\b", _reason_lines, re.IGNORECASE)
                and not re.search(rf"\b{keyword}\b\s*\(", _reason_lines, re.IGNORECASE)
            ):
                return value

    return None


# ── Public API ───────────────────────────────────────────────────────────────

def extract_intake_fields(image_bytes: bytes) -> IntakeRecord:
    """
    Main entry point: send image to Vision API and parse into IntakeRecord.
    Raises RuntimeError on Vision API failure.
    """
    raw_text = _extract_raw_text(image_bytes)
    logger.info("Raw OCR text:\n%s", raw_text)

    # ── Date admitted ─────────────────────────────────────────────────────────
    raw_date = _find_field(raw_text, "Date", "Intake Date", "Date of Intake")
    admitted_at = parse_date(raw_date) or ""

    # ── Species ───────────────────────────────────────────────────────────────
    # The form has "Species/Common Name:" label.  OCR often reads handwritten
    # values (top-right corner) BEFORE the printed label, so check same-line
    # first, then after the label, then before it as a final fallback.
    common_name = (
        _find_field(raw_text, "Species/Common Name", "Common Name")
        or _find_field_after(raw_text, "Species/Common Name")
        or _find_field_after(raw_text, "Common Name")
        or _find_field_before(raw_text, "Species/Common Name")
        or _find_field(raw_text, "Species", "Animal")
        or ""
    )
    # Guard: if it still looks like a label, clear it
    if _is_label_line(common_name) or re.match(r"^[A-Za-z /\(\)]+:$", common_name):
        common_name = ""

    # Join two-line handwritten species names (e.g. "Eastern Box" + "Turtle").
    if common_name:
        common_name = _find_continuation(raw_text, common_name)

    # ── Rescuer name ──────────────────────────────────────────────────────────
    # _find_field Strategy 2 only looks at i+1; when OCR places "Address:" on
    # the very next line the name is missed.  _find_field_after skips over any
    # intermediate label lines to find the first real value.
    full_name = (
        _find_field(raw_text, "Full Name", "Rescuer Name", "Finder")
        or _find_field_after(raw_text, "Full Name")
        or _find_field_after(raw_text, "Rescuer Name")
    )
    rescuer_first, rescuer_last = _parse_name(full_name)
    logger.info("OCR full_name=%r  →  first=%r  last=%r", full_name, rescuer_first, rescuer_last)

    # ── Rescuer phone ─────────────────────────────────────────────────────────
    # Try the label first; fall back to regex scan for any 10-digit number.
    raw_phone = _find_field(raw_text, "Contact Number", "Phone", "Phone Number")
    if not raw_phone:
        phone_match = re.search(r"\b(\(?\d{3}\)?[\-\.\s]\d{3}[\-\.\s]\d{4})\b", raw_text)
        raw_phone = phone_match.group(1).strip() if phone_match else None
    rescuer_phone = raw_phone

    # ── Rescuer address ───────────────────────────────────────────────────────
    # Use the "Address:" label first so non-numeric addresses (landmarks, etc.)
    # are captured.  Fall back to scanning for any numeric street address line.
    raw_address = _find_field(raw_text, "Address")

    # Guard: if the label-based result has no digits and its first word matches
    # the rescuer's first name, OCR has confused the name line with the address
    # (e.g. "Full Name: Address:" on one line → next line "Linda Nichols").
    # Clear it and let the digit scan below find the real street address.
    if (
        raw_address
        and not re.search(r"\d", raw_address)
        and full_name
        and raw_address.strip().split()[0].lower() == full_name.strip().split()[0].lower()
    ):
        logger.info("OCR address guard triggered: discarding %r (matches rescuer name)", raw_address)
        raw_address = None

    if not raw_address:
        for line in raw_text.splitlines():
            line = line.strip()
            if re.match(r"^\d+\s+[A-Za-z]", line):
                if not re.match(r"^\d{5}$", line) and not re.search(r"\d{3}[\-\.]\d{4}", line):
                    raw_address = line
                    break
    rescuer_address, rescuer_city, rescuer_postal_code = _parse_address(raw_address)
    logger.info("OCR raw_address=%r  →  street=%r  city=%r", raw_address, rescuer_address, rescuer_city)

    # ── Location found (if different) ─────────────────────────────────────────
    raw_location = _find_field(
        raw_text,
        "Location Found (if different)",
        "Location Found",
        "Found Location",
        "Where Found",
    )
    address_found: str | None = None
    city_found: str | None = None
    if raw_location:
        if re.search(r"\d", raw_location) or "," in raw_location:
            # Numeric address or "Place, City" — parse normally
            address_found, city_found, _ = _parse_address(raw_location)
        else:
            # Plain name (park, landmark, neighbourhood) — store as address, not city
            address_found = raw_location.strip()

    # ── Date found ────────────────────────────────────────────────────────────
    # The SERC form has no separate "Date Found" field; default to the intake date.
    found_at = (
        parse_date(_find_field(raw_text, "Date Found", "Found Date"))
        or (admitted_at if admitted_at else None)
    )

    # ── Intake reason ─────────────────────────────────────────────────────────
    reasons_for_admission = _parse_reason(raw_text)

    # ── Free-text fields ──────────────────────────────────────────────────────
    # OCR often groups all printed labels together before handwritten values, so
    # the layout can be:
    #   line N:   "Details about rescue or other relevant information:"
    #   line N+1: "Care given (Food, water, medications, treatments:"   ← label
    #   line N+2: "Sick with swollen eyes"                              ← notes value
    #   line N+3: "Water, food, heat"                                   ← care value
    #
    # _find_field Strategy 2 only checks i+1; _find_field_after skips labels.
    # NOTE: "Details about rescue" (shorter) is NOT passed to _find_field because
    # it is a prefix of the label line and Strategy 1 would capture "or other
    # relevant information:" as the value — use _find_field_after instead.
    notes_about_rescue = (
        _find_field(
            raw_text,
            "Details about rescue or other relevant information",
            "Rescue details",
            "Notes",
        )
        or _find_field_after(raw_text, "Details about rescue or other relevant information")
        or _find_field_after(raw_text, "Details about rescue")
    )

    # Use _find_field_after first so we get the actual handwritten value rather
    # than the label-fragment "(Food, water…" that _find_field Strategy 1 picks up.
    care_by_rescuer = (
        _find_field_after(raw_text, "Care given")
        or _find_field(
            raw_text,
            "Care given (food, water, medications, treatments)",
            "Care given",
            "Care provided",
            "Treatment",
        )
    )

    # De-duplicate: when both labels precede both values in OCR output, notes and
    # care initially resolve to the same line.  Advance care to the next non-label
    # line that follows the notes value.
    if care_by_rescuer and notes_about_rescue and care_by_rescuer == notes_about_rescue:
        _lines = raw_text.splitlines()
        for _i, _ln in enumerate(_lines):
            if _ln.strip() == notes_about_rescue and _i + 1 < len(_lines):
                for _k in range(_i + 1, min(_i + 4, len(_lines))):
                    _cand = _lines[_k].strip()
                    if _cand and not _is_label_line(_cand):
                        care_by_rescuer = _cand
                        break
                break

    return IntakeRecord(
        common_name=common_name,
        admitted_at=admitted_at,
        rescuer_first_name=rescuer_first,
        rescuer_last_name=rescuer_last,
        rescuer_phone=rescuer_phone,
        rescuer_address=rescuer_address,
        rescuer_city=rescuer_city,
        rescuer_postal_code=rescuer_postal_code,
        found_at=found_at,
        address_found=address_found,
        city_found=city_found,
        reasons_for_admission=reasons_for_admission,
        notes_about_rescue=notes_about_rescue,
        care_by_rescuer=care_by_rescuer,
    )
