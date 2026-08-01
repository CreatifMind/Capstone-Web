# PurityLoop Operations Portal Master Plan

Status: Draft for FYP discussion. No implementation approved by this document.

## 1. Purpose

PurityLoop is not one generic dashboard. It is one internal portal with task-focused views for people who create, validate, use, and improve waste-sorting data.

Primary story:

1. An Operator reviews model-flagged waste objects.
2. A Operator validates the human labels.
3. An Plant Manager sees safety and recovery-value risk.
4. A feedback case gives Development Team evidence for RCA and retraining.
5. Development Team coordinates the handoffs.
6. Development Team integrates only Development Team-approved model releases.

This story makes the FYP data-driven: operational decisions create verified HITL evidence, then model improvement is measured against operational outcomes.

## 2. Current-State Evidence

Current `/review` is a generic scan-history and scan-detail workspace. It has totals, filters, a selected image, one category control, and final verify/reject actions. It does not yet distinguish Operator suggestions from Operator final labels.

Current `/analytics` provides operational charts and an `Estimated Recovery Value` metric. The value is an estimate based on category price and weight assumptions, not confirmed revenue.

Model serving contract:

- Nine class IDs remain fixed in the current model contract.
- `general_trash` remains class ID 8 inside the model.
- A class-8 winning detection must display as `Unsorted / Needs Review`, not a confident general-trash result.
- It enters HITL after the model's 0.32 detection gate.
- Other confidence and final-model thresholds remain Development Team decisions. The current 85 percent review rule is provisional product behaviour, not final model calibration.

## 3. Product Principles

1. One role, one clear task. Do not make one screen serve Operator, Operator, and Plant Manager at once.
2. Portal is source of truth. Email is daily summary only, except SLA breach or stalled progress.
3. Model confidence is evidence, not certainty. Show exact score plus plain-language confidence band.
4. Preserve model output and human correction separately. Never overwrite original prediction, box, confidence, or model version.
5. Use least-privilege access. Each role sees only data needed for its task.
6. Current green-white operational visual system stays. Improve hierarchy and task flow, not brand direction.
7. Every operational label stays auditable. Only Operator or Plant Manager-approved labels enter Development Team feedback.

## 4. Roles and Module Context

Detailed module briefs:

| Module | Detailed brief |
| --- | --- |
| Operator | [modules/operator.md](modules/operator.md) |
| Operator | [modules/operator-review.md](modules/operator-review.md) |
| Plant Manager | [modules/plant-manager.md](modules/plant-manager.md) |
| Development Team | [modules/development-model.md](modules/development-model.md) |
| Development Team | [modules/development-coordination.md](modules/development-coordination.md) |
| Development Team | [modules/development-integration.md](modules/development-integration.md) |
| System Administrator | [modules/system-administrator.md](modules/system-administrator.md) |

This master plan keeps cross-team rules. Each module brief defines one role's screen, inputs, actions, limits, states, evidence, and handoffs.

### Operator

Single job: create a human label suggestion for assigned flagged work.

Can:

- See only auto-assigned cases.
- Start review, zoom and pan image, inspect per-object model output.
- Suggest one of nine live classes per object.
- Edit a model box, add a missed-object box, or mark a false positive.
- State a fixed failure cause and optional note.
- Return unsuitable task to queue with a reason.

Cannot:

- Finalize a label.
- Reorder queue.
- See global revenue or policy controls.
- Change model settings or create live classes.

#### What this module receives

The Operator receives only a case that system rules have already assigned. A case can contain one image and several objects. Every object retains its model class ID, model label, confidence score, original box, source image, model version, review reason, and urgency. This is important because a human correction must never erase what model originally predicted.

#### What the Operator sees

The screen starts with an assigned-work queue and opens one image at a time. The queue is a work order, not a history list. It shows urgency, time remaining, review reason, and whether the case is already started. The work area shows the image, boxes, object list, provisional score, safe-handling instruction when relevant, and a clear next action.

The Operator needs enough context to label reliably, but not revenue charts, global history, model settings, or unrelated work. Hiding those items is a usability decision. It reduces distraction and keeps the Operator accountable for one task.

#### Operator decision model

For every flagged object, the Operator chooses one outcome:

1. Suggest one of nine current live classes.
2. Edit the model box when model location is wrong.
3. Add a missed-object box when model did not detect an object.
4. Mark a model box as false positive when no valid object exists.
5. Return the case when another reviewer is required.

