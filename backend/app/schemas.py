from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.quality import is_valid_email_format

Priority = Literal["high", "medium", "low", "unscored"]
ConfidenceLevel = Literal["high", "medium", "low"]
ContactStatus = Literal["email_ready", "invalid_email", "needs_enrichment"]
SortField = Literal["score", "company_name", "industry", "state", "revenue_usd", "employee_count", "confidence"]


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


# --- Qualification -----------------------------------------------------------


class Signal(BaseModel):
    key: str
    label: str
    status: Literal["matched", "not_matched", "missing", "not_configured"]
    points: int
    max_points: int
    detail: str


class Qualification(BaseModel):
    score: int | None
    priority: Priority
    signals: list[Signal]
    positives: list[str]
    negatives: list[str]
    review_items: list[str]
    next_action: str


class Confidence(BaseModel):
    level: ConfidenceLevel
    percent: int
    missing_fields: list[str]


class TargetProfile(BaseModel):
    industries: list[str] = Field(default_factory=list, max_length=50)
    states: list[str] = Field(default_factory=list, max_length=60)
    revenue_min: int | None = Field(default=None, ge=0)
    revenue_max: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def _range_is_ordered(self) -> TargetProfile:
        if self.revenue_min is not None and self.revenue_max is not None and self.revenue_min > self.revenue_max:
            raise ValueError("revenue_min must be less than or equal to revenue_max")
        return self


class TargetProfileOut(TargetProfile):
    configured: bool
    weights: dict[str, int]
    high_threshold: int
    medium_threshold: int


# --- Leads -------------------------------------------------------------------


class LeadData(BaseModel):
    company_name: str
    industry: str | None = None
    city: str | None = None
    state: str | None = None
    website: str | None = None
    domain: str | None = None
    email: str | None = None
    phone: str | None = None
    revenue_usd: int | None = None
    employee_count: int | None = None
    owner_name: str | None = None
    owner_title: str | None = None
    founded_year: int | None = None


class LeadOut(LeadData):
    id: int
    merged_duplicates: int
    source: str
    contact_status: ContactStatus
    confidence: Confidence
    qualification: Qualification


class LeadFilters(BaseModel):
    """Search and filter parameters. Also stored verbatim as snapshot criteria."""

    model_config = ConfigDict(extra="forbid")

    q: str | None = Field(default=None, max_length=100)
    industries: list[str] = Field(default_factory=list, max_length=50)
    states: list[str] = Field(default_factory=list, max_length=60)
    revenue_min: int | None = Field(default=None, ge=0)
    revenue_max: int | None = Field(default=None, ge=0)
    priorities: list[Priority] = Field(default_factory=list)
    confidences: list[ConfidenceLevel] = Field(default_factory=list)
    contact_statuses: list[ContactStatus] = Field(default_factory=list)

    @field_validator("q", mode="before")
    @classmethod
    def _clean_q(cls, value: Any) -> Any:
        return _blank_to_none(value)

    @model_validator(mode="after")
    def _range_is_ordered(self) -> LeadFilters:
        if self.revenue_min is not None and self.revenue_max is not None and self.revenue_min > self.revenue_max:
            raise ValueError("revenue_min must be less than or equal to revenue_max")
        return self


class LeadQuery(LeadFilters):
    sort_by: SortField = "score"
    sort_dir: Literal["asc", "desc"] = "desc"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)


class LeadPage(BaseModel):
    items: list[LeadOut]
    total: int
    page: int
    page_size: int
    # Ids of every lead matching the filters, so the UI can offer
    # "select all N matching" without fetching every page.
    matching_ids: list[int]
    profile_configured: bool


class FacetValue(BaseModel):
    value: str
    count: int


class LeadFacets(BaseModel):
    industries: list[FacetValue]
    states: list[FacetValue]
    revenue_min: int | None
    revenue_max: int | None


class LeadExportRequest(BaseModel):
    lead_ids: list[int] = Field(min_length=1, max_length=5000)


class DataQuality(BaseModel):
    total: int
    email_format_valid: int
    email_invalid_format: int
    email_missing: int
    website_missing: int
    phone_missing: int
    revenue_missing: int
    owner_missing: int
    incomplete_key_info: int
    needs_manual_review: int
    duplicates_merged: int
    verified: int


