"""Test setup.

Tests run against a real PostgreSQL database (the schema uses JSONB and a
functional unique index, so SQLite would not be a faithful substitute). The
schema is built by running the Alembic migrations, which tests them too.

Database resolution order:
1. TEST_DATABASE_URL from the environment or backend/.env
2. a throwaway server from the ``pgserver`` package, if installed
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _test_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    env_file = BACKEND_DIR / ".env"
    if not url and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("TEST_DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
    if url:
        return url
    try:
        import pgserver
    except ImportError:  # pragma: no cover
        raise RuntimeError("Set TEST_DATABASE_URL, or `pip install -r requirements-dev.txt` for pgserver.")
    server = pgserver.get_server(Path(tempfile.mkdtemp(prefix="leads-demo-test-pg-")))
    return server.get_uri()


# Must be set before the application (and its engine) is imported.
os.environ["DATABASE_URL"] = _test_database_url()

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import TargetProfile  # noqa: E402
from app.services.import_service import import_enrichment, import_leads  # noqa: E402

PROFILE = {
    "industries": ["Software Development"],
    "states": ["CA"],
    "revenue_min": 1_000_000,
    "revenue_max": 10_000_000,
}

# Small, hand-written dataset so every expected value in a test is obvious.
RAW_LEADS = [
    {   # perfect fit, complete record -> 100
        "company_name": "Alpha Software", "industry": "Software Development", "city": "San Diego", "state": "CA",
        "website": "https://www.alpha.example", "email": "hello@alpha.example", "phone": "(619) 555-0101",
        "revenue_usd": 5_000_000, "employee_count": 30, "owner_name": "Avery Whitlock", "owner_title": "Founder",
    },
    {   # perfect fit but no email -> needs enrichment
        "company_name": "Bravo Labs", "industry": "Software Development", "city": "Los Angeles", "state": "CA",
        "website": "https://bravo.example", "email": None, "phone": None,
        "revenue_usd": 2_000_000, "employee_count": None, "owner_name": None,
    },
    {   # wrong industry, wrong state, revenue too high, malformed email
        "company_name": "Charlie Freight", "industry": "Logistics", "city": "Dallas", "state": "TX",
        "website": "https://charlie.example", "email": "sales at charlie.example", "phone": "(214) 555-0102",
        "revenue_usd": 50_000_000, "employee_count": 200, "owner_name": None,
    },
    {   # almost nothing known
        "company_name": "Delta, Unknown \"Co\"", "industry": None, "city": None, "state": None,
        "website": None, "email": None, "phone": None, "revenue_usd": None, "employee_count": None,
    },
    {   # duplicate of Alpha (same domain, cosmetic differences)
        "company_name": "Alpha Software, Inc.", "industry": "Software Development", "city": "San Diego", "state": "CA",
        "website": "HTTP://ALPHA.example/", "email": None, "phone": None,
        "revenue_usd": None, "employee_count": None, "founded_year": 2011,
    },
]

RAW_ENRICHMENT = [
    {
        "company_name": "Bravo Labs", "state": "CA", "website": "https://www.bravo.example",
        "email": "info@bravo.example", "phone": "(323) 555-0103", "revenue_usd": 2_000_000,
        "employee_count": 12, "owner_name": "Jordan Garrow", "owner_title": "Owner",
    },
    {
        "company_name": "Charlie Freight", "state": "TX", "website": "https://charlie.example",
        "email": "contact@charlie.example", "phone": "(214) 555-0102", "revenue_usd": 50_000_000,
        "employee_count": 200, "owner_name": "Riley Dunmore", "owner_title": "President",
    },
]


@pytest.fixture(scope="session", autouse=True)
def _schema():
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean_tables(_schema):
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def seeded(db):
    """Four companies (five raw records, one duplicate) and a target profile."""
    stats = import_leads(db, RAW_LEADS)
    import_enrichment(db, RAW_ENRICHMENT)
    db.add(TargetProfile(id=1, **PROFILE))
    db.commit()
    return stats


@pytest.fixture
def lead_ids(client, seeded) -> dict[str, int]:
    """Company name -> lead id."""
    items = client.get("/api/leads", params={"page_size": 100}).json()["items"]
    return {item["company_name"]: item["id"] for item in items}
