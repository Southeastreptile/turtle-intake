"""
Date parsing utilities for SERC intake forms.

Paper forms use MM/DD/YY or MM/DD/YYYY format.
WRMD requires YYYY-MM-DD.
"""

import re
from datetime import datetime


# Patterns to try in order of specificity
_DATE_PATTERNS = [
    r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{4})\b",   # MM/DD/YYYY or MM-DD-YYYY
    r"\b(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2})\b",    # MM/DD/YY  or MM-DD-YY
]


def parse_date(raw: str | None) -> str | None:
    """
    Parse a loosely formatted date string from OCR output into YYYY-MM-DD.

    Returns None if the input is empty or unparseable.
    """
    if not raw or not raw.strip():
        return None

    text = raw.strip()

    for pattern in _DATE_PATTERNS:
        match = re.search(pattern, text)
        if match:
            month, day, year = match.group(1), match.group(2), match.group(3)
            # Expand 2-digit year: 00-29 → 2000s, 30-99 → 1900s
            if len(year) == 2:
                yr = int(year)
                year = str(2000 + yr) if yr < 30 else str(1900 + yr)
            try:
                dt = datetime(int(year), int(month), int(day))
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue

    return None


def normalize_date(raw: str | None) -> str | None:
    """
    Return raw unchanged if it is already in YYYY-MM-DD format,
    otherwise attempt to parse it.
    """
    if not raw:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw.strip()):
        return raw.strip()
    return parse_date(raw)
