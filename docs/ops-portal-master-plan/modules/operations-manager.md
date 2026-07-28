# Operations Manager Module

## Purpose

Operations Manager protects safety, recovery value, and controlled operational release. This role sees high-level operation, not raw Operator work queue.

## Primary Task

Decide where current operational risk needs action and approve actions that affect safety, policy, workload, or live operations.

## Main View

```text
Recovery-value risk | Critical contamination | Pending approvals
Category drilldown  | Active feedback cases  | Policy controls
```

## Metrics

| Metric | Meaning | Guardrail |
| --- | --- | --- |
| Estimated Recovery Value | Category weight multiplied by configured estimate | Not actual revenue |
| Monthly baseline | Recent operating comparison | Default for daily action |
| Yearly baseline | Long-term and seasonal context | Use as alternate view |
| False-positive risk | Validated model error affecting sorting | Use final HITL labels only |
| Missed-object risk | Validated object not detected by model | Requires box and final label |
| Team SLA health | Queue capacity and delay | Team aggregate, not public leaderboard |

## Decisions

Operations Manager can:

- Approve Critical battery, food-organic, or material revenue-risk label.
- Decide whether related failure reopens current case or becomes linked new case.
- Approve case-scoped evidence export and access extension.
- Approve targeted data-collection priority.
- Approve operational release after Model Team declares model ready.
- Choose policy preset and adjust fixed-range weights with reason.

## Policy Controls

Preset gives fast choice. Fixed-range control handles site-specific priorities. Before saving, portal must explain likely effect such as increased safety sensitivity or increased review workload. Every change records old value, new value, reason, actor, and time.

Operations Manager cannot alter model file, model class IDs, inference threshold, NMS, or training result.

## Feedback Case Context

Manager sees each active case as operational question:

```text
What changed? -> Why does it matter? -> Who owns next step? -> What approval is needed?
```

Example: recovery value below monthly baseline, repeated food-organic false positives, team lead action completed, Model Team needs targeted images, Manager approves collection workload.

## Handoffs

- Sends operational priority to Team Lead.
- Gives approved evidence scope to Model Team.
- Approves release after Model Team readiness and Web Team integration report.
- PM records decision and sends status to all teams.

## Permissions

| Allowed | Not allowed |
| --- | --- |
| Whole-operation aggregate metrics | Change model artifact |
| Policy and release approval | Train or validate model |
| Critical label approval | Directly edit Operator suggestion |
| Case continuity decision | Manage user roles |

## Completion Evidence

- Decision records clear business reason.
- Estimated value remains distinct from actual commercial value.
- Release approval references Model Team readiness and Web Team test evidence.

## Open Decisions

- Exact baseline calculation and price source.
- Safe fixed ranges for policy weighting.
- Which recovery changes must always open feedback case.
