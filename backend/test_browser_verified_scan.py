import unittest
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

from fastapi import HTTPException

from backend import main


def fake_principal():
    return main.Principal("user", "11111111-1111-4111-8111-111111111111", frozenset({"scan:write", "review:write"}))


class DuplicateRowError(Exception):
    code = "23505"


class FakeQuery:
    def __init__(self, client, table):
        self.client = client
        self.table = table
        self.filters = {}
        self.operation = "select"
        self.payload = None
        self.single = False

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, field, value):
        self.filters[field] = str(value)
        return self

    def maybe_single(self):
        self.single = True
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload if isinstance(payload, list) else [payload]
        return self

    def update(self, payload):
        self.operation = "update"
        self.payload = payload
        return self

    def execute(self):
        rows = self.client.tables[self.table]
        matches = [
            row for row in rows
            if all(str(row.get(field)) == value for field, value in self.filters.items())
        ]
        if self.operation == "select":
            return SimpleNamespace(data=(matches[0] if self.single and matches else None) if self.single else matches)
        if self.operation == "update":
            for row in matches:
                row.update(self.payload)
            return SimpleNamespace(data=matches)

        inserted = []
        for item in self.payload:
            if item.get("id") and any(str(row.get("id")) == str(item["id"]) for row in rows):
                raise DuplicateRowError()
            row = dict(item)
            rows.append(row)
            inserted.append(row)
        return SimpleNamespace(data=inserted)


class FakeClient:
    def __init__(self):
        self.tables = {
            main.SCAN_RESULTS_TABLE: [],
            main.DETECTED_MATERIALS_TABLE: [],
            main.REVIEW_DECISIONS_TABLE: [],
        }

    def table(self, name):
        return FakeQuery(self, name)


def detection(**changes):
    value = {
        "detection_index": 0,
        "class_id": 0,
        "model_class_name": "plastic",
        "verified_class": "plastic",
        "confidence": 0.91,
        "x1": 10,
        "y1": 20,
        "x2": 110,
        "y2": 220,
        "verification_status": "verified",
    }
    value.update(changes)
    return value


def detected(**changes):
    value = detection()
    value.pop("verified_class")
    value.pop("verification_status")
    value.update(changes)
    return value


class BrowserVerifiedScanTests(unittest.TestCase):
    def test_validation_clamps_boxes_and_maps_food_at_persistence_boundary(self):
        materials = main.validate_browser_detections([
            detection(
                class_id=6,
                model_class_name="food_organic",
                verified_class="food_organic",
                x1=-10,
                y1=-20,
                x2=700,
                y2=800,
            )
        ], 640, 480)

        self.assertEqual(materials[0]["category"], "food_organics")
        self.assertEqual(materials[0]["bbox_x"], 0)
        self.assertEqual(materials[0]["bbox_y"], 0)
        self.assertEqual(materials[0]["bbox_width"], 100)
        self.assertEqual(materials[0]["bbox_height"], 100)

    def test_battery_requires_explicit_confirmation(self):
        with self.assertRaisesRegex(HTTPException, "Battery detections require explicit human confirmation"):
            main.validate_browser_detections([
                detection(
                    class_id=7,
                    model_class_name="battery",
                    verified_class="battery",
                )
            ], 640, 480)

    def test_zero_detections_are_rejected(self):
        with self.assertRaisesRegex(HTTPException, "At least one verified detection"):
            main.validate_browser_detections([], 640, 480)

    def test_machine_detected_battery_and_empty_scans_require_review(self):
        battery = main.validate_browser_detected_detections([
            detected(class_id=7, model_class_name="battery")
        ], 640, 480)
        self.assertTrue(battery[0]["review_required"])
        self.assertEqual(main.summarize(battery)["overall_status"], "review_required")
        self.assertEqual(main.summarize([])["overall_status"], "review_required")

    def test_machine_detected_high_confidence_non_battery_is_accepted(self):
        materials = main.validate_browser_detected_detections([detected()], 640, 480)
        self.assertFalse(materials[0]["review_required"])
        self.assertEqual(main.summarize(materials)["overall_status"], "accepted")

    def test_machine_detected_high_confidence_general_trash_requires_review(self):
        materials = main.validate_browser_detected_detections([
            detected(class_id=8, model_class_name="general_trash", confidence=0.98)
        ], 640, 480)
        self.assertTrue(materials[0]["review_required"])
        self.assertEqual(materials[0]["display_status"], "Review Needed")
        self.assertEqual(materials[0]["disposal_route"], "Manual Audit Queue")
        self.assertEqual(main.summarize(materials)["overall_status"], "review_required")

    def test_repeated_submission_reuses_scan_material_and_review_rows(self):
        client = FakeClient()
        database = main.SupabaseExecutor(client=client, attempts=1)
        submission_id = UUID("11111111-1111-4111-8111-111111111111")
        materials = main.validate_browser_detections([detection()], 640, 480)
        summary = {
            **main.summarize(materials),
            "overall_status": "verified",
            "human_review_required": False,
            "recommended_action": "Verified after operator review.",
        }
        drive_result = {
            "drive_file_id": "drive-1",
            "drive_file_name": "image.jpg",
            "drive_web_url": "https://drive.example/1",
            "image_url": "https://drive.example/1",
        }

        with (
            patch.object(main, "upload_original_to_drive_oauth", return_value=drive_result) as drive_upload,
            patch.object(
                main,
                "upload_original_to_supabase_storage",
                return_value={"path": f"browser-onnx/{submission_id}.jpg", "public_url": "https://storage.example/1"},
            ) as storage_upload,
        ):
            first = main.persist_scan(
                b"image",
                "image.jpg",
                "image",
                materials,
                summary,
                source_ref="browser-onnx:best.onnx",
                principal=fake_principal(),
                content_type="image/jpeg",
                database=database,
                scan_result_id=submission_id,
                model_version=main.BROWSER_MODEL_VERSION,
                verified=True,
            )
            second = main.persist_scan(
                b"image",
                "image.jpg",
                "image",
                materials,
                summary,
                source_ref="browser-onnx:best.onnx",
                principal=fake_principal(),
                content_type="image/jpeg",
                database=database,
                scan_result_id=submission_id,
                model_version=main.BROWSER_MODEL_VERSION,
                verified=True,
            )

        self.assertEqual(first["scan_result_id"], second["scan_result_id"])
        self.assertEqual(len(client.tables[main.SCAN_RESULTS_TABLE]), 1)
        self.assertEqual(len(client.tables[main.DETECTED_MATERIALS_TABLE]), 1)
        self.assertEqual(len(client.tables[main.REVIEW_DECISIONS_TABLE]), 1)
        drive_upload.assert_called_once()
        storage_upload.assert_called_once()


if __name__ == "__main__":
    unittest.main()
