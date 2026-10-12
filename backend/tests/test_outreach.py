import csv
import io

import pytest

from app.models import OutreachTemplate
from app.services.outreach_service import render

DELTA = "Delta, Unknown \"Co\""
SUBJECT = "Quick question for {{company}}"
BODY = "Hi {{contact_first_name}},\n\nI saw {{website}} — {{category}} in {{location}}.\n\nBest"

FULL = {
    "company_name": "Alpha Software", "industry": "Software Development", "city": "San Diego", "state": "CA",
    "domain": "alpha.example", "website": "https://www.alpha.example", "owner_name": "Avery Whitlock",
}


# --- template rendering ------------------------------------------------------


def test_render_substitutes_known_values():
    text, fallbacks, unknown = render(BODY, FULL)
    assert text == "Hi Avery,\n\nI saw alpha.example — Software Development in San Diego, CA.\n\nBest"
    assert fallbacks == [] and unknown == []


def test_render_uses_neutral_fallbacks_and_never_invents_a_name():
    text, fallbacks, _ = render(BODY, {"company_name": "Delta"})
    assert text == "Hi there,\n\nI saw your website — your industry in your area.\n\nBest"
    assert fallbacks == ["contact_first_name", "website", "category", "location"]


def test_render_never_leaves_unresolved_variables():
    text, _, unknown = render("Hello {{ ceo_salary }} at {{COMPANY_NAME}} {{ }} {{a b}} {{unclosed", FULL)
    assert "{{ceo" not in text and "}}" not in text
    assert text == "Hello at Alpha Software {{unclosed"
    assert unknown == ["ceo_salary"]


def test_earlier_variable_names_still_work_and_report_the_current_name():
    text, fallbacks, unknown = render("{{company_name}} / {{industry}} / {{owner_name}} / {{owner_first_name}}", FULL)
    assert text == "Alpha Software / Software Development / Avery Whitlock / Avery"
    assert unknown == []
    assert render("Hi {{owner_first_name}}", {"company_name": "Delta"})[1] == ["contact_first_name"]


def test_render_handles_whitespace_and_partial_location():
    assert render("{{  company  }}", FULL)[0] == "Alpha Software"
    assert render("{{city}} / {{state}}", FULL)[0] == "San Diego / CA"
    assert render("{{contact_name}}", FULL)[0] == "Avery Whitlock"
    assert render("{{location}}", {"company_name": "x", "state": "TX"})[0] == "TX"
    assert render("Hi {{nope}} , welcome", FULL)[0] == "Hi, welcome"


# --- API ---------------------------------------------------------------------


@pytest.fixture
def snapshot(client, lead_ids):
    names = ("Alpha Software", "Bravo Labs", "Charlie Freight", DELTA)
    return client.post("/api/snapshots", json={"name": "Outreach", "lead_ids": [lead_ids[n] for n in names]}).json()


@pytest.fixture
def ids(snapshot):
    return {lead["company_name"]: lead["id"] for lead in snapshot["leads"]}


def generate(client, lead_ids, **extra):
    payload = {"snapshot_lead_ids": lead_ids, "subject": SUBJECT, "body": BODY, **extra}
    return client.post("/api/outreach/drafts/generate", json=payload)


def test_generate_reports_processed_and_skipped_with_reasons(client, ids):
    response = generate(client, list(ids.values()))
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["requested"], result["created"], result["updated"]) == (4, 1, 0)
    assert {s["company_name"]: s["reason"] for s in result["skipped"]} == {
        "Bravo Labs": "No email address — enrich this lead first.",
        "Charlie Freight": "Email fails the format check — correct it first.",
        DELTA: "No email address — enrich this lead first.",
    }
    draft = result["drafts"][0]
    assert draft["company_name"] == "Alpha Software" and draft["to_email"] == "hello@alpha.example"
    assert draft["subject"] == "Quick question for Alpha Software"
    assert draft["body"].startswith("Hi Avery,")
    assert "{{" not in draft["subject"] + draft["body"]


def test_enriched_leads_become_eligible(client, snapshot, ids):
    client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    result = generate(client, list(ids.values())).json()
    assert result["created"] == 3
    assert [s["company_name"] for s in result["skipped"]] == [DELTA]
    after = client.get(f"/api/snapshots/{snapshot['id']}").json()
    assert after["stage"] == "drafted" and after["draft_count"] == 3
    assert {lead["company_name"]: lead["has_draft"] for lead in after["leads"]}[DELTA] is False


