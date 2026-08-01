# PurityLoop Role-Based UI/UX Layout Draft

Status: Draft layout. No UI code approved by this document.

## Design Direction

Keep current green-white operations style. Use one accent family, soft cards, concise labels, and clear safety states. Do not redesign into a marketing site.

Design dials:

- Design variance: 4. Predictable operations layout.
- Motion intensity: 3. Feedback only, no decorative movement.
- Visual density: 6. Enough operational context without cockpit clutter.

## Shared Shell

Desktop:

```text
+------------------+---------------------------------------------------+
| Logo             | Page title                    Role switcher       |
| Active role      | Page purpose                  Notifications       |
| Navigation       +---------------------------------------------------+
|                  | Role-specific main content                         |
| User / role      |                                                   |
+------------------+---------------------------------------------------+
```

Mobile:

```text
+---------------------------------------------------+
| Menu | Page title                  | Notifications |
+---------------------------------------------------+
| One focused task pane at a time                    |
+---------------------------------------------------+
```

Rules:

- Role label remains visible in shell.
- Only show navigation destinations user can open.
- Alert colours always include text label and icon.
- Model confidence uses `42% - Low confidence`, not colour alone.

## Operator: My Review Queue

Goal: submit one complete image suggestion for Operator validation.

```text
+-----------------------+-----------------------------------------------+
| MY ASSIGNED WORK       | CASE PL-0248          HIGH · 02:17 remaining |
| 1 Critical             +-----------------------------------------------+
| 3 High                 | [ Zoomable image and object boxes ]           |
| 8 Normal               |                                               |
|                        | [Object 1] Plastic · 42% · Low confidence     |
| > PL-0248 High         | Suggested label: [ Plastic v ]                |
|   PL-0243 High         | [ Edit box ] [ Mark false positive ]          |
|   PL-0231 Normal       |                                               |
|                        | [Object 2] Unsorted / Needs Review            |
|                        | Suggested label: [ General Trash v ]          |
|                        |                                               |
|                        | [ Add missed object ]                          |
|                        | Cause: [ Small object v ] Note: [          ]  |
|                        |                                               |
|                        | [ Return to queue ] [ Submit suggestions ]    |
+-----------------------+-----------------------------------------------+
```

Behaviour:

- Queue is auto-assigned and urgency order is locked.
- `Start review` records responsibility. Opening case alone is not progress.
- Operator can draft per-object work. Submission requires every flagged object handled.
- Critical safe-handling acknowledgement appears before submission.
- After save, next auto-assigned case opens. Empty state says no assigned reviews.

## Operator: Approval and SLA Queue

Goal: finalize labels and protect queue health.

```text
+-------------------------+---------------------------------------------+
| NEEDS ACTION             | APPROVAL DETAIL                             |
| 2 Critical               | Original model output                       |
| 4 SLA breach             | Operator suggestion                         |
| 18 Pending approvals     | Final label: [ Battery v ]                  |
|                           | Correction reason: [                         |
| > PL-0248 Critical       |   confidence unsupported by image          |
|   PL-0243 SLA breach     | ]                                           |
|                           | [ Approve ] [ Correct ] [ Return ]          |
| Batch candidates         | [ Escalate ]                                |
| 12 low-risk plastic      +---------------------------------------------+
+-------------------------+---------------------------------------------+
```

Behaviour:

- Critical and SLA-breach work precedes normal approvals.
- Direct correction requires reason and retains original suggestion.
- Batch approval only for matching low-risk cases. System samples 10 percent, minimum three. One failed sample stops batch action.
- Operator can reassign case, but cannot change policy or model settings.

## Plant Manager: Operations Health

Goal: decide where operational risk needs action.

