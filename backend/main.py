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
from supabase import create_client
from ultralytics import YOLO

BACKEND_ROOT = Path(__file__).resolve().parent
APP_ROOT = BACKEND_ROOT.parent

load_dotenv(BACKEND_ROOT / ".env")

MODEL_PATH = Path(os.getenv("MODEL_PATH", "backend/models/best.pt"))
if not MODEL_PATH.is_absolute():
    MODEL_PATH = APP_ROOT / MODEL_PATH

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID = os.getenv("GOOGLE_DRIVE_UPLOADED_IMAGES_FOLDER_ID")
GOOGLE_OAUTH_REDIRECT_URI = os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/google/callback")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    if origin.strip()
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
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def get_model():
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(status_code=500, detail="YOLO model file not found.")
        model = YOLO(str(MODEL_PATH))
    return model


def safe_drive_filename(original_filename: str | None) -> str:
    name = Path(original_filename or "uploaded-image.jpg").name
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._") or "uploaded-image.jpg"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"purityloop_{timestamp}_{safe_name}"


def safe_error_message(exc: Exception) -> str:
    message = str(exc).replace(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "\0", "[redacted]")
    message = re.sub(r"[\w./ -]*google-service-account\.json", "[google-service-account.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-client\.json", "[google-oauth-client.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-token\.json", "[google-oauth-token.json]", message)
    message = re.sub(r"[\w./ -]*google-oauth-state\.json", "[google-oauth-state.json]", message)
    return message[:300]


def config_path(env_name: str, default_relative: str) -> Path:
    raw_path = os.getenv(env_name, default_relative)
    path = Path(raw_path)
    if path.is_absolute():
        return path

    candidates = [APP_ROOT / path, Path.cwd() / path, BACKEND_ROOT / path]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


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
        .create(body=metadata, media_body=media, fields="id,name,webViewLink")
        .execute()
    )
    return {
        "drive_file_id": created.get("id"),
        "drive_file_name": created.get("name") or drive_file_name,
        "drive_web_url": created.get("webViewLink"),
    }


def google_oauth_client_path() -> Path:
    return config_path("GOOGLE_OAUTH_CLIENT_SECRET_FILE", "backend/google-oauth-client.json")


def google_oauth_token_path() -> Path:
    return config_path("GOOGLE_OAUTH_TOKEN_FILE", "backend/google-oauth-token.json")


def google_oauth_state_path() -> Path:
    return config_path("GOOGLE_OAUTH_STATE_FILE", "backend/google-oauth-state.json")


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
        .create(body=metadata, media_body=media, fields="id,name,webViewLink")
        .execute()
    )
    return {
        "drive_file_id": created.get("id"),
        "drive_file_name": created.get("name") or drive_file_name,
        "drive_web_url": created.get("webViewLink"),
    }


def legacy_scan_row(scan_row: dict, original_filename: str | None) -> dict:
    keep_keys = {
        "image_url",
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
    row["image_url"] = row.get("image_url") or original_filename or "uploaded-image"
    row["upload_status"] = row.get("upload_status") or "uploaded"
    return row


def material_category(name: str) -> str:
    text = name.lower()
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
    if category in {"battery", "food_organics", "general_trash", "textile", "unknown"}:
        return "non_recyclable", "contaminated"
    return "recyclable", "clean"


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
    contaminated = any(item["contaminant_status"] != "clean" for item in materials)
    low_confidence = avg_confidence < 0.85
    review_required = contaminated or low_confidence

    return {
        "overall_status": "review_required" if review_required else "accepted",
        "contamination_risk": "medium" if contaminated else "low",
        "recommended_action": "Human review recommended before sorting."
        if review_required
        else "Accept scan after operator verification.",
        "human_review_required": review_required,
        "overall_confidence": round(avg_confidence, 4),
    }


@app.get("/api/health")
def health():
    return {"ok": True, "model_path": str(MODEL_PATH)}


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

    suffix = Path(file.filename or "upload.jpg").suffix or ".jpg"
    tmp_path = None
    try:
        print(f"[predict] reading uploaded file: {file.filename or 'uploaded-image'} ({file.content_type})")
        file_bytes = await file.read()
        drive_metadata = {
            "storage_provider": "drive_upload_failed",
            "upload_status": "drive_upload_failed",
            "drive_file_id": None,
            "drive_file_name": file.filename or "uploaded-image",
            "drive_web_url": None,
            "image_url": None,
        }
        try:
            print("[predict] uploading to Google Drive with OAuth")
            uploaded_drive_file = upload_original_to_drive_oauth(file_bytes, file.filename, file.content_type)
            drive_metadata = {
                "storage_provider": "google_drive_oauth",
                "upload_status": "uploaded",
                **uploaded_drive_file,
                "image_url": uploaded_drive_file.get("drive_web_url"),
            }
            print(
                f"[predict] Google Drive upload complete: "
                f"{drive_metadata['drive_file_name']} ({drive_metadata['drive_file_id']})"
            )
        except Exception as exc:
            print(f"[predict] Google Drive upload failed: {type(exc).__name__}: {safe_error_message(exc)}")

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        print(f"[predict] running YOLO prediction: {tmp_path}")
        result = get_model()(tmp_path, verbose=False)[0]
        print("[predict] converting YOLO results")
        materials = to_detected_materials(result)
        summary = summarize(materials)
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
        except Exception as exc:
            print(f"[predict] Supabase {SCAN_RESULTS_TABLE} insert failed: {safe_error_message(exc)}")
            print("[predict] retrying scan insert without Drive metadata")
            try:
                scan_response = supabase.table(SCAN_RESULTS_TABLE).insert(legacy_scan_row(scan_row, file.filename)).execute()
                scan_data = scan_response.data
            except Exception as retry_exc:
                print(f"[predict] Supabase {SCAN_RESULTS_TABLE} retry failed: {safe_error_message(retry_exc)}")
                traceback.print_exc()
                raise
        if not scan_data:
            print(f"[predict] Supabase {SCAN_RESULTS_TABLE} insert returned no data")
            raise HTTPException(status_code=500, detail="Unable to save scan result.")

        scan_result_id = scan_data[0]["id"]
        linked_materials = [{**item, "scan_result_id": scan_result_id} for item in materials]
        if linked_materials:
            print(f"[predict] inserting {DETECTED_MATERIALS_TABLE}: {len(linked_materials)} row(s)")
            try:
                supabase.table(DETECTED_MATERIALS_TABLE).insert(linked_materials).execute()
            except Exception as exc:
                print(f"[predict] Supabase {DETECTED_MATERIALS_TABLE} insert failed")
                print(f"[predict] Supabase error: {exc}")
                traceback.print_exc()
                raise

        return {
            "scan_result_id": scan_result_id,
            **summary,
            **drive_metadata,
            "detected_materials": materials,
        }
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Prediction failed.") from exc
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
