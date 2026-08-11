import unittest

from backend.main import derive_final_status, determine_detection_status, evaluate_material, material_category, normalized_confidence, object_metrics_from_rows, summarize


class ClassificationTests(unittest.TestCase):
    def test_category_variants(self):
        self.assertEqual(material_category("General Trash"), "general_trash")
        self.assertEqual(material_category("general_trash"), "general_trash")
        self.assertEqual(material_category("Food Organics"), "food_organics")
        self.assertEqual(material_category("battery"), "battery")

    def test_confirmed_classes_and_routes(self):
        glass = evaluate_material("glass", 0.95)
        battery = evaluate_material("battery", 0.98)
        self.assertEqual((glass["material_class"], glass["display_status"], glass["review_required"]), ("recyclable", "Confirmed Recyclable", False))
        self.assertEqual((battery["material_class"], battery["display_status"], battery["review_required"], battery["disposal_route"]), ("contaminant", "Review Needed", True, "Manual Audit Queue"))

    def test_low_confidence_requires_review_regardless_of_class(self):
        self.assertTrue(evaluate_material("plastic", 0.3199)["review_required"])
        self.assertTrue(evaluate_material("textile", 0.12)["review_required"])

    def test_threshold_boundary_confirms_at_exactly_32_percent(self):
        self.assertFalse(evaluate_material("plastic", 0.32)["review_required"])
        self.assertTrue(evaluate_material("plastic", 0.3199)["review_required"])

    def test_general_trash_requires_human_review(self):
        self.assertEqual(evaluate_material("general_trash", 0.31)["decision_status"], "review_needed")
        self.assertEqual(evaluate_material("general_trash", 0.80)["decision_status"], "review_needed")

    def test_general_trash_status_routes_unverified_items_to_review(self):
        self.assertEqual(
            object_metrics_from_rows(
                [{"id": "scan-1"}],
                [
                    {"id": "high-trash", "scan_result_id": "scan-1", "category": "General Trash", "confidence": 0.8},
                    {"id": "low-trash", "scan_result_id": "scan-1", "category": "General Trash", "confidence": 0.31},
                ],
                [],
            ),
            {
                "total_objects": 2,
                "confirmed_objects": 0,
                "needs_review_objects": 2,
                "rejected_objects": 0,
            },
        )

    def test_detection_status_helper_splits_review_and_confirmed_states(self):
        self.assertEqual(
            determine_detection_status(0.3199, False),
            {"review_status": "needs_review", "ai_status": "low_confidence_detection"},
        )
        self.assertEqual(
            determine_detection_status(0.32, False),
            {"review_status": "confirmed", "ai_status": "confirmed_recyclable"},
        )
        self.assertEqual(
            determine_detection_status(0.8, True),
            {"review_status": "confirmed", "ai_status": "confirmed_contaminant"},
        )
        self.assertEqual(
            determine_detection_status(0.98, True, "battery"),
            {"review_status": "needs_review", "ai_status": "contaminant_alert_requires_review"},
        )

    def test_confidence_normalization_accepts_percentages_and_invalid_values(self):
        self.assertEqual(normalized_confidence(32), 0.32)
        self.assertEqual(normalized_confidence(125), 1.0)
        self.assertEqual(normalized_confidence("not-a-number"), 0.0)

    def test_final_status_boundary_percentages_and_human_overrides(self):
        cases = [
            (0.3199, None, "needs_review"),
            (0.32, None, "confirmed"),
            (0.64, None, "confirmed"),
            (31.99, None, "needs_review"),
            (32, None, "confirmed"),
            (64, None, "confirmed"),
            (0.95, {"outcome": "rejected"}, "rejected"),
            (0.10, {"outcome": "confirmed"}, "confirmed"),
            (None, None, "needs_review"),
            ("bad", None, "needs_review"),
        ]
        for confidence, decision, expected in cases:
            self.assertEqual(derive_final_status(confidence=confidence, decision=decision), expected)

    def test_mixed_scan_only_counts_low_confidence_detection(self):
        materials = [
            {**evaluate_material("plastic", 0.95), "confidence": 0.95, "contaminant_status": "clean"},
            {**evaluate_material("food_organics", 0.88), "confidence": 0.88, "contaminant_status": "contaminated"},
            {**evaluate_material("cardboard", 0.31), "confidence": 0.31, "contaminant_status": "clean"},
        ]
        self.assertEqual(sum(item["review_required"] for item in materials), 1)
        self.assertTrue(summarize(materials)["human_review_required"])

    def test_object_metrics_count_every_detected_material_row(self):
        scans = [
            {"id": "job-a-object", "source_type": "tracked_video"},
            {"id": "job-b-object", "source_type": "tracked_video"},
        ]
        materials = [
            {"id": "a-frame-1", "scan_result_id": "job-a-object", "track_id": "7", "confidence": 0.64},
            {"id": "a-frame-2", "scan_result_id": "job-a-object", "track_id": "7", "confidence": 0.64},
            {"id": "b-frame-1", "scan_result_id": "job-b-object", "track_id": "7", "confidence": 0.31},
        ]

        self.assertEqual(object_metrics_from_rows(scans, materials, []), {
            "total_objects": 3,
            "confirmed_objects": 2,
            "needs_review_objects": 1,
            "rejected_objects": 0,
        })


if __name__ == "__main__":
    unittest.main()
