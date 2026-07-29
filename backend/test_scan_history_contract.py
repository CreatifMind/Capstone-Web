import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

import httpx
from fastapi import HTTPException

from backend import main


class FakeQuery:
    def __init__(self, table, rows):
        self.table = table
        self.rows = rows
        self.count = None
        self.head = None
        self.columns = None
        self.filters = {}
        self.range_args = None
        self.order_args = None

    def select(self, *_args, **kwargs):
        self.columns = _args
        self.count = kwargs.get("count")
        self.head = kwargs.get("head")
        return self

    def order(self, *args, **kwargs):
        self.order_args = (args, kwargs)
        return self

    def range(self, *args):
        self.range_args = args
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
                count = 4312
        rows = self.rows
        if self.filters.get("id") == "missing":
            rows = []
        elif self.filters.get("id"):
            rows = [row for row in rows if row.get("id") == self.filters["id"]]
        if self.range_args:
            start, end = self.range_args
            rows = rows[start:end + 1]
        return SimpleNamespace(data=rows, count=count)


class FakeRpc:
    def __init__(self, params):
        self.params = params

    def execute(self):
        status_totals = {"rejected": 4, "review_needed": 107, "confirmed": 437}
        total = status_totals.get(self.params.get("p_status"), 548)
        rows = [
            {"scan": {"id": f"category-scan-{index}", "created_at": "2026-07-19T00:00:00Z"}, "total_count": total}
            for index in range(min(self.params.get("p_limit") or 10, total))
        ]
        return SimpleNamespace(data=rows, count=None)


class FakeSupabase:
    def __init__(self):
        self.queries = []
        self.rpc_calls = []

    def table(self, table):
        rows = [
            {"id": f"scan-{index}", "created_at": "2026-07-19T00:00:00Z"}
            for index in range(25)
        ] if table == main.SCAN_RESULTS_TABLE else []
        query = FakeQuery(table, rows)
        self.queries.append(query)
        return query

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return FakeRpc(params)


class ScanHistoryContractTests(unittest.TestCase):
    def fake_backend(self, fake):
        stack = ExitStack()
        stack.enter_context(patch.object(main, "supabase", fake))
        stack.enter_context(patch.object(main, "_new_supabase_client", return_value=fake))
        return stack

    def test_scan_history_returns_one_page_and_exact_total(self):
        fake = FakeSupabase()
        with self.fake_backend(fake):
            payload = main.get_scan_history(limit=10, offset=0, principal=main.require_principal())

        self.assertEqual(payload["total"], 4312)
        self.assertEqual(payload["limit"], 10)
        self.assertEqual(payload["offset"], 0)
        self.assertEqual(len(payload["items"]), 10)
        self.assertEqual(fake.queries[0].range_args, (0, 9))
        self.assertEqual(fake.queries[0].columns, ("*",))
        self.assertIsNone(fake.queries[0].count)
        self.assertEqual(fake.queries[1].columns, ("id",))
        self.assertEqual(fake.queries[1].count, "exact")
        self.assertIs(fake.queries[1].head, True)
        self.assertIsNone(fake.queries[1].range_args)
        self.assertEqual(payload["summary"], {"confirmed": 4195, "needs_review": 107, "rejected": 10})
        self.assertNotIn("scans", payload)

    def test_scan_history_review_page_uses_ten_row_ranges(self):
        fake = FakeSupabase()
        with self.fake_backend(fake):
            payload = main.get_scan_history(limit=10, offset=10, principal=main.require_principal())

        self.assertEqual(payload["total"], 4312)
        self.assertEqual(payload["limit"], 10)
        self.assertEqual(payload["offset"], 10)
        self.assertEqual(len(payload["items"]), 10)
        self.assertEqual(fake.queries[0].range_args, (10, 19))

    def test_scan_history_accepts_review_filters_and_confidence_sort(self):
        fake = FakeSupabase()
        with self.fake_backend(fake):
            payload = main.get_scan_history(
                limit=10, offset=10, search="bottle", status="review_needed", sort="confidence", direction="asc",
                principal=main.require_principal(),
            )

        self.assertEqual(payload["search"], "bottle")
        self.assertEqual(payload["status"], "review_needed")
        self.assertEqual(payload["sort"], "confidence")
        self.assertEqual(payload["direction"], "asc")
        self.assertEqual(fake.queries[0].filters["source_name"], "%bottle%")
        self.assertIs(fake.queries[0].filters["human_review_required"], True)
        self.assertEqual(fake.queries[1].filters["source_name"], "%bottle%")
        self.assertIs(fake.queries[1].filters["human_review_required"], True)
        self.assertEqual(fake.queries[0].order_args[0], ("overall_confidence",))
        self.assertEqual(fake.queries[0].range_args, (10, 19))

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
        fake = FakeSupabase()
        with self.fake_backend(fake):
            payload = main.get_scan_history(limit=10, offset=0, category="plastic", principal=main.require_principal())

        self.assertEqual(payload["category"], "plastic")
        self.assertEqual(payload["total"], 548)
        self.assertEqual(len(payload["items"]), 10)
        self.assertEqual(fake.rpc_calls[0][0], "scan_history_page")
        self.assertEqual(fake.rpc_calls[0][1]["p_limit"], 10)
        self.assertEqual(fake.rpc_calls[0][1]["p_offset"], 0)
        self.assertEqual(fake.rpc_calls[0][1]["p_category_key"], "plastic")

    def test_scan_history_search_filter_applies_to_summary_counts(self):
        fake = FakeSupabase()
        with self.fake_backend(fake):
            main.get_scan_history(limit=10, offset=0, search="missing", principal=main.require_principal())

        self.assertEqual(fake.queries[1].filters["source_name"], "%missing%")
        self.assertEqual(fake.queries[2].filters["source_name"], "%missing%")
        self.assertEqual(fake.queries[3].filters["source_name"], "%missing%")

    def test_scan_lookup_rejects_invalid_uuid_safely(self):
        fake = FakeSupabase()
        with self.fake_backend(fake):
            with self.assertRaises(HTTPException) as raised:
                main.get_scan_result("not-a-uuid", principal=main.require_principal())

        self.assertEqual(raised.exception.status_code, 404)
        self.assertFalse(fake.queries)

    def test_scan_read_retries_one_transient_error_with_fresh_client(self):
        class FlakyClient:
            def __init__(self):
                self.calls = 0

        first = FlakyClient()
        second = FlakyClient()
        clients = [first, second]

        def operation(client):
            client.calls += 1
            if client is first:
                raise httpx.RemoteProtocolError("Server disconnected")
            return "ok"

        with patch.object(main, "_new_supabase_client", side_effect=clients):
            self.assertEqual(main.execute_scan_read("test query", operation), "ok")

        self.assertEqual(first.calls, 1)
        self.assertEqual(second.calls, 1)


if __name__ == "__main__":
    unittest.main()
