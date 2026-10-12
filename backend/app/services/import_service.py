"""Import raw (scraped) company records, merging duplicates."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EnrichmentRecord, Lead
from app.services.quality import clean, dedupe_key, normalize_company_name, normalize_domain

_MERGEABLE = (
    "industry", "city", "state", "website", "email", "phone",
    "revenue_usd", "employee_count", "owner_name", "owner_title", "founded_year",
)


class RawLead(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    industry: str | None = None
    city: str | None = None
    state: str | None = None
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    revenue_usd: int | None = Field(default=None, ge=0)
    employee_count: int | None = Field(default=None, ge=0)
    owner_name: str | None = None
    owner_title: str | None = None
    founded_year: int | None = None

    @field_validator("*", mode="before")
    @classmethod
    def _blank_is_missing(cls, value: Any) -> Any:
        return clean(value)


def import_leads(db: Session, raw_records: list[dict[str, Any]], source: str = "synthetic_demo") -> dict[str, int]:
    """Insert records, folding duplicates into the first record seen.

    Two records are the same company when they share a normalised domain (or,
    with no website, a normalised name within the same state). The first
    record wins; later duplicates only fill fields the first one lacked.
    """
    records = [RawLead.model_validate(raw) for raw in raw_records]
    keys = [dedupe_key(r.company_name, r.website, r.state) for r in records]
    existing = {lead.dedupe_key: lead for lead in db.scalars(select(Lead).where(Lead.dedupe_key.in_(set(keys))))}

    inserted = merged = 0
    for record, key in zip(records, keys):
        lead = existing.get(key)
        if lead is None:
            lead = Lead(dedupe_key=key, domain=normalize_domain(record.website), source=source, **record.model_dump())
            db.add(lead)
            existing[key] = lead
            inserted += 1
            continue
        for field in _MERGEABLE:
            if getattr(lead, field) is None and getattr(record, field) is not None:
                setattr(lead, field, getattr(record, field))
        lead.merged_duplicates = (lead.merged_duplicates or 0) + 1
        merged += 1
    db.flush()
    return {"received": len(records), "inserted": inserted, "duplicates_merged": merged}


def import_enrichment(db: Session, raw_records: list[dict[str, Any]]) -> int:
    count = 0
    seen: set[str] = set(db.scalars(select(EnrichmentRecord.dedupe_key)))
    for raw in raw_records:
        key = dedupe_key(raw["company_name"], raw.get("website"), raw.get("state"))
        if key in seen:
            continue
        seen.add(key)
        db.add(
            EnrichmentRecord(
                dedupe_key=key,
                name_key=f"{normalize_company_name(raw['company_name'])}|{(raw.get('state') or '').lower()}",
                **{f: raw.get(f) for f in (
                    "website", "email", "phone", "revenue_usd", "employee_count", "owner_name", "owner_title",
                )},
            )
        )
        count += 1
    db.flush()
    return count