The suggestion is a draft until Operator validates it. The Operator may describe why model failed using fixed cause labels such as small object, blur, overlap, poor lighting, object partly outside frame, mixed waste, or other. Free text explains unusual evidence, but fixed labels keep later analysis consistent.

#### Completion and failure states

- A case cannot submit until every flagged object has a draft outcome.
- `Start review` starts responsibility timer. Opening a case only records a view.
- If image is corrupt or unreadable, Operator returns case with reason instead of guessing.
- If no work is assigned, show an empty state rather than global scan history.
- After successful submission, show confirmation and open next assigned case.

### Operator

Single job: protect label quality and queue SLA.

Can:

- See Critical and breached cases before normal approvals.
- Approve, directly correct with reason, return for missing evidence, or escalate.
- Batch-approve only low-risk, matching suggestions after random sample check.
- Reassign unworked or unsuitable cases.
- Flag repeated failure pattern to Plant Manager.

Cannot:

- Change operational policy, recovery weighting, or model configuration.
- Create class-expansion request directly.

#### What this module receives

Operator receives Operator-submitted suggestions plus cases that need escalation. It sees original model evidence beside human suggestion. This makes correction defensible: the Lead can compare what model saw, what Operator saw, and what final operational record should become.

#### What the Operator decides

The Operator does not redo all operations work. It decides whether suggestion quality is sufficient:

1. Approve suggested label.
2. Correct label directly with a reason.
3. Return case when box, cause, or image evidence is incomplete.
4. Escalate Critical case to Plant Manager.
5. Reassign case when Operator cannot safely complete it.

Direct correction is faster than returning an obvious label error. Returning is reserved for missing evidence because only the Operator can add field context or draw the correct missed-object box.

#### Batch approval guardrail

Batch approval is a speed tool, not a shortcut for risk. It is available only where suggested labels, model labels, and causes match low-risk criteria. Critical risk, missed-object evidence, false positives, and mixed outcomes stay individual. Before approving a batch, system presents random sample. One incorrect sample stops the batch and sends cases back to individual review.

#### Queue-health context

Operator sees team queue volume, accepted versus unstarted cases, SLA risk, returned reasons, and repeated correction pattern. It does not see whole-organisation policy or personal leaderboard. Individual feedback becomes daily coaching summary, except Critical correction that requires immediate attention.

### Plant Manager

Single job: protect operational safety and recovery value.

Can:

- See whole-operation recovery-risk view with monthly or yearly baseline switch.
- See category drilldown, Critical risks, model-feedback cases, release approvals, and team-level metrics.
- Select policy preset and make safe, fixed-range weight adjustments with rationale.
- Approve Critical labels, operational case continuity, collection priority, and model release to live operations.

Cannot:

- Alter model artifact, model threshold, or training decisions.

#### What this module receives

Plant Manager receives aggregated, validated operational data. It must not depend on unreviewed Operator drafts because draft labels can distort business decisions. The page combines recovery-risk trend, contamination risk, SLA health, active feedback cases, and approvals needing action.

#### Baseline and value context

Manager switches between monthly and yearly baseline. Monthly baseline answers "what changed recently?". Yearly baseline gives seasonal and long-term context. Whole-operation value appears first. Category drilldown then explains whether one material, contamination type, or batch caused risk.

`Estimated Recovery Value` remains clearly labelled estimate. It is useful for prioritisation, but it is not invoice, buyer settlement, or guaranteed revenue. Once a trusted commercial data source exists, plan can add actual realized value as separate metric. Never silently replace one with the other.

#### Policy-control guardrail

Manager selects a plain-language policy preset such as balanced, protect revenue, or reduce contamination. It may adjust fixed-range weights with reason. System shows expected effect before save and records who changed what. Free-form formulas are excluded because they are hard to audit and easy to misuse.

#### What the Manager approves

- Critical label when safety or material revenue-risk is involved.
- Operations priority for targeted data collection.
- Whether related model failures reopen existing case or create linked case.
- Operational release after Development Team confirms readiness.
- Controlled evidence export and access extension where required.

### Development Team

Single job: investigate model failure, maintain evidence quality, and confirm model readiness.

Can:

- Read assigned-case evidence only: original image, model input/output, boxes, confidence, HITL final labels, causes, model version, and impact summary.
- Mark individual examples unusable with reason. Evidence remains in audit history.
- Update RCA, dataset readiness, retraining, and evaluation status.
- Recommend class merge, defer, reject, or technical readiness.
- Request targeted collection with required sample count and image-quality rules.

Cannot:

- Change live labels, operations policy, recovery weights, or release a model to operations.

#### What this module receives

