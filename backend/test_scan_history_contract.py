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


if __name__ == "__main__":
    unittest.main()
