# Development Team Module

## Purpose

Development Team bridges Operations, Development Team, and Development Team. PM keeps work visible and removes coordination delay.

## Primary Task

Make every active case have one owner, one next action, one due date, and visible blocker.

## What PM Sees

PM sees read-only operational metadata:

- Case ID and linked case.
- Current lifecycle stage.
- Current owner and active role.
- Due date, SLA state, and stagnation state.
- Latest decision, blocker, and next action.
- Required approval and completion evidence.

PM does not see raw images or full evidence unless Plant Manager grants case-specific access.

## Actions

| Action | Rule |
| --- | --- |
| Send reminder | Recipient, reason, and due date required |
| Record decision | Record Plant Manager decision, not replace it |
| Flag blockage | State blocker and owner needed to remove it |
| Link related case | Preserve lineage without changing operational status |
| Update coordination status | Never modify model, label, or policy data |

## Notification Rule

Portal remains source of truth. PM manual reminder appears in case history. Daily email summarizes progress. Immediate email is reserved for SLA breach or long stagnation.

## Case Continuity

Development Team recommends technical relation between failures. Plant Manager decides whether case reopens or linked case begins. PM records decision, communicates it, and tracks new next action.

## Completion Evidence

- No blocked case lacks owner or next action.
- Every reminder has traceable reason.
- All release handover updates reach Development Team, Development Team, and Plant Manager.

## Open Decisions

- Exact stagnation time by role after workload study.
- FYP email implementation versus documented notification prototype.
