from __future__ import annotations

import argparse
import json
import sys
import time
import tracemalloc
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.main import appearance_fingerprint_from_bytes, merge_track_fragments, reconcile_duplicate_tracked_objects


def _fingerprint(color: tuple[int, int, int]) -> dict:
    image = Image.new("RGB", (40, 40), color)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return appearance_fingerprint_from_bytes(buffer.getvalue(), bbox=[0, 0, 1, 1]) or {}


def _track(object_id: str, track_id: int, *, category: str = "plastic", first: int = 0, last: int = 12, x: float = 0.1, y: float = 0.1, scene_x: float | None = None, color: tuple[int, int, int] = (220, 40, 40)) -> dict:
    observations = []
    path = []
    scene_path = []
    for offset, frame in enumerate(range(first, last + 1)):
        current_x = x + offset * 0.002
        bbox = [round(current_x, 4), y, round(current_x + 0.1, 4), round(y + 0.1, 4)]
        observations.append({"frame": frame, "timestamp": frame / 10, "track_id": str(track_id), "category": category, "confidence": 0.82, "bbox": bbox})
        path.append({"frame": frame, "timestamp": frame / 10, "x": round(current_x + 0.05, 4), "y": round(y + 0.05, 4)})
        if scene_x is not None:
            scene_path.append({"frame": frame, "timestamp": frame / 10, "x": round(scene_x + 0.05, 4), "y": round(y + 0.05, 4)})
    track = {
        "stable_object_id": object_id,
        "object_uid": object_id,
        "source_track_ids": [str(track_id)],
        "track_id": str(track_id),
        "category": category,
        "material_name": category,
        "confidence": 0.82,
        "track_max_confidence": 0.82,
        "track_avg_confidence": 0.82,
        "track_first_frame": first,
        "track_last_frame": last,
        "track_first_timestamp": first / 10,
        "track_last_timestamp": last / 10,
        "track_frame_count": len(observations),
        "track_start_center": {"x": path[0]["x"], "y": path[0]["y"]},
        "track_end_center": {"x": path[-1]["x"], "y": path[-1]["y"]},
        "track_avg_width": 0.1,
        "track_avg_height": 0.1,
        "track_avg_aspect_ratio": 1.0,
        "track_hazard_status": "clear",
        "recyclable_status": "recyclable",
        "contaminant_status": "clean",
        "review_required": False,
        "track_path": path,
        "best_bbox_norm": observations[-1]["bbox"],
        "best_box": {"xyxy": observations[-1]["bbox"], "frame": observations[-1]["frame"]},
        "track_debug": {
            "frame_observations": observations,
            "class_votes": {category: round(0.82 * len(observations), 4)},
            "raw_track_ids": [str(track_id)],
            "appearance_fingerprints": [_fingerprint(color)],
        },
    }
    if scene_path:
        track["track_start_scene_center"] = {"x": scene_path[0]["x"], "y": scene_path[0]["y"]}
        track["track_end_scene_center"] = {"x": scene_path[-1]["x"], "y": scene_path[-1]["y"]}
        track["track_debug"]["stabilized_track_path"] = scene_path
    return track


def _write_mp4(path: Path, objects: int, *, frames: int = 24) -> None:
    try:
        import cv2
        import numpy as np
    except Exception:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 12, (160, 120))
    if not writer.isOpened():
        return
    colors = [(220, 40, 40), (40, 180, 80), (40, 80, 220), (220, 180, 40), (180, 40, 220)]
    for frame in range(frames):
        image = np.full((120, 160, 3), 245, dtype=np.uint8)
        for index in range(objects):
            x = 12 + index * 28 + (frame % 3)
            y = 35 + (index % 2) * 30
            cv2.rectangle(image, (x, y), (x + 18, y + 18), colors[index % len(colors)], -1)
        writer.write(image)
    writer.release()


