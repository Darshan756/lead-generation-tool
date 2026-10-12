import csv
import io

import pytest
from sqlalchemy import select

from app.models import Lead

DELTA = "Delta, Unknown \"Co\""


@pytest.fixture
def snapshot(client, lead_ids):
    payload = {
        "name": "California Software — October 2026",
        "description": "First pass",
        "lead_ids": [lead_ids["Bravo Labs"], lead_ids["Alpha Software"], lead_ids[DELTA]],
        "criteria": {"q": "software", "industries": ["Software Development"], "revenue_min": 1_000_000},
    }
    response = client.post("/api/snapshots", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_snapshot_stores_leads_criteria_and_profile(snapshot):
    assert snapshot["name"] == "California Software — October 2026"
    assert snapshot["stage"] == "raw"
    assert snapshot["lead_count"] == 3
    # Selection order is preserved.
    assert [lead["company_name"] for lead in snapshot["leads"]] == ["Bravo Labs", "Alpha Software", DELTA]
    # Only the filters that were actually applied are stored.
    assert snapshot["criteria"] == {
        "q": "software", "industries": ["Software Development"], "revenue_min": 1_000_000,
    }
    assert snapshot["profile"]["industries"] == ["Software Development"]
    assert (snapshot["email_ready"], snapshot["needs_enrichment"], snapshot["invalid_email"]) == (1, 2, 0)


def test_leads_without_email_are_kept_and_flagged(snapshot):
    bravo = snapshot["leads"][0]
    assert bravo["email"] is None
    assert bravo["contact_status"] == "needs_enrichment"
    assert bravo["qualification"]["score"] == 78
    assert snapshot["quality"]["email_missing"] == 2


def test_snapshot_persists_and_is_listed(client, snapshot):
    listed = client.get("/api/snapshots").json()
    assert [s["id"] for s in listed] == [snapshot["id"]]
    assert listed[0]["lead_count"] == 3 and "leads" not in listed[0]
    fetched = client.get(f"/api/snapshots/{snapshot['id']}").json()
    assert fetched == snapshot


def test_snapshot_is_a_point_in_time_copy(client, db, snapshot, lead_ids):
    """Editing or deleting the source lead, or changing the target profile,
    must not alter the snapshot."""
    alpha = db.get(Lead, lead_ids["Alpha Software"])
    alpha.company_name = "Renamed Corp"
    alpha.email = None
    alpha.industry = "Logistics"
    db.delete(db.get(Lead, lead_ids["Bravo Labs"]))
    db.commit()
    client.put("/api/target-profile", json={"industries": ["Logistics"]})

    after = client.get(f"/api/snapshots/{snapshot['id']}").json()
    assert after["lead_count"] == 3
    bravo, alpha_copy, _ = after["leads"]
    assert alpha_copy["company_name"] == "Alpha Software"
    assert alpha_copy["email"] == "hello@alpha.example"
    assert alpha_copy["qualification"]["score"] == 100
    assert bravo["company_name"] == "Bravo Labs" and bravo["lead_id"] is None
    assert after["profile"]["industries"] == ["Software Development"]
    # The live lead list, by contrast, did change.
    assert db.scalar(select(Lead.company_name).where(Lead.id == lead_ids["Alpha Software"])) == "Renamed Corp"


def test_snapshot_names_are_unique_ignoring_case(client, snapshot, lead_ids):
    payload = {"name": "california software — october 2026", "lead_ids": [lead_ids["Alpha Software"]]}
    response = client.post("/api/snapshots", json=payload)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]
    assert len(client.get("/api/snapshots").json()) == 1


def test_snapshot_validation(client, lead_ids):
    alpha = lead_ids["Alpha Software"]
    cases = [
        ({"name": "", "lead_ids": [alpha]}, 422),
        ({"name": "   ", "lead_ids": [alpha]}, 422),
        ({"name": "x" * 121, "lead_ids": [alpha]}, 422),
        ({"name": "No leads", "lead_ids": []}, 422),
        ({"name": "Ghost lead", "lead_ids": [alpha, 99999]}, 422),
        ({"name": "Bad criteria", "lead_ids": [alpha], "criteria": {"priorities": ["urgent"]}}, 422),
        ({"name": "Bad range", "lead_ids": [alpha], "criteria": {"revenue_min": 5, "revenue_max": 1}}, 422),
    ]
    for payload, expected in cases:
        assert client.post("/api/snapshots", json=payload).status_code == expected, payload
    # A rejected request must not leave a partial snapshot behind.
    assert client.get("/api/snapshots").json() == []


def test_duplicate_lead_ids_are_collapsed(client, lead_ids):
    alpha = lead_ids["Alpha Software"]
    body = client.post("/api/snapshots", json={"name": "Dupes", "lead_ids": [alpha, alpha, alpha]}).json()
    assert body["lead_count"] == 1


def test_delete_snapshot(client, snapshot):
    assert client.delete(f"/api/snapshots/{snapshot['id']}").status_code == 204
    assert client.get(f"/api/snapshots/{snapshot['id']}").status_code == 404
    assert client.delete(f"/api/snapshots/{snapshot['id']}").status_code == 404
    # Source leads are untouched.
    assert client.get("/api/leads").json()["total"] == 4


def test_snapshot_export(client, snapshot):
    response = client.get(f"/api/snapshots/{snapshot['id']}/export")
    assert response.status_code == 200
    assert "demo-lead-list-california-software-october-2026-" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("﻿"))))
    assert [r["Company"] for r in rows] == ["Bravo Labs", "Alpha Software", DELTA]
    assert rows[0]["Lead list"] == "California Software — October 2026"
    assert rows[0]["Contact readiness"] == "No email — needs enrichment"
    assert rows[0]["Recommended next action"] == "Enrich contact — strong fit"
    assert rows[1]["Qualification score"] == "100"
    assert client.get("/api/snapshots/99999/export").status_code == 404
