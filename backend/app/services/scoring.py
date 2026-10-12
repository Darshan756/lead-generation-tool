"""Explainable, rules-based lead qualification.

The weights are illustrative, not a validated sales model. They live in one
place (``DEFAULT_CONFIG``) and the score is always normalised to 0-100 over
the signals that apply, so changing a weight cannot break the scale.

Three outcomes are kept distinct for every signal:

* ``matched``      - the data is present and fits the target profile
* ``not_matched``  - the data is present and does NOT fit (a negative signal)
* ``missing``      - the data is absent, so nothing can be concluded; it earns
                     no points and is reported as a review item
* ``not_configured`` - the target profile has no criterion for this signal, so
                     it is left out of the score entirely
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.services.quality import clean, contact_status

Priority = Literal["high", "medium", "low", "unscored"]


@dataclass(frozen=True)
class ScoringConfig:
    weights: dict[str, int] = field(
        default_factory=lambda: {
            "industry": 25,
            "location": 15,
            "revenue": 20,
            "email": 20,
            "contact_channel": 10,
        }
    )
    high_threshold: int = 70
    medium_threshold: int = 40


DEFAULT_CONFIG = ScoringConfig()

SIGNAL_LABELS = {
    "industry": "Target industry",
    "location": "Target location",
    "revenue": "Revenue fit",
    "email": "Business email",
    "contact_channel": "Website or phone",
}


def profile_is_configured(profile: dict[str, Any] | None) -> bool:
    if not profile:
        return False
    return bool(
        profile.get("industries")
        or profile.get("states")
        or profile.get("revenue_min") is not None
        or profile.get("revenue_max") is not None
    )


def _money(value: int) -> str:
    if value >= 1_000_000:
        return f"${value / 1_000_000:.1f}M".replace(".0M", "M")
    if value >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value}"


def _range_text(low: int | None, high: int | None) -> str:
    if low is not None and high is not None:
        return f"{_money(low)}–{_money(high)}"
    return f"{_money(low)} or more" if low is not None else f"up to {_money(high)}"  # type: ignore[arg-type]


def _signals(data: dict[str, Any], profile: dict[str, Any]) -> dict[str, tuple[str, str]]:
    """Return {signal: (status, human explanation)}."""
    out: dict[str, tuple[str, str]] = {}

    industry = clean(data.get("industry"))
    targets = profile.get("industries") or []
    if not targets:
        out["industry"] = ("not_configured", "No target industries set.")
    elif not industry:
        out["industry"] = ("missing", "Industry is unknown.")
    elif industry.lower() in {t.lower() for t in targets}:
        out["industry"] = ("matched", f"{industry} is a target industry.")
    else:
        out["industry"] = ("not_matched", f"{industry} is not a target industry.")

    state = clean(data.get("state"))
    states = profile.get("states") or []
    if not states:
        out["location"] = ("not_configured", "No target locations set.")
    elif not state:
        out["location"] = ("missing", "Location is unknown.")
    elif state.upper() in {s.upper() for s in states}:
        out["location"] = ("matched", f"{state} is a target location.")
    else:
        out["location"] = ("not_matched", f"{state} is outside the target locations.")

    revenue = data.get("revenue_usd")
    low, high = profile.get("revenue_min"), profile.get("revenue_max")
    if low is None and high is None:
        out["revenue"] = ("not_configured", "No target revenue range set.")
    elif revenue is None:
        out["revenue"] = ("missing", "Revenue is unknown and needs verification.")
    elif (low is None or revenue >= low) and (high is None or revenue <= high):
        out["revenue"] = ("matched", f"Estimated revenue {_money(revenue)} fits the target ({_range_text(low, high)}).")
    else:
        out["revenue"] = (
            "not_matched",
            f"Estimated revenue {_money(revenue)} is outside the target ({_range_text(low, high)}).",
        )

    status = contact_status(data)
    if status == "email_ready":
        out["email"] = ("matched", "Business email present. Format checked only — deliverability not verified.")
    elif status == "invalid_email":
        out["email"] = ("not_matched", "Email on record fails the format check.")
    else:
        out["email"] = ("missing", "No email on record — needs enrichment.")

    # Email is scored above, so it is deliberately not counted again here.
    has_site, has_phone = bool(clean(data.get("website"))), bool(clean(data.get("phone")))
    if has_site or has_phone:
        channels = " and ".join(name for name, present in (("website", has_site), ("phone", has_phone)) if present)
        out["contact_channel"] = ("matched", f"Other contact channel available: {channels}.")
    else:
        out["contact_channel"] = ("missing", "No website or phone on record.")
    return out


def _next_action(priority: Priority, status: str) -> str:
    if status == "invalid_email":
        return "Correct the email address"
    has_email = status == "email_ready"
    if priority == "unscored":
        return "Set a target profile to score" if has_email else "Find a business email"
    if priority == "high":
        return "Prepare outreach" if has_email else "Enrich contact — strong fit"
    if priority == "medium":
        return "Review fit, then outreach" if has_email else "Enrich before outreach"
    return "Low priority — revisit later"


def evaluate(
    data: dict[str, Any], profile: dict[str, Any] | None, config: ScoringConfig = DEFAULT_CONFIG
) -> dict[str, Any]:
    """Score one lead and explain the result."""
    status = contact_status(data)
    if not profile_is_configured(profile):
        return {
            "score": None,
            "priority": "unscored",
            "signals": [],
            "positives": [],
            "negatives": [],
            "review_items": [],
            "next_action": _next_action("unscored", status),
        }

    earned = possible = 0
    signals: list[dict[str, Any]] = []
    for key, (signal_status, detail) in _signals(data, profile or {}).items():
        weight = config.weights[key]
        applies = signal_status != "not_configured"
        points = weight if signal_status == "matched" else 0
        if applies:
            possible += weight
            earned += points
        signals.append(
            {
                "key": key,
                "label": SIGNAL_LABELS[key],
                "status": signal_status,
                "points": points,
                "max_points": weight if applies else 0,
                "detail": detail,
            }
        )

    score = round(100 * earned / possible) if possible else 0
    priority: Priority = (
        "high" if score >= config.high_threshold else "medium" if score >= config.medium_threshold else "low"
    )
    return {
        "score": score,
        "priority": priority,
        "signals": signals,
        "positives": [s["detail"] for s in signals if s["status"] == "matched"],
        "negatives": [s["detail"] for s in signals if s["status"] == "not_matched"],
        "review_items": [s["detail"] for s in signals if s["status"] == "missing"],
        "next_action": _next_action(priority, status),
    }