Development Team sees evidence from assigned feedback cases, not unrestricted portal history. The case package should contain original image, source reference, input metadata, model version, model output, all original boxes and confidence values, Operator suggestions, Operator final labels, annotation edits, causes, urgency, business-impact summary, and case timeline.

#### RCA in plain language

RCA asks why model failed, not only whether it failed. Example causes include object too small, object blocked, low-light image, mixed pile, ambiguous class, or wrong annotation. Development Team documents evidence, hypothesis, decision, data gap, and next action. A vague status such as `investigating` is not enough because Plant Manager and PM cannot act on it.

#### Training-data quality gate

Development Team can mark example unusable when it is duplicate, corrupted, ambiguous, incorrectly boxed, outside model scope, or lacks a final trusted label. This does not delete data. It explains why retrain-ready count changed and helps Operations collect better examples.

Retraining is not automatic. Development Team must assess class balance, label consistency, image diversity, split between train and unseen validation data, and whether new data represents real operating conditions. This avoids overfitting to a small group of repeated images.

#### Candidate class decision

Operations can propose candidate label because it understands sorting impact. Development Team makes technical decision: merge similar label, accept candidate, defer pending data, or reject with reason. New model class is not exposed to live Operations until model readiness and release approvals complete.

### Development Team

Single job: bridge teams and remove blocked work.

Can:

- See read-only case status: owner, stage, due date, blocker, decision, next action.
- Send logged portal reminders.
- Record Plant Manager continuity decision and keep all teams informed.

Cannot:

- Change model, labels, policy, or raw evidence by default.

#### What this module receives

Development Team sees progress metadata from all active cases: stage, current owner, age, due date, blocker, next action, linked case, and latest decision. This is enough to coordinate teams without becoming a second Plant Manager or Development Team.

#### Coordination responsibilities

PM sends logged reminders, asks owner to provide next step, records decisions, and makes blocked work visible. PM does not choose class label or model threshold. When case continuity decision is needed, Development Team recommends technical relationship and Plant Manager decides operational continuity. PM records and communicates outcome.

#### Notification discipline

Portal holds full history. Daily email gives summary. Immediate email occurs only for SLA breach or long stagnation. This avoids email becoming competing source of truth. Manual reminders use portal record with recipient, reason, and due date.

### Development Team

Single job: integrate approved model release and configuration exactly as handed over by Development Team.

Can:

- Receive Development Team technical handover directly.
- Report integration, test, deployment, and rollback status.

Cannot:

- Alter model class map, model thresholds, or approved model contract independently.

#### What Development Team receives

Development Team receives one approved technical handover from Development Team. Handover identifies model artifact and hash, classes and IDs, input shape, preprocessing, output interpretation, confidence and NMS requirements, class-display rule, validation evidence, release version, and rollback version.

#### Integration boundary

Development Team builds browser and portal behaviour around approved contract. It can report incompatibility or request clarification. It cannot silently decide a different class order, remove class before NMS, change threshold, or treat new candidate label as live model class. PM and Plant Manager are copied on all updates so operational release status is visible.

#### Completion evidence

Integration completes only after Development Team reports tested behaviour, known limitations, deployment status, and rollback readiness. Plant Manager then decides whether live operations can use release.

### System Administrator

Single job: manage access and auditability.

Can:

- Invite or maintain user accounts.
- Assign roles, control one active role at a time, grant case-scoped evidence access, set expiry, and review audit log.

Cannot:

- Make operations, labeling, or model decisions.

#### Access-control model

System Administrator manages identities, roles, active role, evidence access, expiry, and audit history. A person can have more than one assigned role only when needed. They operate one active role at a time so every action has clear permission and audit context.

#### Case-scoped evidence rule

Development Team has read-only evidence access only for assigned cases. Case downloads require Plant Manager approval. Every view, export, download, expiry extension, role switch, and access change enters audit log. Closed-case access ends after evaluation plus 30 days, with 90 days maximum without explicit approved extension.

#### Why separation matters

Plant Manager controls work and release. System Administrator controls access. Separating these jobs prevents one role from both approving a sensitive action and changing who can see its evidence.

## 5. Core Workflows

### A. Operator HITL review

1. System auto-assigns case by urgency, workload, shift availability, and relevant training.
2. Operator clicks `Start review`.
3. Operator sees one image and all detected objects. Each object retains model class, confidence, original box, and reason for review.
4. Operator suggests one of nine live classes, edits box, adds missed object, or marks false positive.
5. Operator records cause from fixed list plus optional note.
6. Operator saves drafts per object, then submits one complete image case.
7. Operator validates final labels. Only final label enters feedback dataset.

