from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app import schemas
from app.db.session import get_db
from app.errors import NotFoundError
from app.services import csv_export, outreach_service

router = APIRouter(prefix="/outreach", tags=["outreach"])
Db = Annotated[Session, Depends(get_db)]


@router.get("/variables", response_model=list[schemas.TemplateVariable])
def list_variables():
    return [
        {"name": name, "description": description, "fallback": fallback}
        for name, (description, fallback) in outreach_service.VARIABLES.items()
    ]


@router.get("/templates", response_model=list[schemas.TemplateOut])
def list_templates(db: Db):
    return outreach_service.list_templates(db)


@router.post("/templates", response_model=schemas.TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(payload: schemas.TemplateIn, db: Db):
    return outreach_service.create_template(db, payload)


@router.put("/templates/{template_id}", response_model=schemas.TemplateOut)
def update_template(template_id: int, payload: schemas.TemplateIn, db: Db):
    return outreach_service.update_template(db, template_id, payload)


@router.post("/preview", response_model=schemas.PreviewOut)
def preview(payload: schemas.PreviewRequest, db: Db):
    return outreach_service.preview(db, payload.snapshot_lead_id, payload.subject, payload.body)


@router.post("/drafts/generate", response_model=schemas.GenerateResult)
def generate_drafts(payload: schemas.GenerateRequest, db: Db):
    return outreach_service.generate(db, payload)


@router.get("/drafts", response_model=list[schemas.DraftOut])
def list_drafts(db: Db, snapshot_id: int | None = None):
    return [outreach_service.draft_out(d) for d in outreach_service.list_drafts(db, snapshot_id)]


@router.post("/drafts/send", response_model=schemas.SendResult)
def send_drafts(payload: schemas.SendRequest, db: Db):
    """Simulated send: records the drafts as sent. No email is delivered."""
    return outreach_service.send_drafts(db, payload.draft_ids)


@router.get("/drafts/export")
def export_drafts(
    db: Db,
    snapshot_id: int | None = None,
    ids: Annotated[list[int] | None, Query(max_length=5000)] = None,
):
    drafts = outreach_service.list_drafts(db, snapshot_id, ids)
    if not drafts:
        raise NotFoundError("There are no drafts to export.")
    return Response(
        content=outreach_service.drafts_csv(drafts),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{csv_export.filename("outreach-drafts")}"'},
    )


@router.patch("/drafts/{draft_id}", response_model=schemas.DraftOut)
def update_draft(draft_id: int, payload: schemas.DraftUpdate, db: Db):
    return outreach_service.draft_out(outreach_service.update_draft(db, draft_id, payload))


@router.delete("/drafts/{draft_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_draft(draft_id: int, db: Db):
    outreach_service.delete_draft(db, draft_id)
