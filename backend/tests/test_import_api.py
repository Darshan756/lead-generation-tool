import io

from openpyxl import Workbook

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
HEADERS = ["Company name", "Industry", "City", "State", "Website", "Email", "Phone", "Revenue (USD)", "Employees", "Owner name"]


def xlsx(rows, headers=HEADERS) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def upload(client, content: bytes, filename="leads.xlsx", content_type=XLSX):
    return client.post("/api/leads/import", files={"file": (filename, content, content_type)})


def test_excel_import_adds_new_companies(client, seeded):
    content = xlsx([
        ["Echo Robotics", "Manufacturing", "Austin", "TX", "https://www.echo.example", "hi@echo.example", "(512) 555-0100", 7_500_000, 40, "Dana Lane"],
        ["Foxtrot Health", "Healthcare", "Miami", "FL", None, None, None, None, None, None],
    ])
    response = upload(client, content)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "filename": "leads.xlsx", "rows_read": 2, "inserted": 2, "duplicates_merged": 0, "skipped": [],
    }
    echo = client.get("/api/leads", params={"q": "echo"}).json()["items"][0]
    assert echo["revenue_usd"] == 7_500_000 and echo["employee_count"] == 40
    assert echo["domain"] == "echo.example" and echo["source"] == "file_import"
    assert echo["contact_status"] == "email_ready"
    # Imported leads are scored like any other and missing data is kept, not dropped.
    foxtrot = client.get("/api/leads", params={"q": "foxtrot"}).json()["items"][0]
    assert foxtrot["contact_status"] == "needs_enrichment"
    assert client.get("/api/leads").json()["total"] == 6


def test_import_merges_duplicates_within_the_file_and_against_existing_leads(client, seeded):
    content = xlsx([
        ["Alpha Software LLC", "Software Development", "San Diego", "CA", "http://ALPHA.example/", None, None, None, None, None],
        ["Golf Systems", "IT Services", "Denver", "CO", "golf.example", None, None, None, None, None],
        ["Golf Systems, Inc.", "IT Services", "Denver", "CO", "https://www.golf.example", "info@golf.example", None, None, None, None],
    ])
    body = upload(client, content).json()
    assert (body["inserted"], body["duplicates_merged"]) == (1, 2)
    assert client.get("/api/leads").json()["total"] == 5
    golf = client.get("/api/leads", params={"q": "golf"}).json()["items"]
    assert len(golf) == 1
    # The first row wins; the duplicate filled in the email it was missing.
    assert golf[0]["company_name"] == "Golf Systems" and golf[0]["email"] == "info@golf.example"
    # The existing Alpha record keeps its own data.
    alpha = client.get("/api/leads", params={"q": "alpha"}).json()["items"][0]
    assert alpha["company_name"] == "Alpha Software" and alpha["merged_duplicates"] == 2


def test_bad_rows_are_skipped_with_a_reason_and_good_rows_still_import(client, seeded):
    content = xlsx([
        ["Hotel Labs", "Software Development", "Boston", "MA", None, None, None, "$1,250,000", "12", None],
        [None, "Logistics", "Dallas", "TX", None, None, None, None, None, None],
        ["India Freight", "Logistics", "Dallas", "TX", None, None, None, "about 5 million", None, None],
        [None, None, None, None, None, None, None, None, None, None],
        ["Juliet Media", "Marketing & Advertising", "Tampa", "FL", None, None, None, -5, None, None],
        ["Kilo Works", "Construction", "Phoenix", "AZ", None, None, None, 2_000_000.0, 8.5, None],
    ])
    body = upload(client, content).json()
    assert body["inserted"] == 1 and body["rows_read"] == 5  # the blank row is ignored
    assert body["skipped"] == [
        {"row": 3, "reason": "Company name is missing"},
        {"row": 4, "reason": "Revenue “about 5 million” is not a number"},
        {"row": 6, "reason": "Revenue “-5” must be a whole, non-negative number"},
        {"row": 7, "reason": "Employees “8.5” must be a whole, non-negative number"},
    ]
    hotel = client.get("/api/leads", params={"q": "hotel"}).json()["items"][0]
    assert hotel["revenue_usd"] == 1_250_000 and hotel["employee_count"] == 12


def test_headers_are_matched_loosely_and_unknown_columns_ignored(client, seeded):
    content = xlsx(
        [["Lima Clinics", "Healthcare", "CA", "ignored", "https://lima.example", 2015]],
        headers=["  COMPANY ", "category", "State", "Notes", "URL", "Founded"],
    )
    assert upload(client, content).json()["inserted"] == 1
    lima = client.get("/api/leads", params={"q": "lima"}).json()["items"][0]
    assert (lima["industry"], lima["state"], lima["domain"], lima["founded_year"]) == ("Healthcare", "CA", "lima.example", 2015)


def test_csv_import_including_quoted_commas_and_bom(client, seeded):
    text = '﻿Company name,Industry,State,Email\r\n"Mike, Sons & Co",Construction,OH,office@mike.example\r\n'
    body = upload(client, text.encode("utf-8"), "leads.csv", "text/csv").json()
    assert body["inserted"] == 1 and body["skipped"] == []
    assert client.get("/api/leads", params={"q": "Mike, Sons"}).json()["items"][0]["email"] == "office@mike.example"


def test_unreadable_files_are_rejected_without_importing_anything(client, seeded):
    cases = [
        (b"hello", "notes.txt", "Unsupported file type"),
        (b"this is not a zip", "broken.xlsx", "could not be read"),
        (b"", "empty.csv", "empty"),
        (b"Industry,State\nLogistics,TX\n", "nocompany.csv", "No “Company name” column"),
        (b"\xff\xfe\x00bad", "latin.csv", "not UTF-8"),
        (b"Company name\n" + b"x\n" * 5001, "huge.csv", "more than 5,000 rows"),
    ]
    for content, filename, message in cases:
        response = upload(client, content, filename, "application/octet-stream")
        assert response.status_code == 422, filename
        assert message in response.json()["detail"], filename
    assert client.post("/api/leads/import").status_code == 422
    assert client.get("/api/leads").json()["total"] == 4


def test_oversized_file_is_rejected(client, seeded):
    response = upload(client, b"Company name\n" + b"a" * (5 * 1024 * 1024 + 10), "big.csv", "text/csv")
    assert response.status_code == 422 and "larger than 5 MB" in response.json()["detail"]
