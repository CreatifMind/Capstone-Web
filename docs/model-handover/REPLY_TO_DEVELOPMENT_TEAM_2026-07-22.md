# Reply to the web team — 22 July 2026

You found two real errors. Both are ours, both are corrected, and one of them mattered.

---

## First: your two catches

**1. "Friday 1 August 2026" is not a Friday.** You are right — **1 August 2026 is a Saturday.**

**The deadline is Friday 31 July 2026.** Not 1 August. We picked "the Friday before Mock 3" and
then wrote the wrong date next to it, in four separate documents. Every copy is now corrected.
If you are holding anything that says 1 August, it is stale.

The same error appeared once more, in our internal notes: Mock 3 is **Wednesday** 5 August, not
Tuesday. It does not affect you, but it is the same mistake, so it is worth you knowing we found
both rather than just the one you reported.

**2. §1 said the `.onnx` was not in the package, and it is.** Also right, and it was a leftover:
§1 was written when the model still had to be pulled off the HPC by hand. §1 now leads with the
file being present and with the `sha256sum` check — which you already ran, correctly, and got the
right answer. Thank you for checking rather than assuming.

---

## Your five questions

### 1. Is browser inference replacing the whole detector, or only the public demo?

**The whole thing. There is no server-side detector to replace.**

The FastAPI service in `serve/` and in §3 of the old `DEVELOPMENT_SPEC.md` **was never deployed** —
it exists as code and nothing more. Do not treat it as a system being migrated away from; treat
it as a prototype that never shipped. Everything runs in the browser.

If your application currently calls a detection API, that call has no live backend behind it.

### 2. Should NMS be class-aware or class-agnostic?

**Class-aware** — run NMS separately per class, so a bottle and the crate behind it do not
suppress each other.

This is not a preference: it is what the model was validated with. Ultralytics defaults to
`agnostic_nms=False`, and every number we have given you — 0.585 mAP, precision 0.564, recall
0.522, the size and density tables — was measured that way. Class-agnostic NMS would make your
results differ from our numbers with no warning.

### 3. float32 or float16 input tensor for the fp16 model?

**We are not going to guess at this one.** Our parity check ran through Ultralytics' own loader,
which handles the dtype internally, so it never told us what the raw graph expects — and a
confident wrong answer here costs you an afternoon.

Run this against the file we sent and it answers definitively:

```
python -c "import onnxruntime as ort; s=ort.InferenceSession('best.onnx'); print([(i.name, i.type, i.shape) for i in s.get_inputs()])"
```

`tensor(float16)` means feed it a Float16Array; `tensor(float)` means Float32Array. Whatever it
prints is the answer — believe it over anything in our documentation, and tell us so we can put
it in §2, which currently hedges with "float32 (or float16 for the fp16 model)" and should not.

If you would rather we ran it, say so and we will — we have the environment, you have the file.

### 4. Can you have 10–30 test images with expected boxes, classes and confidences?

**Yes, and it is the right thing to ask for.** It is the only way you can prove your
preprocessing, decoding and NMS are correct independently of us — and letterboxing is the bug we
most expect you to hit.

We will generate them from the exact checkpoint in your package, at `conf = 0.32`, `IoU = 0.7`,
class-aware NMS, and send: the images, plus a JSON of expected boxes in **original-image pixel
coordinates** (not 640-space — the mapping back is where errors hide), with class IDs and
confidences.

Tolerance to expect: boxes within a pixel or two and confidences within ~0.01. Our fp16-vs-fp32
parity run showed a worst-case confidence difference of 0.0031 and worst box overlap of 0.9832,
so anything materially wider than that is a bug on one side.

**Timing:** this needs a GPU job, so it depends on queue time rather than our effort. Assume
within a day of you asking, not within an hour.

### 5. Which deadline is real?

**Friday 31 July 2026.** See above — the "1 August" in your copy is our error.

To be explicit about what that date means: it is the last day we would send you a **replacement
`.onnx`**. It is not a deadline for you. If nothing better arrives, the file you already have is
final, and it is a complete, working model — build against it as though no replacement is coming.

---

## One thing we would ask in return

You asked which handover version you were holding before this package. That question is still
open and it matters: an earlier copy told you to build **per-class confidence thresholds**, and
we have since measured that and reversed it — a single flat threshold beat a fitted nine-value
table on precision, false positives and simplicity.

**If you have already built that mechanism, tell us now** rather than at Mock 3. It is wasted
work either way, but it is much cheaper to delete this week.
