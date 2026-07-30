import os
import re
import json
import math
import tempfile
import traceback
import threading
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from io import BytesIO
from mimetypes import guess_type
from pathlib import Path
from urllib.parse import unquote
from uuid import UUID, uuid4, uuid5
from typing import Any, Callable, TypeVar
from zoneinfo import ZoneInfo

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, Response
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
SCAN_RESULTS_TABLE = "scan_results"
DETECTED_MATERIALS_TABLE = "detected_materials"
REVIEW_DECISIONS_TABLE = "scan_review_decisions"
JOBS_TABLE = "processing_jobs"
PROCESSED_DRIVE_FILES_TABLE = "processed_drive_files"
PREVIEW_BUCKET = "mock_uploaded_images"
DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"]
# The upload folder is configured server-side, not selected with Google Picker.
# OAuth therefore needs access to that existing folder and its idempotency search.
OAUTH_DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
]
CONFIRMATION_THRESHOLD = 0.85
ANALYTICS_PAGE_SIZE = 500
ANALYTICS_CHILD_PAGE_SIZE = 500
SCAN_HISTORY_DEFAULT_LIMIT = 10
SCAN_HISTORY_MAX_LIMIT = 100
SCAN_HISTORY_EXPORT_BATCH_SIZE = 500
SCAN_HISTORY_EXPORT_CHILD_BATCH_SIZE = 200
SCAN_HISTORY_THUMBNAIL_SIZE = (80, 80)
SCAN_HISTORY_THUMBNAIL_WORKERS = 8
SCAN_HISTORY_IMAGE_TIMEOUT = httpx.Timeout(5.0, connect=3.0)
SCAN_HISTORY_IMAGE_MAX_BYTES = 2 * 1024 * 1024
MALAYSIA_TIMEZONE = ZoneInfo("Asia/Kuala_Lumpur")
ANALYTICS_MALAYSIA_TZ = MALAYSIA_TIMEZONE
ANALYTICS_MATERIAL_ESTIMATES = {
    "general trash": {"label": "General Trash", "average_weight_kg": 0.100, "price_per_kg_rm": 0.00, "material_class": "contaminant"},
    "food organic": {"label": "Food Organic", "average_weight_kg": 0.080, "price_per_kg_rm": 0.00, "material_class": "contaminant"},
    "metal": {"label": "Metal", "average_weight_kg": 0.020, "price_per_kg_rm": 1.20, "material_class": "recyclable"},
    "plastic": {"label": "Plastic", "average_weight_kg": 0.032, "price_per_kg_rm": 0.50, "material_class": "recyclable"},
    "glass": {"label": "Glass", "average_weight_kg": 0.300, "price_per_kg_rm": 0.10, "material_class": "recyclable"},
    "textile": {"label": "Textile", "average_weight_kg": 0.150, "price_per_kg_rm": 0.00, "material_class": "contaminant"},
    "paper": {"label": "Paper", "average_weight_kg": 0.005, "price_per_kg_rm": 0.30, "material_class": "recyclable"},
    "battery": {"label": "Battery", "average_weight_kg": 0.023, "price_per_kg_rm": 3.50, "material_class": "contaminant"},
    "cardboard": {"label": "Cardboard", "average_weight_kg": 0.125, "price_per_kg_rm": 0.25, "material_class": "recyclable"},
}
BROWSER_CONFIDENCE_THRESHOLD = 0.32
BROWSER_NMS_IOU_THRESHOLD = 0.70
BROWSER_MODEL_NAME = "best.onnx"
BROWSER_MODEL_VERSION = "v3_ffremask_9cls"
BROWSER_INFERENCE_ENGINE = "browser-onnx"
BROWSER_MODEL_CLASSES = (
    "plastic", "paper", "cardboard", "metal", "glass", "textile", "food_organic", "battery", "general_trash",
)
BROWSER_CONFIDENCE_DETAIL = f"Detection confidence must be between {BROWSER_CONFIDENCE_THRESHOLD:.2f} and 1."
BROWSER_CONFIDENCE_CONTRACT_DETAIL = f"Browser confidence threshold must be {BROWSER_CONFIDENCE_THRESHOLD:.2f}."
BROWSER_NMS_CONTRACT_DETAIL = f"Browser NMS IoU threshold must be {BROWSER_NMS_IOU_THRESHOLD:.2f}."
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
VIDEO_TRACK_MIN_FRAMES = max(1, int(os.getenv("VIDEO_TRACK_MIN_FRAMES", "3")))
VIDEO_TRACK_SHORT_CONFIDENCE = float(os.getenv("VIDEO_TRACK_SHORT_CONFIDENCE", "0.92"))
VIDEO_TRACK_LOST_BUFFER = max(1, int(os.getenv("VIDEO_TRACK_LOST_BUFFER", "15")))
VIDEO_TRACK_RECOVERY_IOU = float(os.getenv("VIDEO_TRACK_RECOVERY_IOU", "0.35"))
VIDEO_TRACK_RECOVERY_CENTER_DISTANCE = float(os.getenv("VIDEO_TRACK_RECOVERY_CENTER_DISTANCE", "0.18"))
VIDEO_LOGICAL_MERGE_MAX_GAP = max(1, int(os.getenv("VIDEO_LOGICAL_MERGE_MAX_GAP", "90")))
VIDEO_LOGICAL_MERGE_CENTER_DISTANCE = float(os.getenv("VIDEO_LOGICAL_MERGE_CENTER_DISTANCE", "0.22"))
VIDEO_LOGICAL_MERGE_SIZE_RATIO = float(os.getenv("VIDEO_LOGICAL_MERGE_SIZE_RATIO", "0.65"))
VIDEO_TRACKER_CONFIG = os.getenv("VIDEO_TRACKER_CONFIG", "config/bytetrack_purityloop.yaml")
VIDEO_TRACK_DEBUG_LOGS = os.getenv("VIDEO_TRACK_DEBUG_LOGS", "true").lower() != "false"


def _coerce_float(value: Any, fallback: float = 0.0) -> float:
    try:
        number = float(value)
        return number if math.isfinite(number) else fallback
    except (TypeError, ValueError):
        return fallback


def _bbox_iou(first: list[float] | None, second: list[float] | None) -> float:
    if not first or not second or len(first) < 4 or len(second) < 4:
        return 0.0
    ax1, ay1, ax2, ay2 = first[:4]
    bx1, by1, bx2, by2 = second[:4]
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _bbox_center(box: list[float] | None) -> tuple[float, float]:
    if not box or len(box) < 4:
        return (0.0, 0.0)
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def _parse_counting_line(options: dict | None) -> dict | None:
    raw = (options or {}).get("counting_line") or os.getenv("VIDEO_COUNTING_LINE")
    if not raw:
        return None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            axis, _, position = raw.partition("=")
            raw = {"axis": axis, "position": position}
    if not isinstance(raw, dict):
        return None
    axis = str(raw.get("axis") or "x").lower()
    if axis not in {"x", "y"}:
        axis = "x"
    position = _coerce_float(raw.get("position"), 0.5)
    if position > 1:
        position = position / 100
    direction = str(raw.get("direction") or "any").lower()
    if direction not in {"positive", "negative", "any"}:
        direction = "any"
    return {"axis": axis, "position": max(0.0, min(1.0, position)), "direction": direction}


def _video_debug(event: str, **fields) -> None:
    if not VIDEO_TRACK_DEBUG_LOGS:
        return
    safe = {"event": event, **fields}
    print(f"[video-track] {json.dumps(safe, default=str, sort_keys=True)}")


def _bbox_size(box: list[float] | None) -> tuple[float, float, float]:
    if not box or len(box) < 4:
        return (0.0, 0.0, 0.0)
    width = max(0.0, box[2] - box[0])
    height = max(0.0, box[3] - box[1])
    aspect = width / height if height > 0 else 0.0
    return width, height, aspect


@dataclass
class VideoTrackState:
    key: str
    raw_track_ids: set[str] = field(default_factory=set)
    first_frame: int = 0
    last_frame: int = 0
    first_timestamp: float = 0.0
    last_timestamp: float = 0.0
    class_votes: dict[str, float] = field(default_factory=dict)
    class_names: dict[str, str] = field(default_factory=dict)
    confidences: list[float] = field(default_factory=list)
    observations: list[dict] = field(default_factory=list)
    path: list[dict] = field(default_factory=list)
    best_observation: dict = field(default_factory=dict)
    best_crop_bytes: bytes | None = None
    counted: bool = False
    last_center: tuple[float, float] | None = None


