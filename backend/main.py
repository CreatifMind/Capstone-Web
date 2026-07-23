import os
import re
import json
import math
import tempfile
import traceback
import threading
import time
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from mimetypes import guess_type
from pathlib import Path
from uuid import UUID, uuid4, uuid5
from typing import Any, Callable, TypeVar

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from supabase import create_client
from ultralytics import YOLO

BACKEND_ROOT = Path(__file__).resolve().parent
APP_ROOT = BACKEND_ROOT.parent

load_dotenv(BACKEND_ROOT / ".env")

_model_path = Path(os.getenv("MODEL_PATH", "models/best.pt")).expanduser()
if _model_path.is_absolute():
    MODEL_PATH = _model_path
else:
    MODEL_PATH = next((path for path in (BACKEND_ROOT / _model_path, APP_ROOT / _model_path) if path.exists()), BACKEND_ROOT / _model_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID = os.getenv("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID")
GOOGLE_OAUTH_REDIRECT_URI = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/google/callback")
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://purityloop-ai.vercel.app",
]
_configured_origins = [item.strip() for item in os.getenv("ALLOWED_ORIGINS", "").split(",") if item.strip()]
if _configured_origins:
    ALLOWED_ORIGINS = _configured_origins

app = FastAPI(title="PurityLoop AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None


def _new_supabase_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None


# Request handlers may keep using this client. Workers always create their own executor.
supabase = _new_supabase_client()
SCAN_RESULTS_TABLE = "mock_scan_results"
DETECTED_MATERIALS_TABLE = "mock_detected_materials"
REVIEW_DECISIONS_TABLE = "scan_review_decisions"
JOBS_TABLE = "processing_jobs"
PROCESSED_DRIVE_FILES_TABLE = "processed_drive_files"
PREVIEW_BUCKET = "mock_uploaded_images"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
# The upload folder is configured server-side, not selected with Google Picker.
# OAuth therefore needs access to that existing folder and its idempotency search.
OAUTH_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"]
CONFIRMATION_THRESHOLD = 0.85
BROWSER_CONFIDENCE_THRESHOLD = 0.32
BROWSER_NMS_IOU_THRESHOLD = 0.70
BROWSER_MODEL_NAME = "best.onnx"
BROWSER_MODEL_VERSION = "v3_ffremask_9cls"
BROWSER_INFERENCE_ENGINE = "browser-onnx"
BROWSER_MODEL_CLASSES = (
    "plastic", "paper", "cardboard", "metal", "glass", "textile", "food_organic", "battery", "general_trash",
)
MAX_IMAGE_BYTES = 10 * 1024 * 1024
SUPABASE_RETRY_ATTEMPTS = 6
SUPABASE_TRANSIENT_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.WriteError,
    httpx.TimeoutException,
)
T = TypeVar("T")


class SupabaseTemporarilyUnavailable(RuntimeError):
    """A transient transport failure after bounded reconnect attempts."""


class SupabaseExecutor:
    """Retry one Supabase operation and replace a broken PostgREST client."""

    def __init__(self, client: Any | None = None, client_factory: Callable[[], Any] = _new_supabase_client,
                 attempts: int = SUPABASE_RETRY_ATTEMPTS, sleeper: Callable[[float], None] = time.sleep,
                 random_value: Callable[[], float] = random.random):
        self.client = client or client_factory()
        self.client_factory = client_factory
        self.attempts = attempts
        self.sleeper = sleeper
        self.random_value = random_value

    def execute(self, operation: Callable[[Any], T], recover: Callable[[Any], T | None] | None = None) -> T:
        if not self.client:
            raise RuntimeError("Supabase backend env is not configured")
        last_error: Exception | None = None
        for attempt in range(self.attempts):
            try:
                return operation(self.client)
            except SUPABASE_TRANSIENT_ERRORS as exc:
                last_error = exc
                # A protocol disconnect can leave the synchronous HTTP/2 connection unusable.
                self.client = self.client_factory()
                if recover and self.client:
                    try:
                        recovered = recover(self.client)
                        if recovered is not None:
                            return recovered
                    except SUPABASE_TRANSIENT_ERRORS:
                        self.client = self.client_factory()
                if attempt + 1 < self.attempts:
                    self.sleeper(min(4.0, 0.25 * (2 ** attempt)) + (self.random_value() * 0.2))
        raise SupabaseTemporarilyUnavailable("Supabase connection temporarily unavailable") from last_error
# ponytail: local demo is one backend process; use shared storage for multi-instance deployment.
UPLOAD_SESSIONS: dict[str, str] = {}
CATEGORY_CLASS_MAP = {
    "general_trash": "contaminant",
    "food_organics": "contaminant",
    "textile": "contaminant",
    "battery": "contaminant",
    "metal": "recyclable",
    "plastic": "recyclable",
    "glass": "recyclable",
    "paper": "recyclable",
    "cardboard": "recyclable",
}
CATEGORY_ROUTES = {
    "general_trash": "General-Waste Disposal",
    "food_organics": "Organic Waste / Compost",
    "textile": "Textile Recovery / Contaminant Route",
    "battery": "Battery / E-Waste Collection",
    "metal": "Metal Sorting Bin",
    "plastic": "Plastic Sorting Bin",
    "glass": "Glass Sorting Bin",
    "paper": "Paper Sorting Bin",
    "cardboard": "Cardboard Sorting Bin",
}


@dataclass(frozen=True)
class Principal:
    kind: str
    id: str
    scopes: frozenset[str]


def require_principal() -> Principal:
    return Principal("public", "public", frozenset({"scan:read", "scan:write", "job:read", "review:write"}))


def require_scope(scope: str):
    def dependency(principal: Principal = Depends(require_principal)) -> Principal:
        if scope not in principal.scopes:
            raise HTTPException(status_code=403, detail=f"Missing API scope: {scope}")
        return principal
    return dependency


def scoped_query(query, principal: Principal):
    return query


def get_model():
    global model
    if model is None:
        print(f"[startup] Loading YOLO model from: {MODEL_PATH}")
        if not MODEL_PATH.exists():
            print(f"[startup] YOLO model file not found at: {MODEL_PATH}")
            raise HTTPException(status_code=500, detail="YOLO model file not found.")
        model = YOLO(str(MODEL_PATH))
    return model


def safe_drive_filename(original_filename: str | None) -> str:
    name = Path(original_filename or "uploaded-image.jpg").name
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "uploaded-image.jpg"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"purityloop_{timestamp}_{safe_name}"


def upload_original_to_supabase_storage(
    file_bytes: bytes,
    original_filename: str | None,
    content_type: str,
    database: SupabaseExecutor | None = None,
    *,
    object_path: str | None = None,
) -> dict:
    database = database or SupabaseExecutor(supabase)
    if not database.client:
        raise RuntimeError("Supabase backend env is not configured")

    path = object_path or safe_drive_filename(original_filename)
    try:
        database.execute(lambda client: client.storage.from_(PREVIEW_BUCKET).upload(
            path=path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "false"},
        ))
    except Exception as exc:
        duplicate = (
            getattr(exc, "status_code", None) == 409
            or getattr(exc, "status", None) == 409
            or "duplicate" in str(exc).lower()
            or "already exists" in str(exc).lower()
        )
        if not object_path or not duplicate:
            raise
        # Deterministic browser paths make an existing object a successful retry.
        print(f"[Supabase Storage] Reusing deterministic object: {path}")
    public_url = database.execute(lambda client: client.storage.from_(PREVIEW_BUCKET).get_public_url(path))
    if isinstance(public_url, dict):
        public_url = public_url.get("publicURL") or public_url.get("publicUrl") or public_url.get("signedURL") or ""
    if not public_url:
        raise RuntimeError("Supabase Storage public URL is empty")
    return {"path": path, "public_url": str(public_url or "")}


