import unittest

from backend.main import determine_detection_status, evaluate_material, material_category, normalized_confidence, summarize


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
        self.assertEqual((battery["material_class"], battery["display_status"], battery["review_required"], battery["disposal_route"]), ("contaminant", "Confirmed Contaminant", False, "Battery / E-Waste Collection"))

    def test_low_confidence_requires_review_regardless_of_class(self):
        self.assertTrue(evaluate_material("plastic", 0.3199)["review_required"])
        self.assertTrue(evaluate_material("textile", 0.12)["review_required"])

    def test_threshold_boundary_confirms_at_exactly_32_percent(self):
        self.assertFalse(evaluate_material("plastic", 0.32)["review_required"])
        self.assertTrue(evaluate_material("plastic", 0.3199)["review_required"])

    def test_general_trash_always_requires_manual_review(self):
        for confidence in (0.10, 0.31, 0.32, 0.75, 0.99):
            material = evaluate_material("general_trash", confidence)
            self.assertTrue(material["review_required"])
            self.assertEqual(material["decision_status"], "review_needed")
            self.assertEqual(material["display_status"], "Review Needed")
            self.assertEqual(material["disposal_route"], "Manual Audit Queue")
            self.assertEqual(
                determine_detection_status(confidence, True, "General Trash"),
                {"review_status": "needs_review", "ai_status": "manual_review_required"},
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

    def test_confidence_normalization_accepts_percentages_and_invalid_values(self):
        self.assertEqual(normalized_confidence(32), 0.32)
        self.assertEqual(normalized_confidence(125), 1.0)
        self.assertEqual(normalized_confidence("not-a-number"), 0.0)

    def test_mixed_scan_only_counts_low_confidence_detection(self):
        materials = [
            {**evaluate_material("plastic", 0.95), "confidence": 0.95, "contaminant_status": "clean"},
            {**evaluate_material("food_organics", 0.88), "confidence": 0.88, "contaminant_status": "contaminated"},
            {**evaluate_material("cardboard", 0.31), "confidence": 0.31, "contaminant_status": "clean"},
        ]
        self.assertEqual(sum(item["review_required"] for item in materials), 1)
        self.assertTrue(summarize(materials)["human_review_required"])


if __name__ == "__main__":
    unittest.main()