class VideoTrackAggregator:
    """Collect sequential ByteTrack observations into one row per physical object."""

    def __init__(
        self,
        upload_id: str,
        *,
        min_frames: int = VIDEO_TRACK_MIN_FRAMES,
        short_track_confidence: float = VIDEO_TRACK_SHORT_CONFIDENCE,
        lost_buffer: int = VIDEO_TRACK_LOST_BUFFER,
        recovery_iou: float = VIDEO_TRACK_RECOVERY_IOU,
        recovery_center_distance: float = VIDEO_TRACK_RECOVERY_CENTER_DISTANCE,
        counting_line: dict | None = None,
    ):
        self.upload_id = str(upload_id)
        self.min_frames = min_frames
        self.short_track_confidence = short_track_confidence
        self.lost_buffer = lost_buffer
        self.recovery_iou = recovery_iou
        self.recovery_center_distance = recovery_center_distance
        self.counting_line = counting_line
        self.active: dict[str, VideoTrackState] = {}
        self.raw_to_key: dict[str, str] = {}
        self.finalized_track_ids: set[str] = set()
        self.finalized: list[dict] = []
        self._next_synthetic = 1

    def observe(self, frame_index: int, timestamp: float, detections: list[dict]) -> list[dict]:
        for detection in detections:
            self._observe_one(frame_index, timestamp, detection)
        return self.flush_stale(frame_index)

    def flush_stale(self, frame_index: int, *, force: bool = False) -> list[dict]:
        flushed = []
        for key, state in list(self.active.items()):
            if force or frame_index - state.last_frame > self.lost_buffer:
                self.active.pop(key, None)
                for raw_id in state.raw_track_ids:
                    if self.raw_to_key.get(raw_id) == key:
                        self.raw_to_key.pop(raw_id, None)
                material = self._finalize(state)
                if material:
                    self.finalized_track_ids.update(state.raw_track_ids)
                    self.finalized.append(material)
                    flushed.append(material)
                    _video_debug(
                        "track_finalized",
                        scan_id=self.upload_id,
                        logical_object_id=material.get("stable_object_id"),
                        source_track_ids=material.get("source_track_ids"),
                        first_frame=material.get("track_first_frame"),
                        last_frame=material.get("track_last_frame"),
                        observations=material.get("track_frame_count"),
                        final_class=material.get("category"),
                    )
        return flushed

    def finish(self, frame_index: int = 0) -> list[dict]:
        return self.flush_stale(frame_index, force=True)

    def _observe_one(self, frame_index: int, timestamp: float, detection: dict) -> None:
        track_id = detection.get("track_id")
        raw_id = str(track_id) if track_id is not None and str(track_id) != "" else ""
        if raw_id and raw_id in self.finalized_track_ids:
            _video_debug("track_observation_skipped_finalized", scan_id=self.upload_id, frame=frame_index, raw_track_id=raw_id)
            return
        category = material_category(detection.get("category") or detection.get("material_name"))
        box = [round(_coerce_float(value), 6) for value in detection.get("bbox") or []][:4]
        key = self._resolve_key(raw_id, category, box, frame_index)
        state = self.active.get(key)
        confidence = max(0.0, min(1.0, _coerce_float(detection.get("confidence"))))
        if not state:
            state = VideoTrackState(
                key=key,
                first_frame=frame_index,
                last_frame=frame_index,
                first_timestamp=timestamp,
                last_timestamp=timestamp,
            )
            self.active[key] = state
        if raw_id:
            state.raw_track_ids.add(raw_id)
            self.raw_to_key[raw_id] = key
        state.last_frame = frame_index
        state.last_timestamp = timestamp
        state.class_votes[category] = state.class_votes.get(category, 0.0) + confidence
        state.class_names.setdefault(category, str(detection.get("material_name") or category))
        state.confidences.append(confidence)
        center = _bbox_center(box)
        state.path.append({"frame": frame_index, "timestamp": round(timestamp, 3), "x": round(center[0], 4), "y": round(center[1], 4)})
        self._update_counting_line(state, center)
        observation = {
            "frame": frame_index,
            "timestamp": round(timestamp, 3),
            "track_id": raw_id or key,
            "category": category,
            "confidence": round(confidence, 4),
            "bbox": box,
            "bbox_percent": detection.get("bbox_percent"),
        }
        _video_debug(
            "track_observation",
            scan_id=self.upload_id,
            frame=frame_index,
            raw_track_id=raw_id or key,
            class_name=category,
            confidence=round(confidence, 4),
            bbox=box,
        )
        state.observations.append(observation)
        if confidence >= _coerce_float(state.best_observation.get("confidence"), -1):
            state.best_observation = {
                **observation,
                "mask": detection.get("mask"),
                "best_box": detection.get("best_box") or detection.get("bbox_percent") or box,
            }
            state.best_crop_bytes = detection.get("crop_bytes") or state.best_crop_bytes
        state.last_center = center

    def _resolve_key(self, raw_id: str, category: str, box: list[float], frame_index: int) -> str:
        if raw_id and raw_id in self.raw_to_key and self.raw_to_key[raw_id] in self.active:
            return self.raw_to_key[raw_id]
        recovered = self._recover_key(category, box, frame_index)
        if recovered:
            return recovered
        if raw_id:
            return raw_id
        key = f"synthetic-{self._next_synthetic}"
        self._next_synthetic += 1
        return key

    def _recover_key(self, category: str, box: list[float], frame_index: int) -> str | None:
        best_key = None
        best_score = 0.0
        cx, cy = _bbox_center(box)
        for key, state in self.active.items():
            if frame_index - state.last_frame > self.lost_buffer:
                continue
            previous_category = max(state.class_votes, key=state.class_votes.get, default="")
            if previous_category != category:
                continue
            previous_box = state.best_observation.get("bbox") or []
            iou = _bbox_iou(previous_box, box)
            px, py = state.last_center or _bbox_center(previous_box)
            distance = math.hypot(cx - px, cy - py)
            score = max(iou, 1.0 - distance)
            if (iou >= self.recovery_iou or distance <= self.recovery_center_distance) and score > best_score:
                best_score = score
                best_key = key
        return best_key

    def _update_counting_line(self, state: VideoTrackState, center: tuple[float, float]) -> None:
        if not self.counting_line:
            return
        previous = state.last_center
        if previous is None or state.counted:
            return
        index = 0 if self.counting_line["axis"] == "x" else 1
        position = self.counting_line["position"]
        before = previous[index] - position
        after = center[index] - position
        crossed = before == 0 or after == 0 or before * after < 0
        if not crossed:
            return
        direction = self.counting_line["direction"]
        if direction == "positive" and after <= before:
            return
        if direction == "negative" and after >= before:
            return
        state.counted = True

    def _finalize(self, state: VideoTrackState) -> dict | None:
        frame_count = len(state.observations)
        max_confidence = max(state.confidences or [0.0])
        if frame_count < self.min_frames and max_confidence < self.short_track_confidence:
            return None
        final_category = max(state.class_votes, key=state.class_votes.get, default="unknown")
        avg_confidence = sum(state.confidences) / frame_count if frame_count else 0.0
        recyclable_status, contaminant_status = material_status(final_category)
        hazard_status = "hazard" if CATEGORY_CLASS_MAP.get(final_category) == "contaminant" else "clear"
        best_box = state.best_observation.get("bbox_percent") or {}
        if not isinstance(best_box, dict):
            best_box = {}
        best_norm_box = state.best_observation.get("bbox") or []
        start_center = state.path[0] if state.path else {"x": 0, "y": 0}
        end_center = state.path[-1] if state.path else {"x": 0, "y": 0}
        widths, heights, aspects = [], [], []
        for observation in state.observations:
            width, height, aspect = _bbox_size(observation.get("bbox"))
            widths.append(width)
            heights.append(height)
            aspects.append(aspect)
        source_track_ids = sorted(state.raw_track_ids)
        stable_suffix = re.sub(r"[^A-Za-z0-9_.-]+", "-", state.key).strip("-") or "object"
        material = {
            "stable_object_id": f"{self.upload_id}-track-{stable_suffix}",
            "object_uid": f"{self.upload_id}-track-{stable_suffix}",
            "source_track_ids": source_track_ids,
            "track_id": ",".join(sorted(state.raw_track_ids)) or stable_suffix,
            "material_name": state.class_names.get(final_category, final_category),
            "category": final_category,
            "confidence": round(max_confidence, 4),
            "track_avg_confidence": round(avg_confidence, 4),
            "track_max_confidence": round(max_confidence, 4),
            "track_first_frame": state.first_frame,
            "track_last_frame": state.last_frame,
            "track_first_timestamp": round(state.first_timestamp, 3),
            "track_last_timestamp": round(state.last_timestamp, 3),
            "track_duration_seconds": round(max(0.0, state.last_timestamp - state.first_timestamp), 3),
            "track_frame_count": frame_count,
            "track_hazard_status": hazard_status,
            "track_counted": True if not self.counting_line else state.counted,
            "track_start_center": {"x": start_center.get("x", 0), "y": start_center.get("y", 0)},
            "track_end_center": {"x": end_center.get("x", 0), "y": end_center.get("y", 0)},
            "track_avg_width": round(sum(widths) / len(widths), 6) if widths else 0,
            "track_avg_height": round(sum(heights) / len(heights), 6) if heights else 0,
            "track_avg_aspect_ratio": round(sum(aspects) / len(aspects), 6) if aspects else 0,
            "recyclable_status": recyclable_status,
            "contaminant_status": contaminant_status,
            **evaluate_material(final_category, max_confidence),
            "bbox_x": round(_coerce_float(best_box.get("x")), 2),
            "bbox_y": round(_coerce_float(best_box.get("y")), 2),
            "bbox_width": round(_coerce_float(best_box.get("width")), 2),
            "bbox_height": round(_coerce_float(best_box.get("height")), 2),
            "best_box": state.best_observation.get("best_box"),
            "best_bbox_norm": best_norm_box,
            "segmentation_mask": state.best_observation.get("mask"),
            "track_path": state.path,
            "track_debug": {
                "frame_observations": state.observations,
                "class_votes": {key: round(value, 4) for key, value in state.class_votes.items()},
                "raw_track_ids": sorted(state.raw_track_ids),
            },
            "_best_crop_bytes": state.best_crop_bytes,
        }
        return material


def canonical_category_key(value: str | None) -> str:
    key = " ".join(str(value or "").strip().lower().replace("_", " ").replace("-", " ").split())
    if "food" in key or "organic" in key:
        return "food_organics"
    if "general" in key or "trash" in key or "waste" in key:
        return "general_trash"
    if "textile" in key or "fabric" in key or "cloth" in key:
        return "textile"
    if "battery" in key:
        return "battery"
    if "cardboard" in key or "box" in key:
        return "cardboard"
    if "glass" in key or "jar" in key:
        return "glass"
    if "paper" in key:
        return "paper"
    if "metal" in key or "aluminum" in key or "aluminium" in key or "can" in key:
        return "metal"
    if "plastic" in key or "bottle" in key or "pet" in key or "film" in key:
        return "plastic"
    return "unknown"


def filter_scans_by_final_category(scans: list[dict], materials: list[dict], decisions: list[dict], category: str) -> list[dict]:
    latest = {}
    for decision in sorted(decisions, key=lambda item: str(item.get("created_at", ""))):
        latest[str(decision.get("detected_material_id", ""))] = decision
    materials_by_scan = {}
    for material in materials:
        materials_by_scan.setdefault(str(material.get("scan_result_id", "")), []).append(material)

    def final_category(scan: dict) -> str:
        material = (materials_by_scan.get(str(scan.get("id", ""))) or [{}])[0]
        decision = latest.get(str(material.get("id", "")), {})
        return canonical_category_key(scan.get("verified_category") or decision.get("chosen_category") or material.get("category"))

    return [scan for scan in scans if final_category(scan) == category]


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


def upload_file_to_supabase_storage(
    file_path: str | Path,
    object_path: str,
    content_type: str,
    database: SupabaseExecutor | None = None,
) -> dict:
    database = database or SupabaseExecutor(supabase)
    if not database.client:
        raise RuntimeError("Supabase backend env is not configured")

    path = str(object_path).lstrip("/")
    source = Path(file_path)
    with source.open("rb") as file:
        database.execute(lambda client: client.storage.from_(PREVIEW_BUCKET).upload(
            path=path,
            file=file,
            file_options={"content-type": content_type, "upsert": "true"},
        ))
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


def log_scan_stage_failure(stage: str, exc: Exception) -> None:
    print(f"[scans] {stage} failed: {type(exc).__name__}: {safe_error_message(exc)}")
    traceback.print_exc()


def execute_scan_read(stage: str, operation: Callable[[Any], T]) -> T:
    try:
        return SupabaseExecutor(client_factory=_new_supabase_client, attempts=2).execute(operation)
    except Exception as exc:
        log_scan_stage_failure(stage, exc)
        raise


def scan_history_filters(
    start_date: str | None,
    end_date: str | None,
    search: str | None,
    status: str | None,
) -> dict[str, str | None]:
    normalized_status = str(status or "").lower()
    return {
        "start_date": start_date,
        "end_date": end_date,
        "search": search.strip() if search and search.strip() else None,
        "status": normalized_status or None,
    }


def apply_scan_history_filters(query, filters: dict[str, str | None], status_override: str | None = None):
    query = query.neq("source_type", "video_frame")
    if filters.get("start_date"):
        query = query.gte("created_at", filters["start_date"])
    if filters.get("end_date"):
        query = query.lt("created_at", filters["end_date"])
    if filters.get("search"):
        query = query.ilike("source_name", f"%{filters['search']}%")
    normalized_status = str(status_override if status_override is not None else filters.get("status") or "").lower()
    if normalized_status == "review_needed":
        query = query.eq("human_review_required", True)
    elif normalized_status == "rejected":
        query = query.in_("overall_status", ["rejected", "quarantined"])
    elif normalized_status == "confirmed":
        query = query.eq("human_review_required", False)
    return query