def safe_error_message(exc: Exception) -> str:
    message = str(exc).replace(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "\0", "[redacted]")
    message = re.sub(r"[\w./ -]*google-service-account\.json", "[google-service-account.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-client\.json", "[google-oauth-client.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-token\.json", "[google-oauth-token.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-state\.json", "[google-oauth-state.json]", message)
    return message[:300]


def config_path(env_name: str, default_relative: str) -> Path:
    raw_path = os.getenv(env_name, default_relative)
    path = Path(raw_path).expanduser()
    return path if path.is_absolute() else BACKEND_ROOT / path


def google_credentials_path() -> Path | None:
    raw_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not raw_path:
        return None
    path = Path(raw_path)
    if path.is_absolute():
        return path

    candidates = [APP_ROOT / path, Path.cwd() / path, BACKEND_ROOT / path]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def upload_original_to_drive(file_bytes: bytes, original_filename: str | None, content_type: str | None) -> dict:
    if not GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID:
        raise RuntimeError("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID is not configured")

    credentials_path = google_credentials_path()
    if not credentials_path or not credentials_path.exists():
        raise RuntimeError("Google service account credentials file is not available")

    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload

    drive_file_name = safe_drive_filename(original_filename)
    mimetype = content_type or guess_type(drive_file_name)[0] or "application/octet-stream"
    credentials = service_account.Credentials.from_service_account_file(str(credentials_path), scopes=DRIVE_SCOPES)
    service = build("drive", "v3", credentials=credentials, cache_discovery=False)
    media = MediaIoBaseUpload(BytesIO(file_bytes), mimetype=mimetype, resumable=False)
    metadata = {
        "name": drive_file_name,
        "parents": [GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID],
    }

    created = (
        service.files()
        .create(body=metadata, media_body=media, fields="id, webViewLink, webContentLink")
        .execute()
    )
    return {
        "drive_file_id": created.get("id"),
        "drive_file_name": drive_file_name,
        "drive_web_url": created.get("webViewLink"),
        "image_url": created.get("webViewLink"),
    }


def google_oauth_client_path() -> Path:
    return config_path("GOOGLE_OAUTH_CLIENT_SECRET_FILE", "google-oauth-client.json")


def google_oauth_token_path() -> Path:
    return config_path("GOOGLE_OAUTH_TOKEN_FILE", "google-oauth-token.json")


def google_oauth_state_path() -> Path:
    return config_path("GOOGLE_OAUTH_STATE_FILE", "google-oauth-state.json")


def oauth_flow():
    client_path = google_oauth_client_path()
    if not client_path.exists():
        raise RuntimeError("Google OAuth client file is not available")

    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
    from google_auth_oauthlib.flow import Flow

    return Flow.from_client_secrets_file(
        str(client_path),
        scopes=OAUTH_DRIVE_SCOPES,
        redirect_uri=GOOGLE_OAUTH_REDIRECT_URI,
    )


def save_oauth_state(state: str, code_verifier: str | None) -> None:
    if not state or not code_verifier:
        raise RuntimeError("Google OAuth state is not available")

    state_path = google_oauth_state_path()
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps({"state": state, "code_verifier": code_verifier}))
    try:
        state_path.chmod(0o600)
    except OSError:
        pass


def load_oauth_state(expected_state: str | None) -> dict:
    safe_detail = "OAuth session expired. Please open /api/google/auth again."
    state_path = google_oauth_state_path()
    if not state_path.exists():
        raise HTTPException(status_code=400, detail=safe_detail)

    try:
        payload = json.loads(state_path.read_text())
    except Exception as exc:
        print(f"[google-callback] OAuth state read failed: {type(exc).__name__}: {safe_error_message(exc)}")
        raise HTTPException(status_code=400, detail=safe_detail) from exc

    saved_state = payload.get("state")
    code_verifier = payload.get("code_verifier")
    if not saved_state or not code_verifier or saved_state != expected_state:
        raise HTTPException(status_code=400, detail=safe_detail)
    return payload


def save_oauth_token(credentials) -> None:
    token_path = google_oauth_token_path()
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(credentials.to_json())
    try:
        token_path.chmod(0o600)
    except OSError:
        pass


def oauth_drive_credentials():
    token_path = google_oauth_token_path()
    if not token_path.exists():
        raise RuntimeError("Google OAuth token file is not available")

    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2.credentials import Credentials

    credentials = Credentials.from_authorized_user_file(str(token_path), OAUTH_DRIVE_SCOPES)
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(GoogleAuthRequest())
        save_oauth_token(credentials)
    if not credentials.valid:
        raise RuntimeError("Google OAuth token is not valid")
    return credentials


def upload_original_to_drive_oauth(
    file_bytes: bytes,
    original_filename: str | None,
    content_type: str | None,
    *,
    submission_id: UUID | None = None,
) -> dict:
    if not GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID:
        raise RuntimeError("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID is not configured")

    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload

    drive_file_name = safe_drive_filename(original_filename)
    mimetype = content_type or guess_type(drive_file_name)[0] or "application/octet-stream"
    service = build("drive", "v3", credentials=oauth_drive_credentials(), cache_discovery=False)
    if submission_id:
        existing = service.files().list(
            q=(
                f"trashed = false and '{GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID}' in parents and "
                f"appProperties has {{ key='purityloop_submission_id' and value='{submission_id}' }}"
            ),
            spaces="drive",
            fields="files(id,name,webViewLink,webContentLink)",
            pageSize=1,
        ).execute().get("files", [])
        if existing:
            created = existing[0]
            return {
                "drive_file_id": created.get("id"),
                "drive_file_name": created.get("name") or drive_file_name,
                "drive_web_url": created.get("webViewLink"),
                "image_url": created.get("webViewLink"),
            }
    media = MediaIoBaseUpload(BytesIO(file_bytes), mimetype=mimetype, resumable=False)
    metadata = {
        "name": drive_file_name,
        "parents": [GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID],
    }
    if submission_id:
        metadata["appProperties"] = {"purityloop_submission_id": str(submission_id)}

    created = (
        service.files()
        .create(body=metadata, media_body=media, fields="id, webViewLink, webContentLink")
        .execute()
    )
    return {
        "drive_file_id": created.get("id"),
        "drive_file_name": drive_file_name,
        "drive_web_url": created.get("webViewLink"),
        "image_url": created.get("webViewLink"),
    }


def legacy_scan_row(scan_row: dict, original_filename: str | None) -> dict:
    keep_keys = {
        "image_url",
        "preview_image_url",
        "drive_file_id",
        "drive_file_name",
        "drive_web_url",
        "source_type",
        "upload_status",
        "processing_status",
        "overall_status",
        "contamination_risk",
        "recommended_action",
        "human_review_required",
        "overall_confidence",
        "user_id",
    }
    row = {key: value for key, value in scan_row.items() if key in keep_keys}
    row["image_url"] = row.get("image_url")
    row["upload_status"] = row.get("upload_status") or "uploaded"
    return row


def material_category(name: str) -> str:
    text = re.sub(r"[_-]+", " ", str(name or "").lower()).strip()
    if "battery" in text:
        return "battery"
    if "food" in text or "organic" in text:
        return "food_organics"
    if "trash" in text or "waste" in text:
        return "general_trash"
    if "textile" in text or "fabric" in text or "cloth" in text:
        return "textile"
    if "glass" in text or "jar" in text:
        return "glass"
    if "cardboard" in text or "box" in text:
        return "cardboard"
    if "paper" in text:
        return "paper"
    if "metal" in text or "aluminum" in text or "aluminium" in text or "can" in text:
        return "metal"
    if "plastic" in text or "bottle" in text or "pet" in text:
        return "plastic"
    return "unknown"


