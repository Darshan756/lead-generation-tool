from app.services.scoring import DEFAULT_CONFIG, ScoringConfig, evaluate, profile_is_configured

PROFILE = {"industries": ["Software Development"], "states": ["CA"], "revenue_min": 1_000_000, "revenue_max": 10_000_000}
PERFECT = {
    "company_name": "Alpha", "industry": "Software Development", "state": "CA", "revenue_usd": 5_000_000,
    "email": "hello@alpha.example", "website": "https://alpha.example", "phone": None,
}


def by_key(result):
    return {s["key"]: s for s in result["signals"]}


def test_perfect_fit_scores_100_and_is_high_priority():
    result = evaluate(PERFECT, PROFILE)
    assert result["score"] == 100
    assert result["priority"] == "high"
    assert result["negatives"] == [] and result["review_items"] == []
    assert result["next_action"] == "Prepare outreach"


def test_score_is_normalised_to_100_even_though_weights_sum_to_90():
    assert sum(DEFAULT_CONFIG.weights.values()) == 90
    # Everything except the email signal (20 of 90) -> 70/90 = 78.
    result = evaluate({**PERFECT, "email": None}, PROFILE)
    assert result["score"] == 78


def test_missing_data_earns_no_points_and_is_a_review_item_not_a_negative():
    result = evaluate({**PERFECT, "revenue_usd": None}, PROFILE)
    signal = by_key(result)["revenue"]
    assert signal["status"] == "missing" and signal["points"] == 0
    assert any("Revenue is unknown" in item for item in result["review_items"])
    assert result["negatives"] == []


def test_present_but_unfit_data_is_a_negative_signal():
    result = evaluate({**PERFECT, "revenue_usd": 90_000_000, "industry": "Logistics"}, PROFILE)
    signals = by_key(result)
    assert signals["revenue"]["status"] == "not_matched"
    assert signals["industry"]["status"] == "not_matched"
    assert len(result["negatives"]) == 2
    assert result["review_items"] == []


def test_missing_and_negative_score_the_same_but_are_explained_differently():
    missing = evaluate({**PERFECT, "industry": None}, PROFILE)
    negative = evaluate({**PERFECT, "industry": "Logistics"}, PROFILE)
    assert missing["score"] == negative["score"]
    assert by_key(missing)["industry"]["status"] != by_key(negative)["industry"]["status"]


def test_malformed_email_gets_no_points_and_is_never_called_verified():
    result = evaluate({**PERFECT, "email": "sales at alpha.example"}, PROFILE)
    assert by_key(result)["email"]["status"] == "not_matched"
    assert result["next_action"] == "Correct the email address"
    valid = by_key(evaluate(PERFECT, PROFILE))["email"]["detail"]
    assert "not verified" in valid


def test_email_is_not_double_counted_as_a_contact_channel():
    only_email = {**PERFECT, "website": None, "phone": None}
    signals = by_key(evaluate(only_email, PROFILE))
    assert signals["email"]["status"] == "matched"
    assert signals["contact_channel"]["status"] == "missing"


def test_unconfigured_profile_gives_neutral_unscored_result():
    for profile in (None, {}, {"industries": [], "states": [], "revenue_min": None, "revenue_max": None}):
        assert not profile_is_configured(profile)
        result = evaluate(PERFECT, profile)
        assert result["score"] is None and result["priority"] == "unscored"
        assert result["signals"] == []


def test_criteria_that_are_not_configured_are_left_out_of_the_denominator():
    # Only an industry target: possible = 25 + 20 + 10 = 55, all earned.
    result = evaluate(PERFECT, {"industries": ["Software Development"]})
    assert result["score"] == 100
    signals = by_key(result)
    assert signals["location"]["status"] == "not_configured" and signals["location"]["max_points"] == 0


def test_priority_thresholds_are_applied_consistently():
    config = ScoringConfig()
    assert (config.high_threshold, config.medium_threshold) == (70, 40)
    # industry only: 25/90 = 28 -> low
    low = evaluate({"company_name": "x", "industry": "Software Development"}, PROFILE)
    assert (low["score"], low["priority"]) == (28, "low")
    # industry + location: 40/90 = 44 -> medium
    medium = evaluate({"company_name": "x", "industry": "Software Development", "state": "CA"}, PROFILE)
    assert (medium["score"], medium["priority"]) == (44, "medium")


def test_weights_are_configurable_and_score_stays_within_range():
    config = ScoringConfig(weights={"industry": 500, "location": 1, "revenue": 1, "email": 1, "contact_channel": 1})
    assert evaluate(PERFECT, PROFILE, config)["score"] == 100
    assert 0 <= evaluate({**PERFECT, "industry": "Logistics"}, PROFILE, config)["score"] <= 100
