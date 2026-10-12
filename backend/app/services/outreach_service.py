"""Outreach drafts generated from templates. Nothing is ever sent."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import ConflictError, NotFoundError, ValidationError
from app.models import OutreachDraft, OutreachTemplate, Snapshot, SnapshotLead
from app.schemas import DraftUpdate, GenerateRequest, TemplateIn
from app.services import csv_export
from app.services.quality import clean, contact_status

_VARIABLE_RE = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}")
# Anything brace-wrapped that survives substitution (e.g. "{{ }}", "{{a b}}").
_LEFTOVER_RE = re.compile(r"\{\{.*?\}\}", re.DOTALL)

# name -> (description, fallback used when the record has no value)
VARIABLES: dict[str, tuple[str, str]] = {
    "company_name": ("Company name", "your company"),
    "industry": ("Industry", "your industry"),
    "location": ("City and state", "your area"),
    "website": ("Website domain", "your website"),
    "owner_name": ("Contact's full name", "there"),
    "owner_first_name": ("Contact's first name", "there"),
}

SKIP_REASONS = {
    "needs_enrichment": "No email address — enrich this lead first.",
    "invalid_email": "Email fails the format check — correct it first.",
}


def _values(data: dict[str, Any]) -> dict[str, str | None]:
    owner = clean(data.get("owner_name"))
    city, state = clean(data.get("city")), clean(data.get("state"))
    return {
        "company_name": clean(data.get("company_name")),
        "industry": clean(data.get("industry")),
        "location": ", ".join(part for part in (city, state) if part) or None,
        "website": clean(data.get("domain")) or clean(data.get("website")),
        "owner_name": owner,
        "owner_first_name": owner.split()[0] if owner else None,
    }


def render(text: str, data: dict[str, Any]) -> tuple[str, list[str], list[str]]:
    """Substitute template variables using only what the record contains.

    Returns (text, fallbacks_used, unknown_variables). A known variable with
    no value becomes a neutral fallback; an unknown variable is removed. The
    result never contains ``{{ }}``.
    """
    values = _values(data)
    fallbacks: list[str] = []
    unknown: list[str] = []

    def substitute(match: re.Match[str]) -> str:
        name = match.group(1).lower()
        if name not in VARIABLES:
            if name not in unknown:
                unknown.append(name)
            return ""
        value = values[name]
        if value is None:
            if name not in fallbacks:
                fallbacks.append(name)
            return VARIABLES[name][1]
        return value

    rendered = _LEFTOVER_RE.sub("", _VARIABLE_RE.sub(substitute, text))
    # Tidy the gaps left by removed variables without touching line breaks.
    rendered = re.sub(r"[ \t]{2,}", " ", rendered)
    rendered = re.sub(r"[ \t]+([,.!?;:])", r"\1", rendered)
    rendered = "\n".join(line.rstrip() for line in rendered.splitlines())
    return rendered.strip(), fallbacks, unknown


# --- templates ---------------------------------------------------------------


def list_templates(db: Session) -> list[OutreachTemplate]:
    return list(db.scalars(select(OutreachTemplate).order_by(OutreachTemplate.id)))


def _name_taken(db: Session, name: str, except_id: int | None = None) -> bool:
    stmt = select(OutreachTemplate.id).where(OutreachTemplate.name == name)
    if except_id is not None:
        stmt = stmt.where(OutreachTemplate.id != except_id)
    return db.scalar(stmt) is not None


def create_template(db: Session, payload: TemplateIn) -> OutreachTemplate:
    if _name_taken(db, payload.name):
        raise ConflictError(f'A template named "{payload.name}" already exists.')
    template = OutreachTemplate(**payload.model_dump())
    db.add(template)
    db.flush()
    return template


def update_template(db: Session, template_id: int, payload: TemplateIn) -> OutreachTemplate:
    template = db.get(OutreachTemplate, template_id)
    if template is None:
        raise NotFoundError(f"Template {template_id} does not exist.")
    if _name_taken(db, payload.name, except_id=template_id):
        raise ConflictError(f'A template named "{payload.name}" already exists.')
    template.name, template.subject, template.body = payload.name, payload.subject, payload.body
    db.flush()
    return template


# --- drafts ------------------------------------------------------------------


def _snapshot_leads(db: Session, ids: list[int]) -> list[SnapshotLead]:
    ids = list(dict.fromkeys(ids))
    stmt = (
        select(SnapshotLead)
        .where(SnapshotLead.id.in_(ids))
        .options(selectinload(SnapshotLead.snapshot), selectinload(SnapshotLead.draft))
    )
    found = {item.id: item for item in db.scalars(stmt)}
    missing = [i for i in ids if i not in found]
    if missing:
        raise ValidationError(f"These snapshot leads do not exist: {missing[:10]}.")
    return [found[i] for i in ids]


def preview(db: Session, snapshot_lead_id: int, subject: str, body: str) -> dict[str, Any]:
    item = db.get(SnapshotLead, snapshot_lead_id)
    if item is None:
        raise NotFoundError(f"Snapshot lead {snapshot_lead_id} does not exist.")
    rendered_subject, f1, u1 = render(subject, item.data)
    rendered_body, f2, u2 = render(body, item.data)
    return {
        "to_email": clean(item.data.get("email")) if contact_status(item.data) == "email_ready" else None,
        "subject": rendered_subject,
        "body": rendered_body,
        "fallbacks_used": list(dict.fromkeys(f1 + f2)),
        "unknown_variables": list(dict.fromkeys(u1 + u2)),
    }


def generate(db: Session, payload: GenerateRequest) -> dict[str, Any]:
    """Create one draft per eligible lead and report exactly what happened to
    every requested lead."""
    if payload.template_id is not None and db.get(OutreachTemplate, payload.template_id) is None:
        raise NotFoundError(f"Template {payload.template_id} does not exist.")
    items = _snapshot_leads(db, payload.snapshot_lead_ids)

    created = updated = 0
    skipped: list[dict[str, Any]] = []
    unknown: list[str] = []
    drafts: list[OutreachDraft] = []

    def skip(item: SnapshotLead, reason: str) -> None:
        skipped.append({"snapshot_lead_id": item.id, "company_name": item.data["company_name"], "reason": reason})

    for item in items:
        status = contact_status(item.data)
        if status != "email_ready":
            skip(item, SKIP_REASONS[status])
            continue
        if item.draft is not None and not payload.overwrite:
            skip(item, "A draft already exists — choose “replace existing drafts” to regenerate it.")
            continue
        subject, _, u1 = render(payload.subject, item.data)
        body, _, u2 = render(payload.body, item.data)
        unknown += [name for name in u1 + u2 if name not in unknown]
        if not subject or not body:
            skip(item, "The template produced an empty subject or message for this lead.")
            continue
        if item.draft is None:
            item.draft = OutreachDraft(snapshot_id=item.snapshot_id)
            created += 1
        else:
            updated += 1
        draft = item.draft
        draft.template_id = payload.template_id
        draft.to_email = clean(item.data["email"])
        draft.subject = subject[:300]
        draft.body = body
        drafts.append(draft)
    db.flush()
    for draft in drafts:
        db.refresh(draft)
    return {
        "requested": len(items),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "unknown_variables": unknown,
        "drafts": [draft_out(d) for d in drafts],
    }


def draft_out(draft: OutreachDraft) -> dict[str, Any]:
    data = draft.snapshot_lead.data
    return {
        "id": draft.id,
        "snapshot_id": draft.snapshot_id,
        "snapshot_name": draft.snapshot_lead.snapshot.name,
        "snapshot_lead_id": draft.snapshot_lead_id,
        "company_name": data["company_name"],
        "industry": data.get("industry"),
        "owner_name": data.get("owner_name"),
        "to_email": draft.to_email,
        "subject": draft.subject,
        "body": draft.body,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def _draft_query():
    return select(OutreachDraft).options(
        selectinload(OutreachDraft.snapshot_lead).selectinload(SnapshotLead.snapshot)
    )


def list_drafts(db: Session, snapshot_id: int | None = None, ids: list[int] | None = None) -> list[OutreachDraft]:
    stmt = _draft_query().order_by(OutreachDraft.snapshot_id.desc(), OutreachDraft.id)
    if snapshot_id is not None:
        if db.get(Snapshot, snapshot_id) is None:
            raise NotFoundError(f"Snapshot {snapshot_id} does not exist.")
        stmt = stmt.where(OutreachDraft.snapshot_id == snapshot_id)
    if ids:
        stmt = stmt.where(OutreachDraft.id.in_(ids))
    return list(db.scalars(stmt))


def get_draft(db: Session, draft_id: int) -> OutreachDraft:
    draft = db.scalar(_draft_query().where(OutreachDraft.id == draft_id))
    if draft is None:
        raise NotFoundError(f"Draft {draft_id} does not exist.")
    return draft


def update_draft(db: Session, draft_id: int, payload: DraftUpdate) -> OutreachDraft:
    draft = get_draft(db, draft_id)
    if _LEFTOVER_RE.search(payload.subject) or _LEFTOVER_RE.search(payload.body):
        raise ValidationError("Remove the unresolved {{variables}} before saving this draft.")
    draft.subject, draft.body = payload.subject.strip(), payload.body.strip()
    db.flush()
    db.refresh(draft)
    return draft


def delete_draft(db: Session, draft_id: int) -> None:
    db.delete(get_draft(db, draft_id))
    db.flush()


def drafts_csv(drafts: list[OutreachDraft]) -> str:
    headers = ["Company", "Industry", "Contact", "To", "Subject", "Message", "Snapshot", "Status", "Data note"]
    rows = []
    for draft in drafts:
        out = draft_out(draft)
        rows.append(
            [
                out["company_name"], out["industry"], out["owner_name"], out["to_email"], out["subject"],
                out["body"], out["snapshot_name"], "Draft — not sent", csv_export.DATA_NOTE,
            ]
        )
    return csv_export.to_csv(headers, rows)
