import os
import re
import json
import tempfile
import traceback
from datetime import datetime, timezone
from io import BytesIO
from mimetypes import guess_type
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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

app = FastAPI(title="PurityLoop AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None
SCAN_RESULTS_TABLE = "mock_scan_results"
DETECTED_MATERIALS_TABLE = "mock_detected_materials"
REVIEW_DECISIONS_TABLE = "scan_review_decisions"
PREVIEW_BUCKET = "mock_uploaded_images"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
CONFIRMATION_THRESHOLD = 0.85
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


def upload_original_to_supabase_storage(file_bytes: bytes, original_filename: str | None, content_type: str) -> dict:
    if not supabase:
        raise RuntimeError("Supabase backend env is not configured")

    path = safe_drive_filename(original_filename)
    supabase.storage.from_(PREVIEW_BUCKET).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    public_url = supabase.storage.from_(PREVIEW_BUCKET).get_public_url(path)
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
        scopes=DRIVE_SCOPES,
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

    credentials = Credentials.from_authorized_user_file(str(token_path), DRIVE_SCOPES)
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(GoogleAuthRequest())
        save_oauth_token(credentials)
    if not credentials.valid:
        raise RuntimeError("Google OAuth token is not valid")
    return credentials


def upload_original_to_drive_oauth(file_bytes: bytes, original_filename: str | None, content_type: str | None) -> dict:
    if not GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID:
        raise RuntimeError("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID is not configured")

    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseUpload

    drive_file_name = safe_drive_filename(original_filename)
    mimetype = content_type or guess_type(drive_file_name)[0] or "application/octet-stream"
    service = build("drive", "v3", credentials=oauth_drive_credentials(), cache_discovery=False)
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


class ReviewDecisionInput(BaseModel):
    scan_result_id: str
    detected_material_id: str
    action: str
    manual_category: str | None = None
    reviewer_email: str | None = None


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/reviews")
def create_review(decision: ReviewDecisionInput):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    action = str(decision.action or "").strip().lower()
    if action not in {"verify", "reject"}:
        raise HTTPException(status_code=400, detail="Review action must be 'verify' or 'reject'.")
    try:
        scan_response = supabase.table(SCAN_RESULTS_TABLE).select("*").eq("id", decision.scan_result_id).execute()
        material_response = supabase.table(DETECTED_MATERIALS_TABLE).select("*").eq("id", decision.detected_material_id).eq("scan_result_id", decision.scan_result_id).execute()
        if not scan_response.data or not material_response.data:
            raise HTTPException(status_code=404, detail="Scan result or detected material was not found.")

        material = material_response.data[0]
        category = material_category(decision.manual_category or material.get("category"))
        disposition = CATEGORY_CLASS_MAP.get(category)
        if category == "unknown" or disposition not in {"recyclable", "contaminant"}:
            raise HTTPException(status_code=400, detail="Manual category is not supported.")

        updated_material = material
        if action == "verify" and category != material.get("category"):
            material_update = {"category": category}
            if not material.get("original_category"):
                material_update["original_category"] = material.get("category")
            update_response = supabase.table(DETECTED_MATERIALS_TABLE).update(material_update).eq("id", decision.detected_material_id).eq("scan_result_id", decision.scan_result_id).execute()
            updated_material = update_response.data[0] if update_response.data else {**material, **material_update}

        outcome = "confirmed" if action == "verify" else "rejected"
        inserted = supabase.table(REVIEW_DECISIONS_TABLE).insert({
            "scan_result_id": decision.scan_result_id,
            "detected_material_id": decision.detected_material_id,
            "chosen_category": category,
            "disposition": disposition,
            "outcome": outcome,
            "reviewer_email": decision.reviewer_email,
        }).execute()
        scan_update = {
            "overall_status": "verified" if action == "verify" else "rejected",
            "human_review_required": False,
            "recommended_action": "Verified after operator review." if action == "verify" else "Rejected after operator review.",
            "review_status": "verified" if action == "verify" else "rejected",
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        if action == "verify":
            scan_update["verified_category"] = category
        updated_scan_response = supabase.table(SCAN_RESULTS_TABLE).update(scan_update).eq("id", decision.scan_result_id).execute()
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
        print(f"[review] Supabase update failed: {safe_error_message(exc)}")
        if getattr(exc, "code", "") == "PGRST205":
            raise HTTPException(status_code=500, detail="Supabase review schema is missing. Apply the review migration, then retry.") from exc
        raise HTTPException(status_code=500, detail="Unable to save review. Check the backend Supabase configuration.") from exc


@app.get("/api/scans")
def get_scan_history():
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    try:
        scans = supabase.table(SCAN_RESULTS_TABLE).select("*").order("created_at", desc=True).execute().data or []
        materials = supabase.table(DETECTED_MATERIALS_TABLE).select("*").execute().data or []
        decisions = supabase.table(REVIEW_DECISIONS_TABLE).select("*").execute().data or []
        latest_decisions = {}
        for decision in sorted(decisions, key=lambda item: str(item.get("created_at", ""))):
            latest_decisions[str(decision.get("detected_material_id", ""))] = decision
        materials_by_scan = {}
        for material in materials:
            materials_by_scan.setdefault(str(material.get("scan_result_id", "")), []).append({
                **material,
                "review_decision": latest_decisions.get(str(material.get("id", ""))),
            })
        return {
            "scans": [
                {**scan, "detected_materials": materials_by_scan.get(str(scan.get("id", "")), [])}
                for scan in scans
            ]
        }
    except Exception as exc:
        print(f"[scans] Supabase history fetch failed: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to load scan history.") from exc


@app.get("/api/scans/{scan_result_id}")
def get_scan_result(scan_result_id: str):
    """Return the persisted material IDs needed to review a previously loaded scan."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    scan_response = supabase.table(SCAN_RESULTS_TABLE).select("*").eq("id", scan_result_id).execute()
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


@app.get("/api/debug/model")
def debug_model():
    import os

    model_path = os.getenv("MODEL_PATH", "models/best.pt")

    return {
        "cwd": os.getcwd(),
        "model_path": model_path,
        "exists": os.path.exists(model_path),
        "root_files": os.listdir("."),
        "models_exists": os.path.exists("models"),
        "models_files": os.listdir("models") if os.path.exists("models") else []
    }


@app.get("/api/google/auth")
def google_auth():
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
async def predict(file: UploadFile = File(...)):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload one image file.")

    content_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
    suffix = (Path(file.filename or "upload.jpg").suffix or ".jpg").lower()
    content_type = content_types.get(suffix)
    if not content_type:
        raise HTTPException(status_code=400, detail="Upload one image file.")

    tmp_path = None
    try:
        print(f"[predict] reading uploaded file: {file.filename or 'uploaded-image'} ({file.content_type})")
        file_bytes = await file.read()
        drive_metadata = {
            "storage_provider": "google_drive_and_supabase_storage",
            "upload_status": "pending",
            "drive_file_id": None,
            "drive_file_name": file.filename or "uploaded-image",
            "drive_web_url": None,
            "image_url": None,
            "preview_image_url": None,
        }

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        print(f"[predict] running YOLO prediction: {tmp_path}")
        result = get_model()(tmp_path, verbose=False)[0]
        print("[predict] converting YOLO results")
        materials = to_detected_materials(result)
        summary = summarize(materials)

        try:
            print("[Google Drive] Upload started")
            uploaded_drive_file = upload_original_to_drive_oauth(file_bytes, file.filename, content_type)
            drive_metadata = {**drive_metadata, **uploaded_drive_file}
            print(f"[Google Drive] Upload successful: {drive_metadata['drive_file_id']}")
        except Exception as exc:
            print(f"[Google Drive] Upload failed: {type(exc).__name__}: {safe_error_message(exc)}")

        try:
            print("[Supabase Storage] Upload started")
            preview_upload = upload_original_to_supabase_storage(file_bytes, file.filename, content_type)
            drive_metadata["preview_image_url"] = preview_upload["public_url"]
            print(f"[Supabase Storage] Upload successful: {preview_upload['public_url']}")
        except Exception as exc:
            print(f"[Supabase Storage] Upload failed: {type(exc).__name__}: {safe_error_message(exc)}")

        drive_metadata["upload_status"] = "uploaded" if drive_metadata["preview_image_url"] else "preview_upload_failed"
        scan_row = {
            **drive_metadata,
            "source_type": "image",
            "processing_status": "complete",
            **summary,
        }

        print(f"[predict] inserting {SCAN_RESULTS_TABLE}")
        try:
            scan_response = supabase.table(SCAN_RESULTS_TABLE).insert(scan_row).execute()
            scan_data = scan_response.data
            print("[Database] Scan record inserted")
        except Exception as exc:
            print(f"[predict] Supabase {SCAN_RESULTS_TABLE} insert failed: {safe_error_message(exc)}")
            print("[predict] retrying scan insert without Drive metadata")
            try:
                scan_response = supabase.table(SCAN_RESULTS_TABLE).insert(legacy_scan_row(scan_row, file.filename)).execute()
                scan_data = scan_response.data
                print("[Database] Scan record inserted")
            except Exception as retry_exc:
                print(f"[predict] Supabase {SCAN_RESULTS_TABLE} retry failed: {safe_error_message(retry_exc)}")
                traceback.print_exc()
                raise
        if not scan_data:
            print(f"[predict] Supabase {SCAN_RESULTS_TABLE} insert returned no data")
            raise HTTPException(status_code=500, detail="Unable to save scan result.")

        scan_result_id = scan_data[0]["id"]
        stored_material_keys = {"material_name", "category", "confidence", "recyclable_status", "contaminant_status", "bbox_x", "bbox_y", "bbox_width", "bbox_height"}
        linked_materials = [{key: value for key, value in item.items() if key in stored_material_keys} | {"scan_result_id": scan_result_id} for item in materials]
        stored_materials = []
        if linked_materials:
            print(f"[predict] inserting {DETECTED_MATERIALS_TABLE}: {len(linked_materials)} row(s)")
            try:
                stored_materials = supabase.table(DETECTED_MATERIALS_TABLE).insert(linked_materials).execute().data or []
            except Exception as exc:
                print(f"[predict] Supabase {DETECTED_MATERIALS_TABLE} insert failed")
                print(f"[predict] Supabase error: {exc}")
                traceback.print_exc()
                raise
            if len(stored_materials) != len(linked_materials):
                raise HTTPException(status_code=500, detail="Unable to retrieve saved detected materials.")

        return {
            "scan_result_id": scan_result_id,
            **summary,
            **drive_metadata,
            # Return the inserted rows, including their database IDs. These IDs are
            # required by /api/reviews and must travel with the browser's scan state.
            "detected_materials": stored_materials,
        }
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Prediction failed.") from exc
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