def display_label(value: Any) -> str:
    text = re.sub(r"[_-]+", " ", str(value or "Unknown")).strip()
    return " ".join(word[:1].upper() + word[1:] for word in text.split()) or "Unknown"


def confidence_percent(value: Any) -> float:
    try:
        numeric = float(value or 0)
    except (TypeError, ValueError):
        return 0
    return numeric * 100 if numeric <= 1 else numeric


def latest_decisions_by_material(decisions: list[dict]) -> dict[str, dict]:
    latest: dict[str, dict] = {}
    for decision in sorted(decisions, key=lambda item: str(item.get("created_at", ""))):
        latest[str(decision.get("detected_material_id", ""))] = decision
    return latest


def attach_scan_children(scans: list[dict], materials: list[dict], decisions: list[dict]) -> list[dict]:
    latest = latest_decisions_by_material(decisions)
    materials_by_scan: dict[str, list[dict]] = {}
    for material in sorted(materials, key=lambda item: str(item.get("created_at", ""))):
        materials_by_scan.setdefault(str(material.get("scan_result_id", "")), []).append({
            **material,
            "review_decision": latest.get(str(material.get("id", ""))),
        })
    return [{**scan, "detected_materials": materials_by_scan.get(str(scan.get("id", "")), [])} for scan in scans]


def export_material_decision(scan: dict) -> tuple[dict, dict | None]:
    material = (scan.get("detected_materials") or [{}])[0] or {}
    decision = material.get("review_decision") or None
    return material, decision


def export_final_category(scan: dict) -> str:
    material, decision = export_material_decision(scan)
    return canonical_category_key(scan.get("verified_category") or (decision or {}).get("chosen_category") or material.get("category") or material.get("material_name"))


def export_display_status(scan: dict, material: dict, decision: dict | None) -> tuple[str, str, str]:
    category = export_final_category(scan)
    material_class = (decision or {}).get("disposition") or material.get("material_class") or CATEGORY_CLASS_MAP.get(category, "unknown")
    confidence = confidence_percent(material.get("confidence") if material.get("confidence") is not None else scan.get("overall_confidence"))
    review_outcome = str((decision or {}).get("outcome") or (decision or {}).get("review_outcome") or "confirmed").strip().lower().replace("-", "_").replace(" ", "_")
    scan_status = str(scan.get("review_status") or scan.get("overall_status") or "").strip().lower().replace("-", "_").replace(" ", "_")
    rejected = scan_status in {"rejected", "quarantined"} or (decision is not None and review_outcome == "rejected")
    verified = scan_status == "verified"
    review_required = not verified and not rejected and decision is None and (confidence < CONFIRMATION_THRESHOLD * 100 or material_class == "unknown")
    if rejected:
        return "Rejected", "rejected", material_class
    if verified:
        return "Verified", "verified", material_class
    if review_required:
        return "Review Needed", "review_needed", material_class
    if material_class == "recyclable":
        return "Confirmed Recyclable", "confirmed", material_class
    if material_class == "contaminant":
        return "Confirmed Contaminant", "confirmed", material_class
    return "Review Needed", "review_needed", material_class


def export_weight(scan: dict, material: dict) -> str:
    for value in (
        material.get("estimated_weight_kg"), material.get("estimated_weight"), material.get("weight_kg"), material.get("weight"),
        scan.get("estimated_weight_kg"), scan.get("estimated_weight"), scan.get("weight_kg"), scan.get("weight"),
    ):
        if value not in (None, ""):
            try:
                return f"{float(value):.3f} kg"
            except (TypeError, ValueError):
                return str(value)
    category = material.get("category") or material.get("material_name")
    if category:
        key = analytics_category(category)
        estimate = ANALYTICS_MATERIAL_ESTIMATES.get(key)
        if estimate and estimate.get("average_weight_kg") is not None:
            return f"{float(estimate['average_weight_kg']):.3f} kg"
    return "-"


def export_quantity(scan: dict, material: dict) -> str:
    value = material.get("quantity", material.get("count", scan.get("quantity", "")))
    return "-" if value in (None, "") else str(value)


def export_reviewer(decision: dict | None) -> str:
    if not decision:
        return "-"
    return str(decision.get("reviewer") or decision.get("reviewer_id") or decision.get("reviewed_by") or "-")


def format_malaysia_datetime(value: Any) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        normalized = value.strip()
        if not normalized:
            return "-"
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return "-"
    else:
        return "-"
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    malaysia_datetime = parsed.astimezone(MALAYSIA_TIMEZONE)
    weekday = malaysia_datetime.strftime("%a")
    day = malaysia_datetime.day
    month = malaysia_datetime.strftime("%b")
    hour = malaysia_datetime.strftime("%I").lstrip("0") or "0"
    minute = malaysia_datetime.strftime("%M")
    period = malaysia_datetime.strftime("%p")
    return f"{weekday} {day} {month} {hour}:{minute} {period}"


def export_scan_row(scan: dict) -> dict[str, str]:
    material, decision = export_material_decision(scan)
    category = export_final_category(scan)
    status, review_status, material_class = export_display_status(scan, material, decision)
    confidence = confidence_percent(scan.get("overall_confidence") if scan.get("overall_confidence") is not None else material.get("confidence"))
    image_url = scan.get("preview_image_url") or scan.get("image_url") or scan.get("drive_web_url") or ""
    return {
        "scan_id": str(scan.get("id") or ""),
        "datetime": format_malaysia_datetime(scan.get("created_at")),
        "file_name": str(scan.get("source_name") or "Uploaded image"),
        "predicted_category": display_label(material.get("category") or material.get("material_name")),
        "corrected_category": display_label(scan.get("verified_category") or (decision or {}).get("chosen_category") or category),
        "confidence": f"{confidence:.0f}%",
        "status": status,
        "quantity": export_quantity(scan, material),
        "estimated_weight": export_weight(scan, material),
        "recommended_route": (CATEGORY_ROUTES.get(category) or "Manual Audit Queue") if review_status != "review_needed" else "Manual Audit Queue",
        "review_status": review_status,
        "reviewer": export_reviewer(decision),
        "image_url": str(image_url),
        "material_class": display_label(material_class),
    }


def fetch_history_export_rows(
    start_date: str | None,
    end_date: str | None,
    search: str | None,
    category: str | None,
    status: str | None,
    sort: str,
    direction: str,
    principal: Principal,
) -> list[dict[str, str]]:
    filters = scan_history_filters(start_date, end_date, search, status)
    category_key = canonical_category_key(category) if category else ""
    if category and category_key == "unknown":
        return []
    order_column = "overall_confidence" if sort == "confidence" else "created_at"
    descending = str(direction).lower() != "asc"
    database = SupabaseExecutor(client_factory=_new_supabase_client, attempts=2)
    rows: list[dict[str, str]] = []
    offset = 0
    while True:
        def scan_query(client, offset=offset):
            query = client.table(SCAN_RESULTS_TABLE).select("*")
            query = apply_scan_history_filters(query, filters)
            return scoped_query(query.order(order_column, desc=descending).range(offset, offset + SCAN_HISTORY_EXPORT_BATCH_SIZE - 1), principal).execute()

        scans = database.execute(scan_query).data or []
        if not scans:
            break
        scan_ids = [str(scan.get("id")) for scan in scans if scan.get("id")]
        materials: list[dict] = []
        decisions: list[dict] = []
        for index in range(0, len(scan_ids), SCAN_HISTORY_EXPORT_CHILD_BATCH_SIZE):
            ids = scan_ids[index:index + SCAN_HISTORY_EXPORT_CHILD_BATCH_SIZE]
            materials.extend(database.execute(lambda client, ids=ids: client.table(DETECTED_MATERIALS_TABLE).select("*").in_("scan_result_id", ids).execute()).data or [])
            decisions.extend(database.execute(lambda client, ids=ids: client.table(REVIEW_DECISIONS_TABLE).select("*").in_("scan_result_id", ids).execute()).data or [])
        for scan in attach_scan_children(scans, materials, decisions):
            if category_key and export_final_category(scan) != category_key:
                continue
            rows.append(export_scan_row(scan))
        if len(scans) < SCAN_HISTORY_EXPORT_BATCH_SIZE:
            break
        offset += SCAN_HISTORY_EXPORT_BATCH_SIZE
    return rows


EXPORT_COLUMNS = [
    ("scan_id", "Scan ID"),
    ("datetime", "Date and time"),
    ("corrected_category", "Category"),
    ("confidence", "Confidence"),
    ("status", "Status"),
    ("recommended_route", "Recommended route"),
    ("image_preview", "Image Preview"),
]

PDF_EXPORT_COLUMNS = ["Scan ID", "Date/time", "Category", "Confidence", "Status", "Route", "Preview"]
EXCEL_COLUMN_WIDTHS = {
    "Scan ID": 18,
    "Date and time": 24,
    "Category": 20,
    "Confidence": 12,
    "Status": 22,
    "Recommended route": 30,
    "Image Preview": 14,
}


@dataclass(frozen=True)
class ThumbnailResult:
    url: str
    data: bytes | None = None
    error: str | None = None


def storage_signed_url(url: str) -> str | None:
    if not supabase or not SUPABASE_URL or not url.startswith(SUPABASE_URL):
        return None
    match = re.search(r"/storage/v1/object/(?:public|sign)/([^/]+)/(.+)$", url)
    if not match:
        return None
    bucket, object_path = match.group(1), unquote(match.group(2).split("?")[0])
    try:
        signed = supabase.storage.from_(bucket).create_signed_url(object_path, 3600)
        return signed.get("signedURL") or signed.get("signedUrl") or signed.get("signed_url")
    except Exception as exc:
        print(f"[history-export] signed URL fallback failed: {type(exc).__name__}")
        return None


def transformed_storage_url(url: str) -> str:
    if not SUPABASE_URL or not url.startswith(SUPABASE_URL):
        return url
    match = re.search(r"/storage/v1/object/public/([^/]+)/(.+)$", url)
    if not match:
        return url
    bucket, object_path = match.group(1), match.group(2).split("?")[0]
    return (
        f"{SUPABASE_URL}/storage/v1/render/image/public/{bucket}/{object_path}"
        f"?width={SCAN_HISTORY_THUMBNAIL_SIZE[0]}&height={SCAN_HISTORY_THUMBNAIL_SIZE[1]}"
        "&resize=contain&quality=50&format=origin"
    )


def fetch_image_bytes(client: httpx.Client, url: str) -> bytes:
    request_url = transformed_storage_url(url)
    for attempt in range(2):
        try:
            response = client.get(request_url, follow_redirects=True)
            if response.status_code >= 500 and attempt == 0:
                continue
            break
        except (httpx.TimeoutException, httpx.TransportError):
            if attempt == 0:
                continue
            raise
    if response.status_code in {403, 404}:
        signed_url = storage_signed_url(url)
        if signed_url and signed_url != url:
            response = client.get(signed_url, follow_redirects=True)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").lower()
    if content_type and not any(kind in content_type for kind in ("image/jpeg", "image/jpg", "image/png", "image/webp")):
        raise ValueError("unsupported image content type")
    content = response.content
    if len(content) > SCAN_HISTORY_IMAGE_MAX_BYTES:
        raise ValueError("source image too large")
    return content


