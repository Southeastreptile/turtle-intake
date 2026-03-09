"""
WRMD taxa search service.

Queries the WRMD internal common-names search endpoint to find officially
recognised species labels, so that intake records use exact WRMD vocabulary.

Endpoint (requires Bearer auth):
  GET https://wrmd.org/internal-api/search/common-names/?search={query}
  Returns: [{"value": int, "label": str, "data": []}, ...]  (up to 20 results)
"""

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

_WRMD_HOST = "https://wrmd.org"
_SEARCH_PATH = "/internal-api/search/common-names/"


def _api_key() -> str:
    return os.environ.get("WRMD_API_KEY", "").strip()


def search_taxa(query: str) -> list[dict]:
    """
    Search WRMD for common names matching *query*.

    Returns a list of {"value": int, "label": str} dicts (up to 20).
    Returns an empty list — never raises — so that a WRMD outage or missing
    key can never block the intake flow.
    """
    if not query or not query.strip():
        return []

    key = _api_key()
    if not key:
        logger.warning("WRMD_API_KEY not set — skipping taxa lookup.")
        return []

    url = _WRMD_HOST + _SEARCH_PATH + "?search=" + urllib.parse.quote(query.strip())
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
            "User-Agent": "SERC-Wildlife-Intake/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            raw = json.loads(r.read().decode())
            return [{"value": item["value"], "label": item["label"]} for item in raw]
    except urllib.error.HTTPError as e:
        logger.warning("WRMD taxa search HTTP %s for query %r", e.code, query)
        return []
    except Exception as e:
        logger.warning("WRMD taxa search failed for %r: %s", query, e)
        return []


def best_match_label(query: str, candidates: list[dict]) -> str | None:
    """
    Return the WRMD label that exactly matches *query* (case-insensitive),
    or None if there is no exact match.

    Used to auto-promote an OCR result to the canonical WRMD spelling when
    the volunteer would see no ambiguity.
    """
    q = query.strip().lower()
    for c in candidates:
        if c["label"].strip().lower() == q:
            return c["label"]
    return None
