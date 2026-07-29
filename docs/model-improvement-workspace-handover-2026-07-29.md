# PurityLoop AI Handover - Model Improvement Workspace

Generated: 2026-07-29, Malaysia time.

## Purpose

This handover is for a teammate to pick up the next workspace: a role-gated Model Improvement workspace for the Model Team and Web Team.

The workspace should only appear for registered Gmail accounts whose `user_profiles.role` is either:

- `model_team`
- `web_team`

The account must also be active, linked to Supabase Auth, and not soft-deleted.

## Current Repo State

- Project path: `/Users/thoochinfeng/Documents/PurityLoop AI/Capstone-Web v2`
- Current branch: `dashboards`
- Current commit: `8ff7603b6c659c4c02854e39639d09548778143d`
- Working tree at handover time: clean before this handover file was added
- Previous pushed checkpoint from 2026-07-28: `f28ba74f` - `Implement admin user management and auth fixes`

## Current Progress

Completed before this handover:

- Supabase Auth login now uses server-side sessions.
- `user_profiles` is the active role/profile table.
- Admin-only User Management workspace exists at `/admin/users`.
- Admin can create, edit, delete, and reset passwords for role accounts.
- Public signup was removed.
- Login error handling now separates credential, missing profile, inactive account, invalid role, database, and config failures.
- Logout now clears session and redirects to `/login`.
- Supported roles are centralized in `lib/admin.ts`:
  - `operator`
  - `team_lead`
  - `operations_manager`
  - `model_team`
  - `project_manager`
  - `web_team`
  - `admin`
- Existing non-admin authenticated users currently route into the operational app, mainly `/upload`.
- Browser ONNX single-image inference is already integrated through:
  - `components/UploadBrowserInferenceBridge.tsx`
  - `lib/inference/*`
  - `public/models/purityloop/best.onnx`
- Existing model contract documentation already lives under `docs/model-handover/`.
- Existing role/module planning already lives under `docs/ops-portal-master-plan/modules/`.
- July 28 progress is recorded in `docs/session-progress-2026-07-28.md`.

## Important Current Behavior

Current auth middleware behavior:

- unauthenticated users are redirected to `/login` for protected pages.
- active `admin` users are redirected to `/admin/users`.
- other active roles are redirected to `/upload` when they hit `/login` or `/`.
- `/admin/*` is only for admins.

This means the new Model Improvement workspace must add explicit route handling for `model_team` and `web_team`. Do not rely on the current default `/upload` redirect.

## Required Workspace

Build a new workspace for model improvement work. Suggested route:

```text
/model-improvement
```

Visibility/access rule:

- show only for logged-in users with active `user_profiles` row
- require `deleted_at IS NULL`
- require `auth.users.id = user_profiles.auth_user_id`
- require Gmail address if the product rule is literal Gmail-only
- allow only `model_team` and `web_team`
- reject all other roles

Suggested helper:

```ts
export function canAccessModelImprovement(profile: UserProfile) {
  return profile.status === "active" &&
    !profile.deleted_at &&
    ["model_team", "web_team"].includes(profile.role) &&
    profile.email.toLowerCase().endsWith("@gmail.com");
}
```

If Gmail-only means "normal registered email account" instead of literal `@gmail.com`, remove the domain check and keep Supabase Auth + profile linkage as the source of truth.

## Model Team Role Scope

Model Team workspace should help them:

- review assigned case evidence
- inspect original image, model version, predicted class, confidence, and boxes
- compare operator/team-lead correction
- mark examples usable or unusable with reason
- identify failure pattern:
  - small object
  - blur
  - overlap
  - lighting
  - mixed pile
  - class ambiguity
  - other supported reason
- write RCA hypothesis
- state next evidence needed
- set dataset readiness recommendation
- prepare technical model handover to Web Team

Do not let Model Team:

- change live labels directly
- approve business release
- deploy to operations
- browse global evidence without assignment

Source doc: `docs/ops-portal-master-plan/modules/model-team.md`.

## Web Team Role Scope

Web Team workspace should help them:

- receive approved model handover
- verify exact model artifact and hash
- check class IDs and label mapping
- confirm preprocessing and output decoding
- verify confidence and NMS values
- verify class-8/general-trash handling
- record integration status
- record rollback target
- report deployment readiness

Do not let Web Team:

- change class order
- silently replace model contract
- change threshold or NMS without Model Team handover
- display `general_trash` as a confident live result

