import shutil
import sys
import importlib.util
import json
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
