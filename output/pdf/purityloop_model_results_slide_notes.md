# PurityLoop Model Results - Slide Notes

## Slide 1 - Model Result

**Headline:** 59.5 mAP@0.5

PurityLoop reached **59.5 mAP@0.5** on **8,453 held-out validation images** across **9 waste classes**.

**Model:** `remask200_40ep`, YOLOv8m-seg, 9-class waste instance segmentation.

**Task:** Detect individual waste objects and classify their material type, fully in browser via ONNX.

**Key metrics:**

| Metric | Value | Meaning |
|---|---:|---|
| mAP@0.5 | 0.595 | Main detection-quality score |
| Precision | 0.606 | Of boxes shown, how many are correct |
| Recall | 0.579 | Of real objects, how many are found |
| Naming accuracy | 0.918 | When detected, class name is usually correct |

**Safe explanation:** When PurityLoop detects an object, it names the material correctly about **92%** of the time, but it detects about **58%** of objects present. Therefore, the UI must say **"Detected in this photo:"**, not **"This bin contains:"**.

## Slide 2 - Classes

PurityLoop detects 9 fixed waste classes:

- plastic
- paper
- cardboard
- metal
- glass
- textile
- food waste
- battery
- general trash

`general_trash` should be routed to **needs review**, not shown as a confident label.

## Slide 3 - Why This Model Shipped

**Training story:** The strongest improvement came from fixing validation labels, not from making the model bigger.

| Step | Result |
|---|---|
| Validation labels audited | +21.9% under-labelled objects found |
| Score before corrected comparison | 0.552 mAP@0.5 |
| Score after correction | 0.595 mAP@0.5 |
| Improvement | +0.043 mAP@0.5 |

**Slide wording:** Correcting the answer sheet revealed that the model was being penalized for detecting real objects that were missing from labels. After correction, the shipped model improved from **0.552 to 0.595 mAP@0.5**.

## Slide 4 - Model Comparison

Use this table to give context. Do not compare 59.5 with COCO or unrelated metric scores.

| Model / System | mAP@0.5 |
|---|---:|
| ZeroWaste published baseline | 33.5-36.3 |
| TrashDet on TACO | 19.5 |
| Zabble commercial benchmark | 54.5 |
| PurityLoop | 59.5 |

## Slide 5 - Reliability And Generalization

Key evidence:

- **0 train/validation collisions** after cleanup.
- **8,453 held-out validation images**, much larger than many benchmark test splits.
- Training from **40 to 70 epochs** improved only **+0.004**, so longer training was not a useful lever.
- Higher resolutions were tested and rejected; **640 px** was faster and performed better for this browser model.

## Slide 6 - Honest Limits

Put limitations on slide. It makes the result more credible.

| Case | Result |
|---|---:|
| One close-up object | ~85% found |
| 2-5 objects | ~56% found |
| 6+ cluttered objects | ~42% found |

Small objects and cluttered scenes are the hardest cases.

## Slide 7 - Browser ONNX Proof

**Deployment-ready model:**

- `best.onnx`
- 54.6 MB fp16
- runs client-side in browser
- no server or GPU needed for inference
- PyTorch-to-ONNX parity checked

**Parity result:** 312 PyTorch detections vs 312 ONNX detections, with **0/30 images** differing in detection count.

## Slide 8 - Human Review / Abstain

PurityLoop should not force a confident answer when the model is unsure.

Route to **needs review** when:

- top score is too low
- `metal` and `plastic` are close
- class is `general_trash`
- object appears outside the 9 trained classes

**Slide wording:** In recycling, a confident wrong sort can contaminate a batch. PurityLoop routes uncertain cases to human review instead of guessing.

## Single-Slide Version

If only one slide is allowed, use:

- Big headline: **59.5 mAP@0.5**
- Subline: **9 classes, 8,453 held-out validation images, browser ONNX**
- Metrics: **Precision 0.606, Recall 0.579, Naming accuracy 0.918**
- Honest limit: **Best on one close-up object (~85% found), weaker on cluttered bins (~42% found with 6+ objects)**
- Safety wording: **"Detected in this photo:"**, not **"This bin contains:"**