def thumbnail_png(image_bytes: bytes) -> bytes:
    with Image.open(BytesIO(image_bytes)) as image:
        image.thumbnail(SCAN_HISTORY_THUMBNAIL_SIZE)
        canvas = Image.new("RGB", SCAN_HISTORY_THUMBNAIL_SIZE, "white")
        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
            image = image.convert("RGBA")
            x = (SCAN_HISTORY_THUMBNAIL_SIZE[0] - image.width) // 2
            y = (SCAN_HISTORY_THUMBNAIL_SIZE[1] - image.height) // 2
            canvas.paste(image, (x, y), image)
        else:
            image = image.convert("RGB")
            x = (SCAN_HISTORY_THUMBNAIL_SIZE[0] - image.width) // 2
            y = (SCAN_HISTORY_THUMBNAIL_SIZE[1] - image.height) // 2
            canvas.paste(image, (x, y))
        output = BytesIO()
        canvas.save(output, format="PNG", optimize=True)
        return output.getvalue()


def load_thumbnail(client: httpx.Client, url: str) -> ThumbnailResult:
    if not url:
        return ThumbnailResult(url, error="missing URL")
    try:
        return ThumbnailResult(url, data=thumbnail_png(fetch_image_bytes(client, url)))
    except Exception as exc:
        return ThumbnailResult(url, error=type(exc).__name__)


def fetch_history_thumbnails(rows: list[dict[str, str]]) -> tuple[dict[str, bytes], dict[str, int]]:
    urls = [row.get("image_url", "") for row in rows if row.get("image_url")]
    unique_urls = list(dict.fromkeys(urls))
    stats = {"requested": len(urls), "unique": len(unique_urls), "cache_hits": max(0, len(urls) - len(unique_urls)), "failed": 0, "processed": 0}
    if not unique_urls:
        return {}, stats
    thumbnails: dict[str, bytes] = {}
    limits = httpx.Limits(max_connections=SCAN_HISTORY_THUMBNAIL_WORKERS, max_keepalive_connections=SCAN_HISTORY_THUMBNAIL_WORKERS)
    with httpx.Client(timeout=SCAN_HISTORY_IMAGE_TIMEOUT, limits=limits) as client:
        with ThreadPoolExecutor(max_workers=SCAN_HISTORY_THUMBNAIL_WORKERS) as executor:
            futures = [executor.submit(load_thumbnail, client, url) for url in unique_urls]
            for future in as_completed(futures):
                result = future.result()
                stats["processed"] += 1
                if result.data:
                    thumbnails[result.url] = result.data
                else:
                    stats["failed"] += 1
                if stats["processed"] == stats["unique"] or stats["processed"] % 250 == 0:
                    print(
                        "[history-export] image progress "
                        f"processed={stats['processed']}/{stats['unique']} failed={stats['failed']} "
                        f"cache_hits={stats['cache_hits']}"
                    )
    return thumbnails, stats


def build_history_excel(rows: list[dict[str, str]], thumbnails: dict[str, bytes] | None = None) -> bytes:
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as ExcelImage
    from openpyxl.styles import Alignment
    from openpyxl.utils import get_column_letter

    output = BytesIO()
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "PurityLoop History"
    worksheet.append([label for _, label in EXPORT_COLUMNS])
    preview_col = len(EXPORT_COLUMNS)
    for index, (_, label) in enumerate(EXPORT_COLUMNS, start=1):
        worksheet.column_dimensions[get_column_letter(index)].width = EXCEL_COLUMN_WIDTHS.get(label, 16)
    for row in rows:
        worksheet.append(["" if key == "image_preview" else row.get(key, "") for key, _ in EXPORT_COLUMNS])
        excel_row = worksheet.max_row
        worksheet.row_dimensions[excel_row].height = 64
        image_bytes = (thumbnails or {}).get(row.get("image_url", ""))
        if image_bytes:
            image = ExcelImage(BytesIO(image_bytes))
            image.width = SCAN_HISTORY_THUMBNAIL_SIZE[0]
            image.height = SCAN_HISTORY_THUMBNAIL_SIZE[1]
            worksheet.add_image(image, f"{get_column_letter(preview_col)}{excel_row}")
        else:
            cell = worksheet.cell(excel_row, preview_col)
            cell.value = "Image unavailable"
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    workbook.save(output)
    return output.getvalue()


