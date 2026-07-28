import unittest
from types import SimpleNamespace
from unittest.mock import patch

from backend import main


class FakeQuery:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.count = None
        self.filters = {}

    def select(self, *_args, **kwargs):
        self.count = kwargs.get("count")
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args):
        return self

    def in_(self, *_args):
        self.filters["in"] = _args
        return self

    def eq(self, field, value):
        self.filters[field] = value
        return self

    def gte(self, field, value):
        self.filters[field] = value
        return self

    def lt(self, field, value):
        self.filters[field] = value
        return self

    def ilike(self, field, value):
        self.filters[field] = value
        return self

    def execute(self):
        count = None
        if self.table == main.SCAN_RESULTS_TABLE and self.count == "exact":
            if self.filters.get("in", (None,))[0] == "overall_status":
                count = 10
            elif self.filters.get("human_review_required") is True:
                count = 107
            else:
                count = 437
        return SimpleNamespace(data=self.rows, count=count)


class FakeSupabase:
    def table(self, table):
        rows = [{"id": "scan-1", "created_at": "2026-07-19T00:00:00Z"}] if table == main.SCAN_RESULTS_TABLE else []
        return FakeQuery(table, rows)


class ScanHistoryContractTests(unittest.TestCase):
    def test_scan_history_returns_one_page_and_exact_total(self):
        with patch.object(main, "supabase", FakeSupabase()):
            payload = main.get_scan_history(limit=200, offset=0, principal=main.require_principal())

        self.assertEqual(payload["total"], 437)
        self.assertEqual(payload["limit"], 200)
        self.assertEqual(payload["offset"], 0)
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["summary"], {"confirmed": 320, "needs_review": 107, "rejected": 10})
        self.assertNotIn("scans", payload)

    def test_scan_history_accepts_review_filters_and_confidence_sort(self):
        with patch.object(main, "supabase", FakeSupabase()):
            payload = main.get_scan_history(
                limit=10, offset=10, search="bottle", status="review_needed", sort="confidence", direction="asc",
                principal=main.require_principal(),
            )

        self.assertEqual(payload["search"], "bottle")
        self.assertEqual(payload["status"], "review_needed")
        self.assertEqual(payload["sort"], "confidence")
        self.assertEqual(payload["direction"], "asc")

    def test_final_category_filter_prefers_verified_then_reviewed_category(self):
        scans = [
            {"id": "verified", "verified_category": "Glass"},
            {"id": "reviewed"},
            {"id": "predicted"},
        ]
        materials = [
            {"id": "material-1", "scan_result_id": "verified", "category": "Plastic"},
            {"id": "material-2", "scan_result_id": "reviewed", "category": "Glass"},
            {"id": "material-3", "scan_result_id": "predicted", "category": "PET Bottle"},
        ]
        decisions = [{"detected_material_id": "material-2", "chosen_category": "Plastic", "created_at": "2026-07-28T00:00:00Z"}]

        filtered = main.filter_scans_by_final_category(scans, materials, decisions, "plastic")

        self.assertEqual([scan["id"] for scan in filtered], ["reviewed", "predicted"])

    def test_scan_history_accepts_category_filter(self):
        with patch.object(main, "supabase", FakeSupabase()):
            payload = main.get_scan_history(limit=10, offset=0, category="plastic", principal=main.require_principal())

        self.assertEqual(payload["category"], "plastic")
        self.assertEqual(payload["total"], 0)


if __name__ == "__main__":
    unittest.main()
