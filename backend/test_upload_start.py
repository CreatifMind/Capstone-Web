import json
import sys
import types
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend import main


def principal():
    return main.Principal("user", "11111111-1111-4111-8111-111111111111", frozenset({"scan:write"}), profile_id="22222222-2222-4222-8222-222222222222")


def upload_session_row(upload_id="session-1"):
    return {
        "id": upload_id,
        "original_filename": "scan.mp4",
        "status": "upload_pending",
        "received_size": 0,
        "drive_file_id": None,
    }


class FakeExecute:
    def __init__(self, value):
        self.value = value

    def execute(self):
        return self.value


class FakeFiles:
    def __init__(self):
        self.calls = []

    def list(self, **kwargs):
        self.calls.append(("list", kwargs))
        return FakeExecute({"files": []})

    def create(self, **kwargs):
        self.calls.append(("create", kwargs))
        return FakeExecute({"id": "drive-file-1", "webViewLink": "https://drive.example.test/file"})

    def get(self, **kwargs):
        self.calls.append(("get", kwargs))
        return FakeExecute({"id": kwargs["fileId"], "mimeType": "video/mp4"})


class FakeDriveService:
    def __init__(self):
        self.files_client = FakeFiles()

    def files(self):
        return self.files_client


def test_exact_frontend_mp4_upload_start_request_succeeds(monkeypatch):
    calls = {}

    def fake_create(filename, size_bytes, mime):
        calls["payload"] = {"filename": filename, "size_bytes": size_bytes, "mime": mime}
        return "https://upload.example.test/session"

    def fake_insert(_database, principal_arg, **kwargs):
        calls["session"] = {**kwargs, "principal": principal_arg}
        return upload_session_row(kwargs["upload_id"])

    monkeypatch.setattr(main, "_create_drive_resumable_upload", fake_create)
    monkeypatch.setattr(main, "_insert_upload_session", fake_insert)

    response = main.start_upload(
        main.UploadStartInput(filename="WhatsApp Video 2026-07-29 at 22.21.33.mp4", size_bytes=123456, mime="video/mp4"),
        principal(),
    )

    assert response["upload_id"]
    assert response["chunk_size"] == main.UPLOAD_CHUNK_SIZE_BYTES
    assert response["filename"].endswith(".mp4")
    assert calls["payload"]["size_bytes"] == 123456
    assert calls["payload"]["mime"] == "video/mp4"
    assert calls["session"]["upload_url"] == "https://upload.example.test/session"
    assert calls["session"]["principal"].id == principal().id


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
    monkeypatch.setattr(main, "_insert_upload_session", lambda *_args, **kwargs: upload_session_row(kwargs["upload_id"]))
    monkeypatch.setattr(main, "_require_executable", lambda name: (_ for _ in ()).throw(AssertionError(f"{name} should not be checked")))
    monkeypatch.setattr(main, "_encode_browser_mp4", lambda *_args: (_ for _ in ()).throw(AssertionError("FFmpeg should not run")))
    monkeypatch.setattr(main, "_annotate_video_frame", lambda *_args: (_ for _ in ()).throw(AssertionError("annotation should not run")))

    response = main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert response["upload_id"]


def test_annotated_video_failure_does_not_affect_upload_start(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: "https://upload.example.test/session")
    monkeypatch.setattr(main, "_insert_upload_session", lambda *_args, **kwargs: upload_session_row(kwargs["upload_id"]))
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


def test_upload_start_persists_durable_session(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: "https://upload.example.test/session")
    calls = {}

    def fake_insert(_database, principal_arg, **kwargs):
        calls["principal"] = principal_arg
        calls["session"] = kwargs
        return upload_session_row(kwargs["upload_id"])

    monkeypatch.setattr(main, "_insert_upload_session", fake_insert)

    response = main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert response["upload_id"]
    assert calls["principal"].id == principal().id
    assert calls["session"]["filename"].endswith("_scan.mp4")
    assert calls["session"]["upload_url"] == "https://upload.example.test/session"


def test_upload_start_response_detail_is_json_serializable(monkeypatch):
    monkeypatch.setattr(main, "_create_drive_resumable_upload", lambda *_args: (_ for _ in ()).throw(main.UploadStartFailure("STORAGE_UPLOAD_INIT_FAILED", "failed", status_code=502, stage="create_drive_resumable_upload")))

    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    json.dumps(exc.value.detail)


