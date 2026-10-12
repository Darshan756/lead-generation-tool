from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app import schemas
from app.db.session import get_db
from app.errors import NotFoundError
from app.services import csv_export, file_import, import_service, lead_service, scoring

router = APIRouter(tags=["leads"])
Db = Annotated[Session, Depends(get_db)]


def _profile_out(profile: dict) -> dict:
    config = scoring.DEFAULT_CONFIG
    return {
        **profile,
        "configured": scoring.profile_is_configured(profile),
        "weights": config.weights,
        "high_threshold": config.high_threshold,
        "medium_threshold": config.medium_threshold,
    }


@router.get("/leads", response_model=schemas.LeadPage)
def list_leads(query: Annotated[schemas.LeadQuery, Query()], db: Db):
    profile = lead_service.get_profile(db)
    views = lead_service.search(db, query, profile)
    start = (query.page - 1) * query.page_size
    return {
        "items": views[start : start + query.page_size],
        "total": len(views),
        "page": query.page,
        "page_size": query.page_size,
        "matching_ids": [v["id"] for v in views],
        "profile_configured": scoring.profile_is_configured(profile),
    }


@router.get("/leads/facets", response_model=schemas.LeadFacets)
def lead_facets(db: Db):
    return lead_service.facets(db)


@router.post("/leads/import", response_model=schemas.ImportResult)
def import_leads(db: Db, file: Annotated[UploadFile, File(description="Excel (.xlsx) or CSV file with a header row")]):
    """Add leads from a spreadsheet. Rows that match an existing company
    (same domain, or same name and state) are merged, not duplicated."""
    # Read one byte past the limit so an oversized file is detected without loading it all.
    content = file.file.read(file_import.MAX_FILE_BYTES + 1)
    records, skipped = file_import.parse(file.filename or "", content)
    stats = import_service.import_leads(db, records, source="file_import")
    return {
        "filename": file.filename or "upload",
        "rows_read": len(records) + len(skipped),
        "inserted": stats["inserted"],
        "duplicates_merged": stats["duplicates_merged"],
        "skipped": skipped,
    }


@router.post("/leads/export")
def export_leads(payload: schemas.LeadExportRequest, db: Db):
    views = lead_service.get_many(db, payload.lead_ids, lead_service.get_profile(db))
    if not views:
        raise NotFoundError("None of the selected leads exist.")
    return Response(
        content=csv_export.leads_csv(views),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{csv_export.filename("leads")}"'},
    )


@router.get("/target-profile", response_model=schemas.TargetProfileOut)
def get_target_profile(db: Db):
    return _profile_out(lead_service.get_profile(db))


@router.put("/target-profile", response_model=schemas.TargetProfileOut)
def put_target_profile(payload: schemas.TargetProfile, db: Db):
    return _profile_out(lead_service.save_profile(db, payload))


@router.get("/data-quality", response_model=schemas.DataQuality)
def get_data_quality(db: Db):
    return lead_service.data_quality(db)
