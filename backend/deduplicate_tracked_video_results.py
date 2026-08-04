from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import UUID

import httpx
from PIL import Image, ImageDraw

try:
    import cv2
except Exception:  # pragma: no cover - diagnostics degrade safely without OpenCV.
    cv2 = None

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import (
    DETECTED_MATERIALS_TABLE,
    JOBS_TABLE,
    REVIEW_DECISIONS_TABLE,
    SCAN_RESULTS_TABLE,
    SupabaseExecutor,
    _bbox_quality,
    _coerce_float,
    _merge_duplicate_group,
    _new_supabase_client,
    _video_tracking_summary,
    appearance_fingerprint_from_bytes,
    reconcile_duplicate_tracked_objects,
    summarize,
)

PREVIEW_TIMEOUT = httpx.Timeout(8.0, connect=3.0)
PREVIEW_MAX_BYTES = 2 * 1024 * 1024
PREVIEW_TYPES = {"image/jpeg", "image/png", "image/webp"}
OBJECT_CROP_PADDING = 0.07
MOTION_MIN_MATCHES = 12
MOTION_MAX_FRAMES = 350


def _safe_json(value):
    return json.loads(json.dumps(value, default=str))


def _preview_source(scan: dict) -> tuple[str | None, str]:
    if scan.get("preview_image_url"):
        return str(scan["preview_image_url"]), "preview_image_url"
    if scan.get("image_url") and "/storage/v1/object/" in str(scan["image_url"]):
        return str(scan["image_url"]), "image_url"
    return None, "missing"


def _download_preview_bytes(url: str | None) -> tuple[bytes | None, str]:
    if not url:
        return None, "preview unavailable"
    try:
        with httpx.Client(timeout=PREVIEW_TIMEOUT, follow_redirects=True) as client:
            response = client.get(url)
            response.raise_for_status()
            content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
            if content_type not in PREVIEW_TYPES:
                return None, f"unsupported content type {content_type or 'unknown'}"
            content = response.content
            if len(content) > PREVIEW_MAX_BYTES:
                return None, f"preview exceeds {PREVIEW_MAX_BYTES} bytes"
            return content, "downloaded"
    except Exception as exc:
        return None, f"preview download failed: {type(exc).__name__}"


def _selected_bbox(track: dict) -> list[float] | None:
    best_box = track.get("best_box") if isinstance(track.get("best_box"), dict) else {}
    bbox = track.get("best_bbox_norm") or best_box.get("xyxy")
    return bbox if isinstance(bbox, list) and len(bbox) >= 4 else None


def _bbox_to_pixels(bbox: list[float], width: int, height: int, *, padding_ratio: float = 0.0) -> tuple[int, int, int, int] | None:
    x1, y1, x2, y2 = [_coerce_float(value) for value in bbox[:4]]
    if max(x1, y1, x2, y2) <= 1:
        x1, x2 = x1 * width, x2 * width
        y1, y2 = y1 * height, y2 * height
    pad_x = max(0.0, x2 - x1) * max(0.0, padding_ratio)
    pad_y = max(0.0, y2 - y1) * max(0.0, padding_ratio)
    left, top = max(0, int(x1 - pad_x)), max(0, int(y1 - pad_y))
    right, bottom = min(width, int(x2 + pad_x)), min(height, int(y2 + pad_y))
    return (left, top, right, bottom) if right > left and bottom > top else None


def _open_preview(content: bytes | None) -> Image.Image | None:
    if not content:
        return None
    try:
        return Image.open(BytesIO(content)).convert("RGB")
    except Exception:
        return None


def _object_crop_image(content: bytes | None, track: dict) -> Image.Image | None:
    raw_crop = track.get("_diagnostic_object_crop_bytes")
    if raw_crop:
        image = _open_preview(raw_crop)
        if image is not None:
            return image
    image = _open_preview(content)
    bbox = _selected_bbox(track)
    if image is None or not bbox:
        return None
    region = _bbox_to_pixels(bbox, *image.size, padding_ratio=OBJECT_CROP_PADDING)
    return image.crop(region) if region else None


