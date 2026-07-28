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
| Final label | Team Lead finalizes Normal and High. Operations Manager finalizes Critical safety or material revenue-risk labels |
| Critical safety | Battery and food-organic risk gets immediate safe-handling warning |
| Operator queue | Auto-assigned only, urgency order locked |
| Team Lead | Approves labels, manages SLA breach, reassigns cases, flags repeated pattern |
| Operations Manager | Handles operations, recovery risk, fixed-range policy weights, approvals, and release approval |
| Model Team | Performs RCA, retraining, model readiness, class feasibility, and requests targeted data |
| Project Manager | Communication bridge, blocker tracking, reminders, decision recording |
| Web Team | Integrates Model Team-approved model and configuration only |
| System Administrator | User roles, access expiry, case-scoped evidence access, audit log |
| Release communication | Model Team sends technical handover directly to Web Team. PM and Operations Manager are copied |
| Notifications | Portal is source of truth. Daily email summary only. Immediate email on SLA breach or stalled progress |
| Stalled progress | Role-specific adjustable timing. Operations Manager or PM can adjust defaults |
| Evidence access | Model Team sees assigned case evidence only. Read-only by default. Case download requires approval and audit log |
| Evidence expiry | Access through evaluation plus 30 days. 90-day maximum unless extension approved |
| Candidate classes | Ops proposes based on real problems. Model Team makes final technical decision. New class appears live only after model readiness and operations approval |
| Data quality | Only Team Lead or Operations Manager-approved labels become model feedback |
| Operator learning | Daily correction summary. Critical correction can alert immediately |

## Recommended Defaults Pending Validation

These are design defaults, not confirmed operational policy:

| Area | Draft default | Needs validation from |
| --- | --- | --- |
| Critical SLA | 15 minutes during operating hours | Operations Manager |
| High SLA | 4 working hours | Operations Manager |
| Normal SLA | 1 working day | Operations Manager |
| Critical inactivity escalation | 5 minutes | Team Lead and Operations Manager |
| Reassignment | One automatic reassignment at 50 percent of SLA, Team Lead at 75 percent | Team Lead |
| Batch sample | 10 percent, minimum three cases | Team Lead and Model Team |
| Model Team stagnation | 3 working days without RCA or retraining update | Project Manager |
| Web Team stagnation | 2 working days without integration status | Project Manager |

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
10. Who is named Operations Manager, Team Lead, Project Manager, and System Administrator for demo ownership?