def test_environment_oauth_credentials_refresh_without_scopes(monkeypatch, capsys):
    calls = {}

    class FakeCredentials:
        def __init__(self, **kwargs):
            calls["kwargs"] = kwargs
            self.valid = False

        def refresh(self, request):
            calls["refresh_count"] = calls.get("refresh_count", 0) + 1
            calls["request_type"] = type(request).__name__
            self.valid = True

    class FakeRequest:
        pass

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("GOOGLE_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setattr("google.oauth2.credentials.Credentials", FakeCredentials)
    monkeypatch.setattr("google.auth.transport.requests.Request", FakeRequest)

    credentials = main.oauth_drive_credentials()

    assert credentials.valid is True
    assert calls["kwargs"] == {
        "token": None,
        "refresh_token": "refresh-token",
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": "client-id",
        "client_secret": "client-secret",
    }
    assert "scopes" not in calls["kwargs"]
    assert calls["refresh_count"] == 1
    captured = capsys.readouterr()
    assert "refresh-token" not in captured.out + captured.err
    assert "client-secret" not in captured.out + captured.err


def test_local_oauth_token_file_path_still_loads(monkeypatch, tmp_path):
    token_file = tmp_path / "google-oauth-token.json"
    token_file.write_text("{}")

    class FakeCredentials:
        valid = True
        expired = False
        refresh_token = None

        @classmethod
        def from_authorized_user_file(cls, path):
            assert path == str(token_file)
            return cls()

    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_REFRESH_TOKEN", raising=False)
    monkeypatch.setattr(main, "google_oauth_token_path", lambda: token_file)
    monkeypatch.setattr("google.oauth2.credentials.Credentials", FakeCredentials)

    assert isinstance(main.oauth_drive_credentials(), FakeCredentials)


def test_interactive_reauthorization_retains_explicit_scopes(monkeypatch, tmp_path):
    client_file = tmp_path / "google-oauth-client.json"
    client_file.write_text("{}")
    calls = {}

    class FakeFlow:
        @staticmethod
        def from_client_secrets_file(path, *, scopes, redirect_uri):
            calls["path"] = path
            calls["scopes"] = scopes
            calls["redirect_uri"] = redirect_uri
            return object()

    flow_module = types.ModuleType("google_auth_oauthlib.flow")
    flow_module.Flow = FakeFlow
    monkeypatch.setitem(sys.modules, "google_auth_oauthlib.flow", flow_module)
    monkeypatch.setattr(main, "google_oauth_client_path", lambda: client_file)

    main.oauth_flow()

    assert calls["path"] == str(client_file)
    assert calls["scopes"] == main.OAUTH_DRIVE_SCOPES


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("folder_ABC-123", "folder_ABC-123"),
        ("  folder_ABC-123  ", "folder_ABC-123"),
        ("https://drive.google.com/drive/folders/folder_ABC-123", "folder_ABC-123"),
        ("https://drive.google.com/open?id=folder_ABC-123", "folder_ABC-123"),
    ],
)
def test_drive_folder_id_normalization_accepts_safe_values(value, expected):
    assert main.normalize_drive_folder_id(value) == expected


@pytest.mark.parametrize(
    "value",
    [
        "",
        "https://drive.google.com/drive/folders/folder_A?id=folder_B",
        "https://drive.google.com/drive/my-drive",
        "https://example.com/drive/folders/folder ABC",
        "folder/ABC",
    ],
)
def test_drive_folder_id_normalization_rejects_bad_values(value):
    if value == "":
        assert main.normalize_drive_folder_id(value) is None
    else:
        with pytest.raises(ValueError):
            main.normalize_drive_folder_id(value)


def test_configured_drive_folder_id_uses_primary_then_fallback(monkeypatch):
    monkeypatch.setenv("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID", " primary_1 ")
    monkeypatch.setenv("GOOGLE_DRIVE_FOLDER_ID", "fallback_1")
    assert main.configured_drive_folder_id() == "primary_1"
    monkeypatch.delenv("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID")
    assert main.configured_drive_folder_id() == "fallback_1"


def test_drive_file_info_uses_supports_all_drives(monkeypatch):
    service = FakeDriveService()
    monkeypatch.setattr(main, "_drive_service", lambda: service)

    main._drive_file_info("drive-file-1")

    assert service.files_client.calls[0] == (
        "get",
        {
            "fileId": "drive-file-1",
            "fields": "id,name,mimeType,size,webViewLink,parents,trashed",
            "supportsAllDrives": True,
        },
    )


def test_oauth_drive_list_and_create_support_all_drives(monkeypatch):
    service = FakeDriveService()
    monkeypatch.setattr(main, "GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID", "folder_1")
    monkeypatch.setattr(main, "oauth_drive_credentials", lambda: object())
    monkeypatch.setattr("googleapiclient.discovery.build", lambda *_args, **_kwargs: service)

    main.upload_original_to_drive_oauth(b"image", "scan.jpg", "image/jpeg", submission_id="33333333-3333-4333-8333-333333333333")

    list_call = service.files_client.calls[0][1]
    create_call = service.files_client.calls[1][1]
    assert list_call["supportsAllDrives"] is True
    assert list_call["includeItemsFromAllDrives"] is True
    assert create_call["supportsAllDrives"] is True


def test_resumable_upload_init_supports_all_drives(monkeypatch):
    calls = {}

    class FakeResponse:
        headers = {"Location": "https://upload.example.test/session"}

        def raise_for_status(self):
            return None

    class FakeSession:
        def __init__(self, credentials):
            calls["credentials"] = credentials

        def post(self, url, **kwargs):
            calls["url"] = url
            calls["kwargs"] = kwargs
            return FakeResponse()

    monkeypatch.setattr(main, "GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID", "folder_1")
    monkeypatch.setattr(main, "oauth_drive_credentials", lambda: object())
    monkeypatch.setattr("google.auth.transport.requests.AuthorizedSession", FakeSession)

    assert main._create_drive_resumable_upload("scan.mp4", 1000, "video/mp4") == "https://upload.example.test/session"
    assert "supportsAllDrives=true" in calls["url"]
    assert calls["kwargs"]["json"]["parents"] == ["folder_1"]


def test_upload_start_sanitized_503_when_google_refresh_fails(monkeypatch):
    monkeypatch.setattr(main, "GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID", "folder_1")
    monkeypatch.setattr(main, "oauth_drive_credentials", lambda: (_ for _ in ()).throw(RuntimeError("invalid_scope: Bad Request")))

    with pytest.raises(HTTPException) as exc:
        main.start_upload(main.UploadStartInput(filename="scan.mp4", size_bytes=1000, mime="video/mp4"), principal())

    assert exc.value.status_code == 503
    assert exc.value.detail["code"] == "MISSING_ENVIRONMENT_VARIABLE"
    assert exc.value.detail["stage"] == "load_drive_credentials"
