"""Backfill tracked-video object preview images from stored annotated MP4s.

Usage:
    python3 -m backend.backfill_tracked_previews --scan-id <scan-id> --dry-run
    python3 -m backend.backfill_tracked_previews --batch-id <batch-id>

This command does not rerun YOLO. It updates only scan preview image metadata.
"""

from __future__ import annotations

import argparse
import tempfile
import urllib.request
from pathlib import Path

from . import main


def _scan_annotated_video_url(scan: dict) -> str | None:
    summary = scan.get("video_tracking_summary") if isinstance(scan.get("video_tracking_summary"), dict) else {}
    return scan.get("annotated_video_url") or summary.get("annotated_video_url")


def _scan_rows(database: main.SupabaseExecutor, scan_ids: list[str], batch_ids: list[str]) -> list[dict]:
    rows: list[dict] = []
    for scan_id in scan_ids:
        response = database.execute(
            lambda client, value=scan_id: client.table(main.SCAN_RESULTS_TABLE).select("*").eq("id", value).maybe_single().execute()
        )
        if response and response.data:
            rows.append(response.data)
    for batch_id in batch_ids:
        response = database.execute(
            lambda client, value=batch_id: client.table(main.SCAN_RESULTS_TABLE).select("*").eq("batch_id", value).eq("result_kind", "video_track_object").execute()
        )
        rows.extend(response.data or [])
    seen: set[str] = set()
    unique = []
    for row in rows:
        row_id = str(row.get("id") or "")
        if row_id and row_id not in seen:
            unique.append(row)
            seen.add(row_id)
    return unique


def _download(url: str, destination: Path) -> None:
    with urllib.request.urlopen(url, timeout=60) as response:
        destination.write_bytes(response.read())


def backfill(scan_ids: list[str], batch_ids: list[str], *, dry_run: bool = True) -> list[dict]:
    database = main.SupabaseExecutor(main.supabase)
    if not database.client:
        raise RuntimeError("Supabase backend env is not configured.")
    results = []
    for scan in _scan_rows(database, scan_ids, batch_ids):
        scan_id = str(scan.get("id"))
        materials = main._load_scan_materials(database, scan_id)
        material = materials[0] if materials else {}
        video_url = _scan_annotated_video_url(scan)
        if not material or not video_url:
            results.append({"scan_id": scan_id, "status": "unavailable"})
            continue
        if dry_run:
            results.append({"scan_id": scan_id, "status": "dry-run", "source": "annotated_video_frame"})
            continue
        with tempfile.TemporaryDirectory(prefix=f"purityloop-backfill-{scan_id}-") as tmp:
            video_path = Path(tmp) / "annotated.mp4"
            _download(video_url, video_path)
            fallback = main._extract_annotated_video_object_preview(video_path, material)
            if not fallback:
                results.append({"scan_id": scan_id, "status": "unavailable"})
                continue
            preview_bytes, _metadata = fallback
            storage_path = f"tracked-object-previews/{scan_id}/preview-v2.jpg"
            preview_path = Path(tmp) / "preview-v2.jpg"
            preview_path.write_bytes(preview_bytes)
            upload = main.upload_file_to_supabase_storage(
                preview_path,
                storage_path,
                "image/jpeg",
                database,
            )
            database.execute(
                lambda client, value=scan_id: client.table(main.SCAN_RESULTS_TABLE).update({
                    "preview_image_url": upload["public_url"],
                    "preview_upload_status": "uploaded",
                }).eq("id", value).execute()
            )
            results.append({"scan_id": scan_id, "status": "updated", "storage_path": storage_path})
    return results


def main_cli() -> None:
    parser = argparse.ArgumentParser(description="Backfill PurityLoop tracked-video object previews without rerunning inference.")
    parser.add_argument("--scan-id", action="append", default=[], help="Tracked-object scan_result id to update.")
    parser.add_argument("--batch-id", action="append", default=[], help="Video batch/job id whose tracked-object rows should be updated.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be updated without writing storage/database changes.")
    args = parser.parse_args()
    if not args.scan_id and not args.batch_id:
        parser.error("Provide at least one --scan-id or --batch-id.")
    for result in backfill(args.scan_id, args.batch_id, dry_run=args.dry_run):
        print(result)


if __name__ == "__main__":
    main_cli()