def _context_image(content: bytes | None, track: dict) -> Image.Image | None:
    raw_context = track.get("_diagnostic_context_frame_bytes")
    if raw_context:
        image = _open_preview(raw_context)
        if image is not None:
            return image
    image = _open_preview(content)
    bbox = _selected_bbox(track)
    if image is None or not bbox:
        return image
    region = _bbox_to_pixels(bbox, *image.size)
    if not region:
        return image
    context = image.convert("RGBA")
    overlay = Image.new("RGBA", context.size, (255, 255, 255, 180))
    mask = Image.new("L", context.size, 190)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rectangle(region, fill=0)
    context = Image.composite(overlay, context, mask).convert("RGB")
    draw = ImageDraw.Draw(context)
    draw.rectangle(region, outline=(255, 32, 32), width=max(3, image.size[0] // 180))
    return context


def _image_to_jpeg_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def _bbox_center(bbox: list[float], width: int, height: int) -> tuple[float, float]:
    x1, y1, x2, y2 = [_coerce_float(value) for value in bbox[:4]]
    if max(x1, y1, x2, y2) <= 1:
        x1, x2 = x1 * width, x2 * width
        y1, y2 = y1 * height, y2 * height
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _norm_center(point: tuple[float, float], width: int, height: int) -> dict:
    return {"x": round(point[0] / max(width, 1), 6), "y": round(point[1] / max(height, 1), 6)}


def _apply_affine(matrix: list[list[float]] | None, point: tuple[float, float]) -> tuple[float, float] | None:
    if not matrix:
        return None
    x, y = point
    return (
        matrix[0][0] * x + matrix[0][1] * y + matrix[0][2],
        matrix[1][0] * x + matrix[1][1] * y + matrix[1][2],
    )


def _diagnostic_observations(track: dict) -> list[dict]:
    observations = [item for item in (track.get("track_debug") or {}).get("frame_observations") or [] if isinstance(item, dict)]
    return sorted(observations, key=lambda item: int(_coerce_float(item.get("frame"))))


def _selected_multi_crop_observations(track: dict) -> list[dict]:
    observations = _diagnostic_observations(track)
    if not observations:
        return []
    picks = [
        observations[0],
        observations[len(observations) // 2],
        max(observations, key=lambda item: _coerce_float(item.get("confidence"))),
        max(observations, key=lambda item: (_coerce_float(_bbox_quality(item.get("bbox")).get("score")), _coerce_float(item.get("confidence")))),
        observations[-1],
    ]
    unique = {}
    for item in picks:
        frame = item.get("frame")
        bbox = item.get("bbox")
        if frame is not None and isinstance(bbox, list) and len(bbox) >= 4:
            unique[int(_coerce_float(frame))] = item
    return [unique[key] for key in sorted(unique)]


def _read_video_frames(video_path: str, frame_numbers: set[int]) -> tuple[dict[int, Image.Image], dict]:
    if cv2 is None:
        return {}, {"status": "opencv unavailable"}
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {}, {"status": "video open failed"}
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0)
    frames: dict[int, Image.Image] = {}
    for frame_no in sorted(value for value in frame_numbers if 0 <= value < total):
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_no)
        ok, frame = cap.read()
        if ok:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames[frame_no] = Image.fromarray(rgb)
    cap.release()
    return frames, {"status": "ok", "frame_total": total, "width": width, "height": height, "fps": fps, "frames_loaded": len(frames)}


def _video_frame_total(video_path: str) -> int:
    if cv2 is None:
        return 0
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()
    return total


def _to_gray_array(image: Image.Image):
    np = __import__("numpy")
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)


def _estimate_translation_matrix(current: Image.Image, previous: Image.Image) -> tuple[list[list[float]] | None, dict]:
    np = __import__("numpy")
    cur = cv2.resize(_to_gray_array(current), (232, 416)).astype(np.float32)
    prev = cv2.resize(_to_gray_array(previous), (232, 416)).astype(np.float32)
    try:
        (dx, dy), response = cv2.phaseCorrelate(cur, prev)
    except Exception:
        return None, {"status": "phase correlation failed", "inliers": 0}
    scale_x = current.size[0] / 232
    scale_y = current.size[1] / 416
    if response < 0.03:
        return None, {"status": "weak phase correlation", "inliers": round(float(response), 4)}
    return [[1.0, 0.0, round(float(dx * scale_x), 6)], [0.0, 1.0, round(float(dy * scale_y), 6)]], {"status": "ok", "inliers": round(float(response), 4)}


def _compose_affine(first: list[list[float]], second: list[list[float]]) -> list[list[float]]:
    np = __import__("numpy")
    first_3 = np.array([[first[0][0], first[0][1], first[0][2]], [first[1][0], first[1][1], first[1][2]], [0.0, 0.0, 1.0]])
    second_3 = np.array([[second[0][0], second[0][1], second[0][2]], [second[1][0], second[1][1], second[1][2]], [0.0, 0.0, 1.0]])
    matrix = first_3 @ second_3
    return [[round(float(value), 6) for value in matrix[0, :3]], [round(float(value), 6) for value in matrix[1, :3]]]


def _estimate_motion(frames: dict[int, Image.Image]) -> tuple[dict[int, dict], dict]:
    if cv2 is None:
        return {}, {"status": "opencv unavailable"}
    if not frames:
        return {}, {"status": "no frames"}
    reference_frame = min(frames)
    reference = _to_gray_array(frames[reference_frame])
    orb = cv2.ORB_create(nfeatures=1500)
    ref_keypoints, ref_descriptors = orb.detectAndCompute(reference, None)
    transforms: dict[int, dict] = {
        reference_frame: {"status": "reference", "matrix": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], "inliers": None, "dx": 0.0, "dy": 0.0}
    }
    successes = 1
    failures = 0
    previous_frame = reference_frame
    for frame_no, image in sorted(frames.items()):
        if frame_no == reference_frame:
            continue
        previous_transform = transforms.get(previous_frame, {}).get("matrix")
        if previous_transform:
            step_matrix, step_meta = _estimate_translation_matrix(image, frames[previous_frame])
            if step_matrix:
                matrix = _compose_affine(previous_transform, step_matrix)
                transforms[frame_no] = {
                    "status": "ok",
                    "method": "phase_correlation_cumulative",
                    "matrix": matrix,
                    "inliers": step_meta["inliers"],
                    "dx": matrix[0][2],
                    "dy": matrix[1][2],
                }
                successes += 1
                previous_frame = frame_no
                continue
        current = _to_gray_array(image)
        cur_keypoints, cur_descriptors = orb.detectAndCompute(current, None)
        if ref_descriptors is None or cur_descriptors is None:
            transforms[frame_no] = {"status": "feature extraction failed", "matrix": None, "inliers": 0}
            failures += 1
            continue
        matches = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(cur_descriptors, ref_descriptors)
        matches = sorted(matches, key=lambda item: item.distance)[:80]
        if len(matches) < MOTION_MIN_MATCHES:
            transforms[frame_no] = {"status": "insufficient feature matches", "matrix": None, "inliers": len(matches)}
            failures += 1
            continue
        src = __import__("numpy").float32([cur_keypoints[item.queryIdx].pt for item in matches]).reshape(-1, 1, 2)
        dst = __import__("numpy").float32([ref_keypoints[item.trainIdx].pt for item in matches]).reshape(-1, 1, 2)
        matrix, inlier_mask = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=4.0)
        inliers = int(inlier_mask.sum()) if inlier_mask is not None else 0
        if matrix is None or inliers < MOTION_MIN_MATCHES:
            transforms[frame_no] = {"status": "motion estimate failed", "matrix": None, "inliers": inliers}
            failures += 1
            continue
        rounded = [[round(float(value), 6) for value in row] for row in matrix.tolist()]
        transforms[frame_no] = {"status": "ok", "matrix": rounded, "inliers": inliers, "dx": rounded[0][2], "dy": rounded[1][2]}
        successes += 1
        previous_frame = frame_no
    return transforms, {"status": "ok" if successes > 1 else "insufficient_motion", "reference_frame": reference_frame, "frames_evaluated": len(frames), "successes": successes, "failures": failures}


