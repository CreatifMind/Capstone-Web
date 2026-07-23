# Landing page spec

For the public demo page. These are not style preferences — each rule exists because a specific
measurement says the obvious wording would mislead a user.

## Framing rules (non-negotiable)

**"Detected in this photo:" — never "This bin contains:".** Recall is 0.522 at conf 0.25 and
0.485 at the shipped 0.32. The model finds roughly half of what is there. Any phrasing that
implies a complete inventory is a false claim, and it is the single easiest way for this demo to
embarrass the team in front of an examiner.

**Encourage one item at a time.** Recall is 0.85 on single-object photos, 0.56 at two to five
objects, and 0.42 at six or more. Capture guidance is not a limitation to hide — it is where the
model is genuinely good, and steering users there is honest *and* makes the demo look better.

**Draw boxes, not outlines.** A human review found 73% of segmentation masks materially wrong.
They will look visibly bad on screen. The `output1` tensor can be ignored entirely.

**Battery requires a human-confirmation notice.** Batteries are scheduled hazardous waste under
Malaysian law (EQA 1974, SW 102/103) and measured recall is 0.634 — roughly one in three missed.
No safety or compliance claim may rest on battery detection. If the interface flags hazardous
items, it must say a human has to confirm.

**`food_organic` is food waste only.** Leaves and plant matter are `general_trash` under our
agreed definition, and the model gets this wrong fairly often. Do not present `food_organic` on
vegetation as authoritative.

**`general_trash` reads better as "unsorted / needs review".** It is a genuine mixed bag —
keyboards, shoes, face masks, foam cups — and it is our weakest class by a wide margin. That is a
property of the category, not a bug, and the label should not promise more than it can deliver.

## Panels

1. **Live demo** — 3–4 curated sample images, including **one hard case** that the model handles
   imperfectly. A demo that only shows wins reads as a sales page; one honest failure buys
   credibility for everything else on the page.
2. **Metrics, stated plainly** — 0.585 box mAP@0.5, precision 0.564, recall 0.522, nine classes,
   640 px — shown **alongside the published benchmark of 0.426** on comparable work, so the
   number is read in context rather than as a bare score.
3. **"What this model is good at"** — the size and density tables. Large, isolated objects:
   strong. Small objects in cluttered photos: weak. This is the most useful thing on the page for
   a technical visitor.
4. **The research finding, one line** — the limit is the data, not the architecture, proven by
   eliminating six axes (resolution, loss weights, model size, epochs, confidence threshold,
   scale augmentation) without moving the score more than 0.006.

## Never put on the page

**Any score in the 0.78–0.81 range.** Those were measured against labels that covered the whole
image, so almost any large box counted as correct. They measure label sloppiness, not model
quality, and they are formally quarantined (`handoff/status_pack/STATUS.md:15-17`).

**Latency or throughput figures.** Descoped and never measured properly. Do not estimate them.