def _scenarios(output_dir: Path) -> list[dict]:
    broad = _track("broad-0001", 1, first=0, last=8, x=0.1)
    broad["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
    clipped = _track("edge-0001", 1, first=0, last=8, x=0.01)
    clipped["best_bbox_norm"] = [0.0, 0.1, 0.08, 0.2]
    bridge_first = _track("bridge-0001", 1, first=0, last=8, x=0.1)
    bridge_first["best_bbox_norm"] = [0.0, 0.0, 1.0, 1.0]
    bridge_middle = _track("bridge-0002", 2, first=11, last=27, x=0.1)
    bridge_middle["best_bbox_norm"] = [0.0, 0.1, 0.08, 0.2]
    scale_first = _track("scale-0001", 1, first=0, last=8, x=0.1)
    scale_second = _track("scale-0002", 2, first=12, last=20, x=0.12)
    scale_second.update({"track_avg_width": 0.075, "track_avg_height": 0.075, "track_avg_aspect_ratio": 1.0})
    return [
        {
            "name": "static_one_object",
            "expected_physical_objects": 1,
            "tracks": [_track("static-one-0001", 1)],
            "expected_groups": [["static-one-0001"]],
            "notes": "single track stays single",
        },
        {
            "name": "occlusion_id_switch",
            "expected_physical_objects": 1,
            "tracks": [_track("occ-0001", 1, first=0, last=8, x=0.1), _track("occ-0002", 7, first=12, last=20, x=0.12)],
            "expected_groups": [["occ-0001", "occ-0002"]],
            "notes": "brief lost track resumes nearby",
        },
        {
            "name": "panning_stationary",
            "expected_physical_objects": 1,
            "tracks": [_track("pan-0001", 1, first=0, last=8, x=0.1, scene_x=0.2), _track("pan-0002", 2, first=12, last=20, x=0.55, scene_x=0.21)],
            "expected_groups": [["pan-0001", "pan-0002"]],
            "notes": "raw position shifts but stabilized position agrees",
        },
        {
            "name": "camera_shake",
            "expected_physical_objects": 1,
            "tracks": [_track("shake-0001", 1, first=0, last=8, x=0.08, scene_x=0.2), _track("shake-0002", 2, first=12, last=20, x=0.46, scene_x=0.205)],
            "expected_groups": [["shake-0001", "shake-0002"]],
            "notes": "large raw shake but reliable stabilized coordinates agree",
        },
        {
            "name": "scale_change",
            "expected_physical_objects": 1,
            "tracks": [scale_first, scale_second],
            "expected_groups": [["scale-0001", "scale-0002"]],
            "notes": "moderate camera scale change remains size-compatible",
        },
        {
            "name": "near_full_frame_fragment",
            "expected_physical_objects": 1,
            "tracks": [broad, _track("broad-0002", 2, first=11, last=20, x=0.11)],
            "expected_groups": [["broad-0001", "broad-0002"]],
            "notes": "near-full-frame fragment cannot force a false split",
        },
        {
            "name": "edge_truncated_fragment",
            "expected_physical_objects": 1,
            "tracks": [clipped, _track("edge-0002", 2, first=11, last=20, x=0.08)],
            "expected_groups": [["edge-0001", "edge-0002"]],
            "notes": "edge-clipped fragment joins category-consistent continuation",
        },
        {
            "name": "bridge_fragment",
            "expected_physical_objects": 1,
            "tracks": [bridge_first, bridge_middle, _track("bridge-0003", 3, first=30, last=38, x=0.1)],
            "expected_groups": [["bridge-0001", "bridge-0002", "bridge-0003"]],
            "notes": "A-B and B-C edges connect a component without A-C evidence",
        },
        {
            "name": "five_stationary_objects",
            "expected_physical_objects": 5,
            "tracks": [_track(f"five-{index:04d}", index, first=0, last=30, x=0.05 + index * 0.14) for index in range(1, 6)],
            "expected_groups": [[f"five-{index:04d}"] for index in range(1, 6)],
            "notes": "same-scene objects remain separate",
        },
        {
            "name": "same_category_nearby",
            "expected_physical_objects": 2,
            "tracks": [_track("near-0001", 1, first=0, last=25, x=0.1), _track("near-0002", 2, first=0, last=25, x=0.26)],
            "expected_groups": [["near-0001"], ["near-0002"]],
            "notes": "same category nearby but simultaneous",
        },
        {
            "name": "class_change",
            "expected_physical_objects": 1,
            "tracks": [_track("class-0001", 1, category="plastic", first=0, last=8, x=0.1), _track("class-0002", 2, category="cardboard", first=11, last=18, x=0.11)],
            "expected_groups": [["class-0001", "class-0002"]],
            "notes": "class changes but physical evidence agrees",
        },
        {
            "name": "crossing_paths",
            "expected_physical_objects": 2,
            "tracks": [_track("cross-0001", 1, first=0, last=30, x=0.1), _track("cross-0002", 2, first=0, last=30, x=0.52)],
            "expected_groups": [["cross-0001"], ["cross-0002"]],
            "notes": "coexisting tracks stay separate",
        },
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="output/video-reconciliation-validation")
    args = parser.parse_args()
    output_dir = Path(args.output_dir)
    rows = []
    for scenario in _scenarios(output_dir):
        video_path = output_dir / f"{scenario['name']}.mp4"
        _write_mp4(video_path, scenario["expected_physical_objects"])
        tracemalloc.start()
        started = time.perf_counter()
        raw_tracks = scenario["tracks"]
        source_ids_by_object = {
            item["stable_object_id"]: [str(value) for value in item.get("source_track_ids") or []]
            for item in raw_tracks
        }
        expected_groups = sorted(
            sorted(track_id for object_id in group for track_id in source_ids_by_object.get(object_id, []))
            for group in scenario["expected_groups"]
        )
        logical = merge_track_fragments([dict(item) for item in raw_tracks], scenario["name"])
        final, report = reconcile_duplicate_tracked_objects(logical, scenario["name"], dry_run=True)
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        final_groups = [
            sorted(str(track_id) for track_id in item.get("source_track_ids") or [])
            for item in final
        ]
        rows.append({
            "video": str(video_path),
            "notes": scenario["notes"],
            "expected_physical_objects": scenario["expected_physical_objects"],
            "raw_track_count": len(raw_tracks),
            "first_pass_logical_count": len(logical),
            "final_physical_cluster_count": len(final),
            "false_splits": max(0, len(final) - scenario["expected_physical_objects"]),
            "false_merges": max(0, scenario["expected_physical_objects"] - len(final)),
            "expected_groups": expected_groups,
            "actual_groups": sorted(final_groups),
            "passed": len(final) == scenario["expected_physical_objects"] and sorted(final_groups) == expected_groups,
            "processing_time_ms": round((time.perf_counter() - started) * 1000, 3),
            "peak_memory_bytes": peak,
            "association_reasons": [
                {
                    "object_ids": item.get("object_ids"),
                    "accepted": item.get("accepted"),
                    "reason": item.get("final_reason"),
                    "appearance_score": item.get("appearance_score"),
                    "trajectory_distance": item.get("trajectory_distance"),
                }
                for item in report.get("evaluated_candidates", [])
            ],
        })
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = [
        {"video": row["video"], "expected_physical_objects": row["expected_physical_objects"], "notes": row["notes"], "expected_groups": row["expected_groups"]}
        for row in rows
    ]
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    (output_dir / "validation-report.json").write_text(json.dumps({"scenarios": rows, "passed": all(row["passed"] for row in rows)}, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps({"output": str(output_dir / "validation-report.json"), "passed": all(row["passed"] for row in rows), "scenarios": len(rows)}, sort_keys=True))
    return 0 if all(row["passed"] for row in rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())
