import csv
import io

from app.services.csv_export import filename, to_csv


def test_commas_quotes_and_line_breaks_round_trip():
    tricky = ['Acme, "The Best" Co', "line one\nline two", "plain", None, ["a", "b"], 42]
    text = to_csv(["a", "b", "c", "d", "e", "f"], [tricky])
    assert text.startswith("﻿")
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    assert rows[1] == ['Acme, "The Best" Co', "line one\nline two", "plain", "", "a | b", "42"]


def test_formula_like_cells_are_neutralised():
    rows = list(csv.reader(io.StringIO(to_csv(["x"], [["=HYPERLINK(1)"], ["+1"], ["-1"], ["@a"]]))))
    assert [r[0] for r in rows[1:]] == ["'=HYPERLINK(1)", "'+1", "'-1", "'@a"]


def test_filename_is_readable_and_safe():
    name = filename("snapshot", "California Healthcare / Oct 2026!")
    assert name.startswith("boosta-snapshot-california-healthcare-oct-2026-") and name.endswith(".csv")
