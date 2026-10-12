import csv
import io


def names(response):
    return [item["company_name"] for item in response.json()["items"]]


def test_import_merges_duplicate_domains(seeded, client):
    assert seeded == {"received": 5, "inserted": 4, "duplicates_merged": 1}
    alpha = client.get("/api/leads", params={"q": "alpha"}).json()["items"]
    assert len(alpha) == 1
    # First record wins; the duplicate only filled a field the first lacked.
    assert alpha[0]["company_name"] == "Alpha Software"
    assert alpha[0]["email"] == "hello@alpha.example"
    assert alpha[0]["founded_year"] == 2011
    assert alpha[0]["merged_duplicates"] == 1
    assert alpha[0]["domain"] == "alpha.example"


def test_list_is_sorted_by_score_and_explains_each_lead(client, seeded):
    body = client.get("/api/leads").json()
    assert body["total"] == 4 and body["profile_configured"] is True
    assert [i["company_name"] for i in body["items"]] == [
        "Alpha Software", "Bravo Labs", "Charlie Freight", "Delta, Unknown \"Co\"",
    ]
    alpha, bravo, charlie, delta = body["items"]
    assert alpha["qualification"]["score"] == 100 and alpha["qualification"]["priority"] == "high"
    assert alpha["contact_status"] == "email_ready"
    assert bravo["qualification"]["score"] == 78 and bravo["contact_status"] == "needs_enrichment"
    assert bravo["qualification"]["next_action"] == "Enrich contact — strong fit"
    assert charlie["contact_status"] == "invalid_email"
    assert len(charlie["qualification"]["negatives"]) == 4
    assert delta["qualification"]["score"] == 0 and delta["confidence"]["level"] == "low"
    assert len(delta["qualification"]["review_items"]) == 5


def test_search_matches_name_industry_domain_and_location(client, seeded):
    assert names(client.get("/api/leads", params={"q": "bravo"})) == ["Bravo Labs"]
    assert names(client.get("/api/leads", params={"q": "logist"})) == ["Charlie Freight"]
    assert names(client.get("/api/leads", params={"q": "charlie.example"})) == ["Charlie Freight"]
    assert names(client.get("/api/leads", params={"q": "san diego"})) == ["Alpha Software"]
    assert client.get("/api/leads", params={"q": "zzz"}).json()["total"] == 0


def test_search_treats_wildcards_literally(client, seeded):
    assert client.get("/api/leads", params={"q": "%"}).json()["total"] == 0
    assert client.get("/api/leads", params={"q": "_"}).json()["total"] == 0


def test_multiple_categories_can_be_searched_together(client, seeded):
    response = client.get("/api/leads", params={"industries": ["Software Development", "Logistics"]})
    assert sorted(names(response)) == ["Alpha Software", "Bravo Labs", "Charlie Freight"]


def test_filters_combine(client, seeded):
    assert names(client.get("/api/leads", params={"states": ["TX"]})) == ["Charlie Freight"]
    assert names(client.get("/api/leads", params={"revenue_min": 3_000_000, "revenue_max": 6_000_000})) == [
        "Alpha Software"
    ]
    assert names(client.get("/api/leads", params={"priorities": ["high"]})) == ["Alpha Software", "Bravo Labs"]
    assert names(client.get("/api/leads", params={"confidences": ["low"]})) == ["Delta, Unknown \"Co\""]
    assert names(client.get("/api/leads", params={"contact_statuses": ["needs_enrichment"]})) == [
        "Bravo Labs", "Delta, Unknown \"Co\"",
    ]
    combined = {"industries": ["Software Development"], "contact_statuses": ["email_ready"], "priorities": ["high"]}
    assert names(client.get("/api/leads", params=combined)) == ["Alpha Software"]


def test_sorting_puts_missing_values_last_in_both_directions(client, seeded):
    asc = names(client.get("/api/leads", params={"sort_by": "revenue_usd", "sort_dir": "asc"}))
    desc = names(client.get("/api/leads", params={"sort_by": "revenue_usd", "sort_dir": "desc"}))
    assert asc == ["Bravo Labs", "Alpha Software", "Charlie Freight", "Delta, Unknown \"Co\""]
    assert desc == ["Charlie Freight", "Alpha Software", "Bravo Labs", "Delta, Unknown \"Co\""]
    assert names(client.get("/api/leads", params={"sort_by": "company_name", "sort_dir": "asc"}))[0] == "Alpha Software"