def test_existing_drafts_are_not_overwritten_unless_asked(client, ids):
    alpha = [ids["Alpha Software"]]
    original = generate(client, alpha).json()["drafts"][0]
    client.patch(f"/api/outreach/drafts/{original['id']}", json={"subject": "Edited", "body": "My own words"})

    second = generate(client, alpha).json()
    assert (second["created"], second["updated"]) == (0, 0)
    assert "already exists" in second["skipped"][0]["reason"]
    assert client.get("/api/outreach/drafts").json()[0]["subject"] == "Edited"

    third = generate(client, alpha, overwrite=True).json()
    assert (third["created"], third["updated"]) == (0, 1)
    drafts = client.get("/api/outreach/drafts").json()
    assert len(drafts) == 1 and drafts[0]["subject"] == "Quick question for Alpha Software"
    assert drafts[0]["id"] == original["id"]


def test_drafts_persist_and_can_be_edited_and_deleted(client, snapshot, ids):
    draft = generate(client, [ids["Alpha Software"]]).json()["drafts"][0]
    url = f"/api/outreach/drafts/{draft['id']}"
    edited = client.patch(url, json={"subject": " New subject ", "body": "New body"})
    assert edited.status_code == 200 and edited.json()["subject"] == "New subject"
    listed = client.get("/api/outreach/drafts", params={"snapshot_id": snapshot["id"]}).json()
    assert [(d["subject"], d["body"]) for d in listed] == [("New subject", "New body")]

    assert client.patch(url, json={"subject": "", "body": "x"}).status_code == 422
    assert client.patch(url, json={"subject": "x", "body": "   "}).status_code == 422
    assert client.patch(url, json={"subject": "Hi {{company_name}}", "body": "x"}).status_code == 422
    assert client.patch("/api/outreach/drafts/99999", json={"subject": "x", "body": "x"}).status_code == 404

    assert client.delete(url).status_code == 204
    assert client.get("/api/outreach/drafts").json() == []
    assert client.delete(url).status_code == 404


def test_deleting_a_snapshot_removes_its_drafts(client, snapshot, ids):
    generate(client, [ids["Alpha Software"]])
    client.delete(f"/api/snapshots/{snapshot['id']}")
    assert client.get("/api/outreach/drafts").json() == []


def test_generate_validation(client, ids, db):
    alpha = [ids["Alpha Software"]]
    assert generate(client, []).status_code == 422
    assert generate(client, [99999]).status_code == 422
    assert generate(client, alpha, template_id=99999).status_code == 404
    assert client.post("/api/outreach/drafts/generate", json={"snapshot_lead_ids": alpha, "subject": " ", "body": "x"}).status_code == 422
    assert client.get("/api/outreach/drafts").json() == []
    # A template made only of unknown variables renders empty: skipped, not saved.
    result = client.post(
        "/api/outreach/drafts/generate", json={"snapshot_lead_ids": alpha, "subject": "{{nope}}", "body": "Hello"}
    ).json()
    assert result["created"] == 0 and result["unknown_variables"] == ["nope"]
    assert "empty subject" in result["skipped"][0]["reason"]


def test_preview_does_not_create_a_draft(client, ids):
    response = client.post(
        "/api/outreach/preview", json={"snapshot_lead_id": ids["Bravo Labs"], "subject": SUBJECT, "body": BODY}
    )
    body = response.json()
    assert body["subject"] == "Quick question for Bravo Labs"
    assert body["body"].startswith("Hi there,")
    assert body["to_email"] is None
    assert "contact_first_name" in body["fallbacks_used"]
    assert client.get("/api/outreach/drafts").json() == []
    assert client.post("/api/outreach/preview", json={"snapshot_lead_id": 99999, "subject": "a", "body": "b"}).status_code == 404


