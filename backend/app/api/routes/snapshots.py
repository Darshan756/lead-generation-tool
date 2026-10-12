from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app import schemas
from app.db.session import get_db
from app.services import csv_export, enrichment_service, snapshot_service

router = APIRouter(prefix="/snapshots", tags=["snapshots"])
Db = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[schemas.SnapshotSummary])
def list_snapshots(db: Db):
    return [snapshot_service.summary(s) for s in snapshot_service.list_all(db)]


@router.post("", response_model=schemas.SnapshotDetail, status_code=status.HTTP_201_CREATED)
def create_snapshot(payload: schemas.SnapshotCreate, db: Db):
    snapshot = snapshot_service.create(db, payload)
    return snapshot_service.detail(snapshot_service.get(db, snapshot.id))


@router.get("/{snapshot_id}", response_model=schemas.SnapshotDetail)
def get_snapshot(snapshot_id: int, db: Db):
    return snapshot_service.detail(snapshot_service.get(db, snapshot_id))


@router.delete("/{snapshot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_snapshot(snapshot_id: int, db: Db):
    snapshot_service.delete(db, snapshot_id)


@router.post("/{snapshot_id}/enrich", response_model=schemas.EnrichResult)
def enrich_snapshot(snapshot_id: int, db: Db, payload: schemas.EnrichRequest | None = None):
    snapshot = snapshot_service.get(db, snapshot_id)
    result = enrichment_service.enrich(db, snapshot, payload.snapshot_lead_ids if payload else None)
    return {**result, "snapshot": snapshot_service.detail(snapshot)}


@router.patch("/{snapshot_id}/leads/{snapshot_lead_id}", response_model=schemas.SnapshotLeadOut)
def update_snapshot_lead(snapshot_id: int, snapshot_lead_id: int, payload: schemas.SnapshotLeadUpdate, db: Db):
    snapshot = snapshot_service.get(db, snapshot_id)
    item = enrichment_service.update_lead(db, snapshot, snapshot_lead_id, payload)
    return snapshot_service.lead_out(item, snapshot)


@router.get("/{snapshot_id}/export")
def export_snapshot(snapshot_id: int, db: Db):
    snapshot = snapshot_service.get(db, snapshot_id)
    views = []
    for view in snapshot_service.detail(snapshot)["leads"]:
        sources = view["field_sources"]
        views.append(
            {
                **view,
                "snapshot_created": snapshot.created_at.date().isoformat(),
                "enriched_fields": [f"{name} ({source})" for name, source in sorted(sources.items())],
            }
        )
    extra = [
        ("snapshot_name", "Snapshot"),
        ("snapshot_created", "Snapshot created"),
        ("enriched_fields", "Fields changed by enrichment"),
    ]
    return Response(
        content=csv_export.leads_csv(views, extra),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{csv_export.filename("snapshot", snapshot.name)}"'
        },
    )
