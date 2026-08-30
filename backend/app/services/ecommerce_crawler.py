"""Best-effort public listing fetcher; blocked/unclear pages remain pending."""
import re
import urllib.request
from html import unescape
from urllib.parse import urlparse

def evaluate_listing_text(text: str) -> dict:
    """Run fetched listing text through the same extraction/evaluation path."""
    from app.services.groq_service import extract_structured
    from app.services.compliance_engine import evaluate_declarations, summarize_checks
    extracted = extract_structured(text or "")
    fields = extracted.get("fields") or extracted.get("extracted_fields") or extracted
    checks = evaluate_declarations({"ocr_text": text, "raw_ocr_text": text,
                                   "extracted_fields": fields,
                                   "field_confidences": extracted.get("field_confidences", {}),
                                   "category": "general"})
    return {"extracted_fields": fields, "summary": summarize_checks(checks)}

def fetch_listing(url: str) -> dict:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return {"status": "fetch_failed", "error": "invalid_url"}
    req = urllib.request.Request(url, headers={"User-Agent": "LegalMComplianceChecker/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            html = response.read(2_000_000).decode("utf-8", errors="replace")
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"\s+", " ", unescape(text)).strip()
        return {"status": "fetched", "text": text[:12000], "title": text[:200], "source_url": url}
    except Exception as exc:
        return {"status": "fetch_failed", "error": type(exc).__name__}