def test_templates_can_be_listed_created_and_edited(client, db):
    db.add(OutreachTemplate(name="Intro", subject="Hi {{company_name}}", body="Body"))
    db.commit()
    assert [t["name"] for t in client.get("/api/outreach/templates").json()] == ["Intro"]
    created = client.post("/api/outreach/templates", json={"name": "Follow-up", "subject": "Re", "body": "B"})
    assert created.status_code == 201
    assert client.post("/api/outreach/templates", json={"name": "Intro", "subject": "x", "body": "y"}).status_code == 409
    template_id = created.json()["id"]
    updated = client.put(f"/api/outreach/templates/{template_id}", json={"name": "Follow-up", "subject": "New", "body": "B2"})
    assert updated.json()["subject"] == "New"
    assert client.put(f"/api/outreach/templates/{template_id}", json={"name": "Intro", "subject": "x", "body": "y"}).status_code == 409
    assert client.put("/api/outreach/templates/99999", json={"name": "Z", "subject": "x", "body": "y"}).status_code == 404
    # Variables are named after the columns users see, and the old names are not advertised.
    names = [v["name"] for v in client.get("/api/outreach/variables").json()]
    assert names == ["company", "category", "city", "state", "location", "website", "contact_name", "contact_first_name"]


def test_draft_export(client, snapshot, ids):
    assert client.get("/api/outreach/drafts/export").status_code == 404
    client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    drafts = generate(client, list(ids.values())).json()["drafts"]
    response = client.get("/api/outreach/drafts/export", params={"snapshot_id": snapshot["id"]})
    assert response.status_code == 200
    assert "demo-outreach-drafts-" in response.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("﻿"))))
    assert len(rows) == 3
    alpha = next(r for r in rows if r["Company"] == "Alpha Software")
    assert alpha["To"] == "hello@alpha.example" and alpha["Status"] == "Draft — not sent"
    # Multi-line bodies survive the round trip intact.
    assert alpha["Message"] == "Hi Avery,\n\nI saw alpha.example — Software Development in San Diego, CA.\n\nBest"
    one = client.get("/api/outreach/drafts/export", params={"ids": [drafts[0]["id"]]})
    assert len(list(csv.DictReader(io.StringIO(one.text.lstrip("﻿"))))) == 1


# --- sending (simulated) -----------------------------------------------------


def test_send_marks_drafts_as_sent_and_is_idempotent(client, snapshot, ids):
    client.post(f"/api/snapshots/{snapshot['id']}/enrich")
    drafts = generate(client, list(ids.values())).json()["drafts"]
    assert all(d["sent_at"] is None for d in drafts)
    first, second, third = (d["id"] for d in drafts)

    one = client.post("/api/outreach/drafts/send", json={"draft_ids": [first]})
    assert one.status_code == 200, one.text
    assert (one.json()["sent"], one.json()["already_sent"]) == (1, 0)
    sent_at = one.json()["drafts"][0]["sent_at"]
    assert sent_at is not None

    # "Send all" skips what was already sent and keeps its original time.
    rest = client.post("/api/outreach/drafts/send", json={"draft_ids": [first, second, third]}).json()
    assert (rest["sent"], rest["already_sent"]) == (2, 1)
    assert rest["drafts"][0]["sent_at"] == sent_at
    assert all(d["sent_at"] for d in client.get("/api/outreach/drafts").json())


def test_sent_emails_cannot_be_edited_but_can_be_regenerated(client, ids):
    alpha = [ids["Alpha Software"]]
    draft = generate(client, alpha).json()["drafts"][0]
    client.post("/api/outreach/drafts/send", json={"draft_ids": [draft["id"]]})
    response = client.patch(f"/api/outreach/drafts/{draft['id']}", json={"subject": "Changed", "body": "Changed"})
    assert response.status_code == 409 and "already been sent" in response.json()["detail"]
    assert client.get("/api/outreach/drafts").json()[0]["subject"] == draft["subject"]
    # Replacing the draft produces a new, unsent one.
    replaced = generate(client, alpha, overwrite=True).json()["drafts"][0]
    assert replaced["sent_at"] is None


def test_send_validation_and_export_status(client, ids):
    assert client.post("/api/outreach/drafts/send", json={"draft_ids": []}).status_code == 422
    assert client.post("/api/outreach/drafts/send", json={"draft_ids": [99999]}).status_code == 422
    draft = generate(client, [ids["Alpha Software"]]).json()["drafts"][0]
    rows = lambda: list(csv.DictReader(io.StringIO(client.get("/api/outreach/drafts/export").text.lstrip("﻿"))))  # noqa: E731
    assert rows()[0]["Status"] == "Draft — not sent"
    client.post("/api/outreach/drafts/send", json={"draft_ids": [draft["id"]]})
    # The export never claims a real delivery.
    assert rows()[0]["Status"] == "Sent (simulated — not delivered)"
