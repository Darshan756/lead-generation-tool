from __future__ import annotations

from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Lead, TargetProfile
from app.schemas import LeadFilters, LeadQuery
from app.schemas import TargetProfile as TargetProfileIn
from app.services import quality, scoring

_LEVEL_RANK = {"low": 0, "medium": 1, "high": 2}


def get_profile(db: Session) -> dict[str, Any]:
    row = db.get(TargetProfile, 1)
    if row is None:
        return {"industries": [], "states": [], "revenue_min": None, "revenue_max": None}
    return {
        "industries": list(row.industries),
        "states": list(row.states),
        "revenue_min": row.revenue_min,
        "revenue_max": row.revenue_max,
    }


def save_profile(db: Session, payload: TargetProfileIn) -> dict[str, Any]:
    row = db.get(TargetProfile, 1)
    if row is None:
        row = TargetProfile(id=1)
        db.add(row)
    row.industries = list(dict.fromkeys(i.strip() for i in payload.industries if i.strip()))
    row.states = list(dict.fromkeys(s.strip().upper() for s in payload.states if s.strip()))
    row.revenue_min = payload.revenue_min
    row.revenue_max = payload.revenue_max
    db.flush()
    return get_profile(db)


def lead_view(data: dict[str, Any], profile: dict[str, Any] | None) -> dict[str, Any]:
    """A lead's data together with everything derived from it."""
    return {
        **data,
        "contact_status": quality.contact_status(data),
        "confidence": quality.confidence(data),
        "qualification": scoring.evaluate(data, profile),
    }


def _lead_out(lead: Lead, profile: dict[str, Any]) -> dict[str, Any]:
    return {
        **lead_view(lead.data(), profile),
        "id": lead.id,
        "merged_duplicates": lead.merged_duplicates,
        "source": lead.source,
    }


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search(db: Session, query: LeadFilters | LeadQuery, profile: dict[str, Any]) -> list[dict[str, Any]]:
    """All leads matching the filters, sorted.

    Stored attributes are filtered in SQL. Score, priority and confidence are
    derived from the target profile, so they are computed and filtered here.
    That is fine for a demo-sized dataset; at scale they would be materialised.
    """
    stmt = select(Lead)
    if query.q:
        pattern = f"%{_escape_like(query.q)}%"
        stmt = stmt.where(
            or_(
                Lead.company_name.ilike(pattern, escape="\\"),
                Lead.industry.ilike(pattern, escape="\\"),
                Lead.domain.ilike(pattern, escape="\\"),
                Lead.city.ilike(pattern, escape="\\"),
                Lead.state.ilike(pattern, escape="\\"),
            )
        )
    if query.industries:
        stmt = stmt.where(Lead.industry.in_(query.industries))
    if query.states:
        stmt = stmt.where(Lead.state.in_(query.states))
    # A revenue bound can only be satisfied by a known revenue.
    if query.revenue_min is not None:
        stmt = stmt.where(Lead.revenue_usd >= query.revenue_min)
    if query.revenue_max is not None:
        stmt = stmt.where(Lead.revenue_usd <= query.revenue_max)

    views = [_lead_out(lead, profile) for lead in db.scalars(stmt)]
    if query.priorities:
        views = [v for v in views if v["qualification"]["priority"] in query.priorities]
    if query.confidences:
        views = [v for v in views if v["confidence"]["level"] in query.confidences]
    if query.contact_statuses:
        views = [v for v in views if v["contact_status"] in query.contact_statuses]

    sort_by = getattr(query, "sort_by", "score")
    descending = getattr(query, "sort_dir", "desc") == "desc"

    def value(view: dict[str, Any]) -> Any:
        if sort_by == "score":
            return view["qualification"]["score"]
        if sort_by == "confidence":
            return view["confidence"]["percent"]
        raw = view[sort_by]
        return raw.lower() if isinstance(raw, str) else raw

    # Stable, deterministic order: name is the tiebreaker, missing values last.
    views.sort(key=lambda v: v["company_name"].lower())
    known = [v for v in views if value(v) is not None]
    unknown = [v for v in views if value(v) is None]
    known.sort(key=value, reverse=descending)
    return known + unknown


def get_many(db: Session, lead_ids: list[int], profile: dict[str, Any]) -> list[dict[str, Any]]:
    leads = {lead.id: lead for lead in db.scalars(select(Lead).where(Lead.id.in_(lead_ids)))}
    return [_lead_out(leads[i], profile) for i in lead_ids if i in leads]


def facets(db: Session) -> dict[str, Any]:
    def counts(column: Any) -> list[dict[str, Any]]:
        rows = db.execute(
            select(column, func.count()).where(column.is_not(None)).group_by(column).order_by(column)
        )
        return [{"value": value, "count": count} for value, count in rows]

    low, high = db.execute(select(func.min(Lead.revenue_usd), func.max(Lead.revenue_usd))).one()
    return {
        "industries": counts(Lead.industry),
        "states": counts(Lead.state),
        "revenue_min": low,
        "revenue_max": high,
    }


def data_quality(db: Session) -> dict[str, Any]:
    leads = list(db.scalars(select(Lead)))
    return quality.summarize(
        [lead.data() for lead in leads], duplicates_merged=sum(lead.merged_duplicates for lead in leads)
    )
