# Web team handover — in-browser waste detection model

**22 July 2026. This supersedes every version of this document you received before today** —
if your copy does not have a §0, it is stale and §4 in particular has since been reversed.

Also supersedes the serving sections of `WEB_TEAM_SPEC.md` (§3 of that document describes a
FastAPI service that was never actually built — ignore it).

The model runs **in the user's browser** via ONNX Runtime Web. No server, no GPU, no hosting.

---

## 0. Model status — read before you plan your week

**Everything you write code against is final today. The weights file is not, and that costs you
nothing.**

Final, permanently — these are what your code depends on:

- 9 classes in a fixed order (§5, and `classes.json` in this package)
- 640 × 640 input, letterboxed (§2)
- output tensor shapes and layout (§3)
- the postprocessing recipe (§4)

Provisional until **Friday 31 July 2026**:

- the `.onnx` file itself
- the confidence number (§4)

We may send **one** replacement `.onnx` before 31 July if the remaining work produces a clearly
better model. If we do, it is a **file swap and nothing else** — same classes, same input size,
same outputs, same preprocessing. Drop it in, no code change. You will get a new sha256 with it;
check it against `MODEL_FREEZE.md` so you know which file you are holding.

**After 31 July there is no swap**, whatever we find. Build against what is in this package and
treat any replacement as a bonus, not a dependency.

---

## 1. The model file

**`best.onnx` is in this package** — fp16, 640 px, 9 classes, 52 MB. Verify it before building on
it:

```
sha256sum best.onnx
```

Must give `ff866a7c3154286de6bf5bef72984f584066eda1c9a1cc7643186a1a81fe3ff0`. A different,
**wrong** export of an older checkpoint is nearly the same size and looks identical — the hash is
the only way to tell them apart, and it has already reached someone by mistake.

*(Earlier versions of this section said the `.onnx` was not included and told you to export it
yourself. That was true when the file had to be pulled off the HPC by hand; it is not true of
this package. Corrected 22 July after the web team spotted the contradiction.)*

### If you ever need to re-export it

You should not need to — but for the record, on the HPC:

```
cd /home/project/26060803/model_training_chris/purityloop_v2_handoff
source /application/miniconda/25.7.0/etc/profile.d/conda.sh
conda activate /home/user/22067896/model_training_talvin

python export_onnx.py --weights runs/segment/runs/v3_ffremask_9cls/weights/best.pt --imgsz 640
```

It must print `9 classes`, then **two** `OK` lines:

```
OK  shapes match  (54.6 MB)
...
OK  parity within tolerance (unmatched 0.0%)
```

If either is missing, stop — the file will produce garbage in the browser. The second line is the
one that matters and is newer: the export script used to check tensor **shapes** only, which
catches a malformed file but would not catch a numerically wrong one. It now also compares the
actual detections against the PyTorch original.

**Export both precisions and test which one your runtime handles:**

| flag | size | notes |
|---|---|---|
| default (fp16) | ~52 MB | half the download; browser support varies by backend |
| `--no-half` | ~100 MB | universally supported, heavy page load |

Try fp16 first. If ONNX Runtime Web errors or produces nonsense, fall back to fp32. If 100 MB
is unacceptable for the page and fp16 does not work, tell us — int8 quantisation gets it to
~27 MB at some accuracy cost, but we would rather not spend accuracy unless we must.

**fp16 has been verified against the original — use it without concern.** We ran the PyTorch
checkpoint and the fp16 ONNX over the same images and compared the final post-processed
detections, object by object: **166 detections against 166, all matched, 0 of 30 images
differing in count**, worst confidence difference 0.0031, worst box overlap 0.9832. Reproduced
identically twice. Full output ships with this package as
`onnx_parity_v3_ffremask_9cls.txt`; the record of it is `MODEL_FREEZE.md`.

> **Retraction.** An earlier version of this section credited "jobs 4349 / 4350" for this check.
> Those jobs left no log or output anywhere in our repo, and the environment they supposedly ran
> in had no `onnx` package installed, so they cannot have produced the claim. We found this while
> preparing the handover and re-established the result properly, above. Do not cite the old
> version.

**Which checkpoint and why:** `v3_ffremask_9cls`, YOLOv8m-seg at 640px. It is our best model at
0.585 mAP@0.5. Do not substitute `final_integration` even though it is newer and larger — it
scores 0.555, and we have since confirmed that higher resolution does not help this dataset.
640px is also the fastest to run in a browser, so there is no trade-off here.

---

## 2. Input preprocessing

Get this wrong and the boxes land in the wrong places, which is the most common integration bug.

1. **Letterbox to 640×640** — resize preserving aspect ratio, pad the remainder (grey, value
   114, is what training used). Do **not** stretch to square.
2. **RGB** channel order, not BGR.
3. **Scale to 0–1** — divide pixel values by 255.
4. **NCHW layout** — shape `(1, 3, 640, 640)`, float32 (or float16 for the fp16 model).

Keep the letterbox scale factor and padding offsets. You need them to map boxes back onto the
original image.

---

## 3. Output format

Two tensors.

**`output0` — shape `(1, 45, 8400)`**

8400 candidate detections. The 45 rows are:

| rows | meaning |
|---|---|
| 0–3 | box: centre x, centre y, width, height (in 640-space) |
| 4–12 | confidence score per class, 9 classes |
| 13–44 | 32 mask coefficients |

Note there is no separate "objectness" score — the class score *is* the confidence.

**`output1` — shape `(1, 32, 160, 160)`**

32 mask prototypes. To get one object's mask: multiply the prototypes by that detection's 32
coefficients, sum them, apply a sigmoid, then crop to the detection's box and scale up to the
image. If you only need boxes, ignore this tensor entirely (**and we recommend you do — see §6**).

