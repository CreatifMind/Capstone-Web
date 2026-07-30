import unittest
import os
import sys
import importlib.util
import json
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

from backend.main import VideoTrackAggregator, _video_tracking_summary, merge_track_fragments


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

    def test_video_processing_does_not_persist_inside_frame_loop(self):
        with open("backend/main.py", "r", encoding="utf-8") as handle:
            source = handle.read()
        start = source.index("def _process_video_drive_file")
        end = source.index("def _process_drive_file", start)
        body = source[start:end]

        loop_start = body.index("while True:")
        loop_end = body.index("capture.release()", loop_start)
        self.assertNotIn("_persist_tracked_video_objects", body[loop_start:loop_end])


if __name__ == "__main__":
    unittest.main()
