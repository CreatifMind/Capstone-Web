# Model freeze record

**This is the single source of truth for which model we shipped.** Every other document —
report, handover, presentation — cites this file rather than restating a path or a score.
Anything inconsistent with this page is wrong by definition.

The freeze has **two tiers**, and the distinction is the whole reason we can hand over on
22 July without giving up the remaining GPU time before Mock 3 (5 August):

- The **contract** is what the web team writes code against — letterboxing, class-ID mapping,
  box decoding. Changing it makes them redo work. It is frozen permanently.
- The **weights** are a file they load. Replacing it costs them a file copy and nothing else.
  It stays provisional until a hard cut-off.

---

## Tier 1 — frozen permanently (changing any row breaks the web team's code)

| field | value |
|---|---|
| classes | 9, fixed order — `0 plastic, 1 paper, 2 cardboard, 3 metal, 4 glass, 5 textile, 6 food_organic, 7 battery, 8 general_trash` |
| authoritative class source | `baseline_45k_dataset_v2/data.yaml`; machine-readable copy `handoff/results/classes.json` |
| input size | 640 × 640 |
| architecture family | YOLOv8m-seg |
| `output0` shape | `(1, 45, 8400)` — 4 box + 9 class scores + 32 mask coefficients |
| `output1` shape | `(1, 32, 160, 160)` — mask prototypes |
| preprocessing | letterbox to 640 (pad grey 114), RGB, ÷255, NCHW |

## Tier 2 — provisional until Friday 31 July 2026

| field | value |
|---|---|
| run name | `v3_ffremask_9cls` |
| epochs | 40 |
| checkpoint | `runs/segment/runs/v3_ffremask_9cls/weights/best.pt` |
| checkpoint sha256 | `eccad1ada346dbc6959608ca0e42f1eaf6ad61034900910127871844b1a7a6cd` |
| exported model | `runs/segment/runs/v3_ffremask_9cls/weights/best.onnx` |
| ONNX sha256 | `9dc80d62c76f43326ea217b00e97441a2a9b4740a26ff1c930c237ba7626bb6b` |
| ONNX size | 54.6 MB (52.1 MiB), fp16 |
| confidence threshold | 0.32 (product choice, overrulable — see `WEB_TEAM_HANDOVER.md` §4) |
| NMS IoU | 0.7 |
| handed over | 22 July 2026 |

## Swap protocol

A replacement `.onnx` may be sent to the web team **once**, and only if all of these hold:

1. Every Tier 1 row is **unchanged**. If any changed, it is not a swap — it is a new integration,
   and there is no time for one.
2. It **clearly** beats 0.585 box mAP@0.5 on the same evaluation it is compared against. A
   marginal win is not a win; six axes have now been closed and none moved the score by more
   than 0.006.
3. It has been exported, numerically parity-checked (`export_onnx.py --verify_n 30`) and
   `sha256sum`-ed, with the Tier 2 table above updated **in the same commit**.

**No swap after Friday 31 July 2026** — five days before Mock 3 on Wednesday 5 August —
regardless of what any run says afterwards. A better model that arrives on 4 August is worse than
a slightly weaker one the web team has already integrated and tested.

> Earlier versions of this file said "Friday 1 August". **1 August 2026 is a Saturday** — caught
> by the web team on 22 July. The deadline is the Friday, 31 July. Every document has been
> corrected; if you are holding a copy that says 1 August, it is stale.

**Training augmentation** (from `runs/segment/runs/v3_ffremask_9cls/args.yaml`, verified rather
than assumed): `scale: 0.5`, `mosaic: 1.0`, `copy_paste: 0.3`, `degrees: 0.0`, `mixup: 0.0`.

## Export command

```
python export_onnx.py --weights runs/segment/runs/v3_ffremask_9cls/weights/best.pt --verify_n 30
```

Environment: Ultralytics 8.4.86, torch 2.7.1+cu118, onnx 1.22.0 (opset 12, onnxslim 0.1.94),
ONNX Runtime 1.23.2.

## Scores

Ultralytics validation, leak-safe split (8,453 images / 27,596 instances):

| metric | value |
|---|---|
| box mAP@0.5 | **0.585** |
| mask mAP@0.5 | 0.544 |
| box mAP@0.5:0.95 | 0.465 |
| mask mAP@0.5:0.95 | 0.380 |

Own diagnostic (`diag_missed.py`, greedy per-class matching at IoU ≥ 0.5, 2,000 images,
conf 0.25, job 4359) — a different tool answering a different question, do not mix with the
above: **precision 0.564, recall 0.522**.

Per-class figures: `handoff/results/per_class_results.csv` (authoritative — cite this, not a
memo that transcribed it).

## fp16 parity — verified, 21 July

Full output: `onnx_parity_v3_ffremask_9cls.txt` (HPC working directory).

```
detections: pytorch 166, onnx 166  (matched 166)
images with a differing detection count: 0/30
worst confidence delta on a matched pair: 0.0031
worst box IoU on a matched pair:          0.9832
OK  parity within tolerance (unmatched 0.0%)
```

Reproduced identically across two consecutive runs. **fp16 costs nothing measurable** — ship it
rather than the 100 MB fp32 build.

> **Correction to the record.** `WEB_TEAM_HANDOVER.md:36-41` previously claimed fp16 was
> "verified against the original" by jobs 4349/4350. No log or output for either job exists
> anywhere in the repo, and the training conda env did not even have `onnx` installed, so
> nothing in that environment could have produced the claim. It has now been established
> properly, by the run above. The earlier citation should not be repeated.

## Why this model, and not a newer one

`final_integration` is **newer, larger and trained far longer** — YOLOv8l-seg, 960 px, 100
epochs, 31 GPU-hours — and scores **0.555** against this model's 0.585. All nine classes dropped
near-uniformly.

Its −0.030 is **not attributable to a single cause**: model size, resolution, epochs, loss
weights and augmentation all changed together. `boxdfl_high` later ruled out the loss weights
alone (0.579). Do not describe that regression as diagnosed.

Resolution was independently closed (jobs 4319/4320): 960 px with 2.5× the epochs moved
small-object recall by +0.005, and 1280 px was **worse**. So 640 px is both better *and* the
fastest option in a browser — no trade-off.

Best of roughly fourteen measured runs.

## Contract with the web team

See **Tier 1** above — that table *is* the contract. Every row must hold for a future `.onnx` to
be a drop-in replacement; changing any of them forces the web team to redo preprocessing.

## Known-stale artifacts — do not ship

- `serve/weights/best.onnx` — exported 16 July from the **13 July** checkpoint, **not** this
  model. Byte-size is nearly identical (both are fp16 640 px YOLOv8m-seg exports), so nothing
  about it looks wrong. It also shipped inside `waste-api-handoff.zip`. **Check the sha256
  against the table above before trusting any `.onnx` you find** — that is the only reliable way
  to tell the two apart.
- `serve/weights/best.pt` — the 13 July checkpoint itself.
- Any score in the 0.78–0.81 range. Those were measured against unremasked full-frame labels and
  are quarantined (`handoff/status_pack/STATUS.md:15-17`).