def material_status(category: str) -> tuple[str, str]:
    if CATEGORY_CLASS_MAP.get(category) == "contaminant":
        return "non_recyclable", "contaminated"
    if CATEGORY_CLASS_MAP.get(category) == "recyclable":
        return "recyclable", "clean"
    return "unknown", "unknown"


def evaluate_material(category: str, confidence: float) -> dict:
    material_class = CATEGORY_CLASS_MAP.get(category, "unknown")
    review_required = confidence < CONFIRMATION_THRESHOLD
    decision_status = "review_needed" if review_required else "confirmed"
    if review_required:
        display_status = "Review Needed"
        disposal_route = "Manual Audit Queue"
    elif material_class == "recyclable":
        display_status = "Confirmed Recyclable"
        disposal_route = CATEGORY_ROUTES[category]
    elif material_class == "contaminant":
        display_status = "Confirmed Contaminant"
        disposal_route = CATEGORY_ROUTES[category]
    else:
        display_status = "Review Needed"
        disposal_route = "Manual Audit Queue"
        review_required = True
        decision_status = "review_needed"
    return {
        "material_class": material_class,
        "review_required": review_required,
        "decision_status": decision_status,
        "display_status": display_status,
        "disposal_route": disposal_route,
    }


def to_detected_materials(result) -> list[dict]:
    names = result.names
    image_height, image_width = result.orig_shape
    materials = []
    for box in result.boxes:
        xyxy = box.xyxy[0].tolist()
        confidence = float(box.conf[0])
        class_id = int(box.cls[0])
        material_name = str(names.get(class_id, f"class_{class_id}"))
        category = material_category(material_name)
        recyclable_status, contaminant_status = material_status(category)
        materials.append(
            {
                "material_name": material_name,
                "category": category,
                "confidence": round(confidence, 4),
                "recyclable_status": recyclable_status,
                "contaminant_status": contaminant_status,
                **evaluate_material(category, confidence),
                "bbox_x": round((float(xyxy[0]) / image_width) * 100, 2),
                "bbox_y": round((float(xyxy[1]) / image_height) * 100, 2),
                "bbox_width": round((float(xyxy[2] - xyxy[0]) / image_width) * 100, 2),
                "bbox_height": round((float(xyxy[3] - xyxy[1]) / image_height) * 100, 2),
            }
        )
    return materials


def summarize(materials: list[dict]) -> dict:
    if not materials:
        return {
            "overall_status": "review_required",
            "contamination_risk": "medium",
            "recommended_action": "Human review recommended before sorting.",
            "human_review_required": True,
            "overall_confidence": 0,
        }

    avg_confidence = sum(item["confidence"] for item in materials) / len(materials)
    contaminated = any(item["contaminant_status"] == "contaminated" for item in materials)
    review_required = any(item["review_required"] for item in materials)

    return {
        "overall_status": "review_required" if review_required else "accepted",
        "contamination_risk": "medium" if contaminated else "low",
        "recommended_action": "Human review required before sorting." if review_required else "Confirmed sorting routes applied.",
        "human_review_required": review_required,
        "overall_confidence": round(avg_confidence, 4),
    }


def _image_content_type(filename: str | None, content_type: str | None) -> tuple[str, str]:
    suffix = (Path(filename or "upload.jpg").suffix or ".jpg").lower()
    content_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    normalized = content_types.get(suffix)
    if not normalized or (content_type and not content_type.startswith("image/")):
        raise HTTPException(status_code=400, detail="Upload one JPG, PNG, or WebP image file.")
    return suffix, normalized


def _load_scan(database: SupabaseExecutor, scan_result_id: UUID | str) -> dict | None:
    response = database.execute(
        lambda client: client.table(SCAN_RESULTS_TABLE).select("*").eq("id", str(scan_result_id)).maybe_single().execute()
    )
    return response.data if response and response.data else None


def _load_scan_materials(database: SupabaseExecutor, scan_result_id: UUID | str) -> list[dict]:
    response = database.execute(
        lambda client: client.table(DETECTED_MATERIALS_TABLE).select("*").eq("scan_result_id", str(scan_result_id)).execute()
    )
    return response.data or []


def _load_review_decisions(database: SupabaseExecutor, scan_result_id: UUID | str) -> list[dict]:
    response = database.execute(
        lambda client: client.table(REVIEW_DECISIONS_TABLE).select("*").eq(
            "scan_result_id", str(scan_result_id)
        ).execute()
    )
    return response.data or []


def _scan_response(scan: dict, materials: list[dict]) -> dict:
    return {
        "scan_result_id": scan["id"],
        "overall_status": scan.get("overall_status"),
        "contamination_risk": scan.get("contamination_risk"),
        "recommended_action": scan.get("recommended_action"),
        "human_review_required": scan.get("human_review_required"),
        "overall_confidence": scan.get("overall_confidence"),
        "storage_provider": scan.get("storage_provider"),
        "upload_status": scan.get("upload_status"),
        "drive_upload_status": scan.get("drive_upload_status"),
        "preview_upload_status": scan.get("preview_upload_status"),
        "drive_file_id": scan.get("drive_file_id"),
        "drive_file_name": scan.get("drive_file_name"),
        "drive_web_url": scan.get("drive_web_url"),
        "image_url": scan.get("image_url"),
        "preview_image_url": scan.get("preview_image_url"),
        "detected_materials": materials,
    }


def _browser_storage_path(submission_id: UUID, filename: str | None) -> str:
    suffix = (Path(filename or "upload.jpg").suffix or ".jpg").lower()
    return f"browser-onnx/{submission_id}{suffix}"