Source doc: `docs/ops-portal-master-plan/modules/web-team.md`.

## Current Model Contract

Current approved browser model contract:

- model file: `public/models/purityloop/best.onnx`
- expected sha256: `9dc80d62c76f43326ea217b00e97441a2a9b4740a26ff1c930c237ba7626bb6b`
- classes: 9 fixed classes
- input: `1 x 3 x 640 x 640`
- preprocessing: letterbox to 640 with grey 114 padding, RGB, divide by 255, NCHW
- `output0`: `(1, 45, 8400)`
- `output1`: `(1, 32, 160, 160)`
- confidence threshold: `0.32`
- NMS IoU: `0.7`
- source of truth: `docs/model-handover/MODEL_FREEZE.md`

Do not change these values unless Model Team sends a new approved handover.

## Suggested Implementation Plan

1. Add shared role-access helper for non-admin workspaces.
2. Add middleware route rule for `/model-improvement`.
3. Add `app/model-improvement/page.tsx`.
4. Add navigation entry only for `model_team` and `web_team`.
5. Split UI by role:
   - `model_team`: RCA, evidence quality, dataset readiness, release handover draft
   - `web_team`: model contract checklist, integration checklist, rollback readiness
6. Store status data only after schema decision is confirmed.
7. Add minimal tests for access rules and route redirects.
8. Run local browser smoke test with model-team and web-team accounts.

## Suggested First UI Version

Keep version 1 small:

- one protected route
- two role-specific panels
- static checklist state if DB schema is not approved yet
- no new Supabase tables until data shape is confirmed
- no model retraining logic in the web app
- no deployment automation

This gives teammate a usable workspace shell without inventing backend workflow too early.

## Verification Checklist

Run before handoff back:

```bash
pnpm exec tsc --noEmit
git diff --check
```

Manual checks:

- unauthenticated `/model-improvement` redirects to `/login`
- active `model_team` Gmail user can open `/model-improvement`
- active `web_team` Gmail user can open `/model-improvement`
- active `operator` cannot open `/model-improvement`
- active `admin` behavior is still `/admin/users`
- inactive user redirects to `/login?reason=inactive`
- `/upload`, `/review`, `/analytics`, and admin user management still work

If backend or scan-history behavior is touched, also run focused backend tests:

```bash
python3 -m py_compile backend/main.py
python3 -m pytest backend/test_scan_history_contract.py backend/test_browser_verified_scan.py
```

## Later Plan

After teammate builds the first Model Improvement workspace:

- decide whether workspace data needs new Supabase tables or can start as existing scan/review metadata
- design assigned-case lifecycle for Model Team
- add Web Team release checklist persistence
- define export format for validated model-improvement examples
- define final retrain thresholds by class
- define model acceptance criteria before release
- add hosted verification after Vercel environment is fixed
- connect the workspace to real Review corrections and model failure evidence

## Known Open Items

- Hosted login still needs Vercel Production environment variables checked:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Expected hosted unauthenticated result for `/api/admin/users` after env fix is `401`, not `503`.
- Avoid running `pnpm build` while `pnpm dev` is active because `.next` dev artifacts can be corrupted.
- Do not commit secrets, `.env.local`, Google OAuth token files, or service-role keys.

## Key Files For Teammate

- `middleware.ts`
- `lib/admin.ts`
- `lib/supabase/server.ts`
- `app/auth/login/route.ts`
- `app/api/admin/users/route.ts`
- `app/admin/users/AdminUsersClient.tsx`
- `components/Sidebar.tsx`
- `components/MobileNav.tsx`
- `docs/session-progress-2026-07-28.md`
- `docs/model-handover/MODEL_FREEZE.md`
- `docs/model-handover/WEB_TEAM_HANDOVER.md`
- `docs/ops-portal-master-plan/modules/model-team.md`
- `docs/ops-portal-master-plan/modules/web-team.md`

## Suggested Prompt For Teammate

```text
Please build the PurityLoop Model Improvement workspace from docs/model-improvement-workspace-handover-2026-07-29.md.

Keep the first version minimal. Add a protected /model-improvement route visible only to active registered Gmail users whose user_profiles.role is model_team or web_team. Reuse existing Supabase Auth/profile logic. Do not change the model contract, class order, threshold, NMS, backend FastAPI flow, or Supabase table names unless required and explained.

Verify with pnpm exec tsc --noEmit, git diff --check, and manual login checks for model_team, web_team, operator, admin, inactive, and unauthenticated users.
```
