import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend import main


def principal():
    return main.Principal("public", "public", frozenset({"scan:write"}))


def test_exact_frontend_mp4_upload_start_request_succeeds(monkeypatch):
    main.UPLOAD_SESSIONS.clear()
    calls = {}

    def fake_create(filename, size_bytes, mime):
        calls["payload"] = {"filename": filename, "size_bytes": size_bytes, "mime": mime}
        return "https://upload.example.test/session"

    monkeypatch.setattr(main, "_create_drive_resumable_upload", fake_create)

    response = main.start_upload(
        main.UploadStartInput(filename="WhatsApp Video 2026-07-29 at 22.21.33.mp4", size_bytes=123456, mime="video/mp4"),
        principal(),
    )

    assert response["upload_id"]
    assert response["chunk_size"] == main.UPLOAD_CHUNK_SIZE_BYTES
    assert response["filename"].endswith(".mp4")
    assert calls["payload"]["size_bytes"] == 123456
    assert calls["payload"]["mime"] == "video/mp4"
    assert main.UPLOAD_SESSIONS[response["upload_id"]] == "https://upload.example.test/session"


def test_upload_start_rejects_invalid_mime_with_415():
    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mov", size_bytes=1000, mime="video/quicktime"), principal())

    assert exc.value.status_code == 415
    assert exc.value.detail["code"] == "UNSUPPORTED_MEDIA_TYPE"


def test_upload_start_rejects_zero_byte_source():
    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="empty.mp4", size_bytes=0, mime="video/mp4"), principal())

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "INVALID_UPLOAD_PAYLOAD"


def test_upload_start_reports_missing_drive_folder_as_dependency(monkeypatch):
    monkeypatch.setattr(main, "GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID", "")

    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "MISSING_ENVIRONMENT_VARIABLE"


def test_upload_start_does_not_invoke_ffmpeg_or_video_writer(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: "https://upload.example.test/session")
    monkeypatch.setattr(main, "_require_executable", lambda name: (_ for _ in ()).throw(AssertionError(f"{name} should not be checked")))
    monkeypatch.setattr(main, "_encode_browser_mp4", lambda *_args: (_ for _ in ()).throw(AssertionError("FFmpeg should not run")))
    monkeypatch.setattr(main, "_annotate_video_frame", lambda *_args: (_ for _ in ()).throw(AssertionError("annotation should not run")))

    response = main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert response["upload_id"]


def test_annotated_video_failure_does_not_affect_upload_start(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: "https://upload.example.test/session")
    monkeypatch.setattr(main, "_encode_browser_mp4", lambda *_args: (_ for _ in ()).throw(RuntimeError("simulated annotated failure")))

    response = main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert response["upload_id"]


def test_upload_start_maps_drive_session_failure_to_specific_502(monkeypatch):
    def fail_create(*_args):
        raise main.UploadStartFailure(
            "STORAGE_UPLOAD_INIT_FAILED",
            "Google Drive resumable upload session failed with status 403.",
            status_code=502,
            stage="create_drive_resumable_upload",
        )

    monkeypatch.setattr(main, "_create_drive_resumable_upload", fail_create)

    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert exc.value.status_code == 502
    assert exc.value.detail["code"] == "STORAGE_UPLOAD_INIT_FAILED"
    assert exc.value.detail["stage"] == "create_drive_resumable_upload"


def test_frontend_payload_matches_backend_request_schema():
    source = Path("public/js/script.js").read_text(encoding="utf-8")

    assert "POST" in source
    assert "/api/uploads/start" in source
    assert '"Content-Type": "application/json"' in source
    assert "filename: item.file.name" in source
    assert "size_bytes: item.file.size" in source
    assert 'mime: "video/mp4"' in source
    assert set(main.UploadStartInput.__annotations__) == {"filename", "size_bytes", "mime"}


def test_upload_start_does_not_use_supabase_or_database(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: "https://upload.example.test/session")
    monkeypatch.setattr(main, "SupabaseExecutor", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("database should not be used")))

    response = main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert response["upload_id"]


def test_upload_start_response_detail_is_json_serializable(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: (_ for _ in ()).throw(main.UploadStartFailure("STORAGE_UPLOAD_INIT_FAILED", "failed", status_code=502, stage="create_drive_resumable_upload")))

    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    json.dumps(exc.value.detail)
