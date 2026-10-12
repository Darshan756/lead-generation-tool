"""CSV generation. The standard ``csv`` module handles quoting of commas,
quotes and line breaks; a UTF-8 BOM is added so Excel opens it correctly."""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from typing import Any

DATA_NOTE = "Synthetic demo data — not verified"

LEAD_COLUMNS: list[tuple[str, str]] = [
    ("company_name", "Company"),
    ("industry", "Industry"),
    ("city", "City"),
    ("state", "State"),
    ("website", "Website"),
    ("email", "Email"),
    ("contact_status", "Contact readiness"),
    ("phone", "Phone"),
    ("owner_name", "Owner / contact"),
    ("owner_title", "Title"),
    ("revenue_usd", "Estimated revenue (USD)"),
    ("employee_count", "Employees"),
    ("score", "Qualification score"),
    ("priority", "Priority"),
    ("confidence_level", "Data confidence"),
    ("confidence_percent", "Data completeness %"),
    ("positives", "Positive signals"),
    ("negatives", "Negative signals"),
    ("review_items", "Needs review"),
    ("next_action", "Recommended next action"),
]

CONTACT_LABELS = {
    "email_ready": "Email present (format checked, not verified)",
    "invalid_email": "Email fails format check",
    "needs_enrichment": "No email — needs enrichment",
}

# Spreadsheet apps execute cells starting with these characters as formulas.
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        value = " | ".join(str(v) for v in value)
    if isinstance(value, str) and value.startswith(_FORMULA_PREFIXES):
        return "'" + value
    return value


def to_csv(headers: list[str], rows: list[list[Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows([[_cell(v) for v in row] for row in rows])
    return "﻿" + buffer.getvalue()


def lead_row(view: dict[str, Any]) -> dict[str, Any]:
    """Flatten an evaluated lead (see lead_service.lead_view) into CSV cells."""
    return {
        **view,
        "contact_status": CONTACT_LABELS[view["contact_status"]],
        "score": view["qualification"]["score"],
        "priority": view["qualification"]["priority"],
        "confidence_level": view["confidence"]["level"],
        "confidence_percent": view["confidence"]["percent"],
        "positives": view["qualification"]["positives"],
        "negatives": view["qualification"]["negatives"],
        "review_items": view["qualification"]["review_items"],
        "next_action": view["qualification"]["next_action"],
    }


def leads_csv(views: list[dict[str, Any]], extra: list[tuple[str, str]] | None = None) -> str:
    columns = LEAD_COLUMNS + (extra or []) + [("data_note", "Data note")]
    rows = []
    for view in views:
        flat = {**lead_row(view), "data_note": DATA_NOTE}
        rows.append([flat.get(key) for key, _ in columns])
    return to_csv([header for _, header in columns], rows)


def filename(prefix: str, label: str | None = None) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (label or "").lower()).strip("-")[:60]
    parts = ["boosta", prefix] + ([slug] if slug else []) + [date.today().isoformat()]
    return "-".join(parts) + ".csv"
