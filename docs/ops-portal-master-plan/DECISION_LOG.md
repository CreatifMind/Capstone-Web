# PurityLoop Operations Portal Decision Log

Status: Working record from UI/UX brainstorming. Confirmed items are user decisions, not implementation status.

## Confirmed Decisions

| Topic | Decision |
| --- | --- |
| Portal purpose | Internal waste-management operations and model-feedback portal |
| Operating context | Peninsular Malaysia FYP |
| Model state | Current model weights and final confidence calibration are not final |
| HITL trigger | Confidence contributes to HITL. `general_trash` is always routed to HITL after model detection gate |
| Current class handling | Operators can select all nine current live classes, including General Trash |
| General-trash display | Hide confident general-trash output. Display `Unsorted / Needs Review` until human label |
| Multi-object image | Per-object model output, suggestion, edited box, missed-object box, and false-positive annotation |
| Operator authority | Suggest labels only. No final label authority |
| Final label | Operator finalizes Normal and High. Plant Manager finalizes Critical safety or material revenue-risk labels |
| Critical safety | Battery and food-organic risk gets immediate safe-handling warning |
| Operator queue | Auto-assigned only, urgency order locked |
| Operator | Approves labels, manages SLA breach, reassigns cases, flags repeated pattern |
| Plant Manager | Handles operations, recovery risk, fixed-range policy weights, approvals, and release approval |
| Development Team | Performs RCA, retraining, model readiness, class feasibility, and requests targeted data |
| Development Team | Communication bridge, blocker tracking, reminders, decision recording |
| Development Team | Integrates Development Team-approved model and configuration only |
| System Administrator | User roles, access expiry, case-scoped evidence access, audit log |
| Release communication | Development Team sends technical handover directly to Development Team. PM and Plant Manager are copied |
| Notifications | Portal is source of truth. Daily email summary only. Immediate email on SLA breach or stalled progress |
| Stalled progress | Role-specific adjustable timing. Plant Manager or PM can adjust defaults |
| Evidence access | Development Team sees assigned case evidence only. Read-only by default. Case download requires approval and audit log |
| Evidence expiry | Access through evaluation plus 30 days. 90-day maximum unless extension approved |
| Candidate classes | Ops proposes based on real problems. Development Team makes final technical decision. New class appears live only after model readiness and operations approval |
| Data quality | Only Operator or Plant Manager-approved labels become model feedback |
| Operator learning | Daily correction summary. Critical correction can alert immediately |

## Recommended Defaults Pending Validation

These are design defaults, not confirmed operational policy:

| Area | Draft default | Needs validation from |
| --- | --- | --- |
| Critical SLA | 15 minutes during operating hours | Plant Manager |
| High SLA | 4 working hours | Plant Manager |
| Normal SLA | 1 working day | Plant Manager |
| Critical inactivity escalation | 5 minutes | Operator and Plant Manager |
| Reassignment | One automatic reassignment at 50 percent of SLA, Operator at 75 percent | Operator |
| Batch sample | 10 percent, minimum three cases | Operator and Development Team |
| Development Team stagnation | 3 working days without RCA or retraining update | Development Team |
| Development Team stagnation | 2 working days without integration status | Development Team |

## Open Questions

1. What exact per-class data count and validation split makes a case retrain-ready?
2. Which real data fields are available together for every case: prediction, confidence, box, final label, cause, timestamp, recovery estimate?
3. What is normal scan volume and batch size per facility day?
4. Which commercial source establishes recovery-value price and actual realized value?
5. What fixed failure-cause vocabulary should launch first?
6. Which active user roles are needed in FYP demo, versus documented only?
7. Does the existing backend data model support object-level annotation and case lifecycle, or need scoped migration?
8. Is email delivery real FYP scope or a documented prototype state?
9. Which shift calendar determines working-hour SLA timer?
10. Who is named Plant Manager, Operator, Development Team, and System Administrator for demo ownership?