Critical rule:

- Battery or food-organic risk shows provisional safe-handling instruction immediately.
- Operator acknowledges critical instruction.
- If no work occurs for five minutes, Operator is alerted.

### B. Queue and SLA

- Urgency order is locked. Operator cannot cherry-pick simple cases.
- Critical: 15 minutes during operating hours.
- High: 4 working hours.
- Normal: 1 working day.
- At 50 percent of SLA with no activity: one automatic reassignment.
- At 75 percent: Operator escalation.
- Paused case stops timer.
- Operator or Plant Manager-approved extension is logged. One normal extension per case. Second extension requires Plant Manager and Development Team approval.

### C. General-trash handling and class expansion

`general_trash` is a model catch-all, not a confident live operational output.

1. Keep class 8 inside model and NMS.
2. After NMS, route class 8 to HITL as `Unsorted / Needs Review`.
3. Operator can still choose `General Trash` as final human label among current nine live classes.
4. Operators may propose a candidate subclass with business reason and sample evidence.
5. Similar free-text proposals are grouped. They do not become live classes.
6. Plant Manager approves business priority. Development Team makes final technical call based on data quantity, visual distinctness, handling route, and validation result.
7. New class reaches live operations only after Development Team validation and Plant Manager release approval.

### D. Feedback, RCA, retraining, and release

1. Business trigger creates feedback case: safety risk, recovery-value loss, or repeat failure pattern.
2. Portal compiles case evidence. Plant Manager-approved export remains case-scoped and audited.
3. Development Team performs RCA and updates lifecycle: review, compiled, sent, RCA, retraining, evaluation, resolved.
4. Development Team confirms technical readiness. Plant Manager approves operational release.
5. Development Team sends technical handover directly to Development Team. Development Team and Plant Manager are copied.
6. Development Team integrates exact approved artifact and configuration, reports test and rollback readiness.
7. Post-release evaluation uses custom period agreed by Plant Manager and Development Team. Compare false positives, missed detections, recovery value, and review time.

### E. Evidence and audit lifecycle

Every workflow uses the same evidence chain. This makes later RCA possible without guessing.

```text
Original image
  -> model version and output
  -> Operator draft annotation
  -> Operator final label
  -> Operations approval when required
  -> feedback case evidence package
  -> Development Team RCA and readiness decision
  -> approved model release
  -> post-release evaluation
```

#### Object record

One image may contain many objects. Each object needs its own record. Minimum conceptual fields:

| Group | Fields |
| --- | --- |
| Original model evidence | model class ID, model class name, confidence, original box, model version, inference timestamp |
| Operator annotation | suggested class, edited box or added box, false-positive flag, failure cause, note, started and submitted time |
| Validation | Operator final class, correction reason, validation time, validator identity |
| Operations decision | Critical approval, policy context, recovery-risk context, release or case-continuity decision |
| Training suitability | usable or unusable, Development Team reason, assigned feedback case, candidate-label grouping |

The portal must retain versions rather than replacing values. Example: if an Operator changes a box and Operator changes class, all three views remain visible: original model box, Operator-edited box, and final label.

#### Case record

A case is a controlled piece of work around a risk, not simply one image. It may link many images, objects, labels, and discussions. A case needs owner, stage, urgency, due date, active role, blockage reason, evidence scope, linked cases, decisions, and final outcome.

### F. Notification and escalation module

The notification module supports work. It does not become a second dashboard.

| Event | Portal behaviour | Email behaviour |
| --- | --- | --- |
| Operator receives assignment | New task appears in assigned queue | None |
| Critical safety risk | Prominent safe-handling instruction and Operator alert | Immediate when SLA or safety escalation rule requires |
| High or Normal work | Queue position and remaining SLA | Daily summary only |
| No activity | Reassign at 50 percent, escalate at 75 percent | Email on breach or prolonged stagnation |
| Development Team data request | Appears for Plant Manager and Operator | Daily summary |
| Model release handover | Visible status to Development Team, Development Team, PM, Plant Manager | Status update according to release workflow |

Stagnation timer is role-specific and adjustable by Plant Manager or PM. Any adjustment needs a reason and audit history. A paused case must show why it is paused and who can resume it.

## 6. Decision Logic

### Urgency

- Critical: battery risk, food-organic contamination in recyclable flow, or severe safety and revenue impact.
- High: repeat quality failure or recovery risk requiring same-shift action.
- Normal: isolated issue without safety or material recovery impact.

