# MP4 Physical-Object Reconciliation Report

Batch: `aa894e58-e4d8-446a-a5f0-69b0600d03a1`

Status: local implementation and dry-run only. No deployment, no production Supabase writes, no cleanup `--apply`.

## Root Cause

The MP4 pipeline could promote tracker fragments into final logical objects when ByteTrack changed IDs, briefly lost an item, or classified the same physical item differently later. Earlier duplicate checks leaned too much on full-preview evidence and raw frame coordinates, so panning video and context-heavy previews could create both false splits and unsafe merge pressure.

The concrete bug was not "object-0007 through object-0011 are one group". They are candidates that must be judged per physical item. The new logic only merges pairs with object-only crop evidence plus track, box, time, trajectory, size, and class compatibility.

## New Pipeline

1. Frame detections are enriched with camera-motion diagnostics and stabilized scene centers.
2. Track aggregation keeps raw observations, stabilized path, source track IDs, representative boxes, object-only appearance fingerprints, and preview-quality signals.
3. First-pass track-fragment merging remains conservative.
4. Physical-object reconciliation builds a deterministic pairwise association graph.
5. Hard blockers reject unsafe edges before clustering.
6. Accepted edges form deterministic union-find components.
7. Components are validated pairwise and split if any internal hard blocker exists.
8. A canonical record and representative preview box are selected for each final physical cluster.
9. Persistence asserts every row was physically reconciled before writing.

## Main Files

- `backend/main.py`
  - `VIDEO_PHYSICAL_RECONCILIATION_DEFAULTS`
  - `VideoCameraMotionState`
  - `attach_camera_motion_to_detections`
  - `reconcile_duplicate_tracked_objects`
  - `_validated_physical_components`
  - `_merge_two_tracks`
  - `_persist_tracked_video_objects`
- `backend/deduplicate_tracked_video_results.py`
  - Dry-run diagnostics, object-only crops, context sheets, grouped sheet, evidence CSV.
- `backend/video_reconciliation_validation.py`
  - Local synthetic MP4 validation set and manifest/report generator.
- `backend/test_video_tracking.py`
  - 49 regression tests for tracking, reconciliation, hard blockers, exact real fixture, dry-run behavior, and persistence invariant.
- `backend/test_annotated_video.py`
  - Fixture updates for the reconciliation-completed persistence contract.

## Evidence Rules

Positive duplicate evidence can use:

- source track IDs and track history;
- bounding-box location and IoU;
- raw and stabilized trajectory continuity;
- temporal gap or brief ID-switch overlap;
- object-only crop appearance only;
- size and aspect-ratio compatibility;
- class-vote compatibility, with allowance for class changes only when spatial, trajectory, and appearance evidence is strong.

Hard blockers:

- meaningful simultaneous visibility with separate low-overlap boxes;
- two stable coexisting tracks;
- sustained low IoU and large stabilized distance;
- trajectory discontinuity;
- strong appearance mismatch;
- incompatible size/aspect unless a partial edge fragment is strongly supported;
- invalid camera transform as evidence;
- full-frame/background similarity as positive evidence.

## Canonical Selection

Canonical priority:

1. human-verified record;
2. valid representative preview;
3. stronger preview-quality tier;
4. highest `track_max_confidence`;
5. highest valid-observation count;
6. highest `track_avg_confidence`;
7. deterministic stable ID.

Representative preview selection is separate from canonical ID selection, so a bad full-frame bbox does not win just because its confidence is high.

## Config Defaults

Documented defaults live in `VIDEO_PHYSICAL_RECONCILIATION_DEFAULTS`:

- `VIDEO_DUPLICATE_CENTER_DISTANCE=0.18`
- `VIDEO_DUPLICATE_STRONG_CENTER_DISTANCE=0.12`
- `VIDEO_DUPLICATE_IOU=0.08`
- `VIDEO_DUPLICATE_OVERLAP_IOU=0.30`
- `VIDEO_DUPLICATE_MAX_GAP=90`
- `VIDEO_DUPLICATE_MAX_OVERLAP_FRAMES=5`
- `VIDEO_DUPLICATE_MEANINGFUL_OVERLAP_FRAMES=12`
- `VIDEO_DUPLICATE_STRONG_OVERLAP_IOU=0.90`
- `VIDEO_DUPLICATE_HANDOVER_MEDIAN_IOU=0.80`
- `VIDEO_DUPLICATE_STRONG_OVERLAP_MAX_FRAMES=10`
- `VIDEO_DUPLICATE_SIZE_RATIO=0.65`
- `VIDEO_DUPLICATE_STRONG_SIZE_RATIO=0.70`
- `VIDEO_DUPLICATE_APPEARANCE_SIMILARITY=0.82`
- `VIDEO_DUPLICATE_MIN_APPEARANCE_SIMILARITY=0.45`
- `VIDEO_DUPLICATE_STABLE_TRACK_FRAMES=18`
- `VIDEO_DUPLICATE_MIN_OBSERVATION_CONFIDENCE=0.25`
- `VIDEO_DUPLICATE_MIN_RELIABLE_OBSERVATIONS=3`
- `VIDEO_DUPLICATE_WEAK_FRAGMENT_MAX_GAP=18`
- `VIDEO_DUPLICATE_APPEARANCE_FRAGMENT_MAX_GAP=30`
- `VIDEO_DUPLICATE_FULL_FRAME_AREA=0.70`
- `VIDEO_DUPLICATE_TRUNCATED_EDGE_MARGIN=0.015`
- `VIDEO_CAMERA_MOTION_MIN_RESPONSE=0.03`

