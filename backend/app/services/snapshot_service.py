from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.errors import ConflictError, NotFoundError, ValidationError
from app.models import LEAD_DATA_FIELDS, Lead, Snapshot, SnapshotLead
from app.schemas import SnapshotCreate
from app.services import quality
from app.services.lead_service import get_profile, lead_view


def _load_options():
    return (selectinload(Snapshot.leads).selectinload(SnapshotLead.draft), selectinload(Snapshot.drafts))


def get(db: Session, snapshot_id: int) -> Snapshot:
    snapshot = db.scalar(select(Snapshot).where(Snapshot.id == snapshot_id).options(*_load_options()))
    if snapshot is None:
        raise NotFoundError(f"Snapshot {snapshot_id} does not exist.")
    return snapshot


def list_all(db: Session) -> list[Snapshot]:
    return list(db.scalars(select(Snapshot).options(*_load_options()).order_by(Snapshot.created_at.desc(), Snapshot.id.desc())))


def create(db: Session, payload: SnapshotCreate) -> Snapshot:
    """Copy the selected leads, the search criteria and the target profile
    into a new snapshot, all in the request's transaction."""
    taken = db.scalar(select(Snapshot.id).where(func.lower(Snapshot.name) == payload.name.lower()))
    if taken:
        raise ConflictError(f'A snapshot named "{payload.name}" already exists. Choose a different name.')

    leads = {lead.id: lead for lead in db.scalars(select(Lead).where(Lead.id.in_(payload.lead_ids)))}
    missing = [lead_id for lead_id in payload.lead_ids if lead_id not in leads]
    if missing:
        raise ValidationError(f"These leads no longer exist: {missing[:10]}. Refresh and select again.")

    snapshot = Snapshot(
        name=payload.name,
        description=payload.description or None,
        criteria=payload.criteria.model_dump(exclude_defaults=True),
        profile=get_profile(db),
    )
    for position, lead_id in enumerate(payload.lead_ids):
        data = leads[lead_id].data()
        snapshot.leads.append(
            SnapshotLead(lead_id=lead_id, position=position, original_data=dict(data), data=dict(data))
        )
    db.add(snapshot)
    try:
        db.flush()
    except IntegrityError:  # lost a race on the unique name index
        db.rollback()
        raise ConflictError(f'A snapshot named "{payload.name}" already exists. Choose a different name.')
    return snapshot


def delete(db: Session, snapshot_id: int) -> None:
    db.delete(get(db, snapshot_id))
    db.flush()


def _data(raw: dict[str, Any]) -> dict[str, Any]:
    return {field: raw.get(field) for field in LEAD_DATA_FIELDS}


def lead_out(item: SnapshotLead, snapshot: Snapshot) -> dict[str, Any]:
    original = lead_view(_data(item.original_data), snapshot.profile)
    return {
        **lead_view(_data(item.data), snapshot.profile),
        "id": item.id,
        "snapshot_id": snapshot.id,
        "snapshot_name": snapshot.name,
        "lead_id": item.lead_id,
        "field_sources": item.field_sources or {},
        "enriched_at": item.enriched_at,
        "original": {
            "contact_status": original["contact_status"],
            "email": original["email"],
            "score": original["qualification"]["score"],
            "confidence_percent": original["confidence"]["percent"],
        },
        "has_draft": item.draft is not None,
    }


def summary(snapshot: Snapshot) -> dict[str, Any]:
    now = [quality.contact_status(item.data) for item in snapshot.leads]
    then = [quality.contact_status(item.original_data) for item in snapshot.leads]
    draft_count = len(snapshot.drafts)
    return {
        "id": snapshot.id,
        "name": snapshot.name,
        "description": snapshot.description,
        "criteria": snapshot.criteria,
        "profile": snapshot.profile,
        "created_at": snapshot.created_at,
        "enriched_at": snapshot.enriched_at,
        "stage": "drafted" if draft_count else "enriched" if snapshot.enriched_at else "raw",
        "lead_count": len(snapshot.leads),
        "email_ready": now.count("email_ready"),
        "email_ready_at_creation": then.count("email_ready"),
        "invalid_email": now.count("invalid_email"),
        "needs_enrichment": now.count("needs_enrichment"),
        "enriched_lead_count": sum(1 for item in snapshot.leads if item.enriched_at),
        "draft_count": draft_count,
    }


def detail(snapshot: Snapshot) -> dict[str, Any]:
    return {
        **summary(snapshot),
        "leads": [lead_out(item, snapshot) for item in snapshot.leads],
        "quality": quality.summarize([_data(item.data) for item in snapshot.leads]),
        "quality_at_creation": quality.summarize([_data(item.original_data) for item in snapshot.leads]),
    }