def _draw_source_context(image: Image.Image, track: dict, observation: dict) -> Image.Image:
    bbox = observation.get("bbox") or _selected_bbox(track)
    if not bbox:
        return image.copy()
    region = _bbox_to_pixels(bbox, *image.size)
    if not region:
        return image.copy()
    context = image.convert("RGBA")
    overlay = Image.new("RGBA", context.size, (255, 255, 255, 188))
    mask = Image.new("L", context.size, 210)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rectangle(region, fill=0)
    context = Image.composite(overlay, context, mask).convert("RGB")
    draw = ImageDraw.Draw(context)
    draw.rectangle(region, outline=(255, 32, 32), width=max(4, image.size[0] // 120))
    short_id = str(track.get("stable_object_id") or track.get("object_uid")).rsplit("-", 1)[-1]
    draw.text((max(2, region[0] + 4), max(2, region[1] + 4)), short_id, fill=(255, 32, 32))
    return context


def attach_source_video_diagnostics(video_path: str | None, tracks: list[dict]) -> dict:
    if not video_path:
        return {"status": "source video not provided"}
    frame_numbers: set[int] = set()
    endpoint_by_object: dict[str, tuple[dict | None, dict | None]] = {}
    crop_picks_by_object: dict[str, list[dict]] = {}
    for track in tracks:
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        observations = _diagnostic_observations(track)
        start = observations[0] if observations else None
        end = observations[-1] if observations else None
        endpoint_by_object[object_id] = (start, end)
        crop_picks = _selected_multi_crop_observations(track)
        crop_picks_by_object[object_id] = crop_picks
        for item in observations:
            if item and item.get("frame") is not None:
                frame_numbers.add(int(_coerce_float(item.get("frame"))))
    if len(frame_numbers) > MOTION_MAX_FRAMES:
        return {"status": "too many diagnostic frames requested", "frames_requested": len(frame_numbers)}
    frame_total = _video_frame_total(video_path)
    if frame_total:
        frame_numbers.update(range(0, frame_total, 5))
    frames, video_meta = _read_video_frames(video_path, frame_numbers)
    transforms, motion_summary = _estimate_motion(frames)
    for track in tracks:
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        debug = track.setdefault("track_debug", {})
        fingerprints = []
        for item in crop_picks_by_object.get(object_id, []):
            frame_no = int(_coerce_float(item.get("frame")))
            frame_image = frames.get(frame_no)
            bbox = item.get("bbox")
            if frame_image is None or not isinstance(bbox, list):
                continue
            jpeg = _image_to_jpeg_bytes(frame_image)
            fingerprint = appearance_fingerprint_from_bytes(jpeg, bbox=bbox, padding_ratio=OBJECT_CROP_PADDING)
            if fingerprint:
                quality = _bbox_quality(bbox)
                fingerprint["source"] = "source_video_object_crop"
                fingerprint["frame"] = frame_no
                fingerprint["confidence"] = round(_coerce_float(item.get("confidence")), 4)
                fingerprint["quality_score"] = quality.get("score")
                fingerprint["bbox_quality"] = quality.get("reason")
                fingerprints.append(fingerprint)
        if fingerprints:
            debug["appearance_fingerprints"] = fingerprints
            debug["appearance_source"] = "source_video"
            debug["appearance_status"] = "source video object-only multi-crops"
        best_observation = max(crop_picks_by_object.get(object_id, []), key=lambda item: _coerce_float(item.get("confidence")), default=None)
        if best_observation:
            frame = frames.get(int(_coerce_float(best_observation.get("frame"))))
            bbox = best_observation.get("bbox")
            if frame is not None and isinstance(bbox, list):
                region = _bbox_to_pixels(bbox, *frame.size, padding_ratio=OBJECT_CROP_PADDING)
                if region:
                    track["_diagnostic_object_crop_bytes"] = _image_to_jpeg_bytes(frame.crop(region).resize((180, 180)))
                track["_diagnostic_context_frame_bytes"] = _image_to_jpeg_bytes(_draw_source_context(frame, track, best_observation))
                track["best_bbox_norm"] = bbox
                track["best_box"] = {"xyxy": bbox, "frame": best_observation.get("frame")}
        stabilized_path = []
        for observation in _diagnostic_observations(track):
            if not observation or not isinstance(observation.get("bbox"), list):
                continue
            frame_no = int(_coerce_float(observation.get("frame")))
            frame = frames.get(frame_no)
            transform = transforms.get(frame_no, {})
            if frame is None:
                continue
            center = _bbox_center(observation["bbox"], *frame.size)
            stabilized = _apply_affine(transform.get("matrix"), center)
            observation["camera_motion_status"] = transform.get("status")
            observation["camera_motion_response"] = transform.get("inliers")
            observation["camera_motion_reliable"] = transform.get("status") in {"ok", "reference"}
            if stabilized:
                observation["scene_center"] = _norm_center(stabilized, *frame.size)
                stabilized_path.append({
                    "frame": frame_no,
                    "timestamp": observation.get("timestamp"),
                    **observation["scene_center"],
                    "motion_status": transform.get("status"),
                    "motion_response": transform.get("inliers"),
                })
        debug["stabilized_track_path"] = stabilized_path
        for label, observation in (("start", endpoint_by_object[object_id][0]), ("end", endpoint_by_object[object_id][1])):
            if not observation or not isinstance(observation.get("bbox"), list):
                continue
            frame_no = int(_coerce_float(observation.get("frame")))
            frame = frames.get(frame_no)
            transform = transforms.get(frame_no, {})
            if frame is None:
                continue
            center = _bbox_center(observation["bbox"], *frame.size)
            stabilized = _apply_affine(transform.get("matrix"), center)
            debug.setdefault("stabilized_observations", []).append({
                "frame": frame_no,
                "endpoint": label,
                "raw_center": _norm_center(center, *frame.size),
                "scene_center": _norm_center(stabilized, *frame.size) if stabilized else None,
                "motion_status": transform.get("status"),
            })
            if stabilized:
                track[f"track_{label}_scene_center"] = _norm_center(stabilized, *frame.size)
        debug["camera_motion_status"] = motion_summary.get("status")
    return {"video": video_meta, "motion": motion_summary, "per_frame_motion": transforms}


def write_sanitized_fixture(path: str, tracks: list[dict], camera_motion: dict) -> None:
    track_fields = {
        "stable_object_id", "object_uid", "source_track_ids", "track_id", "category", "material_name",
        "confidence", "track_max_confidence", "track_avg_confidence", "track_first_frame", "track_last_frame",
        "track_first_timestamp", "track_last_timestamp", "track_duration_seconds", "track_frame_count",
        "track_start_center", "track_end_center", "track_start_scene_center", "track_end_scene_center",
        "track_avg_width", "track_avg_height", "track_avg_aspect_ratio", "track_hazard_status",
        "recyclable_status", "contaminant_status", "review_required", "review_status", "track_path",
        "best_box", "best_bbox_norm", "bbox_x", "bbox_y", "bbox_width", "bbox_height",
    }
    debug_fields = {
        "frame_observations", "class_votes", "raw_track_ids", "appearance_fingerprints",
        "stabilized_track_path", "stabilized_observations", "camera_motion_status",
        "representative_frame_dimensions", "representative_bbox_format", "human_verified",
    }
    sanitized = []
    for track in sorted(tracks, key=lambda item: str(item.get("stable_object_id") or item.get("object_uid"))):
        item = {key: _safe_json(value) for key, value in track.items() if key in track_fields}
        debug = track.get("track_debug") or {}
        item["track_debug"] = {key: _safe_json(value) for key, value in debug.items() if key in debug_fields}
        sanitized.append(item)
    payload = {
        "fixture_version": 1,
        "description": "Sanitized real MP4 reconciliation inputs; no image bytes, URLs, credentials, or database row IDs.",
        "camera_motion": _safe_json(camera_motion),
        "tracks": sanitized,
    }
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def attach_preview_appearance(scans: list[dict], tracks: list[dict]) -> dict[str, bytes]:
    scans_by_id = {str(scan.get("id")): scan for scan in scans}
    preview_bytes_by_scan: dict[str, bytes] = {}
    for track in tracks:
        scan_id = str(track.get("persisted_scan_id"))
        url, source = _preview_source(scans_by_id.get(scan_id, {}))
        content, status = _download_preview_bytes(url)
        debug = track.setdefault("track_debug", {})
        debug["appearance_source"] = source
        debug["appearance_status"] = status if content else status
        if not content:
            continue
        preview_bytes_by_scan[scan_id] = content
        bbox = _selected_bbox(track)
        if not bbox:
            debug["appearance_status"] = "object bbox missing"
            continue
        fingerprint = appearance_fingerprint_from_bytes(
            content,
            bbox=bbox,
            padding_ratio=OBJECT_CROP_PADDING,
            max_bytes=PREVIEW_MAX_BYTES,
        )
        if fingerprint:
            fingerprint["source"] = f"object_crop_{source}"
            debug["appearance_fingerprints"] = [fingerprint]
            debug["appearance_status"] = "appearance compared successfully"
        else:
            debug["appearance_status"] = "hash missing"
    return preview_bytes_by_scan


def _one_material_by_scan(materials: list[dict]) -> dict[str, dict]:
    rows = {}
    for material in materials:
        rows.setdefault(str(material.get("scan_result_id")), material)
    return rows


def rows_to_tracked_objects(scans: list[dict], materials: list[dict], decisions: list[dict]) -> list[dict]:
    materials_by_scan = _one_material_by_scan(materials)
    verified_scans = {str(item.get("scan_result_id")) for item in decisions if str(item.get("outcome") or "").lower() in {"confirmed", "verified"}}
    objects = []
    for scan in sorted(scans, key=lambda item: str(item.get("id"))):
        material = materials_by_scan.get(str(scan.get("id")))
        if not material:
            continue
        summary = scan.get("video_tracking_summary") if isinstance(scan.get("video_tracking_summary"), dict) else {}
        summary_objects = [item for item in summary.get("tracked_objects") or [] if isinstance(item, dict)]
        summary_track = summary_objects[0] if summary_objects else {}
        track = {**summary_track, **{key: value for key, value in material.items() if key != "id" and value is not None}}
        track["persisted_scan_id"] = str(scan.get("id"))
        track["persisted_material_id"] = str(material.get("id"))
        track["stable_object_id"] = track.get("stable_object_id") or track.get("object_uid") or str(scan.get("id"))
        track["object_uid"] = track.get("object_uid") or track["stable_object_id"]
        track["category"] = track.get("category") or material.get("material_name") or "unknown"
        track["confidence"] = _coerce_float(track.get("confidence") or scan.get("overall_confidence"))
        track.setdefault("track_debug", {})
        if str(scan.get("id")) in verified_scans or str(scan.get("review_status") or "").lower() == "verified":
            track["track_debug"]["human_verified"] = True
            track["review_status"] = "verified"
        objects.append(track)
    return objects


def load_batch(database: SupabaseExecutor, batch_id: str) -> tuple[list[dict], list[dict], list[dict], dict | None]:
    scans = database.execute(
        lambda client: client.table(SCAN_RESULTS_TABLE).select("*").eq("batch_id", batch_id).execute().data or []
    )
    scan_ids = [str(item.get("id")) for item in scans if item.get("id")]
    if not scan_ids:
        return [], [], [], None
    materials = database.execute(
        lambda client: client.table(DETECTED_MATERIALS_TABLE).select("*").in_("scan_result_id", scan_ids).execute().data or []
    )
    decisions = database.execute(
        lambda client: client.table(REVIEW_DECISIONS_TABLE).select("*").in_("scan_result_id", scan_ids).execute().data or []
    )
    job = database.execute(
        lambda client: client.table(JOBS_TABLE).select("*").eq("id", batch_id).maybe_single().execute().data
    )
    return scans, materials, decisions, job


def diagnostic_objects(tracks: list[dict]) -> list[dict]:
    rows = []
    for track in tracks:
        debug = track.get("track_debug") or {}
        observations = debug.get("frame_observations") or []
        best_box = track.get("best_box") if isinstance(track.get("best_box"), dict) else {}
        rows.append({
            "logical_object_id": track.get("stable_object_id") or track.get("object_uid"),
            "persisted_scan_id": track.get("persisted_scan_id"),
            "category": track.get("category"),
            "confidence": track.get("confidence"),
            "track_max_confidence": track.get("track_max_confidence"),
            "track_avg_confidence": track.get("track_avg_confidence"),
            "track_frame_count": track.get("track_frame_count"),
            "first_frame": track.get("track_first_frame"),
            "last_frame": track.get("track_last_frame"),
            "first_timestamp": track.get("track_first_timestamp"),
            "last_timestamp": track.get("track_last_timestamp"),
            "source_track_ids": track.get("source_track_ids"),
            "start_center": track.get("track_start_center"),
            "end_center": track.get("track_end_center"),
            "start_scene_center": track.get("track_start_scene_center"),
            "end_scene_center": track.get("track_end_scene_center"),
            "track_avg_width": track.get("track_avg_width"),
            "track_avg_height": track.get("track_avg_height"),
            "track_avg_aspect_ratio": track.get("track_avg_aspect_ratio"),
            "weighted_class_votes": debug.get("class_votes") or {},
            "representative_frame_index": best_box.get("frame") or (observations[0].get("frame") if observations else None),
            "representative_bbox": _selected_bbox(track),
            "review_status": track.get("review_status") or debug.get("review_status") or ("verified" if debug.get("human_verified") else None),
            "appearance_source": debug.get("appearance_source"),
            "appearance_status": debug.get("appearance_status") or ("comparison skipped" if not debug.get("appearance_fingerprints") else "appearance compared successfully"),
        })
    return rows


def _record_lookup(tracks: list[dict]) -> dict[str, dict]:
    lookup = {}
    for track in tracks:
        for value in (track.get("persisted_scan_id"), track.get("stable_object_id"), track.get("object_uid")):
            if value:
                lookup[str(value)] = track
    return lookup


def _load_group_map(path: str | None) -> list[list[str]]:
    if not path:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    groups = payload.get("groups") if isinstance(payload, dict) else payload
    if not isinstance(groups, list):
        raise SystemExit("group-map must be a list or {'groups': [...]} object.")
    parsed = []
    for group in groups:
        if not isinstance(group, list) or len(group) < 2:
            raise SystemExit("Each manual group must contain at least two IDs.")
        parsed.append([str(item) for item in group])
    return parsed


def apply_manual_groups(batch_id: str, tracks: list[dict], groups: list[list[str]]) -> tuple[list[dict], list[dict]]:
    if not groups:
        return tracks, []
    lookup = _record_lookup(tracks)
    used: set[str] = set()
    manual_reports = []
    replacements: dict[str, dict] = {}
    removed: set[str] = set()
    for index, group in enumerate(groups, start=1):
        members = []
        for item in group:
            if item not in lookup:
                raise SystemExit(f"group-map references unknown record: {item}")
            track = lookup[item]
            object_id = str(track.get("stable_object_id") or track.get("object_uid"))
            if object_id in used:
                raise SystemExit(f"group-map record appears in more than one group: {item}")
            used.add(object_id)
            members.append(track)
        merged = _merge_duplicate_group(members, [{
            "accepted": True,
            "final_reason": "manual confirmation",
            "object_ids": [str(item.get("stable_object_id") or item.get("object_uid")) for item in members],
        }])
        canonical_object_id = str(merged.get("stable_object_id") or merged.get("object_uid"))
        replacements[canonical_object_id] = merged
        removed.update(str(item.get("stable_object_id") or item.get("object_uid")) for item in members if str(item.get("stable_object_id") or item.get("object_uid")) != canonical_object_id)
        manual_reports.append({
            "duplicate_group_id": f"manual-group-{index:03d}",
            "logical_object_ids": [str(item.get("stable_object_id") or item.get("object_uid")) for item in members],
            "scan_ids": [str(item.get("persisted_scan_id")) for item in members],
            "categories": [item.get("category") for item in members],
            "confidence_values": [item.get("track_max_confidence") or item.get("confidence") for item in members],
            "frame_ranges": [[item.get("track_first_frame"), item.get("track_last_frame")] for item in members],
            "source_track_ids": [item.get("source_track_ids") for item in members],
            "selected_canonical_scan_id": merged.get("persisted_scan_id"),
            "discarded_scan_ids": [item.get("persisted_scan_id") for item in members if item.get("persisted_scan_id") != merged.get("persisted_scan_id")],
            "grouping_evidence": [{"accepted": True, "final_reason": "manual confirmation"}],
            "canonical_selection_reason": "verified > valid_preview > preview_quality > track_max_confidence > valid_observation_count > track_avg_confidence > stable_object_id",
        })
    output = []
    for track in tracks:
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        if object_id in removed:
            continue
        output.append(replacements.get(object_id, track))
    return output, manual_reports


def build_report(batch_id: str, scans: list[dict], materials: list[dict], decisions: list[dict], job: dict | None, *, dry_run: bool, group_map: str | None = None, source_video: str | None = None) -> tuple[dict, list[dict], dict[str, bytes]]:
    tracks = rows_to_tracked_objects(scans, materials, decisions)
    preview_bytes_by_scan = attach_preview_appearance(scans, tracks)
    camera_motion = attach_source_video_diagnostics(source_video, tracks)
    canonical, reconciliation = reconcile_duplicate_tracked_objects(tracks, batch_id, dry_run=dry_run)
    manual_groups = _load_group_map(group_map)
    if manual_groups:
        canonical, manual_reports = apply_manual_groups(batch_id, canonical, manual_groups)
    else:
        manual_reports = []
    scan_by_object = {str(track.get("stable_object_id") or track.get("object_uid")): track.get("persisted_scan_id") for track in tracks}
    groups = []
    for index, group in enumerate(reconciliation.get("confirmed_groups") or [], start=1):
        canonical_object = group.get("selected_canonical_object")
        object_ids = [str(item) for item in group.get("object_ids") or []]
        groups.append({
            "duplicate_group_id": f"group-{index:03d}",
            "scan_ids": [scan_by_object.get(item) for item in object_ids],
            "logical_object_ids": object_ids,
            "categories": group.get("categories"),
            "confidence_values": [
                next((track.get("track_max_confidence") or track.get("confidence") for track in tracks if str(track.get("stable_object_id") or track.get("object_uid")) == item), None)
                for item in object_ids
            ],
            "frame_ranges": [
                [
                    next((track.get("track_first_frame") for track in tracks if str(track.get("stable_object_id") or track.get("object_uid")) == item), None),
                    next((track.get("track_last_frame") for track in tracks if str(track.get("stable_object_id") or track.get("object_uid")) == item), None),
                ]
                for item in object_ids
            ],
            "source_track_ids": group.get("source_track_ids"),
            "selected_canonical_scan_id": scan_by_object.get(str(canonical_object)),
            "discarded_scan_ids": [scan_by_object.get(item) for item in object_ids if item != canonical_object],
            "grouping_evidence": group.get("evidence"),
            "canonical_selection_reason": "verified > valid_preview > preview_quality > track_max_confidence > valid_observation_count > track_avg_confidence > stable_object_id",
        })
    report = {
        "batch_id": batch_id,
        "dry_run": dry_run,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "database_rows_read": {"scan_results": len(scans), "detected_materials": len(materials), "scan_review_decisions": len(decisions)},
        "job_summary": _safe_json((job or {}).get("result_summary") or {}),
        "camera_motion_diagnostics": _safe_json(camera_motion),
        "diagnostic_objects": diagnostic_objects(tracks),
        "duplicate_groups": groups + manual_reports,
        "automatic_duplicate_groups": groups,
        "manual_duplicate_groups": manual_reports,
        "rejected_candidates": reconciliation.get("rejected_candidates") or [],
        "summary_before": _video_tracking_summary(tracks),
        "summary_after": _video_tracking_summary(canonical),
    }
    return report, canonical, preview_bytes_by_scan


def write_evidence_csv(path: str, report: dict) -> None:
    fields = [
        "decision", "final_reason", "object_ids", "scan_ids", "categories", "source_track_ids",
        "appearance_score", "appearance_status", "simultaneously_visible", "overlap_frames",
        "overlapping_frame_iou_max", "overlapping_frame_iou_avg", "raw_trajectory_distance",
        "stabilized_trajectory_distance", "stabilized_coordinates_used", "trajectory_distance",
        "iou", "size_ratio", "aspect_ratio", "class_vote_similarity", "canonical_scan_id",
    ]
    scan_by_object = {
        str(item.get("logical_object_id")): item.get("persisted_scan_id")
        for item in report.get("diagnostic_objects") or []
    }
    rows = []
    for group in report.get("duplicate_groups") or []:
        for evidence in group.get("grouping_evidence") or []:
            rows.append((evidence, "merge", group.get("selected_canonical_scan_id")))
    for evidence in report.get("rejected_candidates") or []:
        rows.append((evidence, "separate", None))
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for evidence, decision, canonical_scan_id in rows:
            object_ids = [str(item) for item in evidence.get("object_ids") or []]
            overlap_iou = evidence.get("overlapping_frame_iou") or {}
            writer.writerow({
                "decision": decision,
                "final_reason": evidence.get("final_reason"),
                "object_ids": " | ".join(object_ids),
                "scan_ids": " | ".join(str(scan_by_object.get(item)) for item in object_ids),
                "categories": " | ".join(str(item) for item in evidence.get("categories") or []),
                "source_track_ids": json.dumps(evidence.get("source_track_ids") or []),
                "appearance_score": evidence.get("appearance_score"),
                "appearance_status": evidence.get("appearance_status"),
                "simultaneously_visible": evidence.get("simultaneously_visible"),
                "overlap_frames": evidence.get("overlap_frames"),
                "overlapping_frame_iou_max": overlap_iou.get("max"),
                "overlapping_frame_iou_avg": overlap_iou.get("avg"),
                "raw_trajectory_distance": evidence.get("raw_trajectory_distance"),
                "stabilized_trajectory_distance": evidence.get("stabilized_trajectory_distance"),
                "stabilized_coordinates_used": evidence.get("stabilized_coordinates_used"),
                "trajectory_distance": evidence.get("trajectory_distance"),
                "iou": evidence.get("iou"),
                "size_ratio": evidence.get("size_ratio"),
                "aspect_ratio": evidence.get("aspect_ratio"),
                "class_vote_similarity": evidence.get("class_vote_similarity"),
                "canonical_scan_id": canonical_scan_id,
            })


def write_grouped_contact_sheet(path: str, report: dict, tracks: list[dict], preview_bytes_by_scan: dict[str, bytes]) -> None:
    object_to_group: dict[str, str] = {}
    for index, group in enumerate(report.get("duplicate_groups") or [], start=1):
        for object_id in group.get("logical_object_ids") or []:
            object_to_group[str(object_id)] = f"cluster-{index:03d}"
    next_group = len(report.get("duplicate_groups") or []) + 1
    for track in tracks:
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        if object_id not in object_to_group:
            object_to_group[object_id] = f"cluster-{next_group:03d}"
            next_group += 1
    ordered = sorted(tracks, key=lambda item: (object_to_group[str(item.get("stable_object_id") or item.get("object_uid"))], str(item.get("stable_object_id") or item.get("object_uid"))))
    tile_w, tile_h = 360, 285
    cols = 2
    rows = max(1, math.ceil(len(ordered) / cols))
    sheet = Image.new("RGB", (tile_w * cols, tile_h * rows), "white")
    draw = ImageDraw.Draw(sheet)
    for index, track in enumerate(ordered):
        x = (index % cols) * tile_w
        y = (index // cols) * tile_h
        scan_id = str(track.get("persisted_scan_id"))
        crop = _object_crop_image(preview_bytes_by_scan.get(scan_id), track)
        context = _context_image(preview_bytes_by_scan.get(scan_id), track)
        if crop:
            crop.thumbnail((150, 135))
            sheet.paste(crop, (x + 10, y + 28))
        if context:
            context.thumbnail((180, 135))
            sheet.paste(context, (x + 170, y + 28))
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        bbox = _selected_bbox(track)
        lines = [
            f"{object_to_group[object_id]} {object_id.rsplit('-', 1)[-1]}",
            scan_id[:8],
            f"{track.get('category')} {float(track.get('confidence') or 0):.4f}",
            f"tracks {','.join(str(item) for item in track.get('source_track_ids') or [])}",
            f"frames {track.get('track_first_frame')}-{track.get('track_last_frame')}",
            f"bbox {','.join(f'{_coerce_float(value):.3f}' for value in (bbox or []))}",
        ]
        for line_index, line in enumerate(lines):
            draw.text((x + 10, y + 170 + (line_index * 16)), line[:55], fill=(0, 0, 0))
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)


def write_contact_sheet(path: str, mapping_path: str, tracks: list[dict], preview_bytes_by_scan: dict[str, bytes], *, mode: str) -> None:
    tile_w, tile_h = 340, 300
    cols = 3
    rows = max(1, (len(tracks) + cols - 1) // cols)
    sheet = Image.new("RGB", (tile_w * cols, tile_h * rows), "white")
    draw = ImageDraw.Draw(sheet)
    mapping = []
    for index, track in enumerate(tracks):
        x = (index % cols) * tile_w
        y = (index // cols) * tile_h
        scan_id = str(track.get("persisted_scan_id"))
        content = preview_bytes_by_scan.get(scan_id)
        image = _object_crop_image(content, track) if mode == "object" else _context_image(content, track)
        if image:
            image.thumbnail((tile_w - 20, 165))
            sheet.paste(image, (x + 10, y + 10))
        label_y = y + 182
        object_id = str(track.get("stable_object_id") or track.get("object_uid"))
        bbox = _selected_bbox(track)
        lines = [
            object_id.rsplit("-", 1)[-1],
            scan_id[:8],
            f"{track.get('category')} {float(track.get('confidence') or 0):.4f}",
            f"tracks {','.join(str(item) for item in track.get('source_track_ids') or [])}",
            f"frames {track.get('track_first_frame')}-{track.get('track_last_frame')}",
            f"bbox {','.join(f'{_coerce_float(value):.3f}' for value in (bbox or []))}",
        ]
        for line in lines:
            draw.text((x + 10, label_y), line[:48], fill=(0, 0, 0))
            label_y += 16
        mapping.append({
            "tile": index + 1,
            "sheet_mode": mode,
            "logical_object_id": object_id,
            "scan_id": scan_id,
            "category": track.get("category"),
            "confidence": track.get("confidence"),
            "source_track_ids": track.get("source_track_ids"),
            "frame_range": [track.get("track_first_frame"), track.get("track_last_frame")],
            "representative_bbox": bbox,
        })
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)
    Path(mapping_path).write_text(json.dumps(mapping, indent=2, sort_keys=True), encoding="utf-8")


def write_contact_sheets(context_path: str | None, object_path: str | None, mapping_path: str | None, tracks: list[dict], preview_bytes_by_scan: dict[str, bytes]) -> None:
    if context_path:
        context_mapping = mapping_path or str(Path(context_path).with_suffix(".json"))
        write_contact_sheet(context_path, context_mapping, tracks, preview_bytes_by_scan, mode="context")
    if object_path:
        object_mapping = mapping_path or str(Path(object_path).with_suffix(".json"))
        if context_path and mapping_path:
            object_mapping = str(Path(mapping_path).with_name(f"{Path(mapping_path).stem}-object.json"))
        write_contact_sheet(object_path, object_mapping, tracks, preview_bytes_by_scan, mode="object")


def apply_groups(database: SupabaseExecutor, batch_id: str, report: dict, canonical_tracks: list[dict], backup_path: Path) -> None:
    backup_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    canonical_by_scan = {track.get("persisted_scan_id"): track for track in canonical_tracks if track.get("persisted_scan_id")}
    for group in report.get("duplicate_groups") or []:
        canonical_scan_id = group["selected_canonical_scan_id"]
        discarded_scan_ids = [item for item in group.get("discarded_scan_ids") or [] if item]
        canonical_track = canonical_by_scan.get(canonical_scan_id)
        if not canonical_scan_id or not discarded_scan_ids or not canonical_track:
            continue
        material_id = canonical_track.get("persisted_material_id")
        material_update = {
            key: value
            for key, value in canonical_track.items()
            if key in {
                "material_name", "category", "confidence", "recyclable_status", "contaminant_status",
                "bbox_x", "bbox_y", "bbox_width", "bbox_height", "original_category",
            }
        }
        database.execute(lambda client: client.table(DETECTED_MATERIALS_TABLE).update(material_update).eq("id", material_id).execute().data or [])
        tracked_material = {key: value for key, value in canonical_track.items() if key not in {"persisted_scan_id", "persisted_material_id"}}
        object_summary = summarize([tracked_material])
        object_summary.update({
            "video_tracking_summary": {"tracked_objects": [tracked_material], "total_unique_objects": 1, "counts_by_class": {tracked_material["category"]: 1}},
            "total_unique_objects": 1,
        })
        database.execute(lambda client: client.table(SCAN_RESULTS_TABLE).update(object_summary).eq("id", canonical_scan_id).execute().data or [])
        database.execute(lambda client: client.table(REVIEW_DECISIONS_TABLE).update({"scan_result_id": canonical_scan_id, "detected_material_id": material_id}).in_("scan_result_id", discarded_scan_ids).execute().data or [])
        database.execute(lambda client: client.table(DETECTED_MATERIALS_TABLE).delete().in_("scan_result_id", discarded_scan_ids).execute().data or [])
        database.execute(lambda client: client.table(SCAN_RESULTS_TABLE).delete().in_("id", discarded_scan_ids).eq("batch_id", batch_id).execute().data or [])
    remaining = database.execute(lambda client: client.table(SCAN_RESULTS_TABLE).select("id").eq("batch_id", batch_id).execute().data or [])
    scan_ids = [str(item.get("id")) for item in remaining if item.get("id")]
    database.execute(
        lambda client: client.table(JOBS_TABLE).update({
            "scan_ids": scan_ids,
            "result_summary": report.get("summary_after"),
            "processed_count": len(scan_ids),
            "total_count": len(scan_ids),
        }).eq("id", batch_id).execute().data or []
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Dry-run or apply tracked-video duplicate cleanup for one batch.")
    parser.add_argument("--batch-id", required=True)
    parser.add_argument("--dry-run", action="store_true", default=False)
    parser.add_argument("--apply", action="store_true", default=False)
    parser.add_argument("--group-map")
    parser.add_argument("--contact-sheet")
    parser.add_argument("--object-contact-sheet")
    parser.add_argument("--context-contact-sheet")
    parser.add_argument("--contact-sheet-mapping")
    parser.add_argument("--source-video")
    parser.add_argument("--grouped-contact-sheet")
    parser.add_argument("--evidence-csv")
    parser.add_argument("--fixture-output")
    parser.add_argument("--output-report", required=True)
    args = parser.parse_args()
    UUID(args.batch_id)
    if args.apply and args.dry_run:
        raise SystemExit("Choose either --dry-run or --apply.")
    dry_run = not args.apply
    if args.apply and not args.batch_id:
        raise SystemExit("--apply requires exactly one --batch-id.")
    database = SupabaseExecutor(client_factory=_new_supabase_client)
    scans, materials, decisions, job = load_batch(database, args.batch_id)
    report, canonical, preview_bytes_by_scan = build_report(
        args.batch_id,
        scans,
        materials,
        decisions,
        job,
        dry_run=dry_run,
        group_map=args.group_map,
        source_video=args.source_video,
    )
    output_path = Path(args.output_report)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    if args.apply:
        backup_path = output_path.with_suffix(output_path.suffix + ".backup.json")
        apply_groups(database, args.batch_id, report, canonical, backup_path)
    object_contact_sheet = args.object_contact_sheet or args.contact_sheet
    if object_contact_sheet or args.context_contact_sheet or args.fixture_output:
        diagnostic_tracks = rows_to_tracked_objects(scans, materials, decisions)
        diagnostic_motion = attach_source_video_diagnostics(args.source_video, diagnostic_tracks)
        if args.fixture_output:
            write_sanitized_fixture(args.fixture_output, diagnostic_tracks, diagnostic_motion)
        if object_contact_sheet or args.context_contact_sheet:
            write_contact_sheets(
                args.context_contact_sheet,
                object_contact_sheet,
                args.contact_sheet_mapping,
                diagnostic_tracks,
                preview_bytes_by_scan,
            )
            if args.grouped_contact_sheet:
                write_grouped_contact_sheet(args.grouped_contact_sheet, report, diagnostic_tracks, preview_bytes_by_scan)
    if args.evidence_csv:
        write_evidence_csv(args.evidence_csv, report)
    print(json.dumps({
        "batch_id": args.batch_id,
        "dry_run": dry_run,
        "report": str(output_path),
        "scan_results_read": len(scans),
        "duplicate_groups": len(report.get("duplicate_groups") or []),
        "summary_after_total_unique_objects": report["summary_after"]["total_unique_objects"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
