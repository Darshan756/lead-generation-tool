from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# The lead attributes that are copied into a snapshot and can be enriched.
LEAD_DATA_FIELDS: tuple[str, ...] = (
    "company_name",
    "industry",
    "city",
    "state",
    "website",
    "domain",
    "email",
    "phone",
    "revenue_usd",
    "employee_count",
    "owner_name",
    "owner_title",
    "founded_year",
)


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint("revenue_usd IS NULL OR revenue_usd >= 0", name="revenue_non_negative"),
        CheckConstraint("employee_count IS NULL OR employee_count >= 0", name="employees_non_negative"),
        CheckConstraint("merged_duplicates >= 0", name="merged_duplicates_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Normalised identity (domain, or name+state when there is no website).
    # The unique constraint is what guarantees deduplication.
    dedupe_key: Mapped[str] = mapped_column(String(255), unique=True)
    company_name: Mapped[str] = mapped_column(String(200), index=True)
    industry: Mapped[str | None] = mapped_column(String(100), index=True)
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(50), index=True)
    website: Mapped[str | None] = mapped_column(String(255))
    domain: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    revenue_usd: Mapped[int | None] = mapped_column(BigInteger, index=True)
    employee_count: Mapped[int | None] = mapped_column(Integer)
    owner_name: Mapped[str | None] = mapped_column(String(150))
    owner_title: Mapped[str | None] = mapped_column(String(100))
    founded_year: Mapped[int | None] = mapped_column(Integer)
    # How many raw records were folded into this one during import.
    merged_duplicates: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    source: Mapped[str] = mapped_column(String(50), default="synthetic_demo", server_default="synthetic_demo")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    def data(self) -> dict[str, Any]:
        return {field: getattr(self, field) for field in LEAD_DATA_FIELDS}


class EnrichmentRecord(Base):
    """Synthetic stand-in for a third-party enrichment provider."""

    __tablename__ = "enrichment_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    dedupe_key: Mapped[str] = mapped_column(String(255), unique=True)
    # Fallback match for leads that were scraped without a website.
    name_key: Mapped[str] = mapped_column(String(255), index=True)
    website: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    revenue_usd: Mapped[int | None] = mapped_column(BigInteger)
    employee_count: Mapped[int | None] = mapped_column(Integer)
    owner_name: Mapped[str | None] = mapped_column(String(150))
    owner_title: Mapped[str | None] = mapped_column(String(100))


class TargetProfile(Base):
    """The ideal-customer profile that qualification scores are measured against.

    A single row (id = 1). No row, or a row with no criteria, means "not
    configured" and leads are shown unscored.
    """

    __tablename__ = "target_profile"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    industries: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    states: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    revenue_min: Mapped[int | None] = mapped_column(BigInteger)
    revenue_max: Mapped[int | None] = mapped_column(BigInteger)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Snapshot(Base):
    __tablename__ = "snapshots"
    __table_args__ = (Index("uq_snapshots_name_lower", text("lower(name)"), unique=True),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    # Search text + filters that produced the selection, frozen at creation.
    criteria: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    # Target profile in force at creation; snapshot scores are always computed
    # against this copy, so later profile edits never rewrite history.
    profile: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    enriched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    leads: Mapped[list[SnapshotLead]] = relationship(
        back_populates="snapshot", cascade="all, delete-orphan", order_by="SnapshotLead.position"
    )
    drafts: Mapped[list[OutreachDraft]] = relationship(back_populates="snapshot", cascade="all, delete-orphan")


class SnapshotLead(Base):
    __tablename__ = "snapshot_leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), index=True)
    # Reference only. The snapshot never reads through it, so deleting or
    # editing the source lead cannot change the snapshot.
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id", ondelete="SET NULL"))
    position: Mapped[int] = mapped_column(Integer)
    # Frozen point-in-time copy. Never written after creation.
    original_data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Working copy: starts equal to original_data, then receives enrichment.
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # {field: "simulated" | "manual"} for every field changed by enrichment.
    field_sources: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    enriched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    snapshot: Mapped[Snapshot] = relationship(back_populates="leads")
    draft: Mapped[OutreachDraft | None] = relationship(
        back_populates="snapshot_lead", cascade="all, delete-orphan", uselist=False
    )


class OutreachTemplate(Base):
    __tablename__ = "outreach_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class OutreachDraft(Base):
    __tablename__ = "outreach_drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("snapshots.id", ondelete="CASCADE"), index=True)
    # One draft per snapshot lead; regenerating replaces it.
    snapshot_lead_id: Mapped[int] = mapped_column(
        ForeignKey("snapshot_leads.id", ondelete="CASCADE"), unique=True
    )
    template_id: Mapped[int | None] = mapped_column(ForeignKey("outreach_templates.id", ondelete="SET NULL"))
    to_email: Mapped[str] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    # Set when the user presses Send. Sending is simulated: no email is delivered.
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    snapshot: Mapped[Snapshot] = relationship(back_populates="drafts")
    snapshot_lead: Mapped[SnapshotLead] = relationship(back_populates="draft")
