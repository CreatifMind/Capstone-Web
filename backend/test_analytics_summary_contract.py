import unittest
from contextlib import ExitStack
from types import SimpleNamespace
from unittest.mock import patch

from backend import main


def fake_principal():
    return main.Principal("user", "11111111-1111-4111-8111-111111111111", frozenset({"scan:read"}))


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = {}
        self.range_args = None

    def select(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def gte(self, field, value):
        self.filters[f"gte:{field}"] = value
        return self

    def lt(self, field, value):
        self.filters[f"lt:{field}"] = value
        return self

    def in_(self, field, values):
        self.filters[f"in:{field}"] = values
        return self

    def range(self, *args):
        self.range_args = args
        return self

    def execute(self):
        rows = self.rows
        in_scan_ids = self.filters.get("in:scan_result_id")
        if in_scan_ids is not None:
            rows = [row for row in rows if row.get("scan_result_id") in in_scan_ids]
        if self.range_args:
            start, end = self.range_args
            rows = rows[start:end + 1]
        return SimpleNamespace(data=rows, count=None)


class FakeSupabase:
    def __init__(self, scans, materials, decisions, jobs):
        self.scans = scans
        self.materials = materials
        self.decisions = decisions
        self.jobs = jobs

    def table(self, table):
        if table == main.SCAN_RESULTS_TABLE:
            return FakeQuery(list(self.scans))
        if table == main.DETECTED_MATERIALS_TABLE:
            return FakeQuery(list(self.materials))
        if table == main.REVIEW_DECISIONS_TABLE:
            return FakeQuery(list(self.decisions))
        if table == main.JOBS_TABLE:
            return FakeQuery(list(self.jobs))
        return FakeQuery([])


SCANS = [
    {"id": "scan-1", "source_name": "a.jpg", "source_type": "web", "batch_id": None, "overall_status": "confirmed", "human_review_required": False, "overall_confidence": 0.9, "created_at": "2026-07-19T00:00:00Z", "reviewed_at": None, "contamination_risk": "low"},
    {"id": "scan-2", "source_name": "b.jpg", "source_type": "web", "batch_id": None, "overall_status": "confirmed", "human_review_required": True, "overall_confidence": 0.7, "created_at": "2026-07-19T01:00:00Z", "reviewed_at": None, "contamination_risk": "medium"},
    {"id": "scan-3", "source_name": "c.jpg", "source_type": "web", "batch_id": None, "overall_status": "confirmed", "human_review_required": False, "overall_confidence": 0.8, "created_at": "2026-07-19T02:00:00Z", "reviewed_at": None},
]

MATERIALS = [
    {"id": "material-1", "scan_result_id": "scan-1", "category": "Plastic", "material_name": "Plastic", "confidence": 0.9, "original_category": None},
    # Human overrode the AI's original "Battery" guess to "General Trash" -- accuracy must be
    # grouped by the AI's ORIGINAL guess (original_category), not the human's final category.
    {"id": "material-2", "scan_result_id": "scan-2", "category": "General Trash", "material_name": "General Trash", "confidence": 0.8, "original_category": "Battery"},
    {"id": "material-3", "scan_result_id": "scan-3", "category": "Glass", "material_name": "Glass", "confidence": 0.85, "original_category": None},
]

DECISIONS = [
    {"id": "decision-1", "scan_result_id": "scan-1", "detected_material_id": "material-1", "chosen_category": "Plastic", "disposition": "recyclable", "outcome": "confirmed", "reviewer_email": "alice@example.com", "created_at": "2026-07-19T00:05:00Z"},
    {"id": "decision-2", "scan_result_id": "scan-2", "detected_material_id": "material-2", "chosen_category": "General Trash", "disposition": "contaminant", "outcome": "rejected", "reviewer_email": "bob@example.com", "created_at": "2026-07-19T01:05:00Z"},
]

JOBS = [
    {"id": "job-1", "source": "web-upload", "status": "completed", "processed_count": 5, "total_count": 5, "attempts": 1, "failed_count": 0, "created_at": "2026-07-19T00:00:00Z", "started_at": "2026-07-19T00:00:00Z", "completed_at": "2026-07-19T00:00:05Z"},
    {"id": "job-2", "source": "zip-batch", "status": "failed", "processed_count": 1, "total_count": 3, "attempts": 3, "failed_count": 2, "created_at": "2026-07-19T01:00:00Z", "started_at": "2026-07-19T01:00:00Z", "completed_at": "2026-07-19T01:00:03Z"},
]


class AnalyticsSummaryContractTests(unittest.TestCase):
    def fake_backend(self, fake):
        stack = ExitStack()
        stack.enter_context(patch.object(main, "supabase", fake))
        stack.enter_context(patch.object(main, "_new_supabase_client", return_value=fake))
        return stack

    def call_summary(self):
        fake = FakeSupabase(SCANS, MATERIALS, DECISIONS, JOBS)
        with self.fake_backend(fake):
            return main.analytics_summary(start_date=None, end_date=None, principal=fake_principal())

    def test_reviewer_activity_tracks_agree_and_override(self):
        payload = self.call_summary()
        by_reviewer = {row["reviewer_email"]: row for row in payload["reviewer_activity"]}

        self.assertEqual(by_reviewer["alice@example.com"], {
            "reviewer_email": "alice@example.com", "reviewed_count": 1,
            "agree_count": 1, "override_count": 0, "confirmed_count": 1, "rejected_count": 0,
        })
        self.assertEqual(by_reviewer["bob@example.com"], {
            "reviewer_email": "bob@example.com", "reviewed_count": 1,
            "agree_count": 0, "override_count": 1, "confirmed_count": 0, "rejected_count": 1,
        })

    def test_ai_accuracy_by_category_compares_original_guess_to_chosen_category(self):
        payload = self.call_summary()
        by_category = {row["category"]: row for row in payload["ai_accuracy_by_category"]}

        self.assertEqual(by_category["plastic"]["reviewed_count"], 1)
        self.assertEqual(by_category["plastic"]["agree_count"], 1)
        self.assertEqual(by_category["plastic"]["accuracy_pct"], 100.0)
        self.assertEqual(by_category["battery"]["reviewed_count"], 1)
        self.assertEqual(by_category["battery"]["agree_count"], 0)
        self.assertEqual(by_category["battery"]["accuracy_pct"], 0.0)
        self.assertNotIn("glass", by_category)

    def test_risk_severity_breakdown_defaults_missing_risk_to_unknown(self):
        payload = self.call_summary()
        by_risk = {row["risk"]: row["count"] for row in payload["risk_severity_breakdown"]}

        self.assertEqual(by_risk, {"low": 1, "medium": 1, "unknown": 1})

    def test_upload_pipeline_health_aggregates_jobs_table(self):
        payload = self.call_summary()
        pipeline = payload["upload_pipeline_health"]

        self.assertEqual(pipeline["total_jobs"], 2)
        self.assertEqual(pipeline["status_counts"], {"completed": 1, "failed": 1})
        self.assertEqual(pipeline["jobs_with_retries"], 1)
        self.assertEqual(pipeline["failed_items_total"], 2)
        self.assertEqual(pipeline["average_processing_duration_ms"], 4000.0)
        self.assertEqual(len(pipeline["recent_jobs"]), 2)

    def test_existing_response_keys_are_unchanged(self):
        payload = self.call_summary()

        self.assertEqual(payload["total_scans"], 3)
        self.assertEqual(payload["detected_materials_count"], 3)


if __name__ == "__main__":
    unittest.main()
