# PurityLoop — web team package, 22 July 2026

**This replaces everything you received before today.** If your copy of the handover has no §0,
it is stale, and §4 in particular has since been reversed.

## What is in here

| file | what it is |
|---|---|
| `best.onnx` | the model, fp16, 640 px, 9 classes — the file you load |
| `WEB_TEAM_HANDOVER.md` | **start here.** Preprocessing, output format, postprocessing, honest limits |
| `MODEL_FREEZE.md` | which model this is, and what may or may not change before 31 July |
| `classes.json` | the nine class IDs, machine-readable |
| `onnx_parity_v3_ffremask_9cls.txt` | evidence the fp16 file matches the original |
| `LANDING_PAGE_SPEC.md` | wording and panel rules for the public demo page |

## The three things most likely to bite

1. **Letterboxing** (handover §2). Resize preserving aspect ratio and pad with grey 114 — do not
   stretch to square. Get this wrong and every box lands in the wrong place. Check it on day one,
   not the week of the demo.
2. **Confidence and IoU.** Ship `conf = 0.32`, `NMS IoU = 0.7`. One value each, hard-coded.
3. **Verify the file you are holding.** `sha256sum best.onnx` must give
   `9dc80d62c76f43326ea217b00e97441a2a9b4740a26ff1c930c237ba7626bb6b`. An older, wrong export of
   a different checkpoint is nearly the same size and looks identical — the hash is the only way
   to tell them apart, and it already reached one person by mistake.

## The model may be replaced once, before 31 July

If the remaining work produces a clearly better model, you get one new `.onnx` and a new hash.
Same classes, same input size, same outputs, same preprocessing — **a file swap, no code change**.
After **Friday 31 July** there is no swap, whatever we find. Build against this package and
treat any replacement as a bonus.

## Not included, deliberately

**Tiling and test-time augmentation.** Both improve accuracy and both need multiple forward
passes per image, which is not viable in a browser for a live demo. They are findings for the
report, not features for the product. Do not build around them.

## Questions

Ask Talvin before building around an assumption.
