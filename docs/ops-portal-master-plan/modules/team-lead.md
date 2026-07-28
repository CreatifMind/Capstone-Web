# Team Lead Module

## Purpose

Team Lead protects label quality and queue SLA. It turns Operator suggestions into validated operational labels.

## Primary Task

Resolve urgent work first, then validate pending suggestions with enough context to make defensible decision.

## Inputs

| Input | Why Team Lead needs it |
| --- | --- |
| Operator submission | Review suggested label and evidence |
| Original model output | Compare model error to human judgment |
| Box history | See original, edited, and missed-object annotation |
| Cause and note | Understand why model or image failed |
| SLA state and assignment history | Protect queue health |

## Priority Order

1. Critical cases.
2. SLA-breached cases.
3. High-priority pending labels.
4. Normal pending labels.
5. Low-risk batch candidates.

## Core Decisions

| Decision | Use when | Required record |
| --- | --- | --- |
| Approve | Suggestion and evidence agree | Validator and timestamp |
| Correct | Final label is clear but Operator label wrong | Corrected label and reason |
| Return | Evidence, box, or image needs Operator work | Return reason |
| Escalate | Safety or material recovery risk needs Manager | Escalation reason |
| Reassign | Operator cannot complete safely or on time | New owner and reason |

Direct correction avoids unnecessary delay. Return is only for information Operator must add.

## Batch Approval

Batch approval is allowed only when cases are low risk and matching. Matching means same model label, same suggested label, and no Critical, false-positive, missed-object, or mixed outcome.

System selects random sample: 10 percent, minimum three. One failed sample stops batch approval. Failed sample creates daily Operator coaching feedback.

## Queue Health

Team Lead sees team-only data:

- Assigned, started, unstarted, returned, and overdue count.
- Critical and High SLA countdown.
- Reassignment history.
- Repeated correction pattern.
- Training need summary.

Team Lead does not see whole-operation recovery weighting or make model decisions.

## Handoffs

- Approved label becomes trusted HITL data.
- Critical final label escalates to Operations Manager where required.
- Repeated pattern goes to Operations Manager as operational signal, not direct model-class request.
- Returned case goes back to suitable Operator with preserved audit trail.

## Permissions

| Allowed | Not allowed |
| --- | --- |
| Finalize Normal and High labels | Change policy weights |
| Correct with reason | Approve model release |
| Reassign cases | Change model contract |
| Approve guarded batch | Create live class |
| Flag quality pattern | Access unrelated model cases |

## Completion Evidence

- Final label traces to original model output and Operator evidence.
- Every correction or return has reason.
- Batch approval preserves sample result and outcome.

## Open Decisions

- Team-specific SLA targets after real workload study.
- Exact escalation list for Critical case.
- Team Lead authority boundaries for battery-trained reassignment.