```text
+---------------------------------------------------------------+
| OPERATIONS HEALTH        [ Monthly baseline v ] [ Yearly ]    |
+----------------------+----------------------+-----------------+
| Estimated recovery   | Critical risks       | Pending approval |
| value vs baseline    | Battery: 2           | Release: 1       |
| RM value and change  | Food organic: 4      | Policy: 2        |
+----------------------+----------------------+-----------------+
| Risk driver by category            | Active feedback cases        |
| [ category comparison and context] | Owner · stage · next action  |
+------------------------------------+------------------------------+
| Policy preset [ Balanced v ]  Fixed-range weighting controls       |
| Explanation before save · reason required · audit shown             |
+---------------------------------------------------------------------+
```

Behaviour:

- Whole-operation risk is first. Category drilldown explains cause.
- Recovery metric is clearly estimated.
- Manager sees team-level, not individual Operator performance by default.
- Manager can approve operations policy, collection priority, Critical labels, and live release.

## Development Team: RCA Case Workspace

Goal: explain failure and confirm data or model readiness.

```text
+----------------------+----------------------------------------------+
| ASSIGNED RCA CASES   | CASE PL-0248                                  |
| > PL-0248           | Original image and model boxes                 |
|   PL-0231            | Input / output / confidence / model version    |
|                       | HITL final labels and cause patterns            |
| Dataset readiness    | Recovery-impact summary                         |
| 63 / target TBD      | [ Accept ] [ Unusable ] [ Request data ]       |
|                       | [ RCA update ] [ Mark retrain-ready ]          |
+----------------------+----------------------------------------------+
```

Behaviour:

- Only assigned cases expose original evidence.
- Individual training example can be marked unusable with reason, never silently deleted.
- Development Team can request targeted collection. Plant Manager approves workload priority.
- No live label, policy, or release controls.

## Development Team: Coordination Board

Goal: remove blocked work and keep teams aligned.

```text
+---------------------------------------------------------------+
| BLOCKED WORK                                                  |
+--------------------+-------------+------------+-------------+
| Case               | Owner       | Blocker    | Next action |
| PL-0248            | Development Team  | More data  | 30 Jul      |
| PL-0231            | Development Team    | Handover   | 29 Jul      |
+--------------------+-------------+------------+-------------+
| [ Send reminder ]   Timeline   Decision history   Linked cases |
+---------------------------------------------------------------+
```

Behaviour:

- Read-only workflow status by default.
- Manual reminder requires recipient, reason, and due date.
- No raw evidence unless Plant Manager grants case access.

## System Administrator: Access Control

Goal: keep role and evidence access safe.

```text
+---------------------------------------------------------------+
| ACCESS ALERTS                                                 |
| 3 case-access grants expire this week                         |
+-----------------------+---------------------------------------+
| User and active role  | Case-scoped evidence access            |
| Invite user           | Case · recipient · expiry · status     |
| Role assignment       | [ Extend ] [ Revoke ]                  |
+-----------------------+---------------------------------------+
| Audit log: view, export, role switch, access change          |
+---------------------------------------------------------------+
```

Behaviour:

- Default Development Team access is read-only, case-scoped, and expires after evaluation plus 30 days.
- 90 days is maximum without explicit extension.
- Every evidence view, export, download, role switch, and access change is logged.

## States and Safety

| State | User-facing treatment |
| --- | --- |
| Loading | Skeleton matching final queue or case structure |
| Empty Operator queue | `No assigned reviews` with next shift or refresh information |
| No data | State what is unavailable and what will populate it |
| SLA risk | Plain-language remaining time and next escalation step |
| Critical safety | Clear warning, safe-handling instruction, acknowledgement |
| Access expired | Explain expiry and show request-access path |
| Model evidence unusable | Reason, evidence retained, request-more-data path |

## Responsive and Accessibility Rules

- Desktop uses queue plus detail layout. Under 768px, queue and detail become separate panels.
- Primary action remains visible, one per role screen.
- Keyboard users can reach queue, image controls, annotation tools, and actions in visual order.
- Image canvas must have text alternatives for object list and annotation state.
- All buttons and form controls have visible labels. No placeholder-only labels.
- Motion is optional and respects reduced-motion preference.