def persist_scan(
    file_bytes: bytes,
    filename: str | None,
    source_type: str,
    materials: list[dict],
    summary: dict,
    *,
    source_ref: str | None = None,
    batch_id: str | None = None,
    principal: Principal | None = None,
    content_type: str | None = None,
    existing_drive_metadata: dict | None = None,
    frame_time_seconds: float | None = None,
    database: SupabaseExecutor | None = None,
    scan_result_id: UUID | None = None,
    model_version: str | None = None,
    verified: bool = False,
) -> dict:
    """Persist one canonical scan. A supplied UUID enables browser retry recovery."""
    database = database or SupabaseExecutor(supabase)
    if not database.client:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    suffix, normalized_type = _image_content_type(filename, content_type)
    existing_scan = _load_scan(database, scan_result_id) if scan_result_id else None
    if existing_scan and existing_scan.get("processing_status") == "complete":
        stored_materials = _load_scan_materials(database, scan_result_id)
        stored_decisions = _load_review_decisions(database, scan_result_id) if verified else []
        storage_complete = (
            existing_scan.get("drive_upload_status") == "uploaded"
            and existing_scan.get("preview_upload_status") == "uploaded"
        )
        if (
            len(stored_materials) == len(materials)
            and (not verified or len(stored_decisions) == len(materials))
            and storage_complete
        ):
            return _scan_response(existing_scan, stored_materials)
    if scan_result_id and not existing_scan:
        reservation = {
            "id": str(scan_result_id),
            "source_type": source_type,
            "source_name": filename or "uploaded-image",
            "source_ref": source_ref,
            "model_version": model_version or BROWSER_MODEL_VERSION,
            "processing_status": "pending",
            "upload_status": "pending",
            "overall_status": "review_required",
            "human_review_required": True,
        }
        if principal and principal.kind == "user":
            reservation["user_id"] = principal.id
        try:
            inserted = database.execute(
                lambda client: client.table(SCAN_RESULTS_TABLE).insert(reservation).execute().data or []
            )
            existing_scan = inserted[0] if inserted else _load_scan(database, scan_result_id)
        except Exception as exc:
            if getattr(exc, "code", "") != "23505":
                raise
            existing_scan = _load_scan(database, scan_result_id)
        if not existing_scan:
            raise HTTPException(status_code=500, detail="Unable to reserve browser scan result.")

    drive_metadata = {
        "storage_provider": "google_drive_and_supabase_storage",
        "upload_status": "pending",
        "drive_upload_status": "pending",
        "preview_upload_status": "pending",
        "drive_file_id": None,
        "drive_file_name": filename or "uploaded-image",
        "drive_web_url": None,
        "image_url": None,
        "preview_image_url": None,
    }
    if existing_scan:
        drive_metadata.update({
            key: existing_scan.get(key)
            for key in drive_metadata
            if existing_scan.get(key) is not None
        })

    if existing_drive_metadata:
        drive_metadata.update(existing_drive_metadata)
        drive_metadata["drive_upload_status"] = "uploaded" if drive_metadata.get("drive_file_id") else "failed"
    elif not drive_metadata.get("drive_file_id"):
        try:
            drive_metadata.update(
                upload_original_to_drive_oauth(
                    file_bytes,
                    filename,
                    normalized_type,
                    submission_id=scan_result_id,
                )
            )
            drive_metadata["drive_upload_status"] = "uploaded"
        except Exception as exc:
            drive_metadata["drive_upload_status"] = "failed"
            print(f"[Google Drive] Upload failed: {type(exc).__name__}: {safe_error_message(exc)}")

    if not drive_metadata.get("preview_image_url"):
        try:
            preview_upload = upload_original_to_supabase_storage(
                file_bytes,
                filename,
                normalized_type,
                database,
                object_path=_browser_storage_path(scan_result_id, filename) if scan_result_id else None,
            )
            drive_metadata["preview_image_url"] = preview_upload["public_url"]
            drive_metadata["preview_upload_status"] = "uploaded"
        except Exception as exc:
            drive_metadata["preview_upload_status"] = "failed"
            print(f"[Supabase Storage] Upload failed: {type(exc).__name__}: {safe_error_message(exc)}")

    drive_metadata["upload_status"] = (
        "uploaded" if drive_metadata["preview_upload_status"] == "uploaded" else "preview_upload_failed"
    )
    scan_row = {
        **drive_metadata,
        "source_type": source_type,
        "source_name": filename or "uploaded-image",
        "source_ref": source_ref,
        "batch_id": batch_id,
        "model_version": model_version or os.getenv("MODEL_VERSION", "yolov8-purityloop"),
        "processing_status": "complete",
        **summary,
    }
    if verified:
        scan_row.update({
            "overall_status": "verified",
            "human_review_required": False,
            "review_status": "verified",
            "recommended_action": "Verified after operator review.",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        })
    if principal and principal.kind == "user":
        scan_row["user_id"] = principal.id

    def recover_scan(client):
        if scan_result_id:
            response = client.table(SCAN_RESULTS_TABLE).select("*").eq("id", str(scan_result_id)).maybe_single().execute()
            return [response.data] if response and response.data else None
        if source_type == "video_frame" and batch_id:
            response = client.table(SCAN_RESULTS_TABLE).select("*").eq("batch_id", batch_id).eq(
                "source_name", scan_row["source_name"]
            ).maybe_single().execute()
            return [response.data] if response and response.data else None
        return None

    if existing_scan:
        scan_data = database.execute(
            lambda client: client.table(SCAN_RESULTS_TABLE).update(scan_row).eq(
                "id", str(scan_result_id)
            ).execute().data or []
        )
    else:
        insert_row = {**scan_row, **({"id": str(scan_result_id)} if scan_result_id else {})}
        try:
            scan_data = database.execute(
                lambda client: client.table(SCAN_RESULTS_TABLE).insert(insert_row).execute().data or [],
                recover=recover_scan,
            )
        except Exception as exc:
            if getattr(exc, "code", "") in {"23505"} and scan_result_id:
                scan_data = recover_scan(database.client) or []
            elif getattr(exc, "code", "") in {"PGRST204", "PGRST205", "42703"} and not scan_result_id:
                scan_data = database.execute(
                    lambda client: client.table(SCAN_RESULTS_TABLE).insert(
                        legacy_scan_row(scan_row, filename)
                    ).execute().data or [],
                    recover=recover_scan,
                )
            else:
                raise
    if not scan_data:
        raise HTTPException(status_code=500, detail="Unable to save scan result.")

    saved_scan_id = scan_data[0]["id"]
    stored_material_keys = {
        "material_name", "category", "confidence", "recyclable_status", "contaminant_status",
        "bbox_x", "bbox_y", "bbox_width", "bbox_height", "original_category",
    }
    linked_materials = []
    for index, item in enumerate(materials):
        linked = {
            key: value for key, value in item.items() if key in stored_material_keys
        } | {"scan_result_id": saved_scan_id}
        if scan_result_id:
            linked["id"] = str(uuid5(scan_result_id, f"material:{index}"))
        if frame_time_seconds is not None:
            linked["frame_time_seconds"] = frame_time_seconds
        linked_materials.append(linked)

    existing_materials = _load_scan_materials(database, saved_scan_id) if scan_result_id else []
    existing_material_ids = {str(item.get("id")) for item in existing_materials}
    missing_materials = [
        item for item in linked_materials if not item.get("id") or str(item["id"]) not in existing_material_ids
    ]
    if missing_materials:
        def recover_materials(client):
            response = client.table(DETECTED_MATERIALS_TABLE).select("*").eq(
                "scan_result_id", saved_scan_id
            ).execute()
            rows = response.data or []
            return rows if len(rows) >= len(linked_materials) else None

        try:
            database.execute(
                lambda client: client.table(DETECTED_MATERIALS_TABLE).insert(missing_materials).execute().data or [],
                recover=recover_materials,
            )
        except Exception as exc:
            if frame_time_seconds is not None and getattr(exc, "code", "") in {"PGRST204", "PGRST205", "42703"}:
                database.execute(
                    lambda client: client.table(DETECTED_MATERIALS_TABLE).insert(
                        [{key: value for key, value in item.items() if key != "frame_time_seconds"} for item in missing_materials]
                    ).execute().data or [],
                    recover=recover_materials,
                )
            elif getattr(exc, "code", "") != "23505":
                raise

    stored_materials = _load_scan_materials(database, saved_scan_id)
    if len(stored_materials) != len(linked_materials):
        raise HTTPException(status_code=500, detail="Unable to retrieve saved detected materials.")

    if verified:
        existing_decisions = _load_review_decisions(database, saved_scan_id)
        existing_decision_ids = {str(item.get("id")) for item in existing_decisions}
        decisions = []
        materials_by_id = {str(item["id"]): item for item in stored_materials}
        for index, material in enumerate(materials):
            material_id = str(uuid5(scan_result_id, f"material:{index}"))
            decision_id = str(uuid5(scan_result_id, f"review:{index}"))
            if decision_id in existing_decision_ids:
                continue
            category = materials_by_id[material_id]["category"]
            decisions.append({
                "id": decision_id,
                "scan_result_id": saved_scan_id,
                "detected_material_id": material_id,
                "chosen_category": category,
                "disposition": CATEGORY_CLASS_MAP[category],
                "outcome": "confirmed",
                "reviewer_email": principal.id if principal else "public",
            })
        if decisions:
            try:
                database.execute(
                    lambda client: client.table(REVIEW_DECISIONS_TABLE).insert(decisions).execute().data or []
                )
            except Exception as exc:
                if getattr(exc, "code", "") != "23505":
                    raise

    saved_scan = _load_scan(database, saved_scan_id) or scan_data[0]
    return _scan_response(saved_scan, stored_materials)


