import unittest
import asyncio
import json
from types import SimpleNamespace
from unittest.mock import patch
from uuid import UUID

import cv2
import numpy as np
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


def image_bytes(width=160, height=120):
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:, :] = (32, 96, 128)
    ok, encoded = cv2.imencode(".jpg", frame)
    assert ok
    return encoded.tobytes()


class FakeUpload:
    filename = "upload.jpg"
    content_type = "image/jpeg"

    def __init__(self, payload):
        self.payload = payload

    async def read(self):
        return self.payload


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

    def test_browser_detected_confidence_boundaries_drive_hitl_not_validation(self):
        cases = [
            (0.00, True),
            (0.18, True),
            (0.3199, True),
            (0.32, False),
            (0.75, False),
            (1.00, False),
        ]
        for confidence, review_required in cases:
            with self.subTest(confidence=confidence):
                materials = main.validate_browser_detected_detections([
                    detected(confidence=confidence)
                ], 640, 480)
                self.assertEqual(materials[0]["confidence"], round(confidence, 4))
                self.assertEqual(materials[0]["review_required"], review_required)
                self.assertEqual(
                    main.summarize(materials)["overall_status"],
                    "review_required" if review_required else "accepted",
                )

    def test_browser_detected_rejects_only_malformed_confidence_values(self):
        missing = detected()
        del missing["confidence"]
        cases = [
            detected(confidence=-0.01),
            detected(confidence=1.01),
            detected(confidence=float("nan")),
            detected(confidence=float("inf")),
            detected(confidence=None),
            missing,
            detected(confidence="not-a-number"),
        ]
        for raw in cases:
            with self.subTest(confidence=raw.get("confidence", "<missing>")):
                with self.assertRaises(HTTPException) as context:
                    main.validate_browser_detected_detections([raw], 640, 480)
                self.assertEqual(context.exception.status_code, 400)

    def test_mixed_browser_detected_scan_requires_review_when_any_detection_is_low(self):
        materials = main.validate_browser_detected_detections([
            detected(detection_index=0, confidence=0.75),
            detected(detection_index=1, class_id=3, model_class_name="metal", confidence=0.18),
        ], 640, 480)

        self.assertTrue(any(item["review_required"] for item in materials))
        self.assertEqual(main.summarize(materials)["overall_status"], "review_required")

    def test_preview_filter_hides_weak_and_overlapping_boxes_without_changing_materials(self):
        materials = main.validate_browser_detected_detections([
            detected(detection_index=0, confidence=0.92, x1=10, y1=10, x2=110, y2=110),
            detected(detection_index=1, confidence=0.61, x1=12, y1=12, x2=112, y2=112),
            detected(detection_index=2, confidence=0.14, x1=220, y1=20, x2=320, y2=120),
        ], 640, 480)
        detections = [main._material_preview_detection(material, 640, 480) for material in materials]

        clean = main._clean_preview_detections(detections, 640, 480)

        self.assertEqual(len(materials), 3)
        self.assertEqual([item["confidence"] for item in clean], [0.92])

    def test_preview_filter_hides_extreme_edge_strips_only(self):
        materials = main.validate_browser_detected_detections([
            detected(detection_index=0, confidence=0.80, x1=0, y1=10, x2=10, y2=90),
            detected(detection_index=1, confidence=0.79, x1=10, y1=0, x2=90, y2=10),
            detected(detection_index=2, confidence=0.78, x1=45, y1=10, x2=55, y2=90),
            detected(detection_index=3, confidence=0.77, x1=0, y1=10, x2=40, y2=60),
        ], 100, 100)
        detections = [main._material_preview_detection(material, 100, 100) for material in materials]

        clean = main._clean_preview_detections(detections, 100, 100)

        self.assertEqual(len(materials), 4)
        self.assertEqual([item["confidence"] for item in clean], [0.78, 0.77])

    def test_preview_filter_keeps_nms_behavior_after_geometry_filter(self):
        materials = main.validate_browser_detected_detections([
            detected(detection_index=0, confidence=0.93, x1=10, y1=10, x2=60, y2=60),
            detected(detection_index=1, confidence=0.88, x1=12, y1=12, x2=62, y2=62),
            detected(detection_index=2, confidence=0.24, x1=70, y1=70, x2=95, y2=95),
        ], 100, 100)
        detections = [main._material_preview_detection(material, 100, 100) for material in materials]

        clean = main._clean_preview_detections(detections, 100, 100)

        self.assertEqual(len(materials), 3)
        self.assertEqual([item["confidence"] for item in clean], [0.93])

    def test_multiple_browser_detected_confirmed_when_all_detections_meet_hitl_threshold(self):
        materials = main.validate_browser_detected_detections([
            detected(detection_index=0, confidence=0.32),
            detected(detection_index=1, class_id=3, model_class_name="metal", confidence=0.91),
        ], 640, 480)

        self.assertFalse(any(item["review_required"] for item in materials))
        self.assertEqual(main.summarize(materials)["overall_status"], "accepted")

    def test_machine_detected_high_confidence_non_battery_is_accepted(self):
        materials = main.validate_browser_detected_detections([detected()], 640, 480)
        self.assertFalse(materials[0]["review_required"])
        self.assertEqual(main.summarize(materials)["overall_status"], "accepted")

    def test_machine_detected_keeps_browser_candidate_threshold_separate_from_decision_contract(self):
        materials = main.validate_browser_detected_detections([
            detected(confidence=main.BROWSER_CONFIDENCE_THRESHOLD)
        ], 640, 480)

        self.assertEqual(materials[0]["confidence"], main.BROWSER_CONFIDENCE_THRESHOLD)
        self.assertLess(main.BROWSER_CONFIDENCE_THRESHOLD, main.BROWSER_DECISION_CONFIDENCE_THRESHOLD)

    def test_machine_detected_high_confidence_general_trash_is_confirmed(self):
        materials = main.validate_browser_detected_detections([
            detected(class_id=8, model_class_name="general_trash", confidence=0.98)
        ], 640, 480)
        self.assertFalse(materials[0]["review_required"])
        self.assertEqual(materials[0]["display_status"], "Confirmed Contaminant")
        self.assertEqual(materials[0]["disposal_route"], "General-Waste Disposal")
        self.assertEqual(main.summarize(materials)["overall_status"], "accepted")

    def test_backend_build_marker_is_exposed_for_deployment_verification(self):
        self.assertEqual(main.health()["backend_build_version"], main.BACKEND_BUILD_VERSION)
        self.assertEqual(main.health_check()["backend_build_version"], main.BACKEND_BUILD_VERSION)
        self.assertIn("browser-confidence-object-metrics-fix-20260805", main.BACKEND_BUILD_VERSION)
        response = main._scan_response({"id": "scan-1"}, [])
        self.assertEqual(response["backend_build_version"], main.BACKEND_BUILD_VERSION)

    def test_annotated_image_preview_bytes_embed_detection_overlay(self):
        raw = image_bytes()
        materials = main.validate_browser_detected_detections([detected(x1=20, y1=20, x2=100, y2=90)], 160, 120)

        annotated = main._encode_annotated_image_preview(raw, "upload.jpg", materials)

        self.assertNotEqual(annotated, raw)
        self.assertGreater(len(annotated), 0)
        decoded = cv2.imdecode(np.frombuffer(annotated, dtype=np.uint8), cv2.IMREAD_COLOR)
        raw_decoded = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        self.assertIsNotNone(decoded)
        self.assertGreater(int(cv2.absdiff(decoded, raw_decoded).sum()), 0)

    def test_browser_detected_endpoint_persists_annotated_bytes(self):
        raw = image_bytes()
        captured = {}

        def fake_persist(file_bytes, filename, source_type, materials, summary, **kwargs):
            captured.update({
                "file_bytes": file_bytes,
                "filename": filename,
                "source_type": source_type,
                "materials": materials,
                "summary": summary,
                "kwargs": kwargs,
            })
            return {"scan_result_id": str(kwargs["scan_result_id"])}

        with patch.object(main, "persist_scan", side_effect=fake_persist):
            result = asyncio.run(main.save_browser_detected_scan(
                file=FakeUpload(raw),
                submission_id=UUID("22222222-2222-4222-8222-222222222222"),
                original_width=160,
                original_height=120,
                model_name=main.BROWSER_MODEL_NAME,
                model_version=main.BROWSER_MODEL_VERSION,
                inference_engine=main.BROWSER_INFERENCE_ENGINE,
                confidence_threshold=main.BROWSER_DECISION_CONFIDENCE_THRESHOLD,
                nms_iou_threshold=main.BROWSER_NMS_IOU_THRESHOLD,
                detections=json.dumps([detected(x1=20, y1=20, x2=100, y2=90)]),
                principal=fake_principal(),
            ))

        self.assertEqual(result["scan_result_id"], "22222222-2222-4222-8222-222222222222")
        self.assertEqual(captured["source_type"], "image")
        self.assertNotEqual(captured["file_bytes"], raw)

    def test_browser_detected_endpoint_rejects_candidate_threshold_as_contract_metadata(self):
        raw = image_bytes()

        with self.assertRaises(HTTPException) as context:
            asyncio.run(main.save_browser_detected_scan(
                file=FakeUpload(raw),
                submission_id=UUID("44444444-4444-4444-8444-444444444444"),
                original_width=160,
                original_height=120,
                model_name=main.BROWSER_MODEL_NAME,
                model_version=main.BROWSER_MODEL_VERSION,
                inference_engine=main.BROWSER_INFERENCE_ENGINE,
                confidence_threshold=main.BROWSER_CONFIDENCE_THRESHOLD,
                nms_iou_threshold=main.BROWSER_NMS_IOU_THRESHOLD,
                detections=json.dumps([detected(x1=20, y1=20, x2=100, y2=90)]),
                principal=fake_principal(),
            ))

        self.assertEqual(context.exception.status_code, 400)
        self.assertEqual(context.exception.detail, "Browser confidence threshold must be 0.32.")

    def test_browser_detected_endpoint_persists_empty_detection_scan_for_review(self):
        raw = image_bytes()
        captured = {}

        def fake_persist(file_bytes, filename, source_type, materials, summary, **kwargs):
            captured.update({
                "file_bytes": file_bytes,
                "materials": materials,
                "summary": summary,
                "kwargs": kwargs,
            })
            return {"scan_result_id": str(kwargs["scan_result_id"]), **summary, "detected_materials": materials}

        with patch.object(main, "persist_scan", side_effect=fake_persist):
            result = asyncio.run(main.save_browser_detected_scan(
                file=FakeUpload(raw),
                submission_id=UUID("44444444-4444-4444-8444-444444444444"),
                original_width=160,
                original_height=120,
                model_name=main.BROWSER_MODEL_NAME,
                model_version=main.BROWSER_MODEL_VERSION,
                inference_engine=main.BROWSER_INFERENCE_ENGINE,
                confidence_threshold=main.BROWSER_DECISION_CONFIDENCE_THRESHOLD,
                nms_iou_threshold=main.BROWSER_NMS_IOU_THRESHOLD,
                detections=json.dumps([]),
                principal=fake_principal(),
            ))

        self.assertEqual(result["scan_result_id"], "44444444-4444-4444-8444-444444444444")
        self.assertEqual(captured["file_bytes"], raw)
        self.assertEqual(captured["materials"], [])
        self.assertEqual(captured["summary"]["overall_status"], "review_required")
        self.assertTrue(captured["summary"]["human_review_required"])

    def test_browser_verified_endpoint_persists_annotated_bytes(self):
        raw = image_bytes()
        captured = {}

        def fake_persist(file_bytes, filename, source_type, materials, summary, **kwargs):
            captured["file_bytes"] = file_bytes
            captured["verified"] = kwargs.get("verified")
            return {"scan_result_id": str(kwargs["scan_result_id"])}

        with patch.object(main, "persist_scan", side_effect=fake_persist):
            result = asyncio.run(main.save_browser_verified_scan(
                file=FakeUpload(raw),
                submission_id=UUID("33333333-3333-4333-8333-333333333333"),
                original_width=160,
                original_height=120,
                model_name=main.BROWSER_MODEL_NAME,
                model_version=main.BROWSER_MODEL_VERSION,
                inference_engine=main.BROWSER_INFERENCE_ENGINE,
                confidence_threshold=main.BROWSER_DECISION_CONFIDENCE_THRESHOLD,
                nms_iou_threshold=main.BROWSER_NMS_IOU_THRESHOLD,
                verified_detections=json.dumps([detection(x1=20, y1=20, x2=100, y2=90)]),
                verification_outcome="verified",
                principal=fake_principal(),
            ))

        self.assertEqual(result["scan_result_id"], "33333333-3333-4333-8333-333333333333")
        self.assertTrue(captured["verified"])
        self.assertNotEqual(captured["file_bytes"], raw)

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