def build_history_pdf(rows: list[dict[str, str]], filters: dict[str, str | None], thumbnails: dict[str, bytes] | None = None) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Image as PdfImage
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), leftMargin=10 * mm, rightMargin=10 * mm, topMargin=10 * mm, bottomMargin=12 * mm)
    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    body.fontSize = 7
    body.leading = 8
    applied = ", ".join(f"{key}: {value}" for key, value in filters.items() if value) or "None"
    data = [PDF_EXPORT_COLUMNS]
    for row in rows:
        image_bytes = (thumbnails or {}).get(row.get("image_url", ""))
        preview = PdfImage(BytesIO(image_bytes), width=18 * mm, height=18 * mm) if image_bytes else Paragraph("Image unavailable", body)
        data.append([
            row["scan_id"][:8],
            row["datetime"],
            row["corrected_category"],
            row["confidence"],
            row["status"],
            row["recommended_route"],
            preview,
        ])
    if len(data) == 1:
        data.append(["No scans to export.", "", "", "", "", "", ""])
    table_data = [[cell if hasattr(cell, "wrapOn") else Paragraph(str(cell), body) for cell in record] for record in data]
    table = Table(table_data, repeatRows=1, colWidths=[24 * mm, 44 * mm, 34 * mm, 24 * mm, 42 * mm, 77 * mm, 28 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#edf5f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#17251e")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d9e4dc")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fbfdfb")]),
    ]))

    def page_number(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(document.pagesize[0] - 10 * mm, 6 * mm, f"Page {document.page}")
        canvas.restoreState()

    story = [
        Paragraph("PurityLoop AI Audit History", styles["Title"]),
        Paragraph(f"Exported {format_malaysia_datetime(datetime.now(timezone.utc))} · {len(rows)} records", styles["Normal"]),
        Paragraph(f"Applied filters: {applied}", styles["Normal"]),
        Spacer(1, 6 * mm),
        table,
    ]
    doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
    return output.getvalue()


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
    review_required = category == "general_trash" or confidence < CONFIRMATION_THRESHOLD
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
    video_summary = scan.get("video_tracking_summary") if isinstance(scan.get("video_tracking_summary"), dict) else {}
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
        "result_kind": scan.get("result_kind"),
        "legacy_result": scan.get("legacy_result"),
        "total_unique_objects": scan.get("total_unique_objects"),
        "counts_by_class": video_summary.get("counts_by_class"),
        "hazards": video_summary.get("hazards"),
        "annotated_video_url": scan.get("annotated_video_url") or video_summary.get("annotated_video_url"),
        "annotated_video_status": scan.get("annotated_video_status") or video_summary.get("annotated_video_status"),
        "annotated_video_error": scan.get("annotated_video_error") or video_summary.get("annotated_video_error"),
        "tracked_objects": materials if str(scan.get("result_kind") or "") in {"tracked_video_object", "video_track_object"} else None,
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
        "bbox_x", "bbox_y", "bbox_width", "bbox_height", "original_category", "stable_object_id",
        "object_uid", "source_track_ids", "track_id", "track_first_frame", "track_last_frame", "track_first_timestamp",
        "track_last_timestamp", "track_duration_seconds", "track_avg_confidence",
        "track_max_confidence", "track_frame_count", "track_hazard_status", "track_counted",
        "track_start_center", "track_end_center", "track_avg_width", "track_avg_height",
        "track_avg_aspect_ratio", "track_debug", "track_path", "segmentation_mask", "best_box",
        "best_bbox_norm", "result_type",
    }
    legacy_material_keys = {
        "material_name", "category", "confidence", "recyclable_status", "contaminant_status",
        "bbox_x", "bbox_y", "bbox_width", "bbox_height", "original_category",
    }
    linked_materials = []
    for index, item in enumerate(materials):
        linked = {
            key: value for key, value in item.items() if key in stored_material_keys
        } | {"scan_result_id": saved_scan_id}
        if scan_result_id:
            linked["id"] = str(uuid5(scan_result_id, f"material:{item.get('object_uid') or index}"))
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
            if getattr(exc, "code", "") in {"PGRST204", "PGRST205", "42703"}:
                database.execute(
                    lambda client: client.table(DETECTED_MATERIALS_TABLE).insert(
                        [{key: value for key, value in item.items() if key in legacy_material_keys or key in {"id", "scan_result_id"}} for item in missing_materials]
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


class BrowserDetectedDetection(BaseModel):
    detection_index: int
    class_id: int
    model_class_name: str
    confidence: float
    x1: float
    y1: float
    x2: float
    y2: float


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
            raise HTTPException(status_code=400, detail=BROWSER_CONFIDENCE_DETAIL)
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


def validate_browser_detected_detections(raw_detections: Any, image_width: int, image_height: int) -> list[dict]:
    if not isinstance(raw_detections, list):
        raise HTTPException(status_code=400, detail="Detection JSON must be an array.")
    validated = []
    indexes = set()
    for raw in raw_detections:
        try:
            detection = BrowserDetectedDetection(**raw)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Detection JSON is invalid.") from exc
        if detection.detection_index < 0 or detection.detection_index in indexes:
            raise HTTPException(status_code=400, detail="Detection indexes must be unique non-negative integers.")
        indexes.add(detection.detection_index)
        if detection.class_id < 0 or detection.class_id >= len(BROWSER_MODEL_CLASSES):
            raise HTTPException(status_code=400, detail="Detection class ID is outside the fixed model contract.")
        category_name = BROWSER_MODEL_CLASSES[detection.class_id]
        if detection.model_class_name != category_name:
            raise HTTPException(status_code=400, detail="Detection class ID and model class name do not match.")
        if not math.isfinite(detection.confidence) or not BROWSER_CONFIDENCE_THRESHOLD <= detection.confidence <= 1:
            raise HTTPException(status_code=400, detail=BROWSER_CONFIDENCE_DETAIL)
        coordinates = (detection.x1, detection.y1, detection.x2, detection.y2)
        if not all(math.isfinite(value) for value in coordinates):
            raise HTTPException(status_code=400, detail="Detection coordinates must be finite.")
        x1, y1 = min(max(detection.x1, 0), image_width), min(max(detection.y1, 0), image_height)
        x2, y2 = min(max(detection.x2, 0), image_width), min(max(detection.y2, 0), image_height)
        if x2 <= x1 or y2 <= y1:
            raise HTTPException(status_code=400, detail="Detection bounding box must have positive area.")
        category = "food_organics" if category_name == "food_organic" else category_name
        recyclable_status, contaminant_status = material_status(category)
        material = {
            "_detection_index": detection.detection_index,
            "material_name": category_name,
            "category": category,
            "confidence": round(detection.confidence, 4),
            "recyclable_status": recyclable_status,
            "contaminant_status": contaminant_status,
            "bbox_x": round((x1 / image_width) * 100, 4),
            "bbox_y": round((y1 / image_height) * 100, 4),
            "bbox_width": round(((x2 - x1) / image_width) * 100, 4),
            "bbox_height": round(((y2 - y1) / image_height) * 100, 4),
            **evaluate_material(category, detection.confidence),
        }
        if category == "battery":
            material.update({
                "review_required": True,
                "decision_status": "review_needed",
                "display_status": "Review Needed",
                "disposal_route": "Manual Audit Queue",
            })
        validated.append(material)
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


def _clip_box(box: list[float], width: int, height: int) -> tuple[int, int, int, int]:
    x1 = max(0, min(width - 1, int(round(_coerce_float(box[0]))))) if width else 0
    y1 = max(0, min(height - 1, int(round(_coerce_float(box[1]))))) if height else 0
    x2 = max(x1 + 1, min(width, int(round(_coerce_float(box[2]))))) if width else 0
    y2 = max(y1 + 1, min(height, int(round(_coerce_float(box[3]))))) if height else 0
    return x1, y1, x2, y2


def _encode_detection_crop(frame, box: list[float]) -> bytes | None:
    import cv2
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = _clip_box(box, width, height)
    crop = frame[y1:y2, x1:x2]
    if crop.size == 0:
        crop = frame
    ok, encoded = cv2.imencode(".jpg", crop)
    return encoded.tobytes() if ok else None


def _mask_polygon(result, index: int) -> list | None:
    masks = getattr(result, "masks", None)
    if not masks:
        return None
    polygons = getattr(masks, "xyn", None) or getattr(masks, "xy", None)
    if polygons is None or index >= len(polygons):
        return None
    polygon = polygons[index]
    if hasattr(polygon, "tolist"):
        polygon = polygon.tolist()
    return polygon


def _result_track_observations(result, frame, frame_index: int, timestamp: float) -> list[dict]:
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []
    names = getattr(result, "names", {}) or {}
    image_height, image_width = getattr(result, "orig_shape", frame.shape[:2])
    track_ids = getattr(boxes, "id", None)
    detections = []
    for index, box in enumerate(boxes):
        xyxy = [float(value) for value in box.xyxy[0].tolist()]
        confidence = float(box.conf[0])
        class_id = int(box.cls[0])
        material_name = str(names.get(class_id, f"class_{class_id}"))
        track_id = None
        if track_ids is not None:
            try:
                track_id = int(track_ids[index].item())
            except (AttributeError, IndexError, TypeError, ValueError):
                track_id = None
        detections.append({
            "track_id": track_id,
            "material_name": material_name,
            "category": material_category(material_name),
            "confidence": confidence,
            "bbox": [
                xyxy[0] / image_width if image_width else 0,
                xyxy[1] / image_height if image_height else 0,
                xyxy[2] / image_width if image_width else 0,
                xyxy[3] / image_height if image_height else 0,
            ],
            "bbox_percent": {
                "x": round((xyxy[0] / image_width) * 100, 2) if image_width else 0,
                "y": round((xyxy[1] / image_height) * 100, 2) if image_height else 0,
                "width": round(((xyxy[2] - xyxy[0]) / image_width) * 100, 2) if image_width else 0,
                "height": round(((xyxy[3] - xyxy[1]) / image_height) * 100, 2) if image_height else 0,
            },
            "best_box": {
                "xyxy": [round(value, 2) for value in xyxy],
                "frame": frame_index,
                "timestamp": round(timestamp, 3),
            },
            "mask": _mask_polygon(result, index),
            "crop_bytes": _encode_detection_crop(frame, xyxy),
        })
    return detections


def _video_class_color(category: str) -> tuple[int, int, int]:
    palette = {
        "plastic": (40, 180, 99),
        "metal": (245, 158, 11),
        "glass": (14, 165, 233),
        "paper": (234, 179, 8),
        "cardboard": (168, 85, 247),
        "battery": (37, 99, 235),
        "textile": (236, 72, 153),
        "food_organics": (34, 197, 94),
        "general_trash": (239, 68, 68),
    }
    return palette.get(material_category(category), (20, 184, 166))


def _mask_to_points(mask, width: int, height: int):
    import numpy as np
    if not mask:
        return None
    points = []
    for point in mask:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            continue
        x = _coerce_float(point[0])
        y = _coerce_float(point[1])
        if x <= 1 and y <= 1:
            x *= width
            y *= height
        points.append([max(0, min(width - 1, int(round(x)))), max(0, min(height - 1, int(round(y))))])
    if len(points) < 3:
        return None
    return np.array(points, dtype=np.int32)


def _annotate_video_frame(frame, detections: list[dict]):
    import cv2
    height, width = frame.shape[:2]
    if not detections:
        return frame
    annotated = frame.copy()
    mask_layer = annotated.copy()
    has_mask = False
    line_width = max(2, round(min(width, height) / 360))
    font_scale = max(0.45, min(1.1, min(width, height) / 900))
    label_padding = max(4, round(line_width * 2))
    for detection in detections:
        category = material_category(detection.get("category") or detection.get("material_name"))
        color_rgb = _video_class_color(category)
        color = (color_rgb[2], color_rgb[1], color_rgb[0])
        box = detection.get("best_box", {}).get("xyxy") if isinstance(detection.get("best_box"), dict) else None
        if not box:
            norm = detection.get("bbox") or []
            box = [
                _coerce_float(norm[0]) * width if len(norm) > 0 else 0,
                _coerce_float(norm[1]) * height if len(norm) > 1 else 0,
                _coerce_float(norm[2]) * width if len(norm) > 2 else 0,
                _coerce_float(norm[3]) * height if len(norm) > 3 else 0,
            ]
        x1, y1, x2, y2 = _clip_box(box, width, height)
        mask_points = _mask_to_points(detection.get("mask"), width, height)
        if mask_points is not None:
            cv2.fillPoly(mask_layer, [mask_points], color)
            has_mask = True
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, line_width)
        confidence = _coerce_float(detection.get("confidence"))
        track_id = detection.get("track_id")
        hazard = " | HAZARD" if CATEGORY_CLASS_MAP.get(category) == "contaminant" else ""
        label = f"{display_label(category)} | {confidence:.2f} | ID {track_id or '-'}{hazard}"
        font = cv2.FONT_HERSHEY_SIMPLEX
        (label_width, label_height), baseline = cv2.getTextSize(label, font, font_scale, line_width)
        label_width = min(label_width + label_padding * 2, width)
        label_height = label_height + baseline + label_padding * 2
        label_x = max(0, min(x1, width - label_width))
        label_y = y1 - label_height if y1 - label_height >= 0 else min(height - label_height, y2 + line_width)
        label_y = max(0, label_y)
        cv2.rectangle(annotated, (label_x, label_y), (label_x + label_width, label_y + label_height), color, -1)
        text_x = label_x + label_padding
        text_y = label_y + label_padding + label_height - baseline - label_padding
        cv2.putText(annotated, label, (text_x, text_y), font, font_scale, (255, 255, 255), max(1, line_width - 1), cv2.LINE_AA)
    if has_mask:
        annotated = cv2.addWeighted(mask_layer, 0.28, annotated, 0.72, 0)
    return annotated


def _video_tracking_summary(tracked_objects: list[dict]) -> dict:
    counts_by_class: dict[str, int] = {}
    hazards = []
    public_objects = []
    for item in tracked_objects:
        category = str(item.get("category") or "unknown")
        counts_by_class[category] = counts_by_class.get(category, 0) + 1
        public = {key: value for key, value in item.items() if not key.startswith("_")}
        public_objects.append(public)
        if item.get("track_hazard_status") == "hazard" or item.get("contaminant_status") == "contaminated":
            hazards.append(public)
    return {
        "total_unique_objects": len(tracked_objects),
        "counts_by_class": counts_by_class,
        "hazards": hazards,
        "tracked_objects": public_objects,
        "result_kind": "tracked_video",
    }


def _track_time_overlap(first: dict, second: dict) -> bool:
    return not (
        _coerce_float(first.get("track_last_frame"), -1) < _coerce_float(second.get("track_first_frame"), 0)
        or _coerce_float(second.get("track_last_frame"), -1) < _coerce_float(first.get("track_first_frame"), 0)
    )


def _track_temporal_gap(first: dict, second: dict) -> int:
    return max(0, int(_coerce_float(second.get("track_first_frame"))) - int(_coerce_float(first.get("track_last_frame"))))


def _track_merge_score(first: dict, second: dict) -> tuple[bool, str]:
    if first.get("category") != second.get("category"):
        return False, "class mismatch"
    if _track_time_overlap(first, second):
        return False, "tracks overlap in time"
    ordered = sorted([first, second], key=lambda item: int(_coerce_float(item.get("track_first_frame"))))
    previous, current = ordered
    gap = _track_temporal_gap(previous, current)
    if gap > VIDEO_LOGICAL_MERGE_MAX_GAP:
        return False, f"temporal gap {gap} exceeds {VIDEO_LOGICAL_MERGE_MAX_GAP}"
    previous_end = previous.get("track_end_center") or {}
    current_start = current.get("track_start_center") or {}
    distance = math.hypot(
        _coerce_float(previous_end.get("x")) - _coerce_float(current_start.get("x")),
        _coerce_float(previous_end.get("y")) - _coerce_float(current_start.get("y")),
    )
    if distance > VIDEO_LOGICAL_MERGE_CENTER_DISTANCE:
        return False, f"centre distance {distance:.3f} exceeds {VIDEO_LOGICAL_MERGE_CENTER_DISTANCE}"
    width_a, width_b = _coerce_float(previous.get("track_avg_width")), _coerce_float(current.get("track_avg_width"))
    height_a, height_b = _coerce_float(previous.get("track_avg_height")), _coerce_float(current.get("track_avg_height"))
    aspect_a, aspect_b = _coerce_float(previous.get("track_avg_aspect_ratio")), _coerce_float(current.get("track_avg_aspect_ratio"))
    width_ratio = min(width_a, width_b) / max(width_a, width_b) if max(width_a, width_b) > 0 else 1
    height_ratio = min(height_a, height_b) / max(height_a, height_b) if max(height_a, height_b) > 0 else 1
    aspect_ratio = min(aspect_a, aspect_b) / max(aspect_a, aspect_b) if max(aspect_a, aspect_b) > 0 else 1
    if min(width_ratio, height_ratio, aspect_ratio) < VIDEO_LOGICAL_MERGE_SIZE_RATIO:
        return False, "size/aspect mismatch"
    return True, f"class compatible; gap={gap}; centre_distance={distance:.3f}; size ratios ok"


def _merge_two_tracks(first: dict, second: dict) -> dict:
    tracks = sorted([first, second], key=lambda item: int(_coerce_float(item.get("track_first_frame"))))
    primary = max(tracks, key=lambda item: _coerce_float(item.get("track_max_confidence") or item.get("confidence")))
    merged_observations = []
    merged_path = []
    class_votes: dict[str, float] = {}
    source_track_ids = []
    for track in tracks:
        source_track_ids.extend([str(item) for item in track.get("source_track_ids") or str(track.get("track_id") or "").split(",") if item])
        debug = track.get("track_debug") or {}
        merged_observations.extend(pl for pl in debug.get("frame_observations", []) if isinstance(pl, dict))
        merged_path.extend(pl for pl in track.get("track_path", []) if isinstance(pl, dict))
        for category, value in (debug.get("class_votes") or {}).items():
            class_votes[category] = class_votes.get(category, 0.0) + _coerce_float(value)
    source_track_ids = sorted(set(source_track_ids), key=str)
    first_frame = min(int(_coerce_float(track.get("track_first_frame"))) for track in tracks)
    last_frame = max(int(_coerce_float(track.get("track_last_frame"))) for track in tracks)
    first_timestamp = min(_coerce_float(track.get("track_first_timestamp")) for track in tracks)
    last_timestamp = max(_coerce_float(track.get("track_last_timestamp")) for track in tracks)
    frame_count = sum(int(_coerce_float(track.get("track_frame_count"))) for track in tracks)
    max_confidence = max(_coerce_float(track.get("track_max_confidence") or track.get("confidence")) for track in tracks)
    weighted_category = max(class_votes, key=class_votes.get, default=primary.get("category") or "unknown")
    avg_confidence = (
        sum(_coerce_float(track.get("track_avg_confidence")) * int(_coerce_float(track.get("track_frame_count"))) for track in tracks) / frame_count
        if frame_count else _coerce_float(primary.get("track_avg_confidence"))
    )
    recyclable_status, contaminant_status = material_status(weighted_category)
    hazard_status = "hazard" if any(track.get("track_hazard_status") == "hazard" for track in tracks) or CATEGORY_CLASS_MAP.get(weighted_category) == "contaminant" else "clear"
    merged = {
        **primary,
        "source_track_ids": source_track_ids,
        "track_id": ",".join(source_track_ids),
        "category": weighted_category,
        "material_name": weighted_category,
        "confidence": round(max_confidence, 4),
        "track_avg_confidence": round(avg_confidence, 4),
        "track_max_confidence": round(max_confidence, 4),
        "track_first_frame": first_frame,
        "track_last_frame": last_frame,
        "track_first_timestamp": round(first_timestamp, 3),
        "track_last_timestamp": round(last_timestamp, 3),
        "track_duration_seconds": round(max(0.0, last_timestamp - first_timestamp), 3),
        "track_frame_count": frame_count,
        "track_hazard_status": hazard_status,
        "recyclable_status": recyclable_status,
        "contaminant_status": contaminant_status,
        "track_path": sorted(merged_path, key=lambda point: int(_coerce_float(point.get("frame")))),
        "track_debug": {
            "frame_observations": sorted(merged_observations, key=lambda item: int(_coerce_float(item.get("frame")))),
            "class_votes": {key: round(value, 4) for key, value in class_votes.items()},
            "raw_track_ids": source_track_ids,
        },
        **evaluate_material(weighted_category, max_confidence),
    }
    return merged


def merge_track_fragments(raw_tracks: list[dict], upload_id: str) -> list[dict]:
    logical = sorted(raw_tracks, key=lambda item: int(_coerce_float(item.get("track_first_frame"))))
    changed = True
    merge_reasons = []
    while changed:
        changed = False
        for i, first in enumerate(logical):
            for j in range(i + 1, len(logical)):
                second = logical[j]
                should_merge, reason = _track_merge_score(first, second)
                if not should_merge:
                    continue
                merged = _merge_two_tracks(first, second)
                merge_reasons.append({
                    "source_track_ids": merged.get("source_track_ids"),
                    "reason": reason,
                })
                logical = [item for index, item in enumerate(logical) if index not in {i, j}] + [merged]
                logical.sort(key=lambda item: int(_coerce_float(item.get("track_first_frame"))))
                changed = True
                break
            if changed:
                break
    for index, item in enumerate(logical, start=1):
        source_track_ids = item.get("source_track_ids") or [item.get("track_id") or index]
        object_uid = f"{upload_id}-object-{index:04d}"
        item["object_uid"] = object_uid
        item["stable_object_id"] = object_uid
        item["source_track_ids"] = source_track_ids
        item.setdefault("track_debug", {})["merge_reasons"] = [
            reason for reason in merge_reasons if set(reason.get("source_track_ids") or []).issubset(set(source_track_ids))
        ]
        _video_debug(
            "logical_object_finalized",
            scan_id=upload_id,
            logical_object_id=object_uid,
            source_track_ids=source_track_ids,
            first_frame=item.get("track_first_frame"),
            last_frame=item.get("track_last_frame"),
            observations=item.get("track_frame_count"),
            final_class=item.get("category"),
        )
    return logical


def _persist_tracked_video_objects(
    *,
    tracked_objects: list[dict],
    source_name: str,
    file_id: str,
    job: dict,
    principal: Principal | None,
    database: SupabaseExecutor,
    existing_drive_metadata: dict,
    annotated_video_metadata: dict | None = None,
) -> list[str]:
    scan_ids: list[str] = []
    namespace = UUID(str(job["id"]))
    for item in tracked_objects:
        stable_object_id = str(item["stable_object_id"])
        crop_bytes = item.get("_best_crop_bytes")
        if not crop_bytes:
            continue
        public_material = {key: value for key, value in item.items() if not key.startswith("_")}
        public_material["result_type"] = "video_track_object"
        object_summary = summarize([public_material])
        object_summary.update({
            "result_kind": "video_track_object",
            "legacy_result": False,
            "total_unique_objects": 1,
            "video_tracking_summary": {
                "total_unique_objects": 1,
                "counts_by_class": {public_material["category"]: 1},
                "hazards": [public_material] if public_material.get("track_hazard_status") == "hazard" else [],
                "tracked_objects": [public_material],
                **(annotated_video_metadata or {}),
            },
        })
        scan_uuid = uuid5(namespace, stable_object_id)
        filename = f"{Path(source_name).stem}_{stable_object_id}.jpg"
        _video_debug(
            "database_write",
            scan_id=str(scan_uuid),
            logical_object_id=stable_object_id,
            source_track_ids=public_material.get("source_track_ids"),
            class_name=public_material.get("category"),
            confidence=public_material.get("confidence"),
        )
        result = persist_scan(
            crop_bytes,
            filename,
            "tracked_video",
            [public_material],
            object_summary,
            source_ref=file_id,
            batch_id=str(job["id"]),
            principal=principal,
            content_type="image/jpeg",
            existing_drive_metadata=existing_drive_metadata,
            database=database,
            scan_result_id=scan_uuid,
            model_version=os.getenv("MODEL_VERSION", "yolov8m-seg-bytetrack"),
        )
        scan_ids.append(str(result["scan_result_id"]))
    return scan_ids


def _process_video_drive_file(file_id: str, job: dict, principal: Principal | None, database: SupabaseExecutor, existing: dict, payload: bytes, name: str) -> list[str]:
    import cv2
    tmp_path = None
    annotated_tmp_path = None
    annotated_writer = None
    capture = None
    annotated_video_metadata = {
        "annotated_video_url": None,
        "annotated_video_status": "unavailable",
        "annotated_video_error": None,
    }
    scan_ids: list[str] = [str(scan_id) for scan_id in job.get("scan_ids") or []]
    options = job.get("options") or {}
    aggregator = VideoTrackAggregator(str(job["id"]), counting_line=_parse_counting_line(options))
    last_checkpoint_at = time.monotonic()
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
            tmp.write(payload)
            tmp_path = tmp.name
        capture = cv2.VideoCapture(tmp_path)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        frame_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        annotated_fps = fps if fps and fps > 0 else 30.0
        video_model = get_model()
        tracker_path = str(APP_ROOT / VIDEO_TRACKER_CONFIG)
        if not Path(tracker_path).exists():
            tracker_path = VIDEO_TRACKER_CONFIG
        _video_debug("video_tracking_started", scan_id=str(job["id"]), source_name=name, frame_total=frame_total, tracker=tracker_path, stride=1)
        _update_job(job["id"], database, total_count=None, result_summary={"mode": "tracked_video", "frame_total": frame_total})
        frame_index = 0
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            timestamp = frame_index / fps if fps else 0.0
            results = video_model.track(frame, persist=True, tracker=tracker_path, verbose=False)
            result = results[0] if results else None
            detections = _result_track_observations(result, frame, frame_index, timestamp) if result else []
            aggregator.observe(frame_index, timestamp, detections)
            if annotated_video_metadata.get("annotated_video_status") != "failed":
                try:
                    if annotated_writer is None:
                        height, width = frame.shape[:2]
                        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as annotated_tmp:
                            annotated_tmp_path = annotated_tmp.name
                        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
                        annotated_writer = cv2.VideoWriter(annotated_tmp_path, fourcc, annotated_fps, (width, height))
                        if not annotated_writer.isOpened():
                            raise RuntimeError("OpenCV VideoWriter could not open annotated MP4 output")
                        annotated_video_metadata["annotated_video_status"] = "processing"
                    annotated_writer.write(_annotate_video_frame(frame, detections) if detections else frame)
                except Exception as exc:
                    annotated_video_metadata.update({
                        "annotated_video_status": "failed",
                        "annotated_video_error": safe_error_message(exc),
                    })
                    print(f"[video-annotation] frame annotation failed: {type(exc).__name__}: {safe_error_message(exc)}")
                    if annotated_writer is not None:
                        annotated_writer.release()
                        annotated_writer = None
                    if annotated_tmp_path:
                        Path(annotated_tmp_path).unlink(missing_ok=True)
                        annotated_tmp_path = None
            now = time.monotonic()
            if now - last_checkpoint_at >= 8:
                summary = _video_tracking_summary(aggregator.finalized)
                summary["frame_detections"] = sum(len(track.get("track_debug", {}).get("frame_observations", [])) for track in aggregator.finalized)
                summary["raw_track_count"] = len(aggregator.finalized) + len(aggregator.active)
                summary.update(annotated_video_metadata)
                _update_job(job["id"], database, processed_count=summary["total_unique_objects"], scan_ids=scan_ids, result_summary=summary)
                last_checkpoint_at = now
            frame_index += 1
        capture.release()
        capture = None
        if annotated_writer is not None:
            annotated_writer.release()
            annotated_writer = None
        if annotated_tmp_path and annotated_video_metadata.get("annotated_video_status") != "failed":
            try:
                upload = upload_file_to_supabase_storage(
                    annotated_tmp_path,
                    f"annotated-videos/{job['id']}-annotated.mp4",
                    "video/mp4",
                    database,
                )
                annotated_video_metadata.update({
                    "annotated_video_url": upload["public_url"],
                    "annotated_video_status": "uploaded",
                    "annotated_video_error": None,
                })
            except Exception as exc:
                annotated_video_metadata.update({
                    "annotated_video_url": None,
                    "annotated_video_status": "failed",
                    "annotated_video_error": safe_error_message(exc),
                })
                print(f"[video-annotation] annotated MP4 upload failed: {type(exc).__name__}: {safe_error_message(exc)}")
        aggregator.finish(frame_index)
        raw_tracks = aggregator.finalized
        logical_objects = merge_track_fragments(raw_tracks, str(job["id"]))
        scan_ids = _persist_tracked_video_objects(
            tracked_objects=logical_objects,
            source_name=name,
            file_id=file_id,
            job=job,
            principal=principal,
            database=database,
            existing_drive_metadata=existing,
            annotated_video_metadata=annotated_video_metadata,
        )
        summary = _video_tracking_summary(logical_objects)
        summary.update({
            "scan_id": str(job["id"]),
            "result_type": "video_tracking",
            "frame_total": frame_total,
            "frame_detections": sum(len(track.get("track_debug", {}).get("frame_observations", [])) for track in raw_tracks),
            "raw_track_count": len(raw_tracks),
            "filtered_tracks": max(0, len(raw_tracks) - len(logical_objects)),
            "database_rows_written": len(scan_ids),
            **annotated_video_metadata,
        })
        _video_debug(
            "video_tracking_completed",
            scan_id=str(job["id"]),
            frame_total=frame_total,
            frame_detections=summary["frame_detections"],
            raw_track_count=len(raw_tracks),
            final_logical_objects=len(logical_objects),
            database_rows_written=len(scan_ids),
        )
        _update_job(job["id"], database, processed_count=len(scan_ids), total_count=summary["total_unique_objects"], scan_ids=scan_ids, result_summary=summary)
        return scan_ids
    finally:
        try:
            if annotated_writer is not None:
                annotated_writer.release()
        except Exception:
            pass
        try:
            if capture is not None:
                capture.release()
        except Exception:
            pass
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
        if annotated_tmp_path:
            Path(annotated_tmp_path).unlink(missing_ok=True)


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
        return _process_video_drive_file(file_id, job, principal, database, existing, payload, name)
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
    payload = {**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
    try:
        database.execute(
            lambda client: client.table(JOBS_TABLE).update(payload).eq("id", job_id).execute()
        )
    except Exception as exc:
        if "result_summary" in payload and getattr(exc, "code", "") in {"PGRST204", "PGRST205", "42703"}:
            payload.pop("result_summary", None)
            database.execute(
                lambda client: client.table(JOBS_TABLE).update(payload).eq("id", job_id).execute()
            )
            return
        raise


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


def analytics_category(value: Any) -> str:
    key = re.sub(r"[_-]+", " ", str(value or "").strip().lower())
    key = re.sub(r"\s+", " ", key)
    if "food" in key or "organic" in key:
        return "food organic"
    if any(word in key for word in ("general", "trash", "landfill", "unknown")):
        return "general trash"
    return next((category for category in ANALYTICS_MATERIAL_ESTIMATES if category in key), "general trash")


def analytics_timestamp(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def analytics_page_rows(database: SupabaseExecutor, table: str, principal: Principal, build_query: Callable[[Any], Any], page_size: int) -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        response = database.execute(lambda client: scoped_query(build_query(client), principal).range(offset, offset + page_size - 1).execute())
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def analytics_child_rows(database: SupabaseExecutor, table: str, scan_ids: list[str], principal: Principal) -> list[dict]:
    rows: list[dict] = []
    for index in range(0, len(scan_ids), 200):
        ids = scan_ids[index:index + 200]
        rows.extend(analytics_page_rows(database, table, principal, lambda client, ids=ids: client.table(table).select("*").in_("scan_result_id", ids), ANALYTICS_CHILD_PAGE_SIZE))
    return rows


@app.get("/api/analytics/summary")
def analytics_summary(
    start_date: str | None = None,
    end_date: str | None = None,
    principal: Principal = Depends(require_scope("scan:read")),
):
    """Aggregate every matching scan server-side; never expose a paginated scan page as analytics."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    if bool(start_date) != bool(end_date):
        raise HTTPException(status_code=400, detail="start_date and end_date must be supplied together.")
    try:
        database = SupabaseExecutor(supabase)

        def build_scans(client):
            query = client.table(SCAN_RESULTS_TABLE).select("id,source_name,source_type,batch_id,overall_status,human_review_required,overall_confidence,created_at,reviewed_at")
            if start_date:
                query = query.gte("created_at", start_date).lt("created_at", end_date)
            return query.order("created_at", desc=True)

        scans = analytics_page_rows(database, SCAN_RESULTS_TABLE, principal, build_scans, ANALYTICS_PAGE_SIZE)
        scan_ids = [str(scan["id"]) for scan in scans if scan.get("id")]
        materials = analytics_child_rows(database, DETECTED_MATERIALS_TABLE, scan_ids, principal)
        decisions = analytics_child_rows(database, REVIEW_DECISIONS_TABLE, scan_ids, principal)
        latest_decisions: dict[str, dict] = {}
        for decision in sorted(decisions, key=lambda item: str(item.get("created_at") or "")):
            latest_decisions[str(decision.get("detected_material_id") or "")] = decision

        scan_by_id = {str(scan["id"]): scan for scan in scans if scan.get("id")}
        rejected_count = sum(str(scan.get("overall_status") or "").lower() in {"rejected", "quarantined"} for scan in scans)
        review_count = sum(bool(scan.get("human_review_required")) for scan in scans)
        confirmed_count = max(0, len(scans) - rejected_count - review_count)
        category_data: dict[str, dict] = {}
        recyclable_counts: dict[str, int] = {}
        contaminant_counts: dict[str, int] = {}
        confidence_values: list[float] = []
        review_durations: list[float] = []
        high_risk_count = 0
        recovery_opportunity_count = 0

        for material in materials:
            category = analytics_category(material.get("category") or material.get("material_name"))
            estimate = ANALYTICS_MATERIAL_ESTIMATES[category]
            row = category_data.setdefault(category, {"category": category, "label": estimate["label"], "count": 0, "estimatedWeightKg": 0.0, "pricePerKg": estimate["price_per_kg_rm"], "estimatedResaleValueRm": 0.0, "confidence_total": 0.0, "confidence_count": 0, "recyclable_count": 0, "contaminant_count": 0})
            row["count"] += 1
            row["estimatedWeightKg"] += estimate["average_weight_kg"]
            row["estimatedResaleValueRm"] += estimate["average_weight_kg"] * estimate["price_per_kg_rm"]
            confidence = float(material.get("confidence") or 0)
            confidence = confidence * 100 if confidence <= 1 else confidence
            if confidence > 0:
                confidence_values.append(confidence)
                row["confidence_total"] += confidence
                row["confidence_count"] += 1
            decision = latest_decisions.get(str(material.get("id") or ""))
            material_class = str((decision or {}).get("disposition") or material.get("material_class") or estimate["material_class"]).lower()
            if material_class == "recyclable":
                recyclable_counts[estimate["label"]] = recyclable_counts.get(estimate["label"], 0) + 1
                row["recyclable_count"] += 1
                if estimate["price_per_kg_rm"] > 0:
                    recovery_opportunity_count += 1
            elif material_class == "contaminant":
                contaminant_counts[estimate["label"]] = contaminant_counts.get(estimate["label"], 0) + 1
                row["contaminant_count"] += 1
                if category == "battery":
                    high_risk_count += 1
            scan = scan_by_id.get(str(material.get("scan_result_id") or ""))
            if decision and scan:
                created_at, reviewed_at = analytics_timestamp(scan.get("created_at")), analytics_timestamp(decision.get("created_at"))
                if created_at and reviewed_at and reviewed_at >= created_at:
                    review_durations.append((reviewed_at - created_at).total_seconds() * 1000)

        trend: dict[str, dict] = {}
        batch_counts: dict[str, int] = {}
        for scan in scans:
            created_at = analytics_timestamp(scan.get("created_at"))
            if created_at:
                local_day = created_at.astimezone(ANALYTICS_MALAYSIA_TZ)
                key = local_day.strftime("%Y-%m-%d")
                trend.setdefault(key, {"key": key, "label": local_day.strftime("%b %-d"), "value": 0})["value"] += 1
            if scan.get("batch_id"):
                batch_counts[str(scan["batch_id"])] = batch_counts.get(str(scan["batch_id"]), 0) + 1

        resale_rows = sorted(category_data.values(), key=lambda row: (-row["estimatedResaleValueRm"], -row["count"]))
        for row in resale_rows:
            row["averageConfidence"] = row.pop("confidence_total") / row.pop("confidence_count") if row["confidence_count"] else 0
        material_mix = sorted(resale_rows, key=lambda row: (-row["estimatedWeightKg"], -row["count"]))
        top_recyclable = max(recyclable_counts.items(), key=lambda item: item[1], default=None)
        top_contaminant = max(contaminant_counts.items(), key=lambda item: item[1], default=None)
        latest_scan = scans[0] if scans else None
        recent_events = [{"timestamp": scan.get("created_at"), "source": scan.get("source_name") or scan.get("source_type") or "Web Upload", "event": "Scan Rejected" if str(scan.get("overall_status") or "").lower() in {"rejected", "quarantined"} else "Scan Verified", "status": "Rejected" if str(scan.get("overall_status") or "").lower() in {"rejected", "quarantined"} else "Review Needed" if scan.get("human_review_required") else "Confirmed", "details": "Saved scan record"} for scan in scans[:5]]
        return {
            "scope": "selected_date" if start_date else "all_history",
            "start_date": start_date,
            "end_date": end_date,
            "total_scans": len(scans),
            "confirmed_count": confirmed_count,
            "review_count": review_count,
            "rejected_count": rejected_count,
            "detected_materials_count": len(materials),
            "average_detection_confidence": sum(confidence_values) / len(confidence_values) if confidence_values else 0,
            "estimated_recovery_value": sum(row["estimatedResaleValueRm"] for row in resale_rows),
            "total_estimated_weight_kg": sum(row["estimatedWeightKg"] for row in material_mix),
            "material_mix": material_mix,
            "recoverable_value_by_category": resale_rows,
            "daily_scan_trend": [trend[key] for key in sorted(trend)],
            "recyclable_rows": sorted(recyclable_counts.items(), key=lambda item: -item[1]),
            "contaminated_rows": sorted(contaminant_counts.items(), key=lambda item: -item[1]),
            "top_contamination_source": {"label": top_contaminant[0], "count": top_contaminant[1]} if top_contaminant else None,
            "top_recyclable_material": {"label": top_recyclable[0], "count": top_recyclable[1]} if top_recyclable else None,
            "average_review_turnaround_ms": sum(review_durations) / len(review_durations) if review_durations else None,
            "highest_value_category": resale_rows[0] if resale_rows and resale_rows[0]["estimatedResaleValueRm"] > 0 else None,
            "last_upload": latest_scan,
            "last_upload_batch_count": batch_counts.get(str(latest_scan.get("batch_id")), 1) if latest_scan else 0,
            "high_risk_count": high_risk_count,
            "recovery_opportunity_count": recovery_opportunity_count,
            "recent_events": recent_events,
        }
    except SupabaseTemporarilyUnavailable:
        return JSONResponse(status_code=503, content={"detail": "Analytics data is temporarily unavailable.", "retryable": True}, headers={"Retry-After": "2"})
    except Exception as exc:
        print(f"[analytics] summary failed: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to load analytics summary.") from exc


@app.post("/api/scans/browser-detected")
async def save_browser_detected_scan(
    file: UploadFile = File(...),
    submission_id: UUID = Form(...),
    original_width: int = Form(...),
    original_height: int = Form(...),
    model_name: str = Form(...),
    model_version: str = Form(...),
    inference_engine: str = Form(...),
    confidence_threshold: float = Form(...),
    nms_iou_threshold: float = Form(...),
    detections: str = Form(...),
    principal: Principal = Depends(require_scope("scan:write")),
):
    if model_name != BROWSER_MODEL_NAME or model_version != BROWSER_MODEL_VERSION:
        raise HTTPException(status_code=400, detail="Browser model identity does not match the fixed contract.")
    if inference_engine != BROWSER_INFERENCE_ENGINE:
        raise HTTPException(status_code=400, detail="Inference engine must be browser-onnx.")
    if not math.isclose(confidence_threshold, BROWSER_CONFIDENCE_THRESHOLD, abs_tol=1e-9):
        raise HTTPException(status_code=400, detail=BROWSER_CONFIDENCE_CONTRACT_DETAIL)
    if not math.isclose(nms_iou_threshold, BROWSER_NMS_IOU_THRESHOLD, abs_tol=1e-9):
        raise HTTPException(status_code=400, detail=BROWSER_NMS_CONTRACT_DETAIL)
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
    if (original_width, original_height) != (actual_width, actual_height):
        raise HTTPException(status_code=400, detail="Browser image dimensions do not match the uploaded image.")
    try:
        raw_detections = json.loads(detections)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Detection JSON is invalid.") from exc
    materials = validate_browser_detected_detections(raw_detections, actual_width, actual_height)
    return persist_scan(
        file_bytes,
        file.filename,
        "image",
        materials,
        summarize(materials),
        source_ref="browser-onnx:best.onnx",
        principal=principal,
        content_type=normalized_type,
        scan_result_id=submission_id,
        model_version=model_version,
    )


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
        raise HTTPException(status_code=400, detail=BROWSER_CONFIDENCE_CONTRACT_DETAIL)
    if not math.isclose(nms_iou_threshold, BROWSER_NMS_IOU_THRESHOLD, abs_tol=1e-9):
        raise HTTPException(status_code=400, detail=BROWSER_NMS_CONTRACT_DETAIL)
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
    limit: int = SCAN_HISTORY_DEFAULT_LIMIT,
    offset: int = 0,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    sort: str = "timestamp",
    direction: str = "desc",
    principal: Principal = Depends(require_scope("scan:read")),
):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    try:
        limit = max(1, min(int(limit), SCAN_HISTORY_MAX_LIMIT))
        offset = max(0, int(offset))
        filters = scan_history_filters(start_date, end_date, search, status)
        normalized_status = filters["status"] or ""
        order_column = "overall_confidence" if sort == "confidence" else "created_at"
        descending = str(direction).lower() != "asc"
        category_key = canonical_category_key(category) if category else ""
        if category and category_key == "unknown":
            return {"items": [], "total": 0, "limit": limit, "offset": offset, "start_date": start_date, "end_date": end_date, "search": search, "category": category, "status": status, "sort": "confidence" if sort == "confidence" else "timestamp", "direction": "desc" if descending else "asc", "summary": {"confirmed": 0, "needs_review": 0, "rejected": 0}}

        if category_key:
            def category_rpc(status_value: str | None, rpc_limit: int = limit, rpc_offset: int = offset):
                return execute_scan_read(f"category {status_value or 'page'} query", lambda client: scoped_query(client.rpc("scan_history_page", {
                    "p_limit": rpc_limit,
                    "p_offset": rpc_offset,
                    "p_start_date": filters["start_date"],
                    "p_end_date": filters["end_date"],
                    "p_search": filters["search"],
                    "p_category_key": category_key,
                    "p_status": status_value,
                    "p_sort": "confidence" if sort == "confidence" else "timestamp",
                    "p_direction": "asc" if not descending else "desc",
                }), principal).execute())

            def category_count(status_value: str | None) -> int:
                rows = category_rpc(status_value, 1, 0).data or []
                return int(rows[0].get("total_count") or 0) if rows else 0

            rpc_response = category_rpc(normalized_status or None)
            rpc_rows = rpc_response.data or []
            scans = [row.get("scan") for row in rpc_rows if isinstance(row, dict) and row.get("scan")]
            total = int(rpc_rows[0].get("total_count") or 0) if rpc_rows else 0
            if normalized_status:
                rejected = total if normalized_status == "rejected" else 0
                needs_review = total if normalized_status == "review_needed" else 0
                confirmed = total if normalized_status == "confirmed" else 0
            else:
                rejected = category_count("rejected")
                needs_review = category_count("review_needed")
                confirmed = max(0, total - rejected - needs_review)
        else:
            def build_page_query(client):
                query = client.table(SCAN_RESULTS_TABLE).select("*")
                query = apply_scan_history_filters(query, filters)
                return scoped_query(query.order(order_column, desc=descending).range(offset, offset + limit - 1), principal).execute()

            def build_count_query(client):
                query = client.table(SCAN_RESULTS_TABLE).select("id", count="exact", head=True)
                query = apply_scan_history_filters(query, filters)
                return scoped_query(query, principal).execute()

            scan_response = execute_scan_read("page data query", build_page_query)
            scans = scan_response.data or []
            count_response = execute_scan_read("count query", build_count_query)
            count_value = getattr(count_response, "count", None)
            if count_value is None:
                raise RuntimeError("Supabase did not return an exact scan count")
            total = int(count_value)

        def exact_count(status_value: str) -> int:
            def run(client):
                query = client.table(SCAN_RESULTS_TABLE).select("id", count="exact", head=True)
                query = apply_scan_history_filters(query, filters, status_value)
                return scoped_query(query, principal).execute()
            response = execute_scan_read(f"{status_value} count query", run)
            value = getattr(response, "count", None)
            return int(value) if value is not None else 0

        if not category_key:
            if normalized_status:
                rejected = total if normalized_status == "rejected" else 0
                needs_review = total if normalized_status == "review_needed" else 0
                confirmed = total if normalized_status == "confirmed" else 0
            else:
                rejected = exact_count("rejected")
                needs_review = exact_count("review_needed")
                confirmed = max(0, total - rejected - needs_review)
        scan_ids = [str(scan.get("id")) for scan in scans if scan.get("id")]
        if scan_ids:
            materials = execute_scan_read("page materials query", lambda client: client.table(DETECTED_MATERIALS_TABLE).select("*").in_("scan_result_id", scan_ids).execute()).data or []
            decisions = execute_scan_read("page decisions query", lambda client: client.table(REVIEW_DECISIONS_TABLE).select("*").in_("scan_result_id", scan_ids).execute()).data or []
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
            "search": search,
            "category": category,
            "status": status,
            "sort": "confidence" if sort == "confidence" else "timestamp",
            "direction": "desc" if descending else "asc",
            "summary": {
                "confirmed": confirmed,
                "needs_review": needs_review,
                "rejected": rejected,
            },
        }
    except Exception as exc:
        if not isinstance(exc, (SupabaseTemporarilyUnavailable, RuntimeError)):
            print(f"[scans] history response failed: {type(exc).__name__}: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to load scan history.") from exc


@app.get("/api/history/export")
def export_scan_history(
    format: str = "excel",
    scope: str = "audit",
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    sort: str = "timestamp",
    direction: str = "desc",
    principal: Principal = Depends(require_scope("scan:read")),
):
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    export_format = str(format or "").strip().lower()
    if export_format not in {"pdf", "excel"}:
        raise HTTPException(status_code=400, detail="Export format must be pdf or excel.")
    normalized_scope = "scan" if str(scope or "").strip().lower() == "scan" else "audit"
    filters = {
        "scope": normalized_scope,
        "search": search.strip() if search and search.strip() else None,
        "start_date": start_date,
        "end_date": end_date,
        "category": category,
        "status": status,
        "sort": "confidence" if sort == "confidence" else "timestamp",
        "direction": "asc" if str(direction).lower() == "asc" else "desc",
    }
    try:
        started = time.perf_counter()
        rows = fetch_history_export_rows(
            start_date=start_date,
            end_date=end_date,
            search=search,
            category=category,
            status=status,
            sort=filters["sort"] or "timestamp",
            direction=filters["direction"] or "desc",
            principal=principal,
        )
        print(f"[history-export] records fetched rows={len(rows)}")
        thumbnail_started = time.perf_counter()
        thumbnails, thumbnail_stats = fetch_history_thumbnails(rows)
        print(
            "[history-export] images processed "
            f"requested={thumbnail_stats['requested']} unique={thumbnail_stats['unique']} "
            f"cache_hits={thumbnail_stats['cache_hits']} failed={thumbnail_stats['failed']} "
            f"duration={time.perf_counter() - thumbnail_started:.2f}s"
        )
        stamp = datetime.now(ANALYTICS_MALAYSIA_TZ).strftime("%Y%m%d-%H%M%S")
        prefix = "purityloop-scan-history" if normalized_scope == "scan" else "purityloop-audit-history"
        if export_format == "excel":
            content = build_history_excel(rows, thumbnails)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"{prefix}-{stamp}.xlsx"
        else:
            content = build_history_pdf(rows, filters, thumbnails)
            media_type = "application/pdf"
            filename = f"{prefix}-{stamp}.pdf"
        print(f"[history-export] report generated format={export_format} bytes={len(content)}")
        print(f"[history-export] {export_format} scope={normalized_scope} rows={len(rows)} duration={time.perf_counter() - started:.2f}s")
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except ImportError as exc:
        print(f"[history-export] dependency missing: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="History export dependency is not installed.") from exc
    except Exception as exc:
        print(f"[history-export] failed: {type(exc).__name__}: {safe_error_message(exc)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Unable to export history.") from exc


@app.get("/api/scans/{scan_result_id}")
def get_scan_result(scan_result_id: str, principal: Principal = Depends(require_scope("scan:read"))):
    """Return the persisted material IDs needed to review a previously loaded scan."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase backend env is not configured.")
    try:
        UUID(scan_result_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Scan result was not found.") from exc
    try:
        scan_response = execute_scan_read(
            "selected scan query",
            lambda client: scoped_query(client.table(SCAN_RESULTS_TABLE).select("*").eq("id", scan_result_id), principal).execute(),
        )
        if not scan_response.data:
            raise HTTPException(status_code=404, detail="Scan result was not found.")
        materials = execute_scan_read(
            "selected scan materials query",
            lambda client: client.table(DETECTED_MATERIALS_TABLE).select("*").eq("scan_result_id", scan_result_id).execute(),
        ).data or []
        decisions = execute_scan_read(
            "selected scan decisions query",
            lambda client: client.table(REVIEW_DECISIONS_TABLE).select("*").eq("scan_result_id", scan_result_id).execute(),
        ).data or []
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[scans] selected scan query failed for {scan_result_id[:8]}…: {type(exc).__name__}: {safe_error_message(exc)}")
        raise HTTPException(status_code=500, detail="Unable to load selected scan.") from exc
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
