# Model Team Module

## Purpose

Model Team performs RCA, protects training-data quality, confirms retrain readiness, and controls model-related technical handover.

## Primary Task

Turn validated field evidence into explained model-improvement decision.

## Case Evidence

Model Team sees only assigned cases. Each case should include:

- Original image and source reference.
- Model version, model class ID, class name, confidence, and original boxes.
- Operator suggestion, edited or missed-object boxes, false-positive state, and cause.
- Team Lead final label and correction reason.
- Urgency, recovery-risk summary, category pattern, and timeline.
- Access scope and expiry.

## RCA Workflow

1. Review evidence quality.
2. Mark each example usable or unusable with reason.
3. Identify failure pattern: small object, blur, overlap, lighting, mixed pile, class ambiguity, or other supported reason.
4. State RCA hypothesis and next evidence needed.
5. Request targeted collection when existing evidence is insufficient.
6. Update case lifecycle and readiness.

`Investigating` is not adequate final status. RCA update must explain evidence, hypothesis, current decision, owner, and next date.

## Dataset Readiness

Retraining must not begin from simple label total. Model Team sets technical recommendation for:

- Minimum validated examples per affected class.
- Image variety across batch, lighting, scale, and source.
- Duplicate control.
- Object-box quality for missed detections.
- Train and unseen validation split.
- Comparison metrics before and after release.

Operations Manager approves collection workload, not technical standard.

## Candidate Class Workflow

Operations proposes new candidate based on sorting problem. Model Team returns one decision:

- Accept for future model work.
- Merge with existing candidate.
- Defer until evidence target reached.
- Reject with plain-language reason.

Candidate remains staging metadata. It becomes live class only after new model validates and Operations Manager approves release.

## Technical Handover

Model Team sends Web Team approved release contract directly. PM and Operations Manager are copied. Handover must state model artifact hash, class IDs, preprocessing, output handling, thresholds, NMS, general-trash serving rule, validation result, known limits, release version, and rollback version.

## Permissions

| Allowed | Not allowed |
| --- | --- |
| Assigned case evidence | Global evidence search |
| RCA and readiness update | Change live label |
| Training suitability decision | Change operations policy |
| Technical handover | Deploy to operations |
| Candidate feasibility decision | Approve business release |

## Completion Evidence

- Every unusable example has reason.
- Readiness decision states data sufficiency and validation method.
- Handover identifies exact approved contract and rollback.

## Open Decisions

- Final retrain thresholds by class.
- Final validation protocol and model performance acceptance criteria.
- FYP scope for actual data export and model-training environment.