## Known Batch Dry Run

Dry-run report: `output/dedupe-aa894e58-complete-dry-run-report.json`

Contact sheets:

- Object-only crops: `output/dedupe-aa894e58-complete-object-crops-contact-sheet.jpg`
- Context frames: `output/dedupe-aa894e58-complete-context-contact-sheet.jpg`
- Grouped context/crop sheet: `output/dedupe-aa894e58-complete-grouped-contact-sheet.jpg`
- Evidence CSV: `output/dedupe-aa894e58-complete-evidence.csv`
- Sanitized fixture: `backend/fixtures/video_reconciliation/aa894e58_tracks.json`

Counts:

- Before: 11 final tracked objects.
- After dry run: 5 final physical-object clusters.
- Reconciled duplicate fragments: 6.
- Accepted physical-object groups: 4 plus one singleton.

Exact physical-object clusters:

- `0001 + 0003 + 0005`; canonical `0003`.
- `0002`; singleton canonical `0002`.
- `0004 + 0006 + 0009`; canonical `0006`.
- `0008 + 0010`; canonical `0008`.
- `0007 + 0011`; canonical `0007`.

The real fixture calls the production reconciler and asserts these exact order-independent components, not only the count.

## Regression Coverage

Unit tests cover:

- five distinct stationary objects remain five;
- one stationary object with multiple track IDs becomes one;
- two nearby objects with the same category remain separate;
- full-frame visual similarity cannot merge different boxes;
- object-only crop similarity plus matching trajectory can merge fragments;
- simultaneous low-IoU boxes remain separate;
- camera-panning stationary fragments merge by stabilized scene position;
- crossing paths remain separate;
- brief visual overlap without handover evidence remains separate;
- bad full-frame previews lose to valid representative object previews;
- partial edge fragments merge only when other evidence agrees;
- persistence receives only final physical clusters.

Local synthetic MP4 validation passed 12 scenarios, including broad/edge fragments, bridge clustering, camera pan/shake, scale change, occlusion, same-category neighbors, class change, multiple simultaneous objects, and crossing paths.

- `static_one_object.mp4`: raw 1, first pass 1, final 1, expected 1.
- `occlusion_id_switch.mp4`: raw 2, first pass 1, final 1, expected 1.
- `panning_stationary.mp4`: raw 2, first pass 2, final 1, expected 1.
- `camera_shake.mp4`: raw 2, first pass 2, final 1, expected 1.
- `scale_change.mp4`: raw 2, first pass 1, final 1, expected 1.
- `near_full_frame_fragment.mp4`: raw 2, final 1, expected 1.
- `edge_truncated_fragment.mp4`: raw 2, final 1, expected 1.
- `bridge_fragment.mp4`: raw 3, final 1, expected 1.
- `five_stationary_objects.mp4`: raw 5, first pass 5, final 5, expected 5.
- `same_category_nearby.mp4`: raw 2, first pass 2, final 2, expected 2.
- `class_change.mp4`: raw 2, first pass 2, final 1, expected 1.
- `crossing_paths.mp4`: raw 2, first pass 2, final 2, expected 2.

Validation report: `output/video-reconciliation-validation/validation-report.json`

## Runtime And Memory

The reconciliation pass is `O(n^2)` over finalized logical objects per video, which is small compared with frame-level YOLO inference. Camera motion adds one phase-correlation estimate per frame. No image bytes are stored in DB metadata or logs; only numeric fingerprints and reconciliation diagnostics are retained.

Peak memory in the synthetic validation scenarios stayed under 46 KB for the reconciliation measurement. The real worker memory impact is bounded by existing track observations and compact appearance fingerprints, not full-frame caches.

## Remaining Risks

- Part-level model detections can still create false splits when boxes are bad, edge-truncated, or near full-frame.
- Similar neighboring objects that never coexist may remain hard to separate if trajectories and crops are also similar.
- Bad camera-motion transforms are ignored, which is safe for false merges but may keep some fragments split.

## Future Commands Not Run

Build image:

```bash
gcloud builds submit backend --project capstone-1-501600 --tag asia-southeast1-docker.pkg.dev/capstone-1-501600/purityloop/purityloop-worker:$(git rev-parse --short HEAD)
```

Update existing Cloud Run worker image, preserving current service settings:

```bash
gcloud run services update purityloop-worker --project capstone-1-501600 --region asia-southeast1 --image asia-southeast1-docker.pkg.dev/capstone-1-501600/purityloop/purityloop-worker:$(git rev-parse --short HEAD)
```

Rollback lookup:

```bash
gcloud run revisions list --service purityloop-worker --project capstone-1-501600 --region asia-southeast1 --sort-by='~metadata.creationTimestamp' --limit=5
```

Rollback traffic:

```bash
gcloud run services update-traffic purityloop-worker --project capstone-1-501600 --region asia-southeast1 --to-revisions PREVIOUS_REVISION=100
```

Cleanup command remains dry-run by default. Do not run with `--apply` until reviewed:

```bash
python3 backend/deduplicate_tracked_video_results.py --batch-id aa894e58-e4d8-446a-a5f0-69b0600d03a1 --dry-run --source-video output/dedupe-aa894e58-source.mp4
```
