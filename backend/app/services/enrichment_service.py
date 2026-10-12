"""Enrichment of snapshot leads.

Two sources, both recorded per field so the UI and exports can show where a
value came from:

* ``simulated`` - looked up in ``enrichment_records``, a synthetic stand-in
  for a third-party data provider. No external service is called.
* ``manual``    - typed in by the user.

Enrichment only ever writes to ``SnapshotLead.data``. ``original_data`` keeps
the snapshot as it was captured.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.errors import NotFoundError, ValidationError
from app.models import EnrichmentRecord, Snapshot, SnapshotLead
from app.schemas import SnapshotLeadUpdate
from app.services.quality import clean, contact_status, dedupe_key, is_valid_email_format, normalize_company_name, normalize_domain

ENRICHABLE_FIELDS = ("website", "email", "phone", "revenue_usd", "employee_count", "owner_name", "owner_title")


def _name_key(data: dict[str, Any]) -> str:
    return f"{normalize_company_name(data['company_name'])}|{(clean(data.get('state')) or '').lower()}"


def _needs(data: dict[str, Any], field: str) -> bool:
    value = clean(data.get(field))
    if field == "email":
        # A malformed email is not usable, so a provider value may replace it.
        return not is_valid_email_format(value)
    return value is None


def _set(item: SnapshotLead, field: str, value: Any, source: str) -> None:
    item.data[field] = value
    if field == "website":
        item.data["domain"] = normalize_domain(value)
    if item.original_data.get(field) == value:
        item.field_sources.pop(field, None)  # back to the captured value
    else:
        item.field_sources[field] = source
    flag_modified(item, "data")
    flag_modified(item, "field_sources")


def _select(snapshot: Snapshot, ids: list[int] | None) -> list[SnapshotLead]:
    if ids is None:
        return list(snapshot.leads)
    by_id = {item.id: item for item in snapshot.leads}
    unknown = [i for i in ids if i not in by_id]
    if unknown:
        raise ValidationError(f"These leads are not part of this snapshot: {unknown[:10]}.")
    return [by_id[i] for i in dict.fromkeys(ids)]


def enrich(db: Session, snapshot: Snapshot, ids: list[int] | None) -> dict[str, Any]:
    """Fill missing fields from the simulated provider. Existing values are
    never overwritten (the one exception is a malformed email)."""
    items = _select(snapshot, ids)
    domain_keys = {dedupe_key(i.data["company_name"], i.data.get("website"), i.data.get("state")) for i in items}
    name_keys = {_name_key(i.data) for i in items}
    records = list(
        db.scalars(
            select(EnrichmentRecord).where(
                or_(EnrichmentRecord.dedupe_key.in_(domain_keys), EnrichmentRecord.name_key.in_(name_keys))
            )
        )
    )
    by_domain = {r.dedupe_key: r for r in records}
    by_name = {r.name_key: r for r in records}

    now = datetime.now(UTC)
    result: dict[str, Any] = {
        "processed": len(items), "enriched": 0, "already_complete": 0, "emails_added": 0,
        "fields_filled": {}, "no_match": [],
    }
    for item in items:
        wanted = [field for field in ENRICHABLE_FIELDS if _needs(item.data, field)]
        if not wanted:
            result["already_complete"] += 1
            continue
        key = dedupe_key(item.data["company_name"], item.data.get("website"), item.data.get("state"))
        record = by_domain.get(key) or by_name.get(_name_key(item.data))
        had_email = contact_status(item.data) == "email_ready"
        filled = 0
        for field in wanted if record else []:
            value = clean(getattr(record, field))
            if value is None or (field == "email" and not is_valid_email_format(value)):
                continue
            _set(item, field, value, "simulated")
            result["fields_filled"][field] = result["fields_filled"].get(field, 0) + 1
            filled += 1
        if not filled:
            result["no_match"].append(
                {
                    "snapshot_lead_id": item.id,
                    "company_name": item.data["company_name"],
                    "reason": "No enrichment data found — needs manual research.",
                }
            )
            continue
        item.enriched_at = now
        result["enriched"] += 1
        if not had_email and contact_status(item.data) == "email_ready":
            result["emails_added"] += 1
    if result["enriched"]:
        snapshot.enriched_at = now
    db.flush()
    return result


def update_lead(db: Session, snapshot: Snapshot, snapshot_lead_id: int, payload: SnapshotLeadUpdate) -> SnapshotLead:
    """Manual enrichment: apply only the fields the client sent."""
    item = next((i for i in snapshot.leads if i.id == snapshot_lead_id), None)
    if item is None:
        raise NotFoundError(f"Lead {snapshot_lead_id} is not part of snapshot {snapshot.id}.")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise ValidationError("No fields to update.")
    changed = False
    for field, value in changes.items():
        if item.data.get(field) != value:
            _set(item, field, value, "manual")
            changed = True
    if changed:
        item.enriched_at = snapshot.enriched_at = datetime.now(UTC)
    db.flush()
    return item
