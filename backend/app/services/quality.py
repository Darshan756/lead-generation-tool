"""Normalisation, format validation and data-confidence rules.

Nothing here contacts the outside world. "Format-valid" means a value has a
plausible shape; it never means the value was verified.
"""

from __future__ import annotations

import re
from typing import Any, Literal

ContactStatus = Literal["email_ready", "invalid_email", "needs_enrichment"]
ConfidenceLevel = Literal["high", "medium", "low"]

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$")
_LEGAL_SUFFIX_RE = re.compile(r"[\s,]+(inc|llc|co|corp|ltd|company|incorporated)\.?$", re.IGNORECASE)

# Fields that make a record usable for qualification and outreach.
KEY_FIELDS: dict[str, str] = {
    "industry": "Industry",
    "state": "Location",
    "website": "Website",
    "email": "Email",
    "phone": "Phone",
    "revenue_usd": "Revenue",
    "employee_count": "Company size",
    "owner_name": "Owner / contact name",
}
CONFIDENCE_HIGH = 75
CONFIDENCE_MEDIUM = 50


def clean(value: Any) -> Any:
    """Treat blank strings as missing."""
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


def is_valid_email_format(email: str | None) -> bool:
    email = clean(email)
    return bool(email) and len(email) <= 254 and ".." not in email and bool(_EMAIL_RE.match(email))


def normalize_domain(website: str | None) -> str | None:
    """``HTTPS://WWW.Acme.example/about`` -> ``acme.example``."""
    website = clean(website)
    if not website:
        return None
    host = re.sub(r"^[a-z][a-z0-9+.\-]*://", "", website.lower())
    host = host.split("/")[0].split("?")[0].split("#")[0].split("@")[-1].split(":")[0]
    host = host.removeprefix("www.").strip(".")
    return host or None


def normalize_company_name(name: str) -> str:
    name = name.strip().lower()
    previous = None
    while previous != name:
        previous = name
        name = _LEGAL_SUFFIX_RE.sub("", name)
    return re.sub(r"[^a-z0-9]+", " ", name).strip()


def dedupe_key(company_name: str, website: str | None, state: str | None) -> str:
    """Identity used to detect duplicates: the domain when known, otherwise
    the normalised name scoped to its state."""
    domain = normalize_domain(website)
    if domain:
        return f"domain:{domain}"
    return f"name:{normalize_company_name(company_name)}|{(clean(state) or '').lower()}"


def contact_status(data: dict[str, Any]) -> ContactStatus:
    email = clean(data.get("email"))
    if not email:
        return "needs_enrichment"
    return "email_ready" if is_valid_email_format(email) else "invalid_email"


def confidence(data: dict[str, Any]) -> dict[str, Any]:
    """How complete the record is. Deliberately independent of qualification:
    a great-fit company can still have poor data, and vice versa."""
    missing: list[str] = []
    for field, label in KEY_FIELDS.items():
        value = clean(data.get(field))
        if value is None or (field == "email" and not is_valid_email_format(value)):
            missing.append(label)
    percent = round(100 * (len(KEY_FIELDS) - len(missing)) / len(KEY_FIELDS))
    level: ConfidenceLevel = (
        "high" if percent >= CONFIDENCE_HIGH else "medium" if percent >= CONFIDENCE_MEDIUM else "low"
    )
    return {"level": level, "percent": percent, "missing_fields": missing}


def summarize(records: list[dict[str, Any]], duplicates_merged: int = 0) -> dict[str, Any]:
    """Data-quality summary computed from the records themselves."""
    statuses = [contact_status(r) for r in records]
    confidences = [confidence(r) for r in records]
    return {
        "total": len(records),
        "email_format_valid": statuses.count("email_ready"),
        "email_invalid_format": statuses.count("invalid_email"),
        "email_missing": statuses.count("needs_enrichment"),
        "website_missing": sum(1 for r in records if not clean(r.get("website"))),
        "phone_missing": sum(1 for r in records if not clean(r.get("phone"))),
        "revenue_missing": sum(1 for r in records if r.get("revenue_usd") is None),
        "owner_missing": sum(1 for r in records if not clean(r.get("owner_name"))),
        "incomplete_key_info": sum(1 for c in confidences if c["missing_fields"]),
        "needs_manual_review": sum(
            1 for s, c in zip(statuses, confidences) if s == "invalid_email" or c["level"] == "low"
        ),
        "duplicates_merged": duplicates_merged,
        # Nothing in this prototype is verified against an external source.
        "verified": 0,
    }
