# Operator Module

## Purpose

Operator creates accurate HITL suggestions for assigned waste-review cases. Operator does not finalize labels, change policy, or see global business metrics.

## Primary Task

Review one assigned image, handle every flagged object, and submit complete suggestions for Team Lead validation.

## Inputs

| Input | Why Operator needs it |
| --- | --- |
| Assigned case ID and urgency | Know work priority and SLA |
| Original image | Inspect actual waste item |
| Model object box, class, score | Understand model suggestion without treating it as truth |
| Review reason | Know why case needs human attention |
| Safe-handling instruction | Protect recyclable stream when battery or food-organic risk exists |

## Screen Structure

```text
Assigned queue | Selected image and boxes | Object action panel
```

Queue contains only assigned cases. It is locked by Critical, High, Normal urgency. Operator cannot browse global history or choose easier cases.

## Per-Object Actions

Operator can:

1. Suggest one of nine current live classes.
2. Edit an existing model box.
3. Add a missed-object box when model did not detect object.
4. Mark false positive when model box has no valid object.
5. Choose fixed failure cause and optional note.

Current live classes remain: Plastic, Paper, Cardboard, Metal, Glass, Textile, Food Organic, Battery, General Trash.

`general_trash` model output must display as `Unsorted / Needs Review`. Operator may still choose General Trash as final suggestion after inspecting image.

## Confidence and Review Reason

Show both number and meaning:

```text
42% - Low confidence
Reason: Unsorted model output
```

Never show confidence as certainty. A high score can still require review because class 8, safety rule, or known model issue can override it.

## Start, Draft, Submit

- Opening case records view only.
- `Start review` accepts responsibility and starts work timer.
- Object suggestions save as drafts.
- Case submits only after every flagged object has outcome.
- Successful submit opens next assigned case.
- Empty queue shows `No assigned reviews`, not unrelated scan history.

## Critical Case Behaviour

Potential battery or food-organic contamination shows provisional instruction before final label:

```text
Potential battery. Keep out of recyclable stream until Team Lead confirms.
```

Operator acknowledges instruction. If no work starts within five minutes, Team Lead receives escalation. Critical case still waits for full image completion before Team Lead approval.

## Return to Queue

Operator can return case only with reason:

- Needs battery-trained reviewer
- Image unclear
- Wrong workload assignment
- Needs Team Lead review

System preserves drafts and notes, then reassigns one time or escalates according to SLA.

## Permissions

| Allowed | Not allowed |
| --- | --- |
| Suggest label | Finalize label |
| Annotate box | Change model output |
| Add missed object | Change urgency policy |
| Mark false positive | Reorder queue |
| Return unsuitable case | See recovery-value analytics |

## Completion Evidence

- Every flagged object has a suggestion, box state, and cause where required.
- Original model output remains unchanged in audit history.
- Team Lead can see image, original evidence, Operator action, and time record.

## Open Decisions

- Final fixed failure-cause list.
- Exact operator training tags for auto-assignment.
- Whether FYP demo supports true image-box drawing or documented prototype state.
