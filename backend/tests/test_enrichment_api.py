import csv
import io

import pytest

DELTA = "Delta, Unknown \"Co\""


@pytest.fixture
def snapshot(client, lead_ids):
    payload = {"name": "To enrich", "lead_ids": [lead_ids[n] for n in ("Alpha Software", "Bravo Labs", "Charlie Freight", DELTA)]}
    return client.post("/api/snapshots", json=payload).json()


def leads_by_name(snapshot):
    return {lead["company_name"]: lead for lead in snapshot["leads"]}


def test_simulated_enrichment_fills_only_missing_fields(client, snapshot):
    response = client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["processed"] == 4
    assert result["enriched"] == 2          # Bravo and Charlie have provider data
    assert result["already_complete"] == 1  # Alpha had nothing missing
    assert result["emails_added"] == 2
    assert [n["company_name"] for n in result["no_match"]] == [DELTA]
    assert "manual research" in result["no_match"][0]["reason"]
    assert result["fields_filled"] == {"email": 2, "phone": 1, "employee_count": 1, "owner_name": 2, "owner_title": 2}

    leads = leads_by_name(result["snapshot"])
    bravo = leads["Bravo Labs"]
    assert bravo["email"] == "info@bravo.example" and bravo["contact_status"] == "email_ready"
    assert bravo["owner_name"] == "Jordan Garrow"
    # A value that was already present is never overwritten by the provider.
    assert bravo["website"] == "https://bravo.example"
    assert bravo["field_sources"] == {
        "email": "simulated", "phone": "simulated", "employee_count": "simulated",
        "owner_name": "simulated", "owner_title": "simulated",
    }
    # A malformed email is replaced, because it was not usable.
    assert leads["Charlie Freight"]["email"] == "contact@charlie.example"
    assert leads["Alpha Software"]["field_sources"] == {} and leads["Alpha Software"]["enriched_at"] is None


def test_enrichment_keeps_the_original_and_shows_before_and_after(client, snapshot):
    result = client.post(f"/api/snapshots/{snapshot['id']}/enrich").json()["snapshot"]
    assert result["stage"] == "enriched" and result["enriched_at"] is not None
    assert (result["email_ready_at_creation"], result["email_ready"]) == (1, 3)
    assert result["quality_at_creation"]["email_format_valid"] == 1
    assert result["quality"]["email_format_valid"] == 3
    bravo = leads_by_name(result)["Bravo Labs"]
    assert bravo["original"] == {
        "contact_status": "needs_enrichment", "email": None, "score": 78, "confidence_percent": 50,
    }
    # Re-scored with the new data against the snapshot's own frozen profile.
    assert bravo["qualification"]["score"] == 100 and bravo["confidence"]["percent"] == 100


def test_enrichment_is_persisted_and_does_not_touch_source_leads(client, snapshot):
    client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    reloaded = leads_by_name(client.get(f"/api/snapshots/{snapshot['id']}").json())
    assert reloaded["Bravo Labs"]["email"] == "info@bravo.example"
    live = client.get("/api/leads", params={"q": "bravo"}).json()["items"][0]
    assert live["email"] is None


def test_enrichment_can_target_selected_leads_and_is_idempotent(client, snapshot):
    bravo_id = leads_by_name(snapshot)["Bravo Labs"]["id"]
    first = client.post(f"/api/snapshots/{snapshot['id']}/enrich", json={"snapshot_lead_ids": [bravo_id]}).json()
    assert (first["processed"], first["enriched"]) == (1, 1)
    assert leads_by_name(first["snapshot"])["Charlie Freight"]["contact_status"] == "invalid_email"
    again = client.post(f"/api/snapshots/{snapshot['id']}/enrich", json={"snapshot_lead_ids": [bravo_id]}).json()
    assert (again["enriched"], again["already_complete"], again["fields_filled"]) == (0, 1, {})


def test_enrichment_rejects_leads_from_another_snapshot(client, snapshot, lead_ids):
    other = client.post("/api/snapshots", json={"name": "Other", "lead_ids": [lead_ids["Alpha Software"]]}).json()
    foreign_id = other["leads"][0]["id"]
    response = client.post(f"/api/snapshots/{snapshot['id']}/enrich", json={"snapshot_lead_ids": [foreign_id]})
    assert response.status_code == 422
    assert client.post("/api/snapshots/99999/enrich").status_code == 404
    assert client.post(f"/api/snapshots/{snapshot['id']}/enrich", json={"snapshot_lead_ids": []}).status_code == 422


def test_manual_enrichment(client, snapshot):
    delta_id = leads_by_name(snapshot)[DELTA]["id"]
    url = f"/api/snapshots/{snapshot['id']}/leads/{delta_id}"
    response = client.patch(url, json={"email": " owner@delta.example ", "owner_name": "Sage Jessup", "website": "https://www.delta.example/"})
    assert response.status_code == 200, response.text
    lead = response.json()
    assert lead["email"] == "owner@delta.example" and lead["contact_status"] == "email_ready"
    assert lead["domain"] == "delta.example"
    assert lead["field_sources"] == {"email": "manual", "owner_name": "manual", "website": "manual"}
    # Fields that were not sent are left alone.
    assert lead["phone"] is None
    after = client.get(f"/api/snapshots/{snapshot['id']}").json()
    assert after["stage"] == "enriched" and after["enriched_lead_count"] == 1


def test_manual_enrichment_can_clear_a_value_and_reverting_drops_the_marker(client, snapshot):
    alpha = leads_by_name(snapshot)["Alpha Software"]
    url = f"/api/snapshots/{snapshot['id']}/leads/{alpha['id']}"
    cleared = client.patch(url, json={"phone": ""}).json()
    assert cleared["phone"] is None and cleared["field_sources"] == {"phone": "manual"}
    restored = client.patch(url, json={"phone": "(619) 555-0101"}).json()
    assert restored["field_sources"] == {}


def test_manual_enrichment_validation(client, snapshot):
    delta_id = leads_by_name(snapshot)[DELTA]["id"]
    url = f"/api/snapshots/{snapshot['id']}/leads/{delta_id}"
    assert client.patch(url, json={"email": "not-an-email"}).status_code == 422
    assert client.patch(url, json={"revenue_usd": -5}).status_code == 422
    assert client.patch(url, json={"company_name": "Hacked"}).status_code == 422
    assert client.patch(url, json={}).status_code == 422
    assert client.patch(f"/api/snapshots/{snapshot['id']}/leads/99999", json={"phone": "1"}).status_code == 404
    unchanged = leads_by_name(client.get(f"/api/snapshots/{snapshot['id']}").json())[DELTA]
    assert unchanged["email"] is None and unchanged["field_sources"] == {}


def test_export_reflects_enrichment_and_its_source(client, snapshot):
    client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    text = client.get(f"/api/snapshots/{snapshot['id']}/export").text
    rows = {r["Company"]: r for r in csv.DictReader(io.StringIO(text.lstrip("﻿")))}
    assert rows["Bravo Labs"]["Email"] == "info@bravo.example"
    assert "email (simulated)" in rows["Bravo Labs"]["Fields changed by enrichment"]
    assert rows["Alpha Software"]["Fields changed by enrichment"] == ""
