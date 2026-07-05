import os
import tempfile
import traceback
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client
from ultralytics import YOLO

load_dotenv(Path(__file__).with_name(".env"))

APP_ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = Path(os.getenv("MODEL_PATH", "backend/models/best.pt"))
if not MODEL_PATH.is_absolute():
    MODEL_PATH = APP_ROOT / MODEL_PATH

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

app = FastAPI(title="PurityLoop AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model = None
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY else None
SCAN_RESULTS_TABLE = "mock_scan_results"
DETECTED_MATERIALS_TABLE = "mock_detected_materials"


def get_model():
    global model
    if model is None:
        if not MODEL_PATH.exists():
            raise HTTPException(status_code=500, detail="YOLO model file not found.")
        model = YOLO(str(MODEL_PATH))
    return model


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
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        print(f"[predict] running YOLO prediction: {tmp_path}")
        result = get_model()(tmp_path, verbose=False)[0]
        print("[predict] converting YOLO results")
        materials = to_detected_materials(result)
        summary = summarize(materials)
        scan_row = {
            "image_url": file.filename or "uploaded-image",
            "source_type": "image",
            "upload_status": "uploaded",
            "processing_status": "complete",
            **summary,
        }

        print(f"[predict] inserting {SCAN_RESULTS_TABLE}")
        try:
            scan_response = supabase.table(SCAN_RESULTS_TABLE).insert(scan_row).execute()
            scan_data = scan_response.data
        except Exception as exc:
            print(f"[predict] Supabase {SCAN_RESULTS_TABLE} insert failed")
            print(f"[predict] Supabase error: {exc}")
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