Use recurrence with impact. Repeated blur alone is not automatically Critical. Repeated failure plus safety or recovery-value risk may be Critical.

### Feedback readiness versus retrain readiness

- `Feedback ready`: enough evidence to create a case.
- `Retrain ready`: Development Team confirms sufficient, balanced, distinct, validated labels and an unseen validation set.

Never retrain from a total label count alone. Prevent overfitting by checking per-class coverage, duplicates, real batch variation, missed-object boxes, and held-out evaluation.

## 7. Information Architecture

One portal. Role determines landing page and permissions.

| Role | Landing module | Primary action |
| --- | --- | --- |
| Operator | My review queue | Submit label suggestion |
| Operator | Approval and SLA queue | Finalize or correct labels |
| Plant Manager | Operations health | Approve risk action and policy |
| Development Team | RCA cases | Confirm evidence and readiness |
| Development Team | Blocked work | Coordinate owners and next actions |
| System Administrator | Access control | Manage role and evidence access |

Users may hold several roles only when needed. They must deliberately switch active role. Permissions, landing module, and audit context change with the active role.

### Navigation rules

Navigation must reflect active role. Do not show inaccessible menu items as disabled mystery links.

| Active role | Navigation priorities |
| --- | --- |
| Operator | My assigned work, safety guidance, personal daily summary |
| Operator | Approval queue, SLA risk, team pattern flags |
| Plant Manager | Operations health, feedback cases, policy, release approvals |
| Development Team | Assigned RCA, dataset requests, candidate-label decisions, release handover |
| Development Team | Blocked work, case timeline, decision history |
| System Administrator | Access alerts, users, roles, audit log |

Shared pages may reuse shell and visual tokens, but their information hierarchy changes by role. This is safer than one page packed with hidden tabs because each user sees their intended decision first.

## 8. Delivery Sequence

### Phase 1: Shared foundations

- Role vocabulary and active-role model.
- Case, object annotation, audit, urgency, SLA, and notification vocabulary.
- Preserve model-output fields and final human-label fields separately.

Exit evidence:

- Role names, responsibility boundaries, and case lifecycle are signed off by Plant Manager, Development Team, PM, and Development Team.
- Existing model contract remains untouched.
- No current scan record loses original model prediction when new HITL data is added.

### Phase 2: Operator and Operator

- Replace generic review-history workflow with Operator task queue and per-object HITL workbench.
- Add Operator approval and SLA workspace.
- Support general-trash suppression, multi-object cases, edited boxes, missed objects, and false positives.

Exit evidence:

- Operator cannot finalize a label.
- Operator can trace every final label to model output and Operator evidence.
- Critical warning and SLA escalation work in controlled demo case.
- Batch approval is blocked for Critical, false-positive, or missed-object cases.

### Phase 3: Operations and feedback lifecycle

- Build Plant Manager risk view with monthly/yearly switch and category drilldown.
- Add feedback case lifecycle, targeted data-collection request, and model evidence package.

Exit evidence:

- Monthly/yearly baseline switch does not mislabel estimated value as actual revenue.
- Manager can explain why a feedback case was opened.
- Development Team receives complete approved evidence package, not informal screenshots.

### Phase 4: Cross-team delivery controls

- Build Development Team RCA workspace, Development Team coordination view, and System Administrator access controls.
- Add model-release handover, web integration status, evaluation, and rollback history.

Exit evidence:

- PM can identify blocked owner and next action without raw evidence access.
- System Administrator can prove access expiry and audit history.
- Development Team records exact approved contract, integration test, and rollback result.

## 9. UX Quality Bar

- Keyboard access, visible focus, semantic labels, and 44px minimum touch targets.
- Clear loading, empty, error, paused, and expired-access states.
- Mobile: one task pane at a time. Desktop: queue plus focused work area.
- Use transform and opacity only for motion. Respect reduced motion.
- No decorative risk color. Every urgency state includes plain-language text.
- Keep recovery metric labelled `Estimated Recovery Value` until real commercial data proves otherwise.

## 10. Open Decisions That Must Not Be Invented

1. Development Team minimum labels per class, dataset quality rules, and validation protocol.
2. Real daily scan volume, batch size, and recurrence threshold calibration.
3. Exact recovery-value formula and source of commercial pricing.
4. Shift calendar and final SLA schedules for each facility.
5. Candidate-label normalization owner and approved taxonomy rules.
6. Real account, email, and secure file-export capability for FYP scope.
7. Exact current backend schema and migration approach for roles, cases, annotations, and audit history.
