import pytest

from app.services.quality import confidence, contact_status, dedupe_key, is_valid_email_format, normalize_domain


@pytest.mark.parametrize(
    "email, expected",
    [
        ("info@acme.example", True),
        ("first.last+tag@sub.acme.co", True),
        ("info@acme", False),
        ("sales at acme.example", False),
        ("contact@@acme.example", False),
        ("a..b@acme.example", False),
        ("", False),
        ("   ", False),
        (None, False),
    ],
)
def test_email_format_validation(email, expected):
    assert is_valid_email_format(email) is expected


@pytest.mark.parametrize(
    "website, expected",
    [
        ("https://www.acme.example", "acme.example"),
        ("HTTP://ACME.example/", "acme.example"),
        ("acme.example/about?x=1", "acme.example"),
        ("https://shop.acme.example:8080/path", "shop.acme.example"),
        ("", None),
        (None, None),
    ],
)
def test_domain_normalisation(website, expected):
    assert normalize_domain(website) == expected


def test_dedupe_key_uses_domain_when_available():
    assert dedupe_key("Acme, Inc.", "https://www.acme.example", "CA") == dedupe_key("ACME", "acme.example/", "TX")


def test_dedupe_key_falls_back_to_name_and_state_without_a_website():
    assert dedupe_key("Acme, Inc.", None, "CA") == dedupe_key("acme", None, "ca")
    assert dedupe_key("Acme", None, "CA") != dedupe_key("Acme", None, "TX")


def test_contact_status_distinguishes_missing_from_malformed():
    assert contact_status({"email": "a@b.example"}) == "email_ready"
    assert contact_status({"email": "a@b"}) == "invalid_email"
    assert contact_status({"email": None}) == "needs_enrichment"
    assert contact_status({"email": "  "}) == "needs_enrichment"


def test_confidence_reflects_completeness_and_lists_what_is_missing():
    full = {
        "industry": "x", "state": "CA", "website": "w", "email": "a@b.example", "phone": "1",
        "revenue_usd": 1, "employee_count": 1, "owner_name": "n",
    }
    assert confidence(full) == {"level": "high", "percent": 100, "missing_fields": []}
    half = {**full, "phone": None, "revenue_usd": None, "employee_count": None, "owner_name": None}
    assert confidence(half)["level"] == "medium" and confidence(half)["percent"] == 50
    assert confidence({})["level"] == "low"
    # A malformed email does not count as a usable email.
    assert "Email" in confidence({**full, "email": "broken"})["missing_fields"]
