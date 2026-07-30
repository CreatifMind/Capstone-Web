import shutil
import sys
import importlib.util
import json
import tempfile
from pathlib import Path
from types import ModuleType, SimpleNamespace

import cv2
import numpy as np
import pytest

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

from backend import main


@pytest.fixture()
def temp_video_pair(tmp_path):
    source = tmp_path / "source.mp4"
    encoded = tmp_path / "encoded.mp4"
    writer = cv2.VideoWriter(str(source), cv2.VideoWriter_fourcc(*"mp4v"), 10, (96, 64))
    assert writer.isOpened()
    for index in range(5):
        frame = np.full((64, 96, 3), 30 + index * 20, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    return source, encoded


def test_annotated_frame_writing_draws_boxes_masks_and_labels():
    frame = np.zeros((80, 120, 3), dtype=np.uint8)
    detection = {
        "track_id": 4,
        "category": "plastic",
        "confidence": 0.91,
        "bbox": [0.2, 0.2, 0.7, 0.7],
        "mask": [[0.25, 0.25], [0.65, 0.25], [0.65, 0.65], [0.25, 0.65]],
    }

    annotated = main._annotate_video_frame(frame, [detection])

    assert annotated.shape == frame.shape
    assert int(annotated.sum()) > int(frame.sum())


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg/FFprobe unavailable")
def test_successful_h264_yuv420p_encoding_and_probe(temp_video_pair):
    source, encoded = temp_video_pair

    command = main._encode_browser_mp4(source, encoded)
    probe = main._ffprobe_mp4(encoded)

    assert "-c:v" in command
    assert "libx264" in command
    assert probe["video_codec"] == "h264"
    assert probe["pixel_format"] == "yuv420p"
    assert probe["dimensions"] == "96x64"


def test_ffmpeg_absence_fails_clearly(monkeypatch, temp_video_pair):
    source, encoded = temp_video_pair
    monkeypatch.setattr(main.shutil, "which", lambda _name: None)

    with pytest.raises(RuntimeError, match="ffmpeg is not installed"):
        main._encode_browser_mp4(source, encoded)


def test_supabase_upload_metadata_uses_stable_path_and_content_type(tmp_path):
    upload_file = tmp_path / "result.mp4"
    upload_file.write_bytes(b"not-a-real-video-for-upload-metadata")
    calls = {}

    class StorageBucket:
        def upload(self, path, file, file_options):
            calls["upload"] = {"path": path, "content_type": file_options["content-type"], "bytes": file.read()}
            return {}

        def get_public_url(self, path):
            calls["public_path"] = path
            return {"publicUrl": f"https://example.test/storage/{path}"}

    class Storage:
        def from_(self, bucket):
            calls["bucket"] = bucket
            return StorageBucket()

    class Client:
        storage = Storage()

    database = main.SupabaseExecutor(client=Client(), attempts=1)
    result = main.upload_file_to_supabase_storage(upload_file, "annotated-videos/job-1/result.mp4", "video/mp4", database)

    assert calls["bucket"] == main.PREVIEW_BUCKET
    assert calls["upload"]["path"] == "annotated-videos/job-1/result.mp4"
    assert calls["upload"]["content_type"] == "video/mp4"
    assert result["public_url"].endswith("/annotated-videos/job-1/result.mp4")


def test_scan_response_exposes_annotated_video_metadata():
    scan = {
        "id": "scan-1",
        "result_kind": "video_track_object",
        "video_tracking_summary": {
            "annotated_video_url": "https://example.test/result.mp4",
            "annotated_video_storage_path": "annotated-videos/scan-1/result.mp4",
            "annotated_video_status": "ready",
            "annotated_video_error": None,
            "annotated_video_probe": {"video_codec": "h264", "pixel_format": "yuv420p"},
        },
    }

    response = main._scan_response(scan, [])

    assert response["annotated_video_url"].endswith("result.mp4")
    assert response["annotated_video_status"] == "ready"
    assert response["annotated_video_storage_path"] == "annotated-videos/scan-1/result.mp4"
    assert response["annotated_video_probe"]["video_codec"] == "h264"


def test_temp_file_cleanup_pattern(tmp_path):
    temp_file = tmp_path / "temporary.mp4"
    temp_file.write_bytes(b"temporary")
    temp_file.unlink(missing_ok=True)
    assert not temp_file.exists()


class NoopQuery:
    data = [{"id": "scan-1"}]

    def update(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def execute(self):
        return self


class NoopClient:
    def table(self, *_args, **_kwargs):
        return NoopQuery()


class NoopDatabase:
    client = NoopClient()

    def execute(self, operation, recover=None):
        return operation(self.client)


class FakeModel:
    def track(self, *_args, **_kwargs):
        return [object()]


def video_bytes(width=96, height=64, frames=4, fps=10):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as handle:
        path = Path(handle.name)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
    assert writer.isOpened()
    for index in range(frames):
        frame = np.full((height, width, 3), 50 + index * 20, dtype=np.uint8)
        writer.write(frame)
    writer.release()
    data = path.read_bytes()
    path.unlink(missing_ok=True)
    return data


def tracked_detection(track_id=4, category="plastic", confidence=0.91):
    return {
        "track_id": track_id,
        "category": category,
        "material_name": category,
        "confidence": confidence,
        "bbox": [0.2, 0.2, 0.7, 0.7],
        "bbox_percent": {"x": 20, "y": 20, "width": 50, "height": 50},
        "mask": [[0.25, 0.25], [0.65, 0.25], [0.65, 0.65], [0.25, 0.65]],
    }


def test_zero_byte_video_source_is_rejected_and_cleaned(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "VIDEO_WORK_ROOT", tmp_path)

    with pytest.raises(main.VideoDecodeError, match="empty"):
        main._process_video_drive_file("drive-1", {"id": "11111111-1111-4111-8111-111111111111"}, None, NoopDatabase(), {"drive_mime_type": "video/mp4"}, b"", "empty.mp4")

    assert not (tmp_path / "11111111-1111-4111-8111-111111111111").exists()


def test_video_dimensions_are_normalized_to_even_values():
    assert main._even_video_dimensions(101, 75) == (100, 74)
    assert main._even_video_dimensions(1, 1) == (2, 2)


def test_annotation_writer_failure_preserves_processing_and_persists_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "VIDEO_WORK_ROOT", tmp_path)
    monkeypatch.setattr(main, "get_model", lambda: FakeModel())
    monkeypatch.setattr(main, "_result_track_observations", lambda *_args, **_kwargs: [tracked_detection()])
    persisted = {}
    source = video_bytes(frames=3)

    def fake_persist(**kwargs):
        persisted["metadata"] = kwargs["annotated_video_metadata"]
        return ["scan-1"]

    monkeypatch.setattr(main, "_persist_tracked_video_objects", fake_persist)

    class ClosedWriter:
        def __init__(self, *_args, **_kwargs):
            pass

        def isOpened(self):
            return False

        def release(self):
            pass

    monkeypatch.setattr(cv2, "VideoWriter", ClosedWriter)

    result = main._process_video_drive_file("drive-1", {"id": "22222222-2222-4222-8222-222222222222"}, None, NoopDatabase(), {"drive_mime_type": "video/mp4"}, source, "writer-fail.mp4")

    assert result == ["scan-1"]
    assert persisted["metadata"]["annotated_video_status"] == "failed"
    assert "VideoWriter" in persisted["metadata"]["annotated_video_error"]
    assert not (tmp_path / "22222222-2222-4222-8222-222222222222").exists()


def test_ffmpeg_failure_preserves_frame_results_and_stderr(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "VIDEO_WORK_ROOT", tmp_path)
    monkeypatch.setattr(main, "get_model", lambda: FakeModel())
    monkeypatch.setattr(main, "_result_track_observations", lambda *_args, **_kwargs: [tracked_detection()])
    persisted = {}

    def fake_persist(**kwargs):
        persisted["metadata"] = kwargs["annotated_video_metadata"]
        return ["scan-1"]

    monkeypatch.setattr(main, "_persist_tracked_video_objects", fake_persist)

    def fail_encode(_input_path, _output_path):
        raise RuntimeError("FFmpeg H.264 encoding failed with exit code 1: simulated stderr")

    monkeypatch.setattr(main, "_encode_browser_mp4", fail_encode)

    result = main._process_video_drive_file("drive-1", {"id": "33333333-3333-4333-8333-333333333333"}, None, NoopDatabase(), {"drive_mime_type": "video/mp4"}, video_bytes(frames=3), "ffmpeg-fail.mp4")

    assert result == ["scan-1"]
    assert persisted["metadata"]["annotated_video_status"] == "failed"
    assert "simulated stderr" in persisted["metadata"]["annotated_video_error"]
    assert not (tmp_path / "33333333-3333-4333-8333-333333333333").exists()


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg/FFprobe unavailable")
def test_successful_video_processing_uploads_encoded_mp4_and_cleans_temp(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "VIDEO_WORK_ROOT", tmp_path)
    monkeypatch.setattr(main, "get_model", lambda: FakeModel())
    monkeypatch.setattr(main, "_result_track_observations", lambda *_args, **_kwargs: [tracked_detection()])
    persisted = {}
    uploaded = {}

    def fake_persist(**kwargs):
        persisted["metadata"] = kwargs["annotated_video_metadata"]
        return ["scan-1"]

    monkeypatch.setattr(main, "_persist_tracked_video_objects", fake_persist)

    def fake_upload(path, storage_path, content_type, _database):
        uploaded["path"] = Path(path)
        uploaded["size"] = Path(path).stat().st_size
        uploaded["storage_path"] = storage_path
        uploaded["content_type"] = content_type
        return {"path": storage_path, "public_url": "https://example.test/result.mp4"}

    monkeypatch.setattr(main, "upload_file_to_supabase_storage", fake_upload)

    result = main._process_video_drive_file("drive-1", {"id": "44444444-4444-4444-8444-444444444444"}, None, NoopDatabase(), {"drive_mime_type": "video/mp4"}, video_bytes(width=95, height=63, frames=3), "portrait-ish.mp4")

    assert result == ["scan-1"]
    assert uploaded["content_type"] == "video/mp4"
    assert uploaded["storage_path"] == "annotated-videos/44444444-4444-4444-8444-444444444444/result.mp4"
    assert uploaded["size"] > 0
    assert persisted["metadata"]["annotated_video_status"] == "ready"
    assert persisted["metadata"]["annotated_video_url"].endswith("result.mp4")
    assert not (tmp_path / "44444444-4444-4444-8444-444444444444").exists()