def run_scan(
    file_bytes: bytes,
    filename: str | None,
    source_type: str,
    *,
    source_ref: str | None = None,
    batch_id: str | None = None,
    principal: Principal | None = None,
    content_type: str | None = None,
    existing_drive_metadata: dict | None = None,
    frame_time_seconds: float | None = None,
    database: SupabaseExecutor | None = None,
) -> dict:
    """Run one image through the existing YOLO path and persist one canonical scan."""
    suffix, _ = _image_content_type(filename, content_type)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        result = get_model()(tmp_path, verbose=False)[0]
        materials = to_detected_materials(result)
        return persist_scan(
            file_bytes,
            filename,
            source_type,
            materials,
            summarize(materials),
            source_ref=source_ref,
            batch_id=batch_id,
            principal=principal,
            content_type=content_type,
            existing_drive_metadata=existing_drive_metadata,
            frame_time_seconds=frame_time_seconds,
            database=database,
        )
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


class ReviewDecisionInput(BaseModel):
    scan_result_id: UUID
    detected_material_id: UUID
    action: str
    manual_category: str | None = None
    reviewer_email: str | None = None


class BrowserVerifiedDetection(BaseModel):
    detection_index: int
    class_id: int
    model_class_name: str
    verified_class: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float
    verification_status: str


def validate_browser_detections(
    raw_detections: Any,
    image_width: int,
    image_height: int,
) -> list[dict]:
    if not isinstance(raw_detections, list) or not raw_detections:
        raise HTTPException(status_code=400, detail="At least one verified detection is required.")

    validated = []
    indexes = set()
    for raw in raw_detections:
        try:
            detection = BrowserVerifiedDetection(**raw)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Verified detection JSON is invalid.") from exc
        if detection.detection_index < 0 or detection.detection_index in indexes:
            raise HTTPException(status_code=400, detail="Detection indexes must be unique non-negative integers.")
        indexes.add(detection.detection_index)
        if detection.class_id < 0 or detection.class_id >= len(BROWSER_MODEL_CLASSES):
            raise HTTPException(status_code=400, detail="Detection class ID is outside the fixed model contract.")
        expected_name = BROWSER_MODEL_CLASSES[detection.class_id]
        if detection.model_class_name != expected_name:
            raise HTTPException(status_code=400, detail="Detection class ID and model class name do not match.")
        if detection.verified_class not in BROWSER_MODEL_CLASSES:
            raise HTTPException(status_code=400, detail="Verified class is outside the fixed model contract.")
        if not math.isfinite(detection.confidence) or not BROWSER_CONFIDENCE_THRESHOLD <= detection.confidence <= 1:
            raise HTTPException(status_code=400, detail="Detection confidence must be between 0.32 and 1.")
        coordinates = (detection.x1, detection.y1, detection.x2, detection.y2)
        if not all(math.isfinite(value) for value in coordinates):
            raise HTTPException(status_code=400, detail="Detection coordinates must be finite.")
        x1 = min(max(detection.x1, 0), image_width)
        y1 = min(max(detection.y1, 0), image_height)
        x2 = min(max(detection.x2, 0), image_width)
        y2 = min(max(detection.y2, 0), image_height)
        if x2 <= x1 or y2 <= y1:
            raise HTTPException(status_code=400, detail="Detection bounding box must have positive area.")
        battery_detected = detection.model_class_name == "battery" or detection.verified_class == "battery"
        required_status = "battery-confirmed" if battery_detected else "verified"
        if detection.verification_status != required_status:
            detail = (
                "Battery detections require explicit human confirmation."
                if battery_detected
                else "Every detection must be human verified."
            )
            raise HTTPException(status_code=400, detail=detail)

        category = "food_organics" if detection.verified_class == "food_organic" else detection.verified_class
        original_category = "food_organics" if detection.model_class_name == "food_organic" else detection.model_class_name
        recyclable_status, contaminant_status = material_status(category)
        validated.append({
            "_detection_index": detection.detection_index,
            "material_name": detection.verified_class,
            "category": category,
            "original_category": original_category if original_category != category else None,
            "confidence": round(detection.confidence, 4),
            "recyclable_status": recyclable_status,
            "contaminant_status": contaminant_status,
            "bbox_x": round((x1 / image_width) * 100, 4),
            "bbox_y": round((y1 / image_height) * 100, 4),
            "bbox_width": round(((x2 - x1) / image_width) * 100, 4),
            "bbox_height": round(((y2 - y1) / image_height) * 100, 4),
            **evaluate_material(category, detection.confidence),
        })
    return sorted(validated, key=lambda item: item["_detection_index"])


class UploadStartInput(BaseModel):
    filename: str
    size_bytes: int
    mime: str


class IngestInput(BaseModel):
    source: str
    ref: str
    options: dict = {}


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "mode": "public_demo",
        "model_available": MODEL_PATH.exists(),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY),
        "drive_configured": bool(GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID),
    }


def _drive_service():
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=oauth_drive_credentials(), cache_discovery=False)


def _drive_file_info(file_id: str) -> dict:
    return _drive_service().files().get(
        fileId=file_id,
        fields="id,name,mimeType,size,webViewLink,parents,trashed",
        supportsAllDrives=True,
    ).execute()


def _download_drive_file(file_id: str) -> bytes:
    from googleapiclient.http import MediaIoBaseDownload
    output = BytesIO()
    request = _drive_service().files().get_media(fileId=file_id, supportsAllDrives=True)
    downloader = MediaIoBaseDownload(output, request, chunksize=8 * 1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return output.getvalue()


def _find_video_frame_scan(database: SupabaseExecutor, job_id: str, filename: str) -> str | None:
    response = database.execute(
        lambda client: client.table(SCAN_RESULTS_TABLE).select("id").eq("batch_id", job_id).eq("source_name", filename).maybe_single().execute()
    )
    return str(response.data["id"]) if response and response.data else None


def _process_drive_file(file_id: str, job: dict, principal: Principal | None, database: SupabaseExecutor) -> list[str]:
    info = _drive_file_info(file_id)
    if info.get("trashed"):
        return []
    existing = {
        "storage_provider": "google_drive_and_supabase_storage",
        "drive_file_id": info.get("id"),
        "drive_file_name": info.get("name"),
        "drive_web_url": info.get("webViewLink"),
        "image_url": info.get("webViewLink"),
    }
    payload = _download_drive_file(file_id)
    mime = str(info.get("mimeType") or "")
    name = info.get("name") or file_id
    if mime == "video/mp4" or name.lower().endswith(".mp4"):
        import cv2
        stride = max(1, int((job.get("options") or {}).get("vid_stride", 30)))
        tmp_path = None
        scan_ids = [str(scan_id) for scan_id in job.get("scan_ids") or []]
        last_checkpoint_count = len(scan_ids)
        last_checkpoint_at = time.monotonic()
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
                tmp.write(payload)
                tmp_path = tmp.name
            capture = cv2.VideoCapture(tmp_path)
            fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
            frame_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            sampled_total = (frame_total + stride - 1) // stride if frame_total else None
            _update_job(job["id"], database, total_count=sampled_total)
            frame_index = 0
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                if frame_index % stride == 0:
                    encoded_ok, encoded = cv2.imencode(".jpg", frame)
                    if encoded_ok:
                        frame_name = f"{Path(name).stem}_frame_{frame_index:08d}.jpg"
                        scan_id = _find_video_frame_scan(database, str(job["id"]), frame_name)
                        if not scan_id:
                            result = run_scan(
                                encoded.tobytes(), frame_name, "video_frame", source_ref=file_id,
                                batch_id=str(job["id"]), principal=principal, content_type="image/jpeg",
                                existing_drive_metadata=existing,
                                frame_time_seconds=(frame_index / fps if fps else None), database=database,
                            )
                            scan_id = str(result["scan_result_id"])
                        if scan_id not in scan_ids:
                            scan_ids.append(scan_id)
                        now = time.monotonic()
                        if len(scan_ids) - last_checkpoint_count >= 10 or now - last_checkpoint_at >= 5:
                            _update_job(job["id"], database, processed_count=len(scan_ids), scan_ids=scan_ids)
                            last_checkpoint_count = len(scan_ids)
                            last_checkpoint_at = now
                frame_index += 1
            capture.release()
            _update_job(job["id"], database, processed_count=len(scan_ids), total_count=sampled_total or len(scan_ids), scan_ids=scan_ids)
            return scan_ids
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)
    result = run_scan(
        payload,
        name,
        "image",
        source_ref=file_id,
        batch_id=str(job["id"]),
        principal=principal,
        content_type=mime or guess_type(name)[0] or "image/jpeg",
        existing_drive_metadata=existing,
        database=database,
    )
    return [str(result["scan_result_id"])]


