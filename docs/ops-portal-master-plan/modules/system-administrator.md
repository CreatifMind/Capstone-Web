# System Administrator Module

## Purpose

System Administrator controls identities, roles, evidence access, expiry, and audit trail. It does not run operations or model decisions.

## Primary Task

Give each person only access needed for active job and prove who accessed sensitive evidence.

## User and Role Management

- Invite user by email when real delivery supports it.
- FYP may use pre-created demo accounts when email is out of scope.
- A person may have multiple assigned roles only when needed.
- User selects one active role at a time.
- Active role determines navigation, actions, and audit context.

## Case-Scoped Evidence Access

Model Team receives read-only access to assigned feedback case only. Original images, model output, and HITL data are not globally searchable.

| Action | Default rule |
| --- | --- |
| View assigned evidence | Allowed, logged |
| Edit evidence | Not allowed |
| Download case file | Operations Manager approval required |
| Extend access | Approved extension and reason required |
| Closed case access | Ends after evaluation plus 30 days |
| Long access | 90-day maximum without explicit approved extension |

## Audit Events

Log at minimum:

- User invitation and activation.
- Role assignment and active-role switch.
- Evidence view, export, download, extension, and revocation.
- Access denial and expiry.
- Policy or release approval actor and time.

## Separation of Duties

Operations Manager approves operations and release. System Administrator manages access. This avoids one role both approving sensitive work and changing who can inspect its evidence.

## Completion Evidence

- Role switch changes available routes and actions.
- Expired user cannot view case evidence.
- Audit history identifies actor, event, target, time, and reason.

## Open Decisions

- Real authentication provider and invitation scope.
- Required evidence retention policy beyond FYP.
- Whether any external compliance requirement applies to source images.