def test_pagination_and_matching_ids(client, seeded):
    page1 = client.get("/api/leads", params={"page_size": 3}).json()
    page2 = client.get("/api/leads", params={"page_size": 3, "page": 2}).json()
    assert len(page1["items"]) == 3 and len(page2["items"]) == 1
    assert page1["total"] == page2["total"] == 4
    assert len(page1["matching_ids"]) == 4
    assert page1["matching_ids"][:3] == [i["id"] for i in page1["items"]]


def test_invalid_query_parameters_are_rejected(client, seeded):
    for params in (
        {"page": 0},
        {"page_size": 1000},
        {"sort_by": "password"},
        {"priorities": ["urgent"]},
        {"revenue_min": -1},
        {"revenue_min": 10, "revenue_max": 5},
        {"unknown_filter": "x"},
    ):
        assert client.get("/api/leads", params=params).status_code == 422, params


def test_facets(client, seeded):
    body = client.get("/api/leads/facets").json()
    assert {"value": "Software Development", "count": 2} in body["industries"]
    assert {"value": "CA", "count": 2} in body["states"]
    assert (body["revenue_min"], body["revenue_max"]) == (2_000_000, 50_000_000)


def test_clearing_the_target_profile_gives_a_neutral_state(client, seeded):
    cleared = client.put("/api/target-profile", json={"industries": [], "states": []}).json()
    assert cleared["configured"] is False
    body = client.get("/api/leads").json()
    assert body["profile_configured"] is False
    assert all(i["qualification"]["score"] is None for i in body["items"])
    assert all(i["qualification"]["priority"] == "unscored" for i in body["items"])


def test_changing_the_target_profile_changes_scores(client, seeded):
    response = client.put("/api/target-profile", json={"industries": ["Logistics"], "states": ["tx"]})
    assert response.status_code == 200 and response.json()["states"] == ["TX"]
    top = client.get("/api/leads").json()["items"][0]
    assert top["company_name"] == "Charlie Freight"
    assert client.put("/api/target-profile", json={"revenue_min": 9, "revenue_max": 1}).status_code == 422


def test_data_quality_is_calculated_from_records(client, seeded):
    assert client.get("/api/data-quality").json() == {
        "total": 4,
        "email_format_valid": 1,
        "email_invalid_format": 1,
        "email_missing": 2,
        "website_missing": 1,
        "phone_missing": 2,
        "revenue_missing": 1,
        "owner_missing": 3,
        "incomplete_key_info": 3,
        "needs_manual_review": 2,
        "duplicates_merged": 1,
        "verified": 0,
    }


def test_export_respects_selection_and_escapes_values(client, lead_ids):
    ids = [lead_ids["Delta, Unknown \"Co\""], lead_ids["Alpha Software"]]
    response = client.post("/api/leads/export", json={"lead_ids": ids})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "boosta-leads-" in response.headers["content-disposition"]

    rows = list(csv.DictReader(io.StringIO(response.text.lstrip("﻿"))))
    assert [r["Company"] for r in rows] == ["Delta, Unknown \"Co\"", "Alpha Software"]
    # The raw text must quote the comma and double the quotes.
    assert '"Delta, Unknown ""Co"""' in response.text
    alpha = rows[1]
    assert alpha["Qualification score"] == "100" and alpha["Priority"] == "high"
    assert alpha["Contact readiness"] == "Email present (format checked, not verified)"
    assert "target industry" in alpha["Positive signals"]
    assert alpha["Data note"] == "Synthetic demo data — not verified"
    assert rows[0]["Email"] == "" and rows[0]["Qualification score"] == "0"


def test_export_rejects_empty_and_unknown_selections(client, seeded):
    assert client.post("/api/leads/export", json={"lead_ids": []}).status_code == 422
    assert client.post("/api/leads/export", json={"lead_ids": [99999]}).status_code == 404
