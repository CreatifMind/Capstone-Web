# Web Team Module

## Purpose

Web Team integrates Model Team-approved model contract into portal without changing technical model decisions.

## Primary Task

Implement and verify approved model release, then report integration and rollback readiness.

## Required Handover

| Item | Why it matters |
| --- | --- |
| Model artifact and hash | Prevent wrong model file |
| Class IDs and class names | Preserve label mapping |
| Input shape and preprocessing | Keep inference valid |
| Output interpretation | Decode model output correctly |
| Confidence and NMS rule | Preserve evaluated serving behaviour |
| General-trash display rule | Route class 8 to HITL after NMS |
| Validation evidence and limits | Keep user claims honest |
| Release and rollback version | Recover safely from integration issue |

## Integration Rules

- Do not change class order.
- Do not filter general trash before NMS.
- Do not display class 8 as confident live result.
- Do not expose candidate subclass as current live class.
- Do not change model threshold or NMS without Model Team handover.
- Preserve original model evidence for HITL and audit.

## Status Updates

Web Team reports:

1. Handover received and understood.
2. Integration in progress or blocked.
3. Test result against approved contract.
4. Deployment readiness.
5. Rollback readiness.
6. Deployed or reverted status.

Model Team sends technical details directly. PM and Operations Manager stay copied. Web Team can request clarification but cannot silently replace contract.

## Completion Evidence

- Exact artifact and config match handover.
- Critical class-8 routing is verified.
- Multi-object, missed-object, false-positive, and HITL evidence path is tested.
- Rollback target is recorded before release.

## Open Decisions

- Final deployment environment and hosted verification flow.
- FYP level of automated model-contract test coverage.