def _update_job(job_id: str, database: SupabaseExecutor, **fields) -> None:
    database.execute(
        lambda client: client.table(JOBS_TABLE).update({**fields, "updated_at": datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute()
    )


def _process_job(job: dict, database: SupabaseExecutor) -> list[str]:
    principal = Principal(
        str(job.get("created_by_type") or "api_key"),
        str(job.get("created_by") or "worker"),
        frozenset({"scan:read", "scan:write", "job:read", "review:write"}),
    )
    source = job.get("source")
    if source == "drive_file":
        file_ids = [job["source_ref"]]
    elif source == "drive_folder":
        service = _drive_service()
        response = service.files().list(
            q=f"'{job['source_ref']}' in parents and trashed = false",
            fields="files(id,mimeType,name)",
            pageSize=1000,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        file_ids = [item["id"] for item in response.get("files", []) if item.get("mimeType", "").startswith(("image/", "video/"))]
    else:
        raise ValueError("Only Drive file and Drive folder ingestion is enabled; URL ingestion is disabled for SSRF safety.")

    scan_ids: list[str] = []
    for file_id in file_ids:
        existing_response = database.execute(
            lambda client: client.table(PROCESSED_DRIVE_FILES_TABLE).select("drive_file_id").eq("drive_file_id", file_id).maybe_single().execute()
        )
        existing = existing_response.data if existing_response else None
        if existing:
            saved = database.execute(
                lambda client: client.table(SCAN_RESULTS_TABLE).select("id").eq("batch_id", str(job["id"])).execute()
            ).data or []
            scan_ids.extend(str(row["id"]) for row in saved if row.get("id"))
            continue
        scan_ids.extend(_process_drive_file(file_id, job, principal, database))
        def recover_processed_file(client):
            response = client.table(PROCESSED_DRIVE_FILES_TABLE).select("drive_file_id").eq("drive_file_id", file_id).maybe_single().execute()
            return response.data if response and response.data else None

        database.execute(
            lambda client: client.table(PROCESSED_DRIVE_FILES_TABLE).insert({"drive_file_id": file_id, "scan_result_id": scan_ids[-1] if scan_ids else None}).execute(),
            recover=recover_processed_file,
        )
    return scan_ids


def _worker_loop() -> None:
    database = SupabaseExecutor()
    active_job = None
    while True:
        job_id = None
        try:
            if not database.client:
                time.sleep(15)
                continue
            if active_job is None:
                job_response = database.execute(
                    lambda client: client.table(JOBS_TABLE).select("*").eq("status", "queued").order("created_at").limit(1).maybe_single().execute()
                )
                active_job = job_response.data if job_response else None
                if not active_job:
                    time.sleep(5)
                    continue
                job_id = str(active_job["id"])
                _update_job(job_id, database, status="processing", started_at=datetime.now(timezone.utc).isoformat(), attempts=int(active_job.get("attempts") or 0) + 1)
            job_id = str(active_job["id"])
            scan_ids = _process_job(active_job, database)
            _update_job(job_id, database, status="completed", scan_ids=scan_ids, processed_count=len(scan_ids), total_count=len(scan_ids), completed_at=datetime.now(timezone.utc).isoformat())
            active_job = None
        except SupabaseTemporarilyUnavailable:
            # Keep this in-memory job alive. A later retry resumes via persisted frame names.
            print("[worker] Supabase temporarily unavailable; keeping job active for retry")
            time.sleep(2)
        except Exception as exc:
            print(f"[worker] job failed: {type(exc).__name__}: {safe_error_message(exc)}")
            if job_id:
                try:
                    _update_job(job_id, database, status="failed", error=safe_error_message(exc))
                except SupabaseTemporarilyUnavailable:
                    print("[worker] unable to persist failure; keeping job active for retry")
                    time.sleep(2)
                    continue
            active_job = None
            time.sleep(5)


@app.on_event("startup")
def start_worker() -> None:
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and os.getenv("DISABLE_WORKER", "false").lower() != "true":
        try:
            startup_database = SupabaseExecutor()
            startup_database.execute(
                lambda client: client.table(JOBS_TABLE).update({"status": "queued", "error": "Worker restarted before completion."}).eq("status", "processing").execute()
            )
        except Exception as exc:
            print(f"[worker] restart recovery skipped: {type(exc).__name__}: {safe_error_message(exc)}")
        threading.Thread(target=_worker_loop, name="purityloop-worker", daemon=True).start()


@app.post("/api/uploads/start")
def start_upload(payload: UploadStartInput, principal: Principal = Depends(require_scope("scan:write"))):
    if payload.mime != "video/mp4" or payload.size_bytes <= 0:
        raise HTTPException(status_code=400, detail="Only non-empty MP4 uploads are supported.")
    try:
        from google.auth.transport.requests import AuthorizedSession
        credentials = oauth_drive_credentials()
        session = AuthorizedSession(credentials)
        name = safe_drive_filename(payload.filename)
        response = session.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
            headers={
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": payload.mime,
                "X-Upload-Content-Length": str(payload.size_bytes),
            },
            json={"name": name, "parents": [GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID]},
            timeout=30,
        )
        response.raise_for_status()
        upload_url = response.headers.get("Location")
        if not upload_url:
            raise RuntimeError("Google Drive did not return a resumable upload URL")
        upload_id = str(uuid4())
        UPLOAD_SESSIONS[upload_id] = upload_url
        return {"upload_id": upload_id, "filename": name, "chunk_size": 8 * 1024 * 1024}
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to start Google Drive upload.") from exc


@app.put("/api/uploads/{upload_id}")
async def upload_chunk(upload_id: str, request: Request, principal: Principal = Depends(require_scope("scan:write"))):
    upload_url = UPLOAD_SESSIONS.get(upload_id)
    content_range = request.headers.get("content-range")
    if not upload_url:
        raise HTTPException(status_code=404, detail="MP4 upload session was not found.")
    if not content_range:
        raise HTTPException(status_code=400, detail="MP4 chunk is missing Content-Range.")
    try:
        from google.auth.transport.requests import AuthorizedSession
        chunk = await request.body()
        response = AuthorizedSession(oauth_drive_credentials()).put(
            upload_url,
            headers={"Content-Range": content_range, "Content-Length": str(len(chunk))},
            data=chunk,
            timeout=120,
        )
        if response.status_code == 308:
            return {"complete": False}
        response.raise_for_status()
        UPLOAD_SESSIONS.pop(upload_id, None)
        return {"complete": True, "drive_file": response.json()}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Unable to upload MP4 chunk to Google Drive.") from exc


@app.post("/api/ingest")
def ingest(payload: IngestInput, principal: Principal = Depends(require_scope("scan:write"))):
    if payload.source not in {"drive_file", "drive_folder"} or not payload.ref.strip():
        raise HTTPException(status_code=400, detail="Use source=drive_file or source=drive_folder with a Drive id.")
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    row = {
        "source": payload.source,
        "source_ref": payload.ref.strip(),
        "options": payload.options or {},
        "created_by": principal.id,
        "created_by_type": principal.kind,
    }
    inserted = supabase.table(JOBS_TABLE).insert(row).execute().data or []
    if not inserted:
        raise HTTPException(status_code=500, detail="Unable to create processing job.")
    return {"job_id": inserted[0]["id"], "status": inserted[0].get("status", "queued")}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, principal: Principal = Depends(require_scope("job:read"))):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    database = SupabaseExecutor()
    try:
        def get_query(client):
            query = client.table(JOBS_TABLE).select("*").eq("id", job_id)
            if principal.kind == "user":
                query = query.eq("created_by", principal.id).eq("created_by_type", "user")
            return query.maybe_single().execute()
        response = database.execute(get_query)
    except SupabaseTemporarilyUnavailable:
        return JSONResponse(
            status_code=503,
            content={"detail": "Job status temporarily unavailable. Retry shortly.", "retryable": True},
            headers={"Retry-After": "3"},
        )
    row = response.data if response else None
    if not row:
        raise HTTPException(status_code=404, detail="Processing job was not found.")
    return row


@app.get("/api/analytics")
def analytics(days: int = 7, principal: Principal = Depends(require_scope("scan:read"))):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    days = max(1, min(int(days), 90))
    since = datetime.now(timezone.utc).timestamp() - days * 86400
    since_iso = datetime.fromtimestamp(since, timezone.utc).isoformat()
    rows = scoped_query(supabase.table(SCAN_RESULTS_TABLE).select("overall_status,contamination_risk,overall_confidence,human_review_required,created_at"), principal).gte("created_at", since_iso).execute().data or []
    return {
        "days": days,
        "total_scans": len(rows),
        "review_required": sum(1 for row in rows if row.get("human_review_required") or row.get("overall_status") == "review_required"),
        "accepted": sum(1 for row in rows if row.get("overall_status") == "accepted"),
        "average_confidence": round(sum(float(row.get("overall_confidence") or 0) for row in rows) / len(rows), 4) if rows else 0,
    }


@app.post("/api/scans/browser-verified")
async def save_browser_verified_scan(
    file: UploadFile = File(...),
    submission_id: UUID = Form(...),
    original_width: int = Form(...),
    original_height: int = Form(...),
    model_name: str = Form(...),
    model_version: str = Form(...),
    inference_engine: str = Form(...),
    confidence_threshold: float = Form(...),
    nms_iou_threshold: float = Form(...),
    verified_detections: str = Form(...),
    verification_outcome: str = Form(...),
    principal: Principal = Depends(require_scope("scan:write")),
):
    if model_name != BROWSER_MODEL_NAME or model_version != BROWSER_MODEL_VERSION:
        raise HTTPException(status_code=400, detail="Browser model identity does not match the fixed contract.")
    if inference_engine != BROWSER_INFERENCE_ENGINE:
        raise HTTPException(status_code=400, detail="Inference engine must be browser-onnx.")
    if not math.isclose(confidence_threshold, BROWSER_CONFIDENCE_THRESHOLD, abs_tol=1e-9):
        raise HTTPException(status_code=400, detail="Browser confidence threshold must be 0.32.")
    if not math.isclose(nms_iou_threshold, BROWSER_NMS_IOU_THRESHOLD, abs_tol=1e-9):
        raise HTTPException(status_code=400, detail="Browser NMS IoU threshold must be 0.70.")
    if verification_outcome != "verified":
        raise HTTPException(status_code=400, detail="Browser detections must be human verified before saving.")

    file_bytes = await file.read()
    if not file_bytes or len(file_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Image must be non-empty and no larger than 10 MB.")
    _, normalized_type = _image_content_type(file.filename, file.content_type)
    try:
        with Image.open(BytesIO(file_bytes)) as image:
            actual_width, actual_height = image.size
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Uploaded image is invalid or corrupted.") from exc
    if actual_width <= 0 or actual_height <= 0:
        raise HTTPException(status_code=400, detail="Uploaded image dimensions are invalid.")
    if (original_width, original_height) != (actual_width, actual_height):
        raise HTTPException(status_code=400, detail="Browser image dimensions do not match the uploaded image.")

    try:
        raw_detections = json.loads(verified_detections)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Verified detection JSON is invalid.") from exc
    materials = validate_browser_detections(raw_detections, actual_width, actual_height)
    summary = summarize(materials)
    summary.update({
        "overall_status": "verified",
        "human_review_required": False,
        "recommended_action": "Verified after operator review.",
    })
    print(
        "[PurityLoop inference]\n"
        "engine=browser-onnx\n"
        "model=best.onnx\n"
        "source=upload-page"
    )
    return persist_scan(
        file_bytes,
        file.filename,
        "image",
        materials,
        summary,
        source_ref="browser-onnx:best.onnx",
        principal=principal,
        content_type=normalized_type,
        scan_result_id=submission_id,
        model_version=model_version,
        verified=True,
    )


@app.post("/api/reviews")
def create_review(decision: ReviewDecisionInput, principal: Principal = Depends(require_scope("review:write"))):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    review_payload = {
        "scan_result_id": str(decision.scan_result_id),
        "detected_material_id": str(decision.detected_material_id),
        "action": decision.action,
        "manual_category": decision.manual_category,
        "principal": principal.id,
    }
    print(f"[review] incoming payload: {review_payload}")
    action = str(decision.action or "").strip().lower()
    if action not in {"verify", "reject"}:
        raise HTTPException(status_code=400, detail="Review action must be 'verify' or 'reject'.")
    try:
        scan_result_id = str(decision.scan_result_id)
        detected_material_id = str(decision.detected_material_id)
        print(f"[review] action={action} scan_result_id={scan_result_id} selected_category={decision.manual_category}")
        print(f"[review] selecting {SCAN_RESULTS_TABLE} where id={scan_result_id}")
        scan_response = scoped_query(supabase.table(SCAN_RESULTS_TABLE).select("*").eq("id", scan_result_id), principal).execute()
        print(f"[review] selecting {DETECTED_MATERIALS_TABLE} where id={detected_material_id}, scan_result_id={scan_result_id}")
        material_response = supabase.table(DETECTED_MATERIALS_TABLE).select("*").eq("id", detected_material_id).eq("scan_result_id", scan_result_id).execute()
        if not scan_response.data or not material_response.data:
            raise HTTPException(status_code=404, detail="Scan result or detected material was not found.")

        material = material_response.data[0]
        category = material_category(decision.manual_category or material.get("category"))
        disposition = CATEGORY_CLASS_MAP.get(category)
        if category == "unknown" or disposition not in {"recyclable", "contaminant"}:
            raise HTTPException(status_code=400, detail="Manual category is not supported.")
        print(f"[review] resolved category={category} disposition={disposition}")

        updated_material = material
        if action == "verify" and category != material.get("category"):
            material_update = {"category": category}
            if not material.get("original_category"):
                material_update["original_category"] = material.get("category")
            print(f"[review] updating {DETECTED_MATERIALS_TABLE}: {material_update}")
            update_response = supabase.table(DETECTED_MATERIALS_TABLE).update(material_update).eq("id", detected_material_id).eq("scan_result_id", scan_result_id).execute()
            updated_material = update_response.data[0] if update_response.data else {**material, **material_update}

        outcome = "confirmed" if action == "verify" else "rejected"
        decision_insert = {
            "scan_result_id": scan_result_id,
            "detected_material_id": detected_material_id,
            "chosen_category": category,
            "disposition": disposition,
            "outcome": outcome,
            "reviewer_email": principal.id if principal.kind == "user" else f"api:{principal.id}",
        }
        print(f"[review] inserting {REVIEW_DECISIONS_TABLE}: {decision_insert}")
        inserted = supabase.table(REVIEW_DECISIONS_TABLE).insert(decision_insert).execute()
        scan_update = {
            "overall_status": "verified" if action == "verify" else "rejected",
            "human_review_required": False,
            "recommended_action": "Verified after operator review." if action == "verify" else "Rejected after operator review.",
            "review_status": "verified" if action == "verify" else "rejected",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        if action == "verify":
            scan_update["verified_category"] = category
        print(f"[review] updating {SCAN_RESULTS_TABLE}: {scan_update}")
        updated_scan_response = supabase.table(SCAN_RESULTS_TABLE).update(scan_update).eq("id", scan_result_id).execute()
        if not updated_scan_response.data:
            raise HTTPException(status_code=500, detail="Review was saved, but the scan result status could not be updated.")
        return {
            "decision": inserted.data[0] if inserted.data else None,
            "material": updated_material,
            "scan_result": updated_scan_response.data[0],
            **updated_scan_response.data[0],
        }
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        print(f"[review] Supabase update failed: {safe_error_message(exc)}")
        detail = safe_error_message(exc)
        if getattr(exc, "code", "") in {"PGRST205", "42703"}:
            detail = f"Supabase review schema is missing or outdated: {detail}"
        if os.getenv("ENVIRONMENT", "development").lower() in {"development", "dev", "local"}:
            raise HTTPException(status_code=500, detail=detail) from exc
        raise HTTPException(status_code=500, detail="Unable to save review. Check the backend Supabase configuration.") from exc


@app.get("/api/scans")
def get_scan_history(
    limit: int = 50,
    offset: int = 0,
    start_date: str | None = None,
    end_date: str | None = None,
    principal: Principal = Depends(require_scope("scan:read")),
):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    try:
        limit = max(1, min(int(limit), 200))
        offset = max(0, int(offset))
        scan_query = supabase.table(SCAN_RESULTS_TABLE).select("*", count="exact")
        if start_date:
            scan_query = scan_query.gte("created_at", start_date)
        if end_date:
            scan_query = scan_query.lt("created_at", end_date)
        scan_response = scoped_query(
            scan_query.order("created_at", desc=True).range(offset, offset + limit - 1), principal
        ).execute()
        scans = scan_response.data or []
        count_value = getattr(scan_response, "count", None)
        if count_value is None:
            raise RuntimeError("Supabase did not return an exact scan count")
        total = int(count_value)
        def exact_count(query):
            response = scoped_query(query, principal).execute()
            value = getattr(response, "count", None)
            return int(value) if value is not None else 0

        rejected_query = supabase.table(SCAN_RESULTS_TABLE).select("id", count="exact", head=True)
        needs_review_query = supabase.table(SCAN_RESULTS_TABLE).select("id", count="exact", head=True)
        for query in (rejected_query, needs_review_query):
            if start_date:
                query.gte("created_at", start_date)
            if end_date:
                query.lt("created_at", end_date)
        rejected = exact_count(rejected_query.in_("overall_status", ["rejected", "quarantined"]))
        needs_review = exact_count(needs_review_query.eq("human_review_required", True))
        confirmed = max(0, total - rejected - needs_review)
        scan_ids = [str(scan.get("id")) for scan in scans if scan.get("id")]
        if scan_ids:
            materials = supabase.table(DETECTED_MATERIALS_TABLE).select("*").in_("scan_result_id", scan_ids).execute().data or []
            decisions = supabase.table(REVIEW_DECISIONS_TABLE).select("*").in_("scan_result_id", scan_ids).execute().data or []
        else:
            materials = []
            decisions = []
        latest_decisions = {}
        for decision in sorted(decisions, key=lambda item: str(item.get("created_at", ""))):
            latest_decisions[str(decision.get("detected_material_id", ""))] = decision
        materials_by_scan = {}
        for material in materials:
            materials_by_scan.setdefault(str(material.get("scan_result_id", "")), []).append({
                **material,
                "review_decision": latest_decisions.get(str(material.get("id", ""))),
            })
        items = [
            {**scan, "detected_materials": materials_by_scan.get(str(scan.get("id", "")), [])}
            for scan in scans
        ]
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset,
            "start_date": start_date,
            "end_date": end_date,
            "summary": {
                "confirmed": confirmed,
                "needs_review": needs_review,
                "rejected": rejected,
            },
        }
    except Exception as exc:
        print(f"[scans] Supabase history fetch failed: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to load scan history.") from exc


@app.get("/api/scans/{scan_result_id}")
def get_scan_result(scan_result_id: str, principal: Principal = Depends(require_scope("scan:read"))):
    """Return the persisted material IDs needed to review a previously loaded scan."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    scan_response = scoped_query(supabase.table(SCAN_RESULTS_TABLE).select("*").eq("id", scan_result_id), principal).execute()
    if not scan_response.data:
        raise HTTPException(status_code=404, detail="Scan result was not found.")
    materials = supabase.table(DETECTED_MATERIALS_TABLE).select("*").eq("scan_result_id", scan_result_id).execute().data or []
    decisions = supabase.table(REVIEW_DECISIONS_TABLE).select("*").eq("scan_result_id", scan_result_id).execute().data or []
    latest_decisions = {}
    for item in sorted(decisions, key=lambda entry: str(entry.get("created_at", ""))):
        latest_decisions[str(item.get("detected_material_id", ""))] = item
    return {
        "scan_result": {
            **scan_response.data[0],
            "detected_materials": [
                {**material, "review_decision": latest_decisions.get(str(material.get("id", "")))}
                for material in materials
            ],
        }
    }


@app.get("/api/google/auth")
def google_auth(principal: Principal = Depends(require_scope("scan:write"))):
    try:
        flow = oauth_flow()
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            prompt="consent",
            include_granted_scopes="true",
        )
        save_oauth_state(state, flow.code_verifier)
    except Exception as exc:
        print(f"[google-auth] OAuth start failed: {type(exc).__name__}: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Google OAuth is not configured.") from exc
    return RedirectResponse(authorization_url)


@app.get("/api/google/callback")
def google_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        raise HTTPException(status_code=400, detail="Google OAuth authorization failed.")
    if not code:
        raise HTTPException(status_code=400, detail="Missing Google OAuth code.")

    try:
        saved_state = load_oauth_state(state)
        flow = oauth_flow()
        flow.code_verifier = saved_state["code_verifier"]
        flow.fetch_token(code=code)
        save_oauth_token(flow.credentials)
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[google-callback] OAuth token exchange failed: {type(exc).__name__}: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to save Google OAuth token.") from exc
    return "Google Drive connected. You can now upload images."


@app.post("/api/predict")
async def predict(file: UploadFile = File(...), principal: Principal = Depends(require_scope("scan:write"))):
    file_bytes = await file.read()
    return run_scan(file_bytes, file.filename, "image", principal=principal, content_type=file.content_type)
