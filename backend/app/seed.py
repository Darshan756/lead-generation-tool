"""Load the synthetic demonstration dataset.

    python -m app.seed            # load if the database is empty
    python -m app.seed --reset    # wipe everything and reload
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models import EnrichmentRecord, Lead, OutreachDraft, OutreachTemplate, Snapshot, SnapshotLead, TargetProfile
from app.services.import_service import import_enrichment, import_leads

DATA_DIR = Path(__file__).parent / "data"

# A starting target profile so the demo opens with meaningful scores.
# It is fully editable (and clearable) in the app.
DEMO_PROFILE = {
    "industries": ["Software Development", "IT Services"],
    "states": ["CA", "TX", "NY"],
    "revenue_min": 1_000_000,
    "revenue_max": 20_000_000,
}


def _load(name: str) -> list[dict]:
    return json.loads((DATA_DIR / name).read_text())


def seed(db: Session, reset: bool = False) -> dict[str, int]:
    if reset:
        for model in (OutreachDraft, SnapshotLead, Snapshot, OutreachTemplate, EnrichmentRecord, Lead, TargetProfile):
            db.execute(delete(model))
    elif db.scalar(select(func.count()).select_from(Lead)):
        return {"skipped": 1}

    stats = import_leads(db, _load("sample-leads.json"))
    stats["enrichment_records"] = import_enrichment(db, _load("sample-enrichment.json"))
    if not db.scalar(select(func.count()).select_from(OutreachTemplate)):
        db.add_all(OutreachTemplate(**template) for template in _load("sample-templates.json"))
    if db.get(TargetProfile, 1) is None:
        db.add(TargetProfile(id=1, **DEMO_PROFILE))
    db.commit()
    return stats


if __name__ == "__main__":
    with SessionLocal() as session:
        result = seed(session, reset="--reset" in sys.argv)
    if result.get("skipped"):
        print("Database already has leads; nothing to do. Use --reset to reload.")
    else:
        print(f"Seeded synthetic demo data: {result}")
