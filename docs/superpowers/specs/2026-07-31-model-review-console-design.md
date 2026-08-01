# Model Review Console — Design

## Source
Claude Design project `Model Review Console.dc.html` (imported via claude_design MCP), a 3-tab client-only prototype: Model team (upload image, run detection, flag false signals, trigger retrain), Web team (checkpoint status, latency, integrate retrain), Project manager (handoff stepper, task log, email-notify buttons). Original prototype used `MOCK_BOXES`, hardcoded `TASKS`, hardcoded `DAILY_FALSE_SIGNALS`, and simulated retrain via `setTimeout` — nothing persisted, nothing real.

This spec turns it into a real feature of the PurityLoop Next.js app: real ONNX detections, real persisted state shared across the team, no fake data.

## Decisions locked via Q&A
1. Route: `/model-review-console`, role-gated to `model_team` / `web_team` / `project_manager` only (not `admin` — admin stays locked to `/admin/users`, same lockout symmetry already used in `middleware.ts`).
2. Detection: real ONNX inference, reusing `lib/inference/{preprocess,onnx-session,postprocess}.ts` (same pipeline as `components/ModelTest.tsx`), not `MOCK_BOXES`.
3. Retrain, task log, email-notify, false-signal flags, and thresholds: all backed by real Supabase tables, not client-only mock state.
4. Confidence threshold: console-local UI control only. Does **not** write to `MODEL_CONFIG.confidenceThreshold` or affect production `/upload` detection — it only filters/re-scores what this console displays.
5. Threshold edit permissions: `model_team` edits confidence threshold; `web_team` and `project_manager` edit retrain threshold. Both live in one shared `model_review_settings` singleton row (team-wide, not per-user).
6. Email notify: persisted notification log only (`model_review_notifications`), no real email sent — this repo has no email-sending service (Resend/SendGrid/nodemailer) or API key today, and adding one is out of scope.
7. Task log: new real table (`model_review_tasks`), simple CRUD scoped to this console, no external Jira/Linear integration.
8. Inference latency panel: real but console-scoped — computed from this console's own detection-run timings (`model_review_runs.duration_ms`), not production traffic (no production inference-metrics pipeline exists anywhere in this app).

## Data model — new migration
File: `supabase/migrations/20260731000000_model_review_console.sql`

```sql
create table if not exists model_review_runs (
  id uuid primary key default gen_random_uuid(),
  run_by_email text not null,
  detection_count integer not null default 0,
  duration_ms numeric not null,
  created_at timestamptz not null default now()
);
create index if not exists model_review_runs_created_at_idx on model_review_runs (created_at desc);
alter table model_review_runs enable row level security;
revoke all on model_review_runs from anon, authenticated;

create table if not exists model_review_flags (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references model_review_runs(id) on delete set null,
  class_name text not null,
  confidence numeric not null,
  x1 numeric not null, y1 numeric not null, x2 numeric not null, y2 numeric not null,
  signal_type text not null check (signal_type in ('fp','fn')),
  suggested_label text not null default '',
  flagged_by_email text not null,
  resolved_at timestamptz,
  retrain_run_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists model_review_flags_created_at_idx on model_review_flags (created_at desc);
create index if not exists model_review_flags_unresolved_idx on model_review_flags (resolved_at) where resolved_at is null;
alter table model_review_flags enable row level security;
revoke all on model_review_flags from anon, authenticated;

create table if not exists model_review_retrain_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('queued','training','complete')),
  base_version text not null,
  new_version text,
  started_by_email text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  integrated boolean not null default false,
  integrated_by_email text,
  integrated_at timestamptz
);
alter table model_review_retrain_runs enable row level security;
revoke all on model_review_retrain_runs from anon, authenticated;

create table if not exists model_review_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  assignee_role text not null check (assignee_role in ('model_team','web_team','project_manager')),
  status text not null check (status in ('todo','in_progress','blocked','done')) default 'todo',
  url text not null default '',
  created_by_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table model_review_tasks enable row level security;
revoke all on model_review_tasks from anon, authenticated;

create table if not exists model_review_notifications (
  id uuid primary key default gen_random_uuid(),
  team text not null check (team in ('model','web')),
  notified_by_email text not null,
  created_at timestamptz not null default now()
);
alter table model_review_notifications enable row level security;
revoke all on model_review_notifications from anon, authenticated;

create table if not exists model_review_settings (
  id boolean primary key default true check (id),
  confidence_threshold numeric not null default 0.32,
  retrain_threshold integer not null default 5,
  updated_by_email text,
  updated_at timestamptz not null default now()
);
insert into model_review_settings (id) values (true) on conflict do nothing;
alter table model_review_settings enable row level security;
revoke all on model_review_settings from anon, authenticated;
```

All access via service-role client in API routes, same pattern as `model_rca_entries` in the (separate, unrelated) earlier `docs/model-improvement-implementation-plan-2026-07-29.md` plan.

## `lib/admin.ts`
Add `requireActiveModelReview()`: same shape as `requireActiveAdmin()`, role check `["model_team","web_team","project_manager"].includes(profile.role)`.

## `middleware.ts`
- Add `isModelReviewApi` (`pathname.startsWith("/api/model-review/")`) and `isModelReviewPage` (`pathname === "/model-review-console" || pathname.startsWith("/model-review-console/")`).
- Include both in the existing "not configured" / "no user → redirect to login" branches (alongside `isAdminPage`/`isOperational`).
- Include `isModelReviewApi` in the inactive/missing-profile pass-through branch (so the API can self-return 401/403 JSON instead of an HTML redirect).
- After the existing `admin` role branch, insert:
  ```ts
  if (["model_team", "web_team", "project_manager"].includes(profile.role)) {
    if (isModelReviewApi || isModelReviewPage) return response;
    return redirect(request, "/model-review-console", response);
  }
  ```
