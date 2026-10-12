"""Read lead records from an uploaded Excel (.xlsx) or CSV file.

The first row must be a header row. Column names are matched loosely
("Company name", "company_name" and "Company" are all accepted), unknown
columns are ignored, and every row is validated on its own so one bad row
never blocks the rest of the file.
"""

from __future__ import annotations

import csv
import io
import re
from typing import Any

from openpyxl import load_workbook
from pydantic import ValidationError as PydanticValidationError

from app.errors import ValidationError
from app.services.import_service import RawLead

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 5000

# normalised header -> lead field
_ALIASES: dict[str, str] = {
    "companyname": "company_name", "company": "company_name", "name": "company_name", "business": "company_name",
    "industry": "industry", "category": "industry",
    "city": "city",
    "state": "state",
    "website": "website", "url": "website", "domain": "website",
    "email": "email", "businessemail": "email",
    "phone": "phone", "phonenumber": "phone",
    "revenueusd": "revenue_usd", "revenue": "revenue_usd", "estimatedrevenue": "revenue_usd",
    "estimatedrevenueusd": "revenue_usd", "estrevenue": "revenue_usd",
    "employees": "employee_count", "employeecount": "employee_count", "companysize": "employee_count",
    "ownername": "owner_name", "owner": "owner_name", "contact": "owner_name", "contactname": "owner_name",
    "ownercontact": "owner_name",
    "ownertitle": "owner_title", "title": "owner_title", "contacttitle": "owner_title",
    "founded": "founded_year", "foundedyear": "founded_year",
}
_NUMERIC = {"revenue_usd": "Revenue", "employee_count": "Employees", "founded_year": "Founded year"}
_LABELS = {"company_name": "Company name", **_NUMERIC}


def _normalise_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def _read_rows(filename: str, content: bytes) -> list[list[Any]]:
    name = filename.lower()
    if name.endswith(".xlsx"):
        try:
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            sheet = workbook.worksheets[0]
            return [list(row) for row in sheet.iter_rows(values_only=True)]
        except Exception as exc:  # openpyxl raises many types for corrupt files
            raise ValidationError("This file could not be read as an Excel workbook. Save it as .xlsx and try again.") from exc
    if name.endswith(".csv"):
        try:
            text = content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValidationError("This CSV is not UTF-8 encoded. Re-save it as “CSV UTF-8” and try again.") from exc
        return [row for row in csv.reader(io.StringIO(text))]
    raise ValidationError("Unsupported file type. Upload an Excel (.xlsx) or CSV (.csv) file.")


def _to_int(value: Any, label: str) -> int | None:
    """Accept 5000000, 5000000.0, "5,000,000" and "$5,000,000"."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = re.sub(r"[$,\s]", "", str(value))
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            raise ValueError(f"{label} “{value}” is not a number") from None
    if number != number or number < 0 or number != int(number):
        raise ValueError(f"{label} “{value}” must be a whole, non-negative number")
    return int(number)


def parse(filename: str, content: bytes) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (valid lead records, skipped rows). Row numbers match the file,
    counting the header as row 1."""
    if len(content) > MAX_FILE_BYTES:
        raise ValidationError("The file is larger than 5 MB. Split it into smaller files.")
    rows = _read_rows(filename, content)
    # Drop fully empty rows at the top so a blank first line is tolerated.
    while rows and not any(str(cell or "").strip() for cell in rows[0]):
        rows.pop(0)
    if not rows:
        raise ValidationError("The file is empty.")

    columns = {index: _ALIASES[key] for index, cell in enumerate(rows[0]) if (key := _normalise_header(cell)) in _ALIASES}
    if "company_name" not in columns.values():
        raise ValidationError("No “Company name” column found. The first row must contain column headers.")
    body = rows[1:]
    if len(body) > MAX_ROWS:
        raise ValidationError(f"The file has more than {MAX_ROWS:,} rows. Split it into smaller files.")

    records: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for offset, row in enumerate(body):
        if not any(str(cell or "").strip() for cell in row):
            continue  # blank line
        row_number = offset + 2
        record: dict[str, Any] = {}
        try:
            for index, field in columns.items():
                if field in record and record[field] not in (None, ""):
                    continue  # two columns map to one field: first non-empty wins
                value = row[index] if index < len(row) else None
                if field in _NUMERIC:
                    record[field] = _to_int(value, _NUMERIC[field])
                else:
                    record[field] = None if value is None else str(value).strip() or None
            if not record.get("company_name"):
                raise ValueError("Company name is missing")
            records.append(RawLead.model_validate(record).model_dump())
        except PydanticValidationError as exc:
            issue = exc.errors()[0]
            field = _LABELS.get(str(issue["loc"][0]), str(issue["loc"][0]))
            skipped.append({"row": row_number, "reason": f"{field}: {issue['msg']}"})
        except ValueError as exc:
            skipped.append({"row": row_number, "reason": str(exc)})
    return records, skipped
