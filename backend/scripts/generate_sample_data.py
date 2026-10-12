"""Generate the synthetic demonstration dataset.

Every company, person, domain and email produced here is fictional. Domains use
the reserved ``.example`` TLD (RFC 2606) so they can never resolve to a real
business. The generator is seeded, so the output is deterministic.

Usage:  python scripts/generate_sample_data.py
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "app" / "data"
rng = random.Random(42)

INDUSTRIES: dict[str, list[str]] = {
    "Software Development": ["Labs", "Software", "Systems", "Digital", "Code Works", "Technologies"],
    "IT Services": ["IT Solutions", "Managed Services", "Networks", "Tech Partners", "Cloud Group"],
    "Manufacturing": ["Manufacturing", "Fabrication", "Industries", "Precision Parts", "Tool & Die"],
    "Healthcare": ["Medical Supplies", "Health Partners", "Clinics", "Care Group", "Diagnostics"],
    "Logistics": ["Logistics", "Freight", "Distribution", "Transport", "Supply Chain"],
    "Construction": ["Builders", "Construction", "Contracting", "Roofing", "Concrete"],
    "Financial Services": ["Advisors", "Capital", "Bookkeeping", "Wealth Partners", "Insurance Group"],
    "Marketing & Advertising": ["Creative", "Media", "Marketing", "Brand Studio", "Advertising"],
}

PREFIXES = [
    "Northstar", "Bluepeak", "Ironwood", "Cedar Ridge", "Harborline", "Summit", "Redwood", "Lakeshore",
    "Brightpath", "Copperfield", "Silverline", "Evergreen", "Granite", "Riverbend", "Atlas", "Pinnacle",
    "Keystone", "Meridian", "Foxglove", "Stonebridge", "Clearwater", "Highland", "Beacon", "Driftwood",
    "Falcon", "Juniper", "Maple Grove", "Orchard", "Prairie", "Quarry", "Sterling", "Tidewater",
    "Vanguard", "Willow Creek", "Amber", "Birchwood", "Cobalt", "Dune", "Elmhurst", "Frontier",
]

LOCATIONS = [
    ("San Francisco", "CA"), ("Los Angeles", "CA"), ("San Diego", "CA"), ("Sacramento", "CA"),
    ("Austin", "TX"), ("Dallas", "TX"), ("Houston", "TX"),
    ("New York", "NY"), ("Buffalo", "NY"),
    ("Chicago", "IL"), ("Seattle", "WA"), ("Denver", "CO"), ("Miami", "FL"), ("Tampa", "FL"),
    ("Boston", "MA"), ("Atlanta", "GA"), ("Columbus", "OH"), ("Phoenix", "AZ"),
]

FIRST = ["Avery", "Jordan", "Morgan", "Riley", "Casey", "Taylor", "Quinn", "Reese", "Dana", "Rowan",
         "Elliot", "Harper", "Sage", "Kendall", "Blair", "Emerson", "Finley", "Hayden", "Lane", "Marlow"]
LAST = ["Whitlock", "Brannigan", "Castellan", "Dunmore", "Everhart", "Fairbanks", "Garrow", "Halloway",
        "Inglewood", "Jessup", "Kingsley", "Lockridge", "Merriweather", "Northcott", "Oakhurst", "Pemberton"]
TITLES = ["Owner", "Founder & CEO", "Managing Director", "President", "Co-Founder", "General Manager"]
MAILBOXES = ["info", "hello", "sales", "contact", "office"]


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def revenue_for(industry: str) -> int:
    low, high = {
        "Software Development": (400_000, 40_000_000),
        "IT Services": (300_000, 25_000_000),
        "Manufacturing": (1_500_000, 90_000_000),
        "Healthcare": (800_000, 60_000_000),
        "Logistics": (1_000_000, 70_000_000),
        "Construction": (600_000, 45_000_000),
        "Financial Services": (300_000, 30_000_000),
        "Marketing & Advertising": (200_000, 12_000_000),
    }[industry]
    # Log-uniform so that small companies are more common than large ones.
    value = low * (high / low) ** rng.random()
    return int(round(value, -5))


def main() -> None:
    leads: list[dict] = []
    enrichment: list[dict] = []
    used: set[str] = set()

    for industry, suffixes in INDUSTRIES.items():
        for _ in range(15):
            while True:
                name = f"{rng.choice(PREFIXES)} {rng.choice(suffixes)}"
                if name not in used:
                    used.add(name)
                    break
            city, state = rng.choice(LOCATIONS)
            domain = f"{slug(name)}.example"
            revenue = revenue_for(industry)
            employees = max(3, int(revenue / rng.uniform(140_000, 320_000)))
            owner = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            full = {
                "company_name": name,
                "industry": industry,
                "city": city,
                "state": state,
                "website": f"https://www.{domain}",
                "email": f"{rng.choice(MAILBOXES)}@{domain}",
                "phone": f"({rng.randint(201, 989)}) 555-01{rng.randint(10, 99)}",
                "revenue_usd": revenue,
                "employee_count": employees,
                "owner_name": owner,
                "owner_title": rng.choice(TITLES),
                "founded_year": rng.randint(1985, 2022),
            }

            # What the "scrape" found: a degraded copy of the full record.
            lead = dict(full)
            roll = rng.random()
            if roll < 0.40:
                lead["email"] = None
            elif roll < 0.46:
                lead["email"] = rng.choice([f"info@{slug(name)}", f"sales at {domain}", f"contact@@{domain}"])
            if rng.random() < 0.10:
                lead["website"] = None
            if rng.random() < 0.30:
                lead["phone"] = None
            if rng.random() < 0.18:
                lead["revenue_usd"] = None
            if rng.random() < 0.20:
                lead["employee_count"] = None
            if rng.random() < 0.55:
                lead["owner_name"] = None
                lead["owner_title"] = None
            if rng.random() < 0.25:
                lead["founded_year"] = None
            leads.append(lead)

            # The simulated enrichment source knows about ~70% of companies.
            if rng.random() < 0.70:
                enrichment.append(
                    {
                        "company_name": full["company_name"],
                        "state": full["state"],
                        "website": full["website"],
                        "email": full["email"],
                        "phone": full["phone"],
                        "revenue_usd": full["revenue_usd"],
                        "employee_count": full["employee_count"],
                        "owner_name": full["owner_name"],
                        "owner_title": full["owner_title"],
                    }
                )

    # Duplicate-domain scenarios: the same company scraped twice with cosmetic
    # differences. The importer must merge these into one record.
    with_site = [lead for lead in leads if lead["website"]]
    for original in rng.sample(with_site, 8):
        dup = dict(original)
        dup["company_name"] = original["company_name"] + rng.choice([", Inc.", " LLC", " Co."])
        dup["website"] = original["website"].replace("https://www.", rng.choice(["http://", "HTTPS://WWW."])) + "/"
        # A duplicate sometimes carries a field the first record was missing.
        if original["phone"] is None:
            dup["phone"] = f"({rng.randint(201, 989)}) 555-01{rng.randint(10, 99)}"
        dup["owner_name"] = None
        dup["owner_title"] = None
        leads.append(dup)

    rng.shuffle(leads)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "sample-leads.json").write_text(json.dumps(leads, indent=2) + "\n")
    (OUT / "sample-enrichment.json").write_text(json.dumps(enrichment, indent=2) + "\n")
    print(f"wrote {len(leads)} raw lead records and {len(enrichment)} enrichment records")


if __name__ == "__main__":
    main()