- These three roles never reach `isAdminApi`/`isAdminPage`/`isOperational`/`PUBLIC` branches below this point — locked to `/model-review-console` only, mirroring the `admin` lockout exactly.

## API routes
All under `app/api/model-review/`, each with a local `modelReviewContext()` mirroring `adminContext()` in `app/api/admin/users/route.ts` (calls `requireActiveModelReview()`, then role-specific 403 where noted).

- **`run/route.ts`** — `POST` (model_team only). Body: `{ detectionCount, durationMs }`. Inserts a `model_review_runs` row. Response `{ run }`.
- **`flags/route.ts`** — `GET` (all 3 roles): last 200 flags + 7-day daily counts (grouped by `created_at::date`) + unresolved weekly total → `{ flags, dailyBars, weeklyFalseSignals }`. `POST` (model_team only): body = one detection's flag fields; inserts a row. Response `{ flag }`.
- **`retrain/route.ts`** — `POST` start (model_team only): 409 if an unresolved retrain run is already `queued`/`training`; re-verify `weeklyFalseSignals >= retrainThreshold` server-side before allowing. Inserts `queued` row, then (synchronously, since there's no real training pipeline — this only marks workflow state) transitions to `training` then `complete` with a bumped `new_version`, and marks all currently-unresolved `model_review_flags` `resolved_at = now()`, `retrain_run_id = <this run>`. Response `{ retrainRun }`. `PATCH` integrate (web_team only): body `{ id }`; sets `integrated = true`. Response `{ retrainRun }`.
- **`tasks/route.ts`** — `GET` (all 3 roles). `POST` create (project_manager only). `PATCH` update status (project_manager only). Responses `{ tasks }` / `{ task }`.
- **`notifications/route.ts`** — `GET` (all 3 roles, last 6). `POST` (project_manager only): body `{ team }`. Response `{ notification }`.
- **`settings/route.ts`** — `GET` (all 3 roles). `PATCH`: body `{ confidenceThreshold }` (model_team only) or `{ retrainThreshold }` (web_team/project_manager only) — 403 if the field doesn't match the caller's role. Response `{ settings }`.

## Page & components
- `app/model-review-console/layout.tsx` ("use client") — minimal shell, no sidebar nav array (nothing else under this route), header + `/auth/signout` link, matching `app/model-improvement` pattern from the prior (separate) plan doc.
- `app/model-review-console/model-review-console.css` — `mrc-*` class prefix, reusing existing design tokens from `admin.css`.
- `app/model-review-console/page.tsx` (server component, `force-dynamic`): calls `requireActiveModelReview()`, redirects on error, passes `profile.role` to the client component to pick which single tab renders.
- `components/model-review-console/ModelReviewConsole.tsx` ("use client") — role switch renders one of:
  - `ModelTeamPanel.tsx` — image upload + real ONNX detection (reusing `lib/inference/*`, same as `ModelTest.tsx`), class filter (`MODEL_CONFIG.classes`), confidence-threshold slider (local display filter, persisted to `model_review_settings` on change), flag FP/FN per detection with suggested-label input, daily false-signal chart + retrain-readiness badge + Start retrain button, export-flags-JSON button.
  - `WebTeamPanel.tsx` — checkpoint version, copy-integration-snippet, latency stats (from own runs), retrain-threshold control, Mark integrated button when a `complete && !integrated` retrain run exists.
  - `PmPanel.tsx` — handoff stepper (images tested / flagged count / retrain status / live version), task log table (create/update status), notify buttons + log.

## Out of scope (explicitly, per the design's own logic)
- No real model training pipeline — "Start retrain" only records workflow state; nothing trains.
- No real email sending.
- No change to production `/upload` detection behavior or `MODEL_CONFIG`.
- Not related to / does not touch the separate, earlier `docs/model-improvement-implementation-plan-2026-07-29.md` (`model_rca_entries` / `web_team_checklist_entries` / `/model-improvement`) — that plan was never implemented and is a different feature (RCA on production scan corrections) from this one (a live testing console with mock-upload detections). Both can coexist; this spec does not modify or depend on it.

## Verification
- `pnpm exec tsc --noEmit`, `git diff --check`.
- Manual, using existing `model_team`/`web_team`/`project_manager` test accounts:
  - Each role lands on their own single-tab view at `/model-review-console`; hitting `/upload` bounces back here.
  - `model_team`: upload real image → real detections render with boxes; flag FP/FN persists and appears for `web_team`/`project_manager` too (shared state, reload confirms persistence); confidence slider changes displayed detections only, doesn't touch `/upload`.
  - Retrain button disabled until `weeklyFalseSignals >= retrainThreshold`; after starting, flags clear (resolved) and a new version appears for `web_team` to integrate.
  - `web_team`: Mark integrated flips `liveVersion`; latency panel shows real numbers from this console's own runs.
  - `project_manager`: create/update a task; send notification, log grows; reload confirms persistence.
  - `admin` still redirects to `/admin/users`; `operator`/other roles still land on `/upload`.
  - Cross-role 403s: `POST /api/model-review/run` as `web_team` → 403; `PATCH /api/model-review/settings` with `confidenceThreshold` as `web_team` → 403.

### Critical files
- `lib/admin.ts`, `middleware.ts`
- `lib/inference/{preprocess,onnx-session,postprocess,model-config,types}.ts` (reused, not modified)
- `app/api/admin/users/route.ts` (API pattern to mirror)
- `components/ModelTest.tsx` (detection-UI pattern to mirror)
- `app/admin/layout.tsx`, `app/admin/admin.css` (shell/style pattern to mirror)