# --- Snapshots ---------------------------------------------------------------


class SnapshotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    lead_ids: list[int] = Field(min_length=1, max_length=5000)
    criteria: LeadFilters = Field(default_factory=LeadFilters)

    @field_validator("name", "description", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("lead_ids")
    @classmethod
    def _unique(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class SnapshotSummary(BaseModel):
    id: int
    name: str
    description: str | None
    criteria: dict[str, Any]
    profile: dict[str, Any]
    created_at: datetime
    enriched_at: datetime | None
    stage: Literal["raw", "enriched", "drafted"]
    lead_count: int
    email_ready: int
    email_ready_at_creation: int
    invalid_email: int
    needs_enrichment: int
    enriched_lead_count: int
    draft_count: int


class OriginalState(BaseModel):
    contact_status: ContactStatus
    email: str | None
    score: int | None
    confidence_percent: int


class SnapshotLeadOut(LeadData):
    id: int
    snapshot_id: int
    snapshot_name: str
    lead_id: int | None
    contact_status: ContactStatus
    confidence: Confidence
    qualification: Qualification
    field_sources: dict[str, Literal["simulated", "manual"]]
    enriched_at: datetime | None
    original: OriginalState
    has_draft: bool


class SnapshotDetail(SnapshotSummary):
    leads: list[SnapshotLeadOut]
    quality: DataQuality
    quality_at_creation: DataQuality


class EnrichRequest(BaseModel):
    # Omit to enrich every lead in the snapshot.
    snapshot_lead_ids: list[int] | None = Field(default=None, min_length=1, max_length=5000)


class NamedItem(BaseModel):
    snapshot_lead_id: int
    company_name: str
    reason: str


class EnrichResult(BaseModel):
    processed: int
    enriched: int
    already_complete: int
    emails_added: int
    fields_filled: dict[str, int]
    no_match: list[NamedItem]
    snapshot: SnapshotDetail


class SnapshotLeadUpdate(BaseModel):
    """Manual enrichment. Only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    website: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=254)
    phone: str | None = Field(default=None, max_length=50)
    owner_name: str | None = Field(default=None, max_length=150)
    owner_title: str | None = Field(default=None, max_length=100)
    revenue_usd: int | None = Field(default=None, ge=0)
    employee_count: int | None = Field(default=None, ge=0)

    @field_validator("website", "email", "phone", "owner_name", "owner_title", mode="before")
    @classmethod
    def _clean(cls, value: Any) -> Any:
        return _blank_to_none(value)

    @field_validator("email")
    @classmethod
    def _email_format(cls, value: str | None) -> str | None:
        if value is not None and not is_valid_email_format(value):
            raise ValueError("is not a valid email format")
        return value


# --- Outreach ----------------------------------------------------------------


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("name", "subject", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value


class TemplateOut(TemplateIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class TemplateVariable(BaseModel):
    name: str
    description: str
    fallback: str


class PreviewRequest(BaseModel):
    snapshot_lead_id: int
    subject: str = Field(max_length=300)
    body: str = Field(max_length=10000)


class PreviewOut(BaseModel):
    to_email: str | None
    subject: str
    body: str
    fallbacks_used: list[str]
    unknown_variables: list[str]


class GenerateRequest(BaseModel):
    snapshot_lead_ids: list[int] = Field(min_length=1, max_length=5000)
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=10000)
    template_id: int | None = None
    # When false, leads that already have a draft are skipped, not overwritten.
    overwrite: bool = False

    @field_validator("subject", "body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class DraftOut(BaseModel):
    id: int
    snapshot_id: int
    snapshot_name: str
    snapshot_lead_id: int
    company_name: str
    industry: str | None
    owner_name: str | None
    to_email: str
    subject: str
    body: str
    created_at: datetime
    updated_at: datetime


class GenerateResult(BaseModel):
    requested: int
    created: int
    updated: int
    skipped: list[NamedItem]
    unknown_variables: list[str]
    drafts: list[DraftOut]


class DraftUpdate(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("subject", "body")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value
