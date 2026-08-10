import unittest
import os
import sys
import importlib.util
import json
import inspect
from io import BytesIO
from pathlib import Path
from types import ModuleType, SimpleNamespace


def module_available(name):
    return importlib.util.find_spec(name) is not None


def install_backend_dependency_shims():
    if "httpx" not in sys.modules and not module_available("httpx"):
        httpx = ModuleType("httpx")
        for name in ("RemoteProtocolError", "ConnectError", "ReadError", "WriteError", "PoolTimeout", "ReadTimeout", "ConnectTimeout", "TimeoutException"):
            setattr(httpx, name, type(name, (Exception,), {}))
        class Limits:
            def __init__(self, *_args, **_kwargs):
                pass

        class Client:
            def __init__(self, *_args, **_kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        httpx.Timeout = lambda *_args, **_kwargs: None
        httpx.Limits = Limits
        httpx.Client = Client
        sys.modules["httpx"] = httpx
    if "dotenv" not in sys.modules and not module_available("dotenv"):
        dotenv = ModuleType("dotenv")
        dotenv.load_dotenv = lambda *_args, **_kwargs: None
        sys.modules["dotenv"] = dotenv
    if "fastapi" not in sys.modules and not module_available("fastapi"):
        fastapi = ModuleType("fastapi")
        class HTTPException(Exception):
            def __init__(self, status_code=500, detail=""):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail
        class FastAPI:
            def __init__(self, *_args, **_kwargs):
                pass
            def add_middleware(self, *_args, **_kwargs):
                pass
            def get(self, *_args, **_kwargs):
                return lambda func: func
            post = put = on_event = get
        fastapi.Depends = lambda value=None: value
        fastapi.FastAPI = FastAPI
        fastapi.File = lambda *args, **kwargs: None
        fastapi.Form = lambda *args, **kwargs: None
        fastapi.HTTPException = HTTPException
        fastapi.Request = object
        fastapi.UploadFile = object
        sys.modules["fastapi"] = fastapi
        middleware = ModuleType("fastapi.middleware")
        cors = ModuleType("fastapi.middleware.cors")
        cors.CORSMiddleware = object
        responses = ModuleType("fastapi.responses")
        class Response:
            def __init__(self, content=b"", media_type=None, headers=None, status_code=200):
                normalized_headers = {str(key).lower(): value for key, value in (headers or {}).items()}
                self.body = content
                self.content = content
                self.media_type = media_type
                self.headers = normalized_headers
                self.status_code = status_code
        class JSONResponse(Response):
            def __init__(self, content=None, media_type="application/json", headers=None, status_code=200):
                super().__init__(
                    content=json.dumps(content if content is not None else {}).encode("utf-8"),
                    media_type=media_type,
                    headers=headers,
                    status_code=status_code,
                )
        responses.JSONResponse = JSONResponse
        responses.RedirectResponse = Response
        responses.Response = Response
        sys.modules["fastapi.middleware"] = middleware
        sys.modules["fastapi.middleware.cors"] = cors
        sys.modules["fastapi.responses"] = responses
    if "PIL" not in sys.modules and not module_available("PIL"):
        pil = ModuleType("PIL")
        image = ModuleType("PIL.Image")
        pil.Image = image
        pil.UnidentifiedImageError = ValueError
        sys.modules["PIL"] = pil
        sys.modules["PIL.Image"] = image
    if "pydantic" not in sys.modules and not module_available("pydantic"):
        pydantic = ModuleType("pydantic")
        class BaseModel:
            def __init__(self, **kwargs):
                annotations = getattr(self.__class__, "__annotations__", {})
                for field in annotations:
                    if field not in kwargs and not hasattr(self.__class__, field):
                        raise TypeError(f"Missing required field: {field}")
                for field, value in kwargs.items():
                    setattr(self, field, value)
        pydantic.BaseModel = BaseModel
        sys.modules["pydantic"] = pydantic
    if "supabase" not in sys.modules or not hasattr(sys.modules.get("supabase"), "create_client"):
        supabase = sys.modules.get("supabase") or ModuleType("supabase")
        supabase.create_client = lambda *_args, **_kwargs: None
        sys.modules["supabase"] = supabase
    if "ultralytics" not in sys.modules and not module_available("ultralytics"):
        ultralytics = ModuleType("ultralytics")
        ultralytics.YOLO = lambda *_args, **_kwargs: SimpleNamespace()
        sys.modules["ultralytics"] = ultralytics


install_backend_dependency_shims()
os.environ["VIDEO_TRACK_DEBUG_LOGS"] = "false"

from PIL import Image

from backend.main import VideoTrackAggregator, _canonical_annotation_frame_map, _class_evidence_from_observations, _duplicate_evidence, _merge_two_tracks, _process_video_drive_file, _refine_detected_category, _scene_cut_signature, _select_annotated_preview_observation, _video_tracking_summary, appearance_fingerprint_from_bytes, is_hard_video_scene_cut, merge_track_fragments, namespace_video_track_detections, reconcile_duplicate_tracked_objects, reset_video_tracker_state
from backend.deduplicate_tracked_video_results import build_report


def detection(track_id, category="plastic", confidence=0.8, x1=0.1, y1=0.1, x2=0.2, y2=0.2):
    return {
        "track_id": track_id,
        "category": category,
        "material_name": category,
        "confidence": confidence,
        "bbox": [x1, y1, x2, y2],
        "bbox_percent": {
            "x": x1 * 100,
            "y": y1 * 100,
            "width": (x2 - x1) * 100,
            "height": (y2 - y1) * 100,
        },
        "mask": [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
    }


class VideoTrackAggregationTests(unittest.TestCase):
    def test_one_object_across_many_frames_is_one_result(self):
        aggregator = VideoTrackAggregator("upload-1", lost_buffer=2)
        for frame in range(5):
            aggregator.observe(frame, frame / 10, [detection(7, "plastic", 0.8 + frame * 0.01)])

        results = aggregator.finish(6)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["stable_object_id"], "upload-1-track-7")
        self.assertEqual(results[0]["track_frame_count"], 5)
        self.assertEqual(results[0]["category"], "plastic")

    def test_two_same_class_objects_are_two_results(self):
        aggregator = VideoTrackAggregator("upload-2")
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [
                detection(1, "metal", 0.91, 0.1, 0.1, 0.2, 0.2),
                detection(2, "metal", 0.93, 0.6, 0.1, 0.7, 0.2),
            ])

        results = aggregator.finish(4)

        self.assertEqual(len(results), 2)
        self.assertEqual(_video_tracking_summary(results)["counts_by_class"], {"metal": 2})

    def test_brief_occlusion_and_changed_track_id_recovers_one_result(self):
        aggregator = VideoTrackAggregator("upload-3", lost_buffer=4, recovery_iou=0.2)
        aggregator.observe(0, 0.0, [detection(10, "glass", 0.86, 0.2, 0.2, 0.3, 0.3)])
        aggregator.observe(1, 0.1, [detection(10, "glass", 0.88, 0.21, 0.2, 0.31, 0.3)])
        aggregator.observe(2, 0.2, [])
        aggregator.observe(3, 0.3, [detection(99, "glass", 0.9, 0.22, 0.2, 0.32, 0.3)])

        results = aggregator.finish(4)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["track_frame_count"], 3)
        self.assertEqual(results[0]["track_id"], "10,99")

    def test_weighted_vote_chooses_final_class(self):
        aggregator = VideoTrackAggregator("upload-4")
        aggregator.observe(0, 0.0, [detection(1, "plastic", 0.55)])
        aggregator.observe(1, 0.1, [detection(1, "metal", 0.92)])
        aggregator.observe(2, 0.2, [detection(1, "metal", 0.91)])

        results = aggregator.finish(3)

        self.assertEqual(results[0]["category"], "metal")
        self.assertAlmostEqual(results[0]["track_max_confidence"], 0.92)

    def test_short_tracks_are_filtered_unless_high_confidence(self):
        low = VideoTrackAggregator("upload-5", min_frames=3, short_track_confidence=0.95)
        low.observe(0, 0.0, [detection(1, "paper", 0.8)])
        high = VideoTrackAggregator("upload-6", min_frames=3, short_track_confidence=0.95)
        high.observe(0, 0.0, [detection(1, "paper", 0.97)])

        self.assertEqual(low.finish(1), [])
        self.assertEqual(len(high.finish(1)), 1)

    def test_battery_hazards_are_reported(self):
        aggregator = VideoTrackAggregator("upload-7")
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "battery", 0.96)])

        results = aggregator.finish(4)
        summary = _video_tracking_summary(results)

        self.assertEqual(results[0]["track_hazard_status"], "hazard")
        self.assertEqual(len(summary["hazards"]), 1)

    def test_counting_line_deduplicates_crossing_per_track(self):
        aggregator = VideoTrackAggregator("upload-8", counting_line={"axis": "x", "position": 0.5, "direction": "positive"})
        aggregator.observe(0, 0.0, [detection(1, "cardboard", 0.93, 0.35, 0.1, 0.45, 0.2)])
        aggregator.observe(1, 0.1, [detection(1, "cardboard", 0.93, 0.45, 0.1, 0.55, 0.2)])
        aggregator.observe(2, 0.2, [detection(1, "cardboard", 0.93, 0.55, 0.1, 0.65, 0.2)])

        results = aggregator.finish(3)

        self.assertEqual(len(results), 1)
        self.assertTrue(results[0]["track_counted"])

    def test_end_of_video_flushes_active_tracks(self):
        aggregator = VideoTrackAggregator("upload-9")
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "paper", 0.9)])

        self.assertEqual(len(aggregator.finalized), 0)
        self.assertEqual(len(aggregator.finish(3)), 1)

    def test_fragmented_ids_merge_into_one_logical_object(self):
        aggregator = VideoTrackAggregator("upload-10", recovery_center_distance=0)
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "plastic", 0.9, 0.1 + frame * 0.01, 0.1, 0.2 + frame * 0.01, 0.2)])
        aggregator.finish(3)
        second = VideoTrackAggregator("upload-10")
        for frame in range(5, 8):
            second.observe(frame, frame / 10, [detection(7, "plastic", 0.91, 0.14 + frame * 0.005, 0.1, 0.24 + frame * 0.005, 0.2)])
        second.finish(8)

        merged = merge_track_fragments(aggregator.finalized + second.finalized, "upload-10")

        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["object_uid"], "upload-10-object-0001")
        self.assertEqual(merged[0]["source_track_ids"], ["1", "7"])

    def test_cross_segment_fragments_do_not_merge_logically(self):
        first = VideoTrackAggregator("upload-segment-merge", min_frames=1)
        first.observe(0, 0.0, namespace_video_track_detections([detection(1, "plastic", 0.9, 0.1, 0.1, 0.2, 0.2)], 0))
        first.finish(1)
        second = VideoTrackAggregator("upload-segment-merge", min_frames=1)
        second.observe(2, 0.2, namespace_video_track_detections([detection(1, "plastic", 0.9, 0.1, 0.1, 0.2, 0.2)], 1))
        second.finish(3)

        merged = merge_track_fragments(first.finalized + second.finalized, "upload-segment-merge")

        self.assertEqual(len(merged), 2)

    def test_separate_same_class_objects_do_not_merge(self):
        aggregator = VideoTrackAggregator("upload-11")
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "metal", 0.9, 0.1, 0.1, 0.2, 0.2)])
        aggregator.finish(3)
        second = VideoTrackAggregator("upload-11")
        for frame in range(5, 8):
            second.observe(frame, frame / 10, [detection(2, "metal", 0.9, 0.7, 0.1, 0.8, 0.2)])
        second.finish(8)

        merged = merge_track_fragments(aggregator.finalized + second.finalized, "upload-11")

        self.assertEqual(len(merged), 2)

    def test_six_physical_objects_can_remain_six_logical_objects(self):
        tracks = []
        for track_id in range(1, 7):
            aggregator = VideoTrackAggregator("upload-12")
            x = 0.08 * track_id
            for frame in range(3):
                aggregator.observe(frame, frame / 10, [detection(track_id, "plastic", 0.9, x, 0.1, x + 0.04, 0.18)])
            aggregator.finish(4)
            tracks.extend(aggregator.finalized)

        merged = merge_track_fragments(tracks, "upload-12")

        self.assertEqual(len(merged), 6)

    def test_each_track_finalizes_once(self):
        aggregator = VideoTrackAggregator("upload-13", lost_buffer=1)
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "glass", 0.9)])
        aggregator.observe(5, 0.5, [])
        aggregator.observe(6, 0.6, [detection(1, "glass", 0.9)])
        aggregator.finish(7)

        self.assertEqual(len(aggregator.finalized), 1)

    def test_reused_raw_track_id_across_segments_is_distinct(self):
        aggregator = VideoTrackAggregator("upload-segments")
        aggregator.observe(0, 0.0, namespace_video_track_detections([detection(1, "glass", 0.9)], 0))
        aggregator.observe(1, 0.1, namespace_video_track_detections([detection(1, "glass", 0.9)], 0))
        aggregator.observe(2, 0.2, namespace_video_track_detections([detection(1, "glass", 0.9)], 0))
        aggregator.flush_stale(3, force=True)
        aggregator.observe(3, 0.3, namespace_video_track_detections([detection(1, "textile", 0.9)], 1))
        aggregator.observe(4, 0.4, namespace_video_track_detections([detection(1, "textile", 0.9)], 1))
        aggregator.observe(5, 0.5, namespace_video_track_detections([detection(1, "textile", 0.9)], 1))
        aggregator.finish(6)

        self.assertEqual(len(aggregator.finalized), 2)
        self.assertEqual([item["source_track_ids"] for item in aggregator.finalized], [["segment=0|track=1"], ["segment=1|track=1"]])

    def test_hard_cut_flush_allows_same_raw_id_after_reset(self):
        aggregator = VideoTrackAggregator("upload-cut", min_frames=1)
        aggregator.observe(0, 0.0, namespace_video_track_detections([detection(1, "glass", 0.9)], 0))
        flushed = aggregator.flush_stale(1, force=True)
        aggregator.observe(1, 0.1, namespace_video_track_detections([detection(1, "paper", 0.9)], 1))
        aggregator.finish(2)

        self.assertEqual(len(flushed), 1)
        self.assertEqual(len(aggregator.finalized), 2)
        self.assertEqual(aggregator.finalized[1]["category"], "paper")

    def test_tracker_reset_calls_existing_trackers(self):
        calls = []
        tracker = SimpleNamespace(reset=lambda: calls.append("reset"))
        model = SimpleNamespace(predictor=SimpleNamespace(trackers=[tracker]))

        self.assertEqual(reset_video_tracker_state(model), 1)
        self.assertEqual(calls, ["reset"])

    def test_hard_full_frame_change_detected(self):
        import numpy as np

        first = np.zeros((120, 160, 3), dtype=np.uint8)
        second = np.full((120, 160, 3), 255, dtype=np.uint8)

        detected, metrics = is_hard_video_scene_cut(_scene_cut_signature(first), _scene_cut_signature(second))

        self.assertTrue(detected)
        self.assertGreaterEqual(metrics["mean_diff"], 0.35)

    def test_localized_object_motion_not_scene_cut(self):
        import numpy as np

        first = np.full((120, 160, 3), 128, dtype=np.uint8)
        second = first.copy()
        first[40:80, 20:60] = 255
        second[40:80, 80:120] = 255

        detected, _ = is_hard_video_scene_cut(_scene_cut_signature(first), _scene_cut_signature(second))

        self.assertFalse(detected)

    def test_video_processing_does_not_persist_inside_frame_loop(self):
        with open("backend/main.py", "r", encoding="utf-8") as handle:
            source = handle.read()
        start = source.index("def _process_video_drive_file")
        end = source.index("def _process_drive_file", start)
        body = source[start:end]

        loop_start = body.index("while True:")
        loop_end = body.index("capture.release()", loop_start)
        self.assertNotIn("_persist_tracked_video_objects", body[loop_start:loop_end])

    def _track(self, object_id, track_id, category="plastic", confidence=0.8, first=0, last=2, x=0.1, y=0.1, appearance="same", verified=False):
        frame_count = last - first + 1
        observations = []
        path = []
        for offset, frame in enumerate(range(first, last + 1)):
            step_x = x + offset * 0.01
            bbox = [step_x, y, step_x + 0.1, y + 0.1]
            observations.append({"frame": frame, "timestamp": frame / 10, "track_id": str(track_id), "category": category, "confidence": confidence, "bbox": bbox})
            path.append({"frame": frame, "timestamp": frame / 10, "x": round(step_x + 0.05, 4), "y": round(y + 0.05, 4)})
        return {
            "stable_object_id": object_id,
            "object_uid": object_id,
            "source_track_ids": [str(track_id)],
            "track_id": str(track_id),
            "category": category,
            "material_name": category,
            "confidence": confidence,
            "track_max_confidence": confidence,
            "track_avg_confidence": confidence,
            "track_first_frame": first,
            "track_last_frame": last,
            "track_first_timestamp": first / 10,
            "track_last_timestamp": last / 10,
            "track_frame_count": frame_count,
            "track_start_center": {"x": path[0]["x"], "y": path[0]["y"]},
            "track_end_center": {"x": path[-1]["x"], "y": path[-1]["y"]},
            "track_avg_width": 0.1,
            "track_avg_height": 0.1,
            "track_avg_aspect_ratio": 1.0,
            "track_hazard_status": "clear",
            "recyclable_status": "recyclable",
            "contaminant_status": "clean",
            "review_required": False,
            "track_path": path,
            "best_bbox_norm": observations[-1]["bbox"],
            "track_debug": {
                "frame_observations": observations,
                "class_votes": {category: round(confidence * frame_count, 4)},
                "raw_track_ids": [str(track_id)],
                "appearance_hash": appearance,
                **({"human_verified": True} if verified else {}),
            },
        }

    def _fingerprint(self, color):
        image = Image.new("RGB", (40, 40), color)
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        return appearance_fingerprint_from_bytes(buffer.getvalue(), bbox=[0, 0, 1, 1])

    def _opposite_fingerprints(self):
        return (
            {"average_hash": "0" * 16, "edge_hash": "0" * 16, "color_histogram": [1.0] + [0.0] * 23},
            {"average_hash": "f" * 16, "edge_hash": "f" * 16, "color_histogram": [0.0, 1.0] + [0.0] * 22},
        )

    def test_duplicate_reconciliation_keeps_stable_track(self):
        track = self._track("upload-object-0001", 1)
        canonical, report = reconcile_duplicate_tracked_objects([track], "upload")

        self.assertEqual(canonical, [track])
        self.assertEqual(report["output_count"], 1)

    def test_refinement_does_not_rewrite_plastic_to_metal_or_invent_confidence(self):
        import numpy as np

        box = SimpleNamespace(cls=[0], conf=[0.42])
        frame = np.full((100, 100, 3), 220, dtype=np.uint8)

        class_id, material, confidence = _refine_detected_category(
            box,
            {0: "plastic", 3: "metal"},
            frame=frame,
            xyxy=[10, 10, 90, 90],
        )

        self.assertEqual(class_id, 0)
        self.assertEqual(material, "plastic")
        self.assertEqual(confidence, 0.42)

    def test_refinement_preserves_raw_metal_class_and_confidence(self):
        box = SimpleNamespace(cls=[3], conf=[0.71])

        class_id, material, confidence = _refine_detected_category(box, {3: "metal"})

        self.assertEqual(class_id, 3)
        self.assertEqual(material, "metal")
        self.assertEqual(confidence, 0.71)

    def test_duplicate_reconciliation_merges_occluded_track_id_change(self):
        first = self._track("upload-object-0001", 1, first=0, last=2, x=0.10)
        second = self._track("upload-object-0002", 7, first=5, last=7, x=0.13)

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(canonical[0]["source_track_ids"], ["1", "7"])
        self.assertEqual(report["output_count"], 1)

    def test_no_cross_segment_physical_reconciliation(self):
        first = self._track("upload-object-0001", "segment=0|track=1", first=0, last=2, x=0.10)
        second = self._track("upload-object-0002", "segment=1|track=1", first=4, last=6, x=0.10)
        first["track_segment_ids"] = ["0"]
        second["track_segment_ids"] = ["1"]
        first["track_debug"]["segment_ids"] = ["0"]
        second["track_debug"]["segment_ids"] = ["1"]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "different video segments")

    def test_same_segment_reconciliation_unchanged(self):
        first = self._track("upload-object-0001", "segment=0|track=1", first=0, last=2, x=0.10)
        second = self._track("upload-object-0002", "segment=0|track=2", first=5, last=7, x=0.13)
        first["track_segment_ids"] = ["0"]
        second["track_segment_ids"] = ["0"]
        first["track_debug"]["segment_ids"] = ["0"]
        second["track_debug"]["segment_ids"] = ["0"]

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)

    def test_duplicate_reconciliation_merges_class_change_when_tracking_and_appearance_agree(self):
        first = self._track("upload-object-0001", 1, "plastic", first=0, last=2, x=0.10, appearance="item-a")
        second = self._track("upload-object-0002", 2, "cardboard", first=4, last=6, x=0.12, appearance="item-a")
        fingerprint = self._fingerprint((230, 80, 20))
        first["track_debug"]["appearance_fingerprints"] = [fingerprint]
        second["track_debug"]["appearance_fingerprints"] = [fingerprint]

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(canonical[0]["source_track_ids"], ["1", "2"])

    def test_duplicate_reconciliation_merges_short_overlap_with_spatial_agreement(self):
        first = self._track("upload-object-0001", 1, first=0, last=5, x=0.10, appearance="item-a")
        second = self._track("upload-object-0002", 2, first=4, last=8, x=0.14, appearance="item-a")

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)

    def test_duplicate_reconciliation_allows_strong_short_overlap_switch(self):
        first = self._track("upload-object-0001", 1, first=0, last=12, x=0.10, appearance="item-a")
        second = self._track("upload-object-0002", 2, first=5, last=14, x=0.15, appearance="item-a")

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertTrue(report["confirmed_groups"][0]["evidence"][0]["strong_overlap_switch"])

    def test_duplicate_reconciliation_three_fragments_keep_highest_confidence(self):
        tracks = [
            self._track("upload-object-0001", 1, confidence=0.7, first=0, last=2, x=0.10),
            self._track("upload-object-0002", 2, confidence=0.9, first=4, last=6, x=0.13),
            self._track("upload-object-0003", 3, confidence=0.8, first=8, last=10, x=0.16),
        ]

        canonical, _ = reconcile_duplicate_tracked_objects(tracks, "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(canonical[0]["stable_object_id"], "upload-object-0002")
        self.assertEqual(canonical[0]["track_debug"]["deduplicated_object_ids"], ["upload-object-0001", "upload-object-0003"])

    def test_duplicate_reconciliation_merges_metadata(self):
        first = self._track("upload-object-0001", 1, first=0, last=2, x=0.10)
        second = self._track("upload-object-0002", 2, first=5, last=7, x=0.13)

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(canonical[0]["track_first_frame"], 0)
        self.assertEqual(canonical[0]["track_last_frame"], 7)
        self.assertEqual(canonical[0]["track_frame_count"], 6)
        self.assertEqual(canonical[0]["track_debug"]["class_votes"]["plastic"], 1.6)

    def test_duplicate_reconciliation_verified_record_beats_confidence(self):
        verified = self._track("upload-object-0001", 1, confidence=0.7, first=0, last=2, x=0.10, verified=True)
        high = self._track("upload-object-0002", 2, confidence=0.95, first=5, last=7, x=0.13)

        canonical, _ = reconcile_duplicate_tracked_objects([verified, high], "upload")

        self.assertEqual(canonical[0]["stable_object_id"], "upload-object-0001")

    def test_duplicate_reconciliation_keeps_simultaneous_same_category_objects(self):
        first = self._track("upload-object-0001", 1, first=0, last=20, x=0.10)
        second = self._track("upload-object-0002", 2, first=0, last=20, x=0.12)

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertIn("coexist", report["rejected_candidates"][0]["final_reason"])

    def test_duplicate_reconciliation_keeps_five_distinct_stationary_objects(self):
        tracks = [
            self._track(f"upload-object-{index:04d}", index, first=0, last=30, x=0.08 + (index * 0.14), appearance="same-frame")
            for index in range(1, 6)
        ]

        canonical, report = reconcile_duplicate_tracked_objects(tracks, "upload")

        self.assertEqual(len(canonical), 5)
        self.assertTrue(all("simultaneous low-IoU boxes" in item["final_reason"] for item in report["rejected_candidates"]))

    def test_duplicate_reconciliation_merges_one_stationary_object_with_multiple_track_ids(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.10)
        second = self._track("upload-object-0002", 2, first=9, last=16, x=0.10)

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(canonical[0]["source_track_ids"], ["1", "2"])

    def test_duplicate_reconciliation_keeps_nearby_same_category_objects_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.10)
        second = self._track("upload-object-0002", 2, first=0, last=30, x=0.24)

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "simultaneous low-IoU boxes for 31 frames")

    def test_duplicate_reconciliation_ignores_full_frame_similarity_for_separate_boxes(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.10, appearance="same-full-frame")
        second = self._track("upload-object-0002", 2, first=0, last=30, x=0.36, appearance="same-full-frame")

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)

    def test_duplicate_reconciliation_uses_object_crop_similarity_for_fragments(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.10)
        second = self._track("upload-object-0002", 2, first=10, last=18, x=0.11)
        fingerprint = self._fingerprint((220, 20, 20))
        first["track_debug"]["appearance_fingerprints"] = [fingerprint]
        second["track_debug"]["appearance_fingerprints"] = [fingerprint]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(report["confirmed_groups"][0]["evidence"][0]["appearance_status"], "appearance compared successfully")

    def test_duplicate_reconciliation_uses_stabilized_trajectory_when_available(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.10)
        second = self._track("upload-object-0002", 2, first=10, last=18, x=0.60)
        fingerprint = self._fingerprint((220, 20, 20))
        first["track_debug"]["appearance_fingerprints"] = [fingerprint]
        second["track_debug"]["appearance_fingerprints"] = [fingerprint]
        first["track_end_scene_center"] = {"x": 0.25, "y": 0.25}
        second["track_start_scene_center"] = {"x": 0.27, "y": 0.25}

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        evidence = report["confirmed_groups"][0]["evidence"][0]
        self.assertTrue(evidence["stabilized_coordinates_used"])
        self.assertGreater(evidence["raw_trajectory_distance"], evidence["stabilized_trajectory_distance"])

    def test_duplicate_reconciliation_fails_safe_without_stabilized_trajectory(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.10)
        second = self._track("upload-object-0002", 2, first=10, last=18, x=0.60)
        fingerprint = self._fingerprint((220, 20, 20))
        first["track_debug"]["appearance_fingerprints"] = [fingerprint]
        second["track_debug"]["appearance_fingerprints"] = [fingerprint]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertFalse(report["rejected_candidates"][0]["stabilized_coordinates_used"])
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "trajectory discontinuity")

    def test_duplicate_reconciliation_keeps_stabilized_simultaneous_low_iou_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.10)
        second = self._track("upload-object-0002", 2, first=0, last=30, x=0.40)
        first["track_end_scene_center"] = {"x": 0.25, "y": 0.25}
        second["track_start_scene_center"] = {"x": 0.26, "y": 0.25}

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertTrue(report["rejected_candidates"][0]["simultaneous_low_iou_separate"])

    def test_duplicate_reconciliation_keeps_simultaneous_low_iou_boxes_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.10)
        second = self._track("upload-object-0002", 2, first=0, last=30, x=0.40)
        fingerprint = self._fingerprint((40, 80, 200))
        first["track_debug"]["appearance_fingerprints"] = [fingerprint]
        second["track_debug"]["appearance_fingerprints"] = [fingerprint]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertTrue(report["rejected_candidates"][0]["simultaneous_low_iou_separate"])

    def test_duplicate_reconciliation_keeps_different_locations_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=2, x=0.10)
        second = self._track("upload-object-0002", 2, first=5, last=7, x=0.70)

        canonical, _ = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)

    def test_duplicate_reconciliation_keeps_different_appearance_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=2, x=0.10, appearance="a")
        second = self._track("upload-object-0002", 2, first=5, last=7, x=0.13, appearance="b")
        first_fp, second_fp = self._opposite_fingerprints()
        first["track_debug"]["appearance_fingerprints"] = [first_fp]
        second["track_debug"]["appearance_fingerprints"] = [second_fp]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "appearance differs")

    def test_duplicate_reconciliation_tie_break_is_deterministic(self):
        tracks = [
            self._track("upload-object-0002", 2, first=5, last=7, x=0.13),
            self._track("upload-object-0001", 1, first=0, last=2, x=0.10),
        ]

        first_run, _ = reconcile_duplicate_tracked_objects(tracks, "upload")
        second_run, _ = reconcile_duplicate_tracked_objects(list(reversed(tracks)), "upload")

        self.assertEqual(first_run[0]["stable_object_id"], "upload-object-0001")
        self.assertEqual(second_run[0]["stable_object_id"], "upload-object-0001")

    def test_physical_reconciliation_stationary_object_under_camera_pan_merges_fragments(self):
        tracks = []
        fingerprint = self._fingerprint((20, 180, 90))
        for index, raw_x in enumerate([0.10, 0.38, 0.66], start=1):
            track = self._track(f"upload-object-{index:04d}", index, first=index * 10, last=index * 10 + 5, x=raw_x)
            track["track_debug"]["appearance_fingerprints"] = [fingerprint]
            track["track_end_scene_center"] = {"x": 0.30 + index * 0.005, "y": 0.30}
            track["track_start_scene_center"] = {"x": 0.30 + index * 0.005, "y": 0.30}
            tracks.append(track)

        canonical, report = reconcile_duplicate_tracked_objects(list(reversed(tracks)), "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(report["output_count"], 1)

    def test_physical_reconciliation_five_stationary_objects_under_camera_movement_remain_five(self):
        tracks = []
        for index in range(5):
            track = self._track(f"upload-object-{index + 1:04d}", index + 1, first=0, last=40, x=0.08 + index * 0.16)
            track["track_start_scene_center"] = {"x": 0.12 + index * 0.16, "y": 0.18}
            track["track_end_scene_center"] = {"x": 0.12 + index * 0.16, "y": 0.18}
            tracks.append(track)

        canonical, report = reconcile_duplicate_tracked_objects(tracks, "upload")

        self.assertEqual(len(canonical), 5)
        self.assertTrue(any(item["simultaneous_low_iou_separate"] for item in report["rejected_candidates"]))

    def test_physical_reconciliation_keeps_crossing_paths_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.10)
        second = self._track("upload-object-0002", 2, first=0, last=30, x=0.60)
        first["track_path"] = [{"frame": frame, "x": 0.10 + frame * 0.012, "y": 0.2} for frame in range(31)]
        second["track_path"] = [{"frame": frame, "x": 0.60 - frame * 0.012, "y": 0.2} for frame in range(31)]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertTrue(report["rejected_candidates"][0]["simultaneous_low_iou_separate"])

    def test_physical_reconciliation_keeps_brief_visual_overlap_without_handover_evidence_separate(self):
        first = self._track("upload-object-0001", 1, first=0, last=12, x=0.10)
        second = self._track("upload-object-0002", 2, first=8, last=20, x=0.30)

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "overlap lacks strong spatial agreement")

    def test_physical_reconciliation_selects_strong_preview_over_bad_full_frame(self):
        bad = self._track("upload-object-0001", 1, confidence=0.95, first=0, last=8, x=0.10)
        good = self._track("upload-object-0002", 2, confidence=0.80, first=10, last=18, x=0.11)
        bad["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
        bad["best_box"] = {"xyxy": [0.0, 0.0, 1.0, 1.0], "frame": 0}
        good["best_bbox_norm"] = [0.11, 0.1, 0.21, 0.2]
        good["best_box"] = {"xyxy": [0.11, 0.1, 0.21, 0.2], "frame": 10}

        canonical, _ = reconcile_duplicate_tracked_objects([bad, good], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(canonical[0]["stable_object_id"], "upload-object-0002")
        self.assertEqual(canonical[0]["best_bbox_norm"], [0.11, 0.1, 0.21, 0.2])

    def test_physical_reconciliation_merges_partial_edge_detection_when_evidence_agrees(self):
        partial = self._track("upload-object-0001", 1, first=0, last=8, x=0.02)
        full = self._track("upload-object-0002", 2, first=10, last=18, x=0.08)
        fingerprint = self._fingerprint((40, 170, 220))
        partial["track_debug"]["appearance_fingerprints"] = [fingerprint]
        full["track_debug"]["appearance_fingerprints"] = [fingerprint]
        partial.update({"track_avg_width": 0.04, "track_avg_height": 0.08, "track_avg_aspect_ratio": 0.5, "best_bbox_norm": [0.0, 0.1, 0.04, 0.18]})
        full.update({"track_avg_width": 0.10, "track_avg_height": 0.10, "track_avg_aspect_ratio": 1.0, "best_bbox_norm": [0.08, 0.1, 0.18, 0.2]})

        canonical, report = reconcile_duplicate_tracked_objects([partial, full], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertTrue(report["confirmed_groups"][0]["evidence"][0]["partial_fragment_supported"])

    def test_physical_reconciliation_rejects_far_partial_bridge_without_appearance(self):
        partial = self._track("upload-object-0001", 1, first=0, last=8, x=0.02)
        far = self._track("upload-object-0002", 2, first=10, last=18, x=0.90)
        partial.update({"track_avg_width": 0.04, "track_avg_height": 0.08, "track_avg_aspect_ratio": 0.5, "best_bbox_norm": [0.0, 0.1, 0.04, 0.18]})
        far.update({"track_avg_width": 0.10, "track_avg_height": 0.10, "track_avg_aspect_ratio": 1.0, "best_bbox_norm": [0.90, 0.1, 1.0, 0.2]})

        canonical, report = reconcile_duplicate_tracked_objects([partial, far], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "fragment bridge lacks spatial continuity")

    def test_physical_reconciliation_rejects_partial_bridge_without_size_support(self):
        broad = self._track("upload-object-0001", 1, first=0, last=8, x=0.30)
        small = self._track("upload-object-0002", 2, first=12, last=20, x=0.60)
        broad.update({"track_avg_width": 0.70, "track_avg_height": 0.30, "track_avg_aspect_ratio": 2.33, "best_bbox_norm": [0.0, 0.60, 0.70, 0.90]})
        small.update({"track_avg_width": 0.10, "track_avg_height": 0.10, "track_avg_aspect_ratio": 1.0, "best_bbox_norm": [0.55, 0.60, 0.65, 0.70]})

        canonical, report = reconcile_duplicate_tracked_objects([broad, small], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertEqual(report["rejected_candidates"][0]["final_reason"], "partial fragment bridge lacks size support")

    def test_transitive_spatial_bridge_does_not_collapse_group(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.10)
        bridge = self._track("upload-object-0002", 2, first=10, last=18, x=0.25)
        last = self._track("upload-object-0003", 3, first=20, last=28, x=0.40)

        canonical, report = reconcile_duplicate_tracked_objects([first, bridge, last], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertTrue(report["cluster_split_events"])

    def test_logical_merge_rejects_near_full_frame_fragment(self):
        object_track = self._track("upload-object-0001", 1, first=0, last=20, x=0.30)
        full_frame = self._track("upload-object-0002", 2, first=22, last=24, x=0.30)
        full_frame["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
        for observation in full_frame["track_debug"]["frame_observations"]:
            observation["bbox"] = [0.0, 0.0, 1.0, 1.0]

        merged = merge_track_fragments([object_track, full_frame], "upload")

        self.assertEqual(len(merged), 2)

    def test_logical_merge_rejects_partial_broad_fragment(self):
        object_track = self._track("upload-object-0001", 1, first=0, last=20, x=0.45)
        broad_fragment = self._track("upload-object-0002", 2, first=35, last=40, x=0.45)
        broad_fragment["best_bbox_norm"] = [0.0, 0.35, 1.0, 0.95]
        broad_fragment.update({
            "track_avg_width": 0.95,
            "track_avg_height": 0.55,
            "track_avg_aspect_ratio": 1.73,
            "track_start_center": {"x": 0.5, "y": 0.65},
            "track_end_center": {"x": 0.5, "y": 0.65},
        })
        for observation in broad_fragment["track_debug"]["frame_observations"]:
            observation["bbox"] = [0.0, 0.35, 1.0, 0.95]

        merged = merge_track_fragments([object_track, broad_fragment], "upload")

        self.assertEqual(len(merged), 2)

    def test_recovery_does_not_attach_near_full_frame_detection(self):
        aggregator = VideoTrackAggregator("upload-near-full-recovery", min_frames=1, lost_buffer=5)
        aggregator.observe(0, 0.0, [detection(1, "plastic", 0.70, 0.30, 0.30, 0.50, 0.50)])
        aggregator.observe(2, 0.2, [detection(None, "plastic", 0.80, 0.0, 0.0, 1.0, 1.0)])
        results = aggregator.finish(10)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["source_track_ids"], ["1"])

    def test_recovery_does_not_attach_to_prior_broad_edge_track(self):
        aggregator = VideoTrackAggregator("upload-broad-recovery", min_frames=1, lost_buffer=10)
        for frame in range(3):
            aggregator.observe(frame, frame / 10, [detection(1, "plastic", 0.70, 0.20, 0.65, 0.95, 1.0)])
        aggregator.observe(5, 0.5, [detection(2, "plastic", 0.80, 0.30, 0.60, 0.60, 0.90)])
        results = aggregator.finish(20)

        self.assertEqual(len(results), 2)
        self.assertEqual([item["source_track_ids"] for item in results], [["1"], ["2"]])

    def test_known_video_fixture_splits_unsupported_partial_bridge(self):
        fixture_path = Path(__file__).parent / "fixtures" / "video_reconciliation" / "aa894e58_tracks.json"
        tracks = json.loads(fixture_path.read_text(encoding="utf-8"))["tracks"]
        expected = sorted([
            ["object-0001", "object-0003", "object-0005"],
            ["object-0002"],
            ["object-0004"],
            ["object-0006", "object-0009"],
            ["object-0008", "object-0010"],
            ["object-0007", "object-0011"],
        ])

        def groups(items):
            return sorted([
                sorted(f"object-{value.rsplit('-', 1)[-1]}" for value in (item.get("track_debug") or {})["physical_object_reconciliation"]["cluster_object_ids"])
                for item in items
            ])

        canonical, report = reconcile_duplicate_tracked_objects(tracks, "fixture", dry_run=True)
        reversed_canonical, _ = reconcile_duplicate_tracked_objects(list(reversed(tracks)), "fixture", dry_run=True)

        self.assertEqual(report["input_count"], 11)
        self.assertEqual(report["output_count"], 6)
        self.assertEqual(groups(canonical), expected)
        self.assertEqual(groups(reversed_canonical), expected)

    def test_weak_simultaneous_low_iou_observation_is_not_hard_separation(self):
        weak = self._track("upload-object-0001", 1, first=0, last=30, x=0.0)
        strong = self._track("upload-object-0002", 2, first=0, last=30, x=0.5)
        weak["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
        for item in weak["track_debug"]["frame_observations"]:
            item["bbox"] = [0.0, 0.0, 1.0, 1.0]

        evidence = _duplicate_evidence(weak, strong)

        self.assertFalse(evidence["simultaneous_low_iou_separate"])
        self.assertFalse(evidence["stable_tracks_coexist"])

    def test_bridge_fragment_connects_component_without_all_pair_matches(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.1)
        bridge = self._track("upload-object-0002", 2, first=11, last=27, x=0.1)
        last = self._track("upload-object-0003", 3, first=30, last=38, x=0.1)
        first["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
        bridge["best_bbox_norm"] = [0.0, 0.1, 0.08, 0.2]

        canonical, report = reconcile_duplicate_tracked_objects([last, first, bridge], "upload")

        self.assertEqual(len(canonical), 1)
        self.assertEqual(len(canonical[0]["track_debug"]["physical_object_reconciliation"]["cluster_object_ids"]), 3)

    def test_reliable_transitive_contradiction_splits_component(self):
        first = self._track("upload-object-0001", 1, first=0, last=30, x=0.1)
        separate = self._track("upload-object-0002", 2, first=0, last=30, x=0.55)
        bridge = self._track("upload-object-0003", 3, first=32, last=38, x=0.3)
        bridge["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]

        canonical, report = reconcile_duplicate_tracked_objects([bridge, separate, first], "upload")

        self.assertEqual(len(canonical), 2)
        self.assertTrue(report["cluster_split_events"])

    def test_one_bad_crop_does_not_override_multiple_strong_matches(self):
        first = self._track("upload-object-0001", 1, first=0, last=8, x=0.1)
        second = self._track("upload-object-0002", 2, first=10, last=18, x=0.11)
        strong = self._fingerprint((220, 40, 40))
        bad, _ = self._opposite_fingerprints()
        first["track_debug"]["appearance_fingerprints"] = [{**strong, "frame": 0}, {**strong, "frame": 4}, {**bad, "frame": 8}]
        second["track_debug"]["appearance_fingerprints"] = [{**strong, "frame": 10}, {**strong, "frame": 14}, {**strong, "frame": 18}]

        canonical, report = reconcile_duplicate_tracked_objects([first, second], "upload")

        self.assertEqual(len(canonical), 1)
        evidence = report["confirmed_groups"][0]["evidence"][0]
        self.assertGreater(evidence["appearance_agreeing_pair_count"], 1)
        self.assertGreater(evidence["appearance_conflicting_pair_count"], 0)

    def test_video_pipeline_persists_only_after_reconciliation(self):
        source = inspect.getsource(_process_video_drive_file)
        self.assertGreater(source.index("_persist_tracked_video_objects("), source.index("reconcile_duplicate_tracked_objects("))
        self.assertEqual(source.count("_persist_tracked_video_objects("), 1)

    def test_duplicate_reconciliation_recalculates_summary_counts(self):
        duplicate_a = self._track("upload-object-0001", 1, "plastic", first=0, last=2, x=0.10)
        duplicate_b = self._track("upload-object-0002", 2, "plastic", first=5, last=7, x=0.13)
        separate = self._track("upload-object-0003", 3, "metal", first=0, last=2, x=0.70, appearance="metal")

        canonical, _ = reconcile_duplicate_tracked_objects([duplicate_a, duplicate_b, separate], "upload")
        summary = _video_tracking_summary(canonical)

        self.assertEqual(summary["total_unique_objects"], 2)
        self.assertEqual(summary["counts_by_class"], {"plastic": 1, "metal": 1})

    def test_preview_selector_rejects_reused_track_id_outside_frame_range(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "category": "cardboard",
            "confidence": 0.87,
            "track_first_frame": 10,
            "track_last_frame": 50,
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 100, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20}
            ]
        }

        self.assertIsNone(_select_annotated_preview_observation(material, observations))

    def test_preview_selector_chooses_highest_confidence_inside_frame_range_only(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "track_first_frame": 10,
            "track_last_frame": 50,
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "cardboard", "confidence": 0.80, "source_frame_index": 15, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "cardboard", "confidence": 0.87, "source_frame_index": 25, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 100, "box_xyxy": [3, 3, 10, 10], "frame_width": 20, "frame_height": 20},
            ]
        }

        selected = _select_annotated_preview_observation(material, observations)

        self.assertEqual(selected["source_frame_index"], 25)
        self.assertEqual(selected["category"], "cardboard")

    def test_preview_selector_outside_range_does_not_change_canonical_metadata(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "category": "cardboard",
            "confidence": 0.87,
            "disposal_route": "CARDBOARD SORTING BIN",
            "track_first_frame": 10,
            "track_last_frame": 50,
        }
        original = dict(material)
        observations = {
            "12": [
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 100, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20}
            ]
        }

        self.assertIsNone(_select_annotated_preview_observation(material, observations))
        self.assertEqual(material, original)

    def test_preview_selector_preserves_normal_long_running_track(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "track_first_frame": 10,
            "track_last_frame": 50,
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "cardboard", "confidence": 0.81, "source_frame_index": 10, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "cardboard", "confidence": 0.91, "source_frame_index": 50, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
            ]
        }

        selected = _select_annotated_preview_observation(material, observations)

        self.assertEqual(selected["source_frame_index"], 50)

    def test_preview_selector_allows_merged_fragment_ranges_but_rejects_reused_raw_id(self):
        material = {
            "track_id": "12,19",
            "source_track_ids": ["12", "19"],
            "track_first_frame": 10,
            "track_last_frame": 80,
            "track_debug": {
                "accepted_track_fragments": {
                    "12": [{"first_frame": 20, "last_frame": 35}],
                    "19": [{"first_frame": 70, "last_frame": 80}],
                }
            },
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "cardboard", "confidence": 0.84, "source_frame_index": 30, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 60, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
            ],
            "19": [
                {"track_id": "19", "category": "cardboard", "confidence": 0.89, "source_frame_index": 75, "box_xyxy": [3, 3, 10, 10], "frame_width": 20, "frame_height": 20}
            ],
        }

        selected = _select_annotated_preview_observation(material, observations)

        self.assertEqual(selected["track_id"], "19")
        self.assertEqual(selected["source_frame_index"], 75)
        self.assertEqual(selected["category"], "cardboard")

    def test_preview_selector_allows_multiple_fragments_for_same_raw_id(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "track_first_frame": 10,
            "track_last_frame": 50,
            "track_debug": {
                "accepted_track_fragments": {
                    "12": [
                        {"first_frame": 10, "last_frame": 20},
                        {"first_frame": 40, "last_frame": 50},
                    ]
                }
            },
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "cardboard", "confidence": 0.81, "source_frame_index": 15, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "metal", "confidence": 0.99, "source_frame_index": 30, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "cardboard", "confidence": 0.91, "source_frame_index": 45, "box_xyxy": [3, 3, 10, 10], "frame_width": 20, "frame_height": 20},
            ]
        }

        selected = _select_annotated_preview_observation(material, observations)

        self.assertEqual(selected["source_frame_index"], 45)
        self.assertEqual(selected["category"], "cardboard")

    def test_preview_selector_rejects_different_raw_id_inside_global_range(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "track_first_frame": 10,
            "track_last_frame": 50,
            "track_debug": {
                "accepted_track_fragments": {
                    "12": [{"first_frame": 10, "last_frame": 50}],
                }
            },
        }
        observations = {
            "13": [
                {"track_id": "13", "category": "metal", "confidence": 0.99, "source_frame_index": 30, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20}
            ],
            "12": [
                {"track_id": "13", "category": "metal", "confidence": 0.99, "source_frame_index": 30, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20}
            ],
        }

        self.assertIsNone(_select_annotated_preview_observation(material, observations))

    def test_preview_selector_falls_back_to_global_range_without_fragments(self):
        material = {
            "track_id": "12",
            "source_track_ids": ["12"],
            "track_first_frame": 10,
            "track_last_frame": 50,
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "cardboard", "confidence": 0.87, "source_frame_index": 25, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 60, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
            ]
        }

        selected = _select_annotated_preview_observation(material, observations)

        self.assertEqual(selected["source_frame_index"], 25)
        self.assertEqual(selected["category"], "cardboard")

    def test_single_high_confidence_outlier_does_not_dominate_class(self):
        aggregator = VideoTrackAggregator("upload-class-confidence-peak", min_frames=1, lost_buffer=10)
        observations = [
            detection(2, "metal", 0.8346, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.55, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.51, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.48, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.46, 0.1, 0.1, 0.2, 0.2),
        ]
        for frame, item in enumerate(observations):
            aggregator.observe(frame, frame / 10, [item])
        results = aggregator.finish(20)

        self.assertEqual(results[0]["category"], "plastic")
        self.assertEqual(results[0]["confidence"], 0.55)

    def test_canonical_confidence_comes_from_winning_class(self):
        aggregator = VideoTrackAggregator("upload-class-confidence", min_frames=1, lost_buffer=10)
        observations = [
            detection(2, "metal", 0.83, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.60, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.70, 0.1, 0.1, 0.2, 0.2),
            detection(2, "plastic", 0.75, 0.1, 0.1, 0.2, 0.2),
        ]
        for frame, item in enumerate(observations):
            aggregator.observe(frame, frame / 10, [item])
        results = aggregator.finish(20)

        self.assertEqual(results[0]["category"], "plastic")
        self.assertEqual(results[0]["confidence"], 0.75)
        self.assertEqual(results[0]["track_debug"]["raw_max_confidence"], 0.83)

    def test_short_strong_run_beats_long_weak_run(self):
        aggregator = VideoTrackAggregator("upload-bounded-class-evidence", min_frames=1, lost_buffer=100)
        for frame in range(40):
            aggregator.observe(frame, frame / 10, [detection(2, "plastic", 0.40, 0.1, 0.1, 0.2, 0.2)])
        for frame in range(40, 45):
            aggregator.observe(frame, frame / 10, [detection(2, "metal", 0.85, 0.1, 0.1, 0.2, 0.2)])

        results = aggregator.finish(100)

        self.assertEqual(results[0]["category"], "metal")
        self.assertEqual(results[0]["confidence"], 0.85)
        self.assertGreater(results[0]["track_debug"]["class_evidence"]["scores"]["metal"], results[0]["track_debug"]["class_evidence"]["scores"]["plastic"])

    def test_fragment_balancing_limits_one_long_weak_fragment(self):
        observations = []
        for frame in range(40):
            observations.append({"frame": frame, "track_id": "1", "category": "plastic", "confidence": 0.45})
        for track_id, start in (("2", 50), ("3", 70)):
            for frame in range(start, start + 3):
                observations.append({"frame": frame, "track_id": track_id, "category": "metal", "confidence": 0.82})

        evidence = _class_evidence_from_observations(observations)

        self.assertEqual(evidence["winner"], "metal")
        self.assertAlmostEqual(evidence["scores"]["plastic"], 0.45, places=4)
        self.assertAlmostEqual(evidence["scores"]["metal"], 1.64, places=4)

    def test_near_tied_class_evidence_sets_ambiguity_flag(self):
        observations = [
            {"frame": frame, "track_id": "1", "category": "plastic", "confidence": 0.60}
            for frame in range(3)
        ] + [
            {"frame": frame + 3, "track_id": "1", "category": "metal", "confidence": 0.58}
            for frame in range(3)
        ]

        evidence = _class_evidence_from_observations(observations)

        self.assertEqual(evidence["winner"], "plastic")
        self.assertTrue(evidence["class_ambiguous"])
        self.assertEqual(evidence["runner_up"], "metal")

    def test_merged_canonical_confidence_comes_from_winning_class(self):
        first = self._track("upload-object-0001", 2, "metal", confidence=0.83, first=0, last=0)
        second = self._track("upload-object-0002", 7, "plastic", confidence=0.75, first=1, last=3, x=0.11)
        second["track_debug"]["class_votes"] = {"plastic": 2.05}
        for obs in second["track_debug"]["frame_observations"]:
            obs["category"] = "plastic"
        canonical = _merge_two_tracks(first, second)

        self.assertEqual(canonical["category"], "plastic")
        self.assertEqual(canonical["confidence"], 0.75)

    def test_canonical_annotation_uses_final_class_and_preserves_raw_bbox(self):
        material = {
            "track_id": "2",
            "source_track_ids": ["2"],
            "category": "plastic",
            "confidence": 0.75,
            "track_debug": {"accepted_track_fragments": {"2": [{"first_frame": 102, "last_frame": 102}]}},
        }
        observations = {
            "2": [{
                "track_id": "2",
                "category": "metal",
                "confidence": 0.8346,
                "source_frame_index": 102,
                "annotated_frame_index": 102,
                "box_xyxy": [188, 398, 426, 477],
                "bbox": [0.4, 0.48, 0.92, 0.57],
                "frame_width": 464,
                "frame_height": 832,
            }]
        }

        frame_map = _canonical_annotation_frame_map([material], observations)
        rendered = frame_map[102][0]

        self.assertEqual(rendered["category"], "plastic")
        self.assertEqual(rendered["confidence"], 0.75)
        self.assertEqual(rendered["track_id"], "2")
        self.assertEqual(rendered["box_xyxy"], [188, 398, 426, 477])
        self.assertEqual(observations["2"][0]["category"], "metal")
        self.assertEqual(observations["2"][0]["confidence"], 0.8346)

    def test_canonical_annotation_preserves_fragment_mapping(self):
        material = {
            "track_id": "12,19",
            "source_track_ids": ["12", "19"],
            "category": "cardboard",
            "confidence": 0.89,
            "track_debug": {
                "accepted_track_fragments": {
                    "12": [{"first_frame": 20, "last_frame": 35}],
                    "19": [{"first_frame": 70, "last_frame": 80}],
                }
            },
        }
        observations = {
            "12": [
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 30, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "12", "category": "metal", "confidence": 0.96, "source_frame_index": 60, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
            ],
            "19": [
                {"track_id": "19", "category": "metal", "confidence": 0.96, "source_frame_index": 75, "box_xyxy": [3, 3, 10, 10], "frame_width": 20, "frame_height": 20}
            ],
        }

        frame_map = _canonical_annotation_frame_map([material], observations)

        self.assertIn(30, frame_map)
        self.assertIn(75, frame_map)
        self.assertNotIn(60, frame_map)
        self.assertEqual(frame_map[30][0]["category"], "cardboard")
        self.assertEqual(frame_map[75][0]["category"], "cardboard")

    def test_multi_class_track_uses_one_canonical_annotation_class(self):
        material = {
            "track_id": "68",
            "source_track_ids": ["68"],
            "category": "general_trash",
            "confidence": 0.40,
            "track_debug": {"accepted_track_fragments": {"68": [{"first_frame": 1, "last_frame": 3}]}},
        }
        observations = {
            "68": [
                {"track_id": "68", "category": "plastic", "confidence": 0.43, "source_frame_index": 1, "box_xyxy": [1, 1, 8, 8], "frame_width": 20, "frame_height": 20},
                {"track_id": "68", "category": "general_trash", "confidence": 0.40, "source_frame_index": 2, "box_xyxy": [2, 2, 9, 9], "frame_width": 20, "frame_height": 20},
            ],
        }

        frame_map = _canonical_annotation_frame_map([material], observations)

        self.assertEqual({item["category"] for values in frame_map.values() for item in values}, {"general_trash"})
        self.assertEqual(observations["68"][0]["category"], "plastic")

    def test_render_canonical_video_does_not_call_model_tracking(self):
        import inspect
        import backend.main as main_module

        source = inspect.getsource(main_module._render_canonical_annotated_video)

        self.assertNotIn(".track(", source)
        self.assertNotIn("get_model(", source)

    def test_merged_tracks_record_accepted_track_fragments(self):
        aggregator = VideoTrackAggregator("upload-fragments", min_frames=1, lost_buffer=2)
        for frame in range(20, 36):
            aggregator.observe(frame, frame / 10, [detection(12, "cardboard", 0.84, 0.1, 0.1, 0.2, 0.2)])
        aggregator.flush_stale(39)
        for frame in range(70, 81):
            aggregator.observe(frame, frame / 10, [detection(19, "cardboard", 0.89, 0.11, 0.1, 0.21, 0.2)])
        aggregator.finish(83)

        merged = merge_track_fragments(aggregator.finalized, "upload-fragments")
        canonical = next(item for item in merged if set(item.get("source_track_ids") or []) == {"12", "19"})
        fragments = canonical["track_debug"]["accepted_track_fragments"]

        self.assertEqual(fragments["12"], [{"first_frame": 20, "last_frame": 35}])
        self.assertEqual(fragments["19"], [{"first_frame": 70, "last_frame": 80}])

    def test_cleanup_dry_run_report_performs_no_writes(self):
        scan_1 = {"id": "scan-1", "batch_id": "batch-1", "overall_confidence": 0.7}
        scan_2 = {"id": "scan-2", "batch_id": "batch-1", "overall_confidence": 0.9}
        track_1 = self._track("batch-1-object-0001", 1, confidence=0.7, first=0, last=2, x=0.10)
        track_2 = self._track("batch-1-object-0002", 2, confidence=0.9, first=5, last=7, x=0.13)
        material_1 = {"id": "material-1", "scan_result_id": "scan-1", **track_1}
        material_2 = {"id": "material-2", "scan_result_id": "scan-2", **track_2}

        report, _, _ = build_report("batch-1", [scan_1, scan_2], [material_1, material_2], [], None, dry_run=True)

        self.assertTrue(report["dry_run"])
        self.assertEqual(len(report["duplicate_groups"]), 1)
        self.assertEqual(report["duplicate_groups"][0]["selected_canonical_scan_id"], "scan-2")

    def test_persistence_receives_only_final_physical_clusters(self):
        tracks = [
            self._track("upload-object-0001", 1, "plastic", first=0, last=2, x=0.10),
            self._track("upload-object-0002", 2, "metal", first=0, last=2, x=0.70),
        ]
        for track in tracks:
            track["best_box"] = {"xyxy": track["best_bbox_norm"], "frame": track["track_first_frame"]}
        captured = []

        def fake_persist(_file_bytes, _filename, _source_type, materials, *_args, **_kwargs):
            captured.append(materials[0]["stable_object_id"])
            return {"scan_result_id": f"scan-{len(captured)}"}

        import backend.main as main_module
        original_extract = main_module._extract_annotated_video_object_preview
        original_persist = main_module.persist_scan
        original_select = main_module._select_annotated_preview_observation
        try:
            main_module._select_annotated_preview_observation = lambda *_args, **_kwargs: {"track_id": "1", "box_xyxy": [1, 1, 5, 5]}
            main_module._extract_annotated_video_object_preview = lambda *_args, **_kwargs: (b"preview", {"format": "annotated_video_frame"})
            main_module.persist_scan = fake_persist
            canonical, _ = reconcile_duplicate_tracked_objects(tracks, "upload")
            scan_ids = main_module._persist_tracked_video_objects(
                tracked_objects=canonical,
                source_name="video.mp4",
                file_id="drive-1",
                job={"id": "66666666-6666-4666-8666-666666666666"},
                principal=None,
                database=None,
                existing_drive_metadata={},
                annotated_video_metadata={"annotated_video_status": "ready"},
                annotated_video_path="/tmp/annotated.mp4",
                annotated_observations_by_track={
                    "1": [{"track_id": "1", "box_xyxy": [1, 1, 5, 5], "confidence": 0.8}],
                    "2": [{"track_id": "2", "box_xyxy": [10, 10, 15, 15], "confidence": 0.8}],
                },
            )
        finally:
            main_module._select_annotated_preview_observation = original_select
            main_module._extract_annotated_video_object_preview = original_extract
            main_module.persist_scan = original_persist

        self.assertEqual(len(scan_ids), len(canonical))
        self.assertEqual(len(captured), len(canonical))


if __name__ == "__main__":
    unittest.main()