---

## 4. Postprocessing

1. Take the highest class score per candidate; discard anything below **0.32**.
2. Convert boxes from centre/width/height to corner coordinates.
3. Run non-maximum suppression at IoU **0.7**.
4. Undo the letterboxing: subtract the padding offsets, divide by the scale factor.

`iou = 0.7` is the value the model was validated at — do not change it. `conf = 0.32` is our
recommendation and is explained below.

**Per-class thresholds: answered, 20 July — don't build it.** We said we'd send per-class
cut-offs if we got them. We measured it properly and the answer is that they are not worth
having. A fitted nine-value table was beaten by a single flat threshold: same F1, better
precision, fewer false positives, one number instead of nine.

| what you set | precision | recall | false positives |
|---|---|---|---|
| **0.25** — what we specified before | 0.554 | 0.528 | 2,758 |
| nine per-class values, properly fitted | 0.580 | 0.508 | 2,390 |
| **0.32** — one flat number | 0.615 | 0.485 | 1,968 |

Measured on 2,000 images the thresholds were not fitted on. The older
`class_specific_thresholds_guide.md` in the repo is calibrated against a superseded model and
**must not be used** — its advice to lower thresholds is backwards for most categories.

**Ship `conf = 0.32`.** We said before that this was your choice between two numbers; you asked
for one, so this is the one — **29% fewer wrong boxes on screen** than 0.25, for 4 points of
recall. Use it unless you have an interface reason not to.

It remains **overrulable**, because it is a design decision and not a quality one: the model's F1
is 0.541 at every threshold in this range, so moving it does not make the model better or worse,
it only trades finding things against being wrong. If a missed object hurts your interface more
than a wrong box does, go back to 0.25 and tell us. What you cannot do is ship "0.25 or 0.32" —
pick one and hard-code it.

Nothing else changes. Same postprocessing, same NMS, same everything.

---

## 5. The nine categories

IDs are fixed by the training data — do not reorder.

```
0 plastic       3 metal     6 food_organic
1 paper         4 glass     7 battery
2 cardboard     5 textile   8 general_trash
```

`food_organic` means **food waste only**. Leaves and plant matter are `general_trash` under our
agreed definition, and the model gets this wrong fairly often — do not present `food_organic` on
vegetation as authoritative.

`general_trash` is a genuine mixed bag (keyboards, shoes, face masks, foam cups). It is our
weakest category by a wide margin and that is a property of the category, not a bug.

---

## 6. Honest limits — please design the interface around these

**The model finds roughly one object in two.** Overall recall 0.522, precision 0.564.

> **Every number in this section was measured at conf 0.25, but §4 ships 0.32.** At 0.32 you
> find *fewer* objects and are *wrong less often* — precision rises to 0.615, recall falls to
> 0.485. So treat the recall figures below as the optimistic end and the "wrong box" risk as the
> pessimistic end. The **shape** of both tables — small objects and crowded photos are the weak
> cases — is what the interface should be designed around, and that does not change with the
> threshold.

**Updated 20 July — these are now the shipped model's own numbers.** Job 4359, measured on
`v3_ffremask_9cls` at 640px, conf 0.25, 2,000 held-out images. The earlier version of this
section borrowed figures from a related checkpoint; every one of them has been replaced.
Nothing got worse — the shipped model is slightly *better* in all eight buckets — and the shape
of both curves is unchanged, so any design decision already made against the old table still
holds.

Performance depends heavily on how big the object is in frame:

| object size | found | (previously quoted) |
|---|---|---|
| under 1% of the image | **19%** | 19% |
| 1–5% | 40% | 37% |
| 5–25% | 61% | 56% |
| 25–50% | 69% | 64% |
| over 50% | **81%** | 78% |

And on how many objects are in the photo:

| objects in photo | found | (previously quoted) |
|---|---|---|
| 1 | **85%** | 84% |
| 2–5 | 56% | 51% |
| 6 or more | **42%** | 39% |

*(Recall and precision above are measured by our own diagnostic, which matches predictions to
labels greedily at IoU ≥ 0.5. The 0.585 mAP headline in §7 comes from the standard Ultralytics
evaluation — different tool, different question, both correct. Do not mix figures across the
two.)*

**What this means for the UI:**

- **One item photographed close up works well** (~85%). **A photo of a full bin does not**
  (~42%). If the product is built around photographing a full bin, the interface must say so
  rather than presenting a confident-looking result.
- **Never imply the list of detections is complete.** It usually is not. Avoid phrasing like
  "This bin contains:" — prefer "Detected in this photo:".
- **Small items are the weakest case by far** — bottle caps, straws, small batteries.
- If the product allows it, **encourage one-item-at-a-time capture**. That is where the model
  is genuinely good, and it is an honest way to demo it.

**Battery — read this one.** Batteries are scheduled hazardous waste under Malaysian law (EQA
1974, SW 102/103). Our measured recall is **63%**, meaning it misses about one in three. Do not
build any safety or compliance claim on battery detection. If the product flags hazardous items,
a human must confirm.

**Prefer boxes over outlines.** The model produces segmentation masks, but a human review found
**73% of outlines were materially wrong**. They will look visibly bad to users. If bounding
boxes work for your design, use those and skip `output1` entirely.

---

## 7. Numbers not to quote

Older team documents contain scores of 0.78–0.81. **Those are wrong** — they were measured
against labels that covered the whole image, so almost any large box counted as a correct
answer. They measure label sloppiness, not model quality.

The honest figure is **0.585**, and it beats the published benchmark we compared against
(0.426). Quote that one.

---

## 8. Questions

Anything unclear, ask Talvin before building around an assumption. The two things most likely
to bite are the letterboxing (§2) and the fp16/fp32 choice (§1) — check both early rather than
near the demo.
