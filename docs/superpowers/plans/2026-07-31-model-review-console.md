# Model Review Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/model-review-console`, a role-gated Next.js page that ports the Claude Design "Model Review Console" prototype into a real feature: live ONNX detection testing, persisted false-signal flagging, a persisted retrain workflow, a persisted task log, and a persisted notification log — shared across `model_team`, `web_team`, and `project_manager` accounts.

**Architecture:** New Supabase tables (service-role only, RLS locked) hold all state that was previously client-only mock data in the prototype. New API routes under `app/api/model-review/` follow the existing `app/api/admin/users/route.ts` pattern (a local role-check helper per file, `NextResponse.json` errors). `middleware.ts` gets a new role branch that locks `model_team`/`web_team`/`project_manager` to `/model-review-console`, mirroring the existing `admin` → `/admin/users` lockout. The page renders one of three client panels based on the signed-in user's role; real detections come from the existing `lib/inference/*` ONNX pipeline already used by `components/ModelTest.tsx`.

**Tech Stack:** Next.js 14 app router, TypeScript, Supabase (service-role client), existing `lib/inference/*` ONNX pipeline, plain CSS (no CSS modules, following `app/admin/admin.css`'s pattern).

## Global Constraints

- Route: `/model-review-console`. Role-gated to `model_team`, `web_team`, `project_manager` only — not `admin` (admin stays locked to `/admin/users`).
- Detection: real ONNX inference via `lib/inference/{preprocess,onnx-session,postprocess}.ts` — no mock boxes.
- Confidence-threshold slider is console-local display filtering only. It never writes to `MODEL_CONFIG.confidenceThreshold` and never affects production `/upload`.
- No real email sending exists or is added. "Notify" actions only write a row to `model_review_notifications`.
- No real ML training pipeline exists or is added. "Start retrain" only records workflow state (a `model_review_retrain_runs` row) and marks currently-unresolved flags resolved; nothing trains.
- Retrain-threshold and confidence-threshold values live in one shared singleton row (`model_review_settings`), not per-user.
- `model_team` may edit `confidence_threshold`. `web_team` and `project_manager` may edit `retrain_threshold`. Any other role/field combination on `PATCH /api/model-review/settings` is a 403.
- Every new API route requires an active session with role in `["model_team","web_team","project_manager"]` (via `requireActiveModelReview()`), plus the extra per-route role check noted in that task.
- New tables: `revoke all ... from anon, authenticated` — service-role only, no RLS policies (same convention as `model_rca_entries` in the unrelated, never-implemented `docs/model-improvement-implementation-plan-2026-07-29.md`).
- This plan does not modify or depend on `docs/model-improvement-implementation-plan-2026-07-29.md` or anything under `docs/model-improvement-workspace/` — that is a separate, never-built feature (RCA on production scan corrections). Do not touch those files.
- No test framework (Jest/Vitest) exists in this repo. The one precedent, `tests/classification.test.cjs`, is a plain Node script using `node:assert` — regex-matching against page/component source for React/Next files (since JSX can't easily run in bare Node), and real function execution for plain-JS logic. This plan follows that exact convention in a new `tests/model-review-console.test.cjs`, run with `node tests/model-review-console.test.cjs`.
- Verification command for every task that touches a `.ts`/`.tsx` file: `pnpm exec tsc --noEmit`, expected: no output, exit code 0.

---

## Task 1: Migration + `requireActiveModelReview()`

**Files:**
- Create: `supabase/migrations/20260731000000_model_review_console.sql`
- Modify: `lib/admin.ts` (append after `requireActiveAdmin`, i.e. after the closing `}` currently on line 34)
- Create: `tests/model-review-console.test.cjs`

**Interfaces:**
- Produces: `requireActiveModelReview(): Promise<{ error: "unauthenticated" | "forbidden" } | { user: User; profile: UserProfile; service: ReturnType<typeof createSupabaseServiceClient> }>` exported from `lib/admin.ts`. Every later API-route task calls this.
- Produces: six tables — `model_review_runs`, `model_review_flags`, `model_review_retrain_runs`, `model_review_tasks`, `model_review_notifications`, `model_review_settings` — that every later task's API routes read/write.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260731000000_model_review_console.sql`:

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

This file is not run automatically (no Supabase CLI config in this repo, same as every prior migration file) — it must be run manually against the live Supabase project before Task 3 onward can work end-to-end. Note this to the user when this task is done.

- [ ] **Step 2: Add `requireActiveModelReview()` to `lib/admin.ts`**

Append immediately after the existing `requireActiveAdmin` function (after its closing `}`):

```ts
const MODEL_REVIEW_ROLES = new Set<Role>(["model_team", "web_team", "project_manager"]);

export async function requireActiveModelReview() {
  const sessionClient = createSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) return { error: "unauthenticated" as const };

  const service = createSupabaseServiceClient();
  const { data: profile, error: profileError } = await service
    .from("user_profiles")
    .select("id, auth_user_id, name, email, role, status, created_at, updated_at, deleted_at")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle<UserProfile>();
  if (profileError || !profile || profile.status !== "active" || !MODEL_REVIEW_ROLES.has(profile.role)) return { error: "forbidden" as const };
  return { user, profile, service };
}
```

- [ ] **Step 3: Create the test file and assert the new pieces exist**

Create `tests/model-review-console.test.cjs`:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");

const migration = fs.readFileSync("supabase/migrations/20260731000000_model_review_console.sql", "utf8");
const adminLib = fs.readFileSync("lib/admin.ts", "utf8");

assert.match(migration, /create table if not exists model_review_runs/);
assert.match(migration, /create table if not exists model_review_flags/);
assert.match(migration, /create table if not exists model_review_retrain_runs/);
assert.match(migration, /create table if not exists model_review_tasks/);
assert.match(migration, /create table if not exists model_review_notifications/);
assert.match(migration, /create table if not exists model_review_settings/);
assert.match(migration, /revoke all on model_review_runs from anon, authenticated/);
assert.match(adminLib, /export async function requireActiveModelReview\(\)/);
assert.match(adminLib, /MODEL_REVIEW_ROLES = new Set<Role>\(\["model_team", "web_team", "project_manager"\]\)/);

console.log("model review console tests passed");
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 5: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260731000000_model_review_console.sql lib/admin.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review console tables and requireActiveModelReview"
```

---

## Task 2: Middleware routing

**Files:**
- Modify: `middleware.ts` (whole-file replace — the file is 61 lines, easier to replace in full than patch piecemeal)
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: nothing from Task 1 directly (middleware queries `user_profiles` over REST, not via `lib/admin.ts`).
- Produces: `model_team`/`web_team`/`project_manager` requests to any path other than `/model-review-console*` or `/api/model-review/*` redirect to `/model-review-console`. Later manual verification (Task 14) depends on this.

- [ ] **Step 1: Replace `middleware.ts` in full**

```ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = new Set(["/", "/login"]);
const OPERATIONAL = ["/upload", "/review", "/analytics", "/settings", "/result", "/log", "/model-test"];
const MODEL_REVIEW_ROLES = new Set(["model_team", "web_team", "project_manager"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/assets") || pathname.startsWith("/css") || pathname.startsWith("/js") || pathname.includes(".")) return NextResponse.next();

  const isAdminApi = pathname.startsWith("/api/admin/");
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isModelReviewApi = pathname.startsWith("/api/model-review/");
  const isModelReviewPage = pathname === "/model-review-console" || pathname.startsWith("/model-review-console/");
  const isOperational = OPERATIONAL.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    if (isAdminApi || isModelReviewApi) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
    return isAdminPage || isModelReviewPage || isOperational ? redirect(request, "/login", response) : response;
  }
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items: { name: string; value: string; options: CookieOptions }[]) => { items.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (isAdminApi || isModelReviewApi) return response;
    if (isAdminPage || isModelReviewPage || isOperational) return redirect(request, "/login", response);
    return response;
  }

  const profileResponse = await fetch(`${url}/rest/v1/user_profiles?select=role,status,deleted_at&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, cache: "no-store"
  });
  const profiles = profileResponse.ok ? await profileResponse.json() as { role: string; status: string; deleted_at: string | null }[] : [];
  const profile = profiles[0];
  if (!profile || profile.status !== "active" || profile.deleted_at) {
    await supabase.auth.signOut();
    if (isAdminApi || isModelReviewApi) return response;
    return redirect(request, "/login?reason=inactive", response);
  }
  if (profile.role === "admin") {
    if (isAdminApi || isAdminPage) return response;
    return redirect(request, "/admin/users", response);
  }
  if (MODEL_REVIEW_ROLES.has(profile.role)) {
    if (isModelReviewApi || isModelReviewPage) return response;
    return redirect(request, "/model-review-console", response);
  }
  if (isAdminApi) return response;
  if (isAdminPage) return redirect(request, "/upload", response);
  if (isModelReviewApi) return response;
  if (isModelReviewPage) return redirect(request, "/upload", response);
  if (PUBLIC.has(pathname)) return redirect(request, "/upload", response);
  return response;
}

function redirect(request: NextRequest, path: string, source: NextResponse) {
  const response = NextResponse.redirect(new URL(path, request.url));
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = { matcher: ["/((?!api/auth|auth/signout).*)"] };
```

- [ ] **Step 2: Append assertions to `tests/model-review-console.test.cjs`**

Insert before the final `console.log(...)` line:

```js
const middleware = fs.readFileSync("middleware.ts", "utf8");
assert.match(middleware, /const isModelReviewApi = pathname\.startsWith\("\/api\/model-review\/"\)/);
assert.match(middleware, /const isModelReviewPage = pathname === "\/model-review-console"/);
assert.match(middleware, /if \(MODEL_REVIEW_ROLES\.has\(profile\.role\)\) \{/);
assert.match(middleware, /return redirect\(request, "\/model-review-console", response\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts tests/model-review-console.test.cjs
git commit -m "feat: lock model_team/web_team/project_manager to /model-review-console"
```

---

## Task 3: API route — `run`

**Files:**
- Create: `app/api/model-review/run/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()` from Task 1; `model_review_runs` table from Task 1.
- Produces: `GET` → `{ imagesTested: number, latency: { avg: number, p50: number, p95: number, p99: number, samples: number } }`. `POST` body `{ detectionCount: number, durationMs: number }` → `{ run: { id, run_by_email, detection_count, duration_ms, created_at } }`. `ModelTeamPanel` (Task 11) POSTs after every detection run; `ModelReviewConsole` (Task 10) GETs this on load for the shared stats row.

- [ ] **Step 1: Write `app/api/model-review/run/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const RETAIN_RUNS_FOR_LATENCY = 200;

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;

  const { count, error: countError } = await service.from("model_review_runs").select("id", { count: "exact", head: true });
  if (countError) return failure("Unable to load run count.", 500);

  const { data: recent, error: recentError } = await service
    .from("model_review_runs")
    .select("duration_ms")
    .order("created_at", { ascending: false })
    .limit(RETAIN_RUNS_FOR_LATENCY);
  if (recentError) return failure("Unable to load latency samples.", 500);

  const durations = (recent || []).map((row) => Number(row.duration_ms)).sort((a, b) => a - b);
  const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  return NextResponse.json({
    imagesTested: count || 0,
    latency: {
      avg: Math.round(avg),
      p50: Math.round(percentile(durations, 0.5)),
      p95: Math.round(percentile(durations, 0.95)),
      p99: Math.round(percentile(durations, 0.99)),
      samples: durations.length
    }
  });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["model_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const detectionCount = typeof body?.detectionCount === "number" ? body.detectionCount : NaN;
  const durationMs = typeof body?.durationMs === "number" ? body.durationMs : NaN;
  if (!Number.isFinite(detectionCount) || detectionCount < 0 || !Number.isFinite(durationMs) || durationMs < 0) {
    return failure("detectionCount and durationMs must be non-negative numbers.", 422);
  }

  const { data: run, error } = await service
    .from("model_review_runs")
    .insert({ run_by_email: profile.email, detection_count: detectionCount, duration_ms: durationMs })
    .select("id, run_by_email, detection_count, duration_ms, created_at")
    .single();
  if (error) return failure("Unable to record run.", 500);
  return NextResponse.json({ run }, { status: 201 });
}
```

- [ ] **Step 2: Append assertions**

```js
const runRoute = fs.readFileSync("app/api/model-review/run/route.ts", "utf8");
assert.match(runRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(runRoute, /from\("model_review_runs"\)/);
assert.match(runRoute, /detectionCount and durationMs must be non-negative numbers/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/run/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review run-logging API route"
```

---

## Task 4: API route — `flags`

**Files:**
- Create: `app/api/model-review/flags/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()`, `model_review_flags` table.
- Produces: `GET` → `{ flags: FlagRow[], dailyBars: { day: string, count: number }[], weeklyFalseSignals: number }`. `POST` body `{ runId: string|null, className: string, confidence: number, x1: number, y1: number, x2: number, y2: number, signalType: "fp"|"fn", suggestedLabel: string }` → `{ flag: FlagRow }`. `FlagRow = { id, run_id, class_name, confidence, x1, y1, x2, y2, signal_type, suggested_label, flagged_by_email, resolved_at, retrain_run_id, created_at }`. Consumed by `ModelTeamPanel` (flag button), `ModelReviewConsole` shared stats, and `PmPanel`'s handoff stepper.

- [ ] **Step 1: Write `app/api/model-review/flags/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const FLAG_TYPES = new Set(["fp", "fn"]);
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;

  const { data: flags, error } = await service
    .from("model_review_flags")
    .select("id, run_id, class_name, confidence, x1, y1, x2, y2, signal_type, suggested_label, flagged_by_email, resolved_at, retrain_run_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return failure("Unable to load flags.", 500);

  const { count: unresolvedCount, error: unresolvedError } = await service
    .from("model_review_flags")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  if (unresolvedError) return failure("Unable to load flag counts.", 500);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const dailyCounts = new Map<string, number>();
  (flags || []).forEach((flag) => {
    const createdAt = new Date(flag.created_at);
    if (createdAt < sevenDaysAgo) return;
    const key = createdAt.toDateString();
    dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
  });
  const dailyBars = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + offset);
    return { day: DAY_LABELS[day.getDay()], count: dailyCounts.get(day.toDateString()) || 0 };
  });

  return NextResponse.json({ flags: flags || [], dailyBars, weeklyFalseSignals: unresolvedCount || 0 });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["model_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const runId = typeof body?.runId === "string" ? body.runId : null;
  const className = typeof body?.className === "string" ? body.className : "";
  const confidence = typeof body?.confidence === "number" ? body.confidence : NaN;
  const x1 = typeof body?.x1 === "number" ? body.x1 : NaN;
  const y1 = typeof body?.y1 === "number" ? body.y1 : NaN;
  const x2 = typeof body?.x2 === "number" ? body.x2 : NaN;
  const y2 = typeof body?.y2 === "number" ? body.y2 : NaN;
  const signalType = typeof body?.signalType === "string" ? body.signalType : "";
  const suggestedLabel = typeof body?.suggestedLabel === "string" ? body.suggestedLabel : "";

  if (!className || !FLAG_TYPES.has(signalType) || [confidence, x1, y1, x2, y2].some((value) => !Number.isFinite(value))) {
    return failure("className, confidence, coordinates, and a valid signalType (fp/fn) are required.", 422);
  }

  const { data: flag, error } = await service
    .from("model_review_flags")
    .insert({
      run_id: runId, class_name: className, confidence, x1, y1, x2, y2,
      signal_type: signalType, suggested_label: suggestedLabel, flagged_by_email: profile.email
    })
    .select("id, run_id, class_name, confidence, x1, y1, x2, y2, signal_type, suggested_label, flagged_by_email, resolved_at, retrain_run_id, created_at")
    .single();
  if (error) return failure("Unable to record flag.", 500);
  return NextResponse.json({ flag }, { status: 201 });
}
```

- [ ] **Step 2: Append assertions**

```js
const flagsRoute = fs.readFileSync("app/api/model-review/flags/route.ts", "utf8");
assert.match(flagsRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(flagsRoute, /from\("model_review_flags"\)/);
assert.match(flagsRoute, /FLAG_TYPES = new Set\(\["fp", "fn"\]\)/);
assert.match(flagsRoute, /is\("resolved_at", null\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/flags/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review flags API route"
```

---

## Task 5: API route — `retrain`

**Files:**
- Create: `app/api/model-review/retrain/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()`, `model_review_retrain_runs`, `model_review_flags`, `model_review_settings` tables.
- Produces: `GET` → `{ current: RetrainRun | null, liveVersion: string, pendingVersion: string | null }`. `POST` (model_team) → `{ retrainRun: RetrainRun }`, 201, or 409/422 on failure. `PATCH` body `{ id: string }` (web_team) → `{ retrainRun: RetrainRun }`. `RetrainRun = { id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at }`. Consumed by `WebTeamPanel` (integrate button), `ModelTeamPanel` (start retrain button), `ModelReviewConsole` shared stats.
- Note: this route starts and completes a retrain synchronously in one request — there is no real training pipeline to wait on (per Global Constraints), so there is no `queued`/`training` waiting period in practice even though the schema still allows those status values for future use.

- [ ] **Step 1: Write `app/api/model-review/retrain/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const INITIAL_MODEL_VERSION = "yolov8-purityloop v1.4.2";

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

function bumpVersion(version: string) {
  return version.replace(/(\d+)(?!.*\d)/, (match) => String(Number(match) + 1));
}

async function currentVersions(service: ReturnType<typeof createSupabaseServiceClient>) {
  const { data: latestIntegrated } = await service
    .from("model_review_retrain_runs")
    .select("new_version")
    .eq("integrated", true)
    .order("integrated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: pending } = await service
    .from("model_review_retrain_runs")
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .eq("status", "complete")
    .eq("integrated", false)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    liveVersion: latestIntegrated?.new_version || INITIAL_MODEL_VERSION,
    pendingRun: pending || null
  };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { liveVersion, pendingRun } = await currentVersions(service);
  return NextResponse.json({ current: pendingRun, liveVersion, pendingVersion: pendingRun?.new_version || null });
}

export async function POST() {
  const checked = await modelReviewContext(["model_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;

  const { count: activeCount, error: activeError } = await service
    .from("model_review_retrain_runs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "training"]);
  if (activeError) return failure("Unable to check retrain status.", 500);
  if ((activeCount || 0) > 0) return failure("A retrain is already in progress.", 409);

  const { data: settings, error: settingsError } = await service.from("model_review_settings").select("retrain_threshold").eq("id", true).single();
  if (settingsError || !settings) return failure("Unable to load retrain threshold.", 500);
  const { count: unresolvedCount, error: unresolvedError } = await service
    .from("model_review_flags")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);
  if (unresolvedError) return failure("Unable to check flagged signals.", 500);
  if ((unresolvedCount || 0) < settings.retrain_threshold) return failure("Not enough flagged false signals to trigger a retrain yet.", 422);

  const { liveVersion } = await currentVersions(service);
  const newVersion = bumpVersion(liveVersion);
  const nowIso = new Date().toISOString();

  const { data: retrainRun, error: insertError } = await service
    .from("model_review_retrain_runs")
    .insert({ status: "complete", base_version: liveVersion, new_version: newVersion, started_by_email: profile.email, started_at: nowIso, completed_at: nowIso })
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .single();
  if (insertError) return failure("Unable to start retrain.", 500);

  const { error: resolveError } = await service
    .from("model_review_flags")
    .update({ resolved_at: nowIso, retrain_run_id: retrainRun.id })
    .is("resolved_at", null);
  if (resolveError) return failure("Retrain recorded, but unable to resolve flagged signals.", 500);

  return NextResponse.json({ retrainRun }, { status: 201 });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext(["web_team"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return failure("Retrain run id is required.", 422);

  const { data: retrainRun, error } = await service
    .from("model_review_retrain_runs")
    .update({ integrated: true, integrated_by_email: profile.email, integrated_at: new Date().toISOString() })
    .eq("id", id).eq("status", "complete").eq("integrated", false)
    .select("id, status, base_version, new_version, started_by_email, started_at, completed_at, integrated, integrated_by_email, integrated_at")
    .single();
  if (error || !retrainRun) return failure("Retrain run not found or already integrated.", 404);
  return NextResponse.json({ retrainRun });
}
```

- [ ] **Step 2: Append assertions**

```js
const retrainRoute = fs.readFileSync("app/api/model-review/retrain/route.ts", "utf8");
assert.match(retrainRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(retrainRoute, /modelReviewContext\(\["web_team"\]\)/);
assert.match(retrainRoute, /Not enough flagged false signals to trigger a retrain yet/);
assert.match(retrainRoute, /A retrain is already in progress/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/retrain/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review retrain API route"
```

---

## Task 6: API route — `tasks`

**Files:**
- Create: `app/api/model-review/tasks/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()`, `model_review_tasks` table.
- Produces: `GET` → `{ tasks: TaskRow[] }`. `POST` body `{ title: string, assigneeRole: "model_team"|"web_team"|"project_manager", url: string }` (project_manager only) → `{ task: TaskRow }`, 201. `PATCH` body `{ id: string, status: "todo"|"in_progress"|"blocked"|"done" }` (project_manager only) → `{ task: TaskRow }`. `TaskRow = { id, title, assignee_role, status, url, created_by_email, created_at, updated_at }`. Consumed by `PmPanel`.

- [ ] **Step 1: Write `app/api/model-review/tasks/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);
const ASSIGNEE_ROLES = new Set(["model_team", "web_team", "project_manager"]);

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: tasks, error } = await service
    .from("model_review_tasks")
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return failure("Unable to load tasks.", 500);
  return NextResponse.json({ tasks: tasks || [] });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const assigneeRole = typeof body?.assigneeRole === "string" ? body.assigneeRole : "";
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!title || !ASSIGNEE_ROLES.has(assigneeRole)) return failure("A title and a valid assignee role are required.", 422);

  const { data: task, error } = await service
    .from("model_review_tasks")
    .insert({ title, assignee_role: assigneeRole, url, created_by_email: profile.email })
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .single();
  if (error) return failure("Unable to create task.", 500);
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const status = typeof body?.status === "string" ? body.status : "";
  if (!id || !STATUSES.has(status)) return failure("A task id and a valid status are required.", 422);

  const { data: task, error } = await service
    .from("model_review_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, title, assignee_role, status, url, created_by_email, created_at, updated_at")
    .single();
  if (error || !task) return failure("Task not found.", 404);
  return NextResponse.json({ task });
}
```

- [ ] **Step 2: Append assertions**

```js
const tasksRoute = fs.readFileSync("app/api/model-review/tasks/route.ts", "utf8");
assert.match(tasksRoute, /modelReviewContext\(\["project_manager"\]\)/);
assert.match(tasksRoute, /from\("model_review_tasks"\)/);
assert.match(tasksRoute, /STATUSES = new Set\(\["todo", "in_progress", "blocked", "done"\]\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/tasks/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review tasks API route"
```

---

## Task 7: API route — `notifications`

**Files:**
- Create: `app/api/model-review/notifications/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()`, `model_review_notifications` table.
- Produces: `GET` → `{ notifications: NotificationRow[] }`. `POST` body `{ team: "model"|"web" }` (project_manager only) → `{ notification: NotificationRow }`, 201. `NotificationRow = { id, team, notified_by_email, created_at }`. Consumed by `PmPanel`.

- [ ] **Step 1: Write `app/api/model-review/notifications/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

const TEAMS = new Set(["model", "web"]);

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: notifications, error } = await service
    .from("model_review_notifications")
    .select("id, team, notified_by_email, created_at")
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) return failure("Unable to load notifications.", 500);
  return NextResponse.json({ notifications: notifications || [] });
}

export async function POST(request: Request) {
  const checked = await modelReviewContext(["project_manager"]);
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const team = typeof body?.team === "string" ? body.team : "";
  if (!TEAMS.has(team)) return failure("A valid team (model/web) is required.", 422);

  const { data: notification, error } = await service
    .from("model_review_notifications")
    .insert({ team, notified_by_email: profile.email })
    .select("id, team, notified_by_email, created_at")
    .single();
  if (error) return failure("Unable to record notification.", 500);
  return NextResponse.json({ notification }, { status: 201 });
}
```

- [ ] **Step 2: Append assertions**

```js
const notificationsRoute = fs.readFileSync("app/api/model-review/notifications/route.ts", "utf8");
assert.match(notificationsRoute, /modelReviewContext\(\["project_manager"\]\)/);
assert.match(notificationsRoute, /from\("model_review_notifications"\)/);
assert.match(notificationsRoute, /TEAMS = new Set\(\["model", "web"\]\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/notifications/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review notifications API route"
```

---

## Task 8: API route — `settings`

**Files:**
- Create: `app/api/model-review/settings/route.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()`, `model_review_settings` table.
- Produces: `GET` → `{ settings: ConsoleSettings }`. `PATCH` body `{ confidenceThreshold: number }` (model_team only, 0.1–0.9) or `{ retrainThreshold: number }` (web_team/project_manager only, integer 1–30) → `{ settings: ConsoleSettings }`. `ConsoleSettings = { confidence_threshold, retrain_threshold, updated_by_email, updated_at }`. Consumed by `ModelTeamPanel` (confidence slider), `WebTeamPanel` (retrain-threshold slider), `ModelReviewConsole` shared stats.

- [ ] **Step 1: Write `app/api/model-review/settings/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireActiveModelReview } from "@/lib/admin";

function failure(message: string, status: number) { return NextResponse.json({ error: message }, { status }); }

async function modelReviewContext(allowedRoles?: string[]) {
  let context: Awaited<ReturnType<typeof requireActiveModelReview>>;
  try { context = await requireActiveModelReview(); } catch { return { response: failure("Authentication is not configured.", 503) }; }
  if ("error" in context) return { response: failure(context.error === "unauthenticated" ? "Authentication required." : "Model review access required.", context.error === "unauthenticated" ? 401 : 403) };
  if (allowedRoles && !allowedRoles.includes(context.profile.role)) return { response: failure("Your role cannot perform this action.", 403) };
  return { context };
}

export async function GET() {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service } = checked.context;
  const { data: settings, error } = await service
    .from("model_review_settings")
    .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
    .eq("id", true)
    .single();
  if (error || !settings) return failure("Unable to load settings.", 500);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const checked = await modelReviewContext();
  if ("response" in checked) return checked.response;
  const { service, profile } = checked.context;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;

  if (typeof body?.confidenceThreshold === "number") {
    if (profile.role !== "model_team") return failure("Only model_team can edit the confidence threshold.", 403);
    const value = body.confidenceThreshold;
    if (value < 0.1 || value > 0.9) return failure("confidenceThreshold must be between 0.1 and 0.9.", 422);
    const { data: settings, error } = await service
      .from("model_review_settings")
      .update({ confidence_threshold: value, updated_by_email: profile.email, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
      .single();
    if (error || !settings) return failure("Unable to update settings.", 500);
    return NextResponse.json({ settings });
  }

  if (typeof body?.retrainThreshold === "number") {
    if (!["web_team", "project_manager"].includes(profile.role)) return failure("Only web_team or project_manager can edit the retrain threshold.", 403);
    const value = body.retrainThreshold;
    if (!Number.isInteger(value) || value < 1 || value > 30) return failure("retrainThreshold must be an integer between 1 and 30.", 422);
    const { data: settings, error } = await service
      .from("model_review_settings")
      .update({ retrain_threshold: value, updated_by_email: profile.email, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("confidence_threshold, retrain_threshold, updated_by_email, updated_at")
      .single();
    if (error || !settings) return failure("Unable to update settings.", 500);
    return NextResponse.json({ settings });
  }

  return failure("Provide confidenceThreshold or retrainThreshold.", 422);
}
```

- [ ] **Step 2: Append assertions**

```js
const settingsRoute = fs.readFileSync("app/api/model-review/settings/route.ts", "utf8");
assert.match(settingsRoute, /Only model_team can edit the confidence threshold/);
assert.match(settingsRoute, /Only web_team or project_manager can edit the retrain threshold/);
assert.match(settingsRoute, /from\("model_review_settings"\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/model-review/settings/route.ts tests/model-review-console.test.cjs
git commit -m "feat: add model review settings API route"
```

---

## Task 9: Page shell — layout, CSS, page, shared types

**Files:**
- Create: `app/model-review-console/layout.tsx`
- Create: `app/model-review-console/model-review-console.css`
- Create: `app/model-review-console/page.tsx`
- Create: `components/model-review-console/types.ts`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `requireActiveModelReview()` from Task 1; `PageHtml` from `components/PageHtml.tsx` (props `{ bodyClass: string; dataPage?: string; children: ReactNode }`).
- Produces: `ModelReviewRole = "model_team" | "web_team" | "project_manager"`, `FlagRow`, `RetrainRun`, `TaskRow`, `NotificationRow`, `ConsoleSettings`, `SharedStats` types in `components/model-review-console/types.ts`, imported by every component task below. `page.tsx` renders `<ModelReviewConsole role={...} />` (built in Task 10) — this task must NOT try to import `ModelReviewConsole` yet since it doesn't exist; instead this task creates a placeholder import that Task 10 will make real (see Step 1 note).

- [ ] **Step 1: Write `components/model-review-console/types.ts`**

```ts
export type ModelReviewRole = "model_team" | "web_team" | "project_manager";

export type FlagRow = {
  id: string;
  run_id: string | null;
  class_name: string;
  confidence: number;
  x1: number; y1: number; x2: number; y2: number;
  signal_type: "fp" | "fn";
  suggested_label: string;
  flagged_by_email: string;
  resolved_at: string | null;
  retrain_run_id: string | null;
  created_at: string;
};

export type RetrainRun = {
  id: string;
  status: "queued" | "training" | "complete";
  base_version: string;
  new_version: string | null;
  started_by_email: string;
  started_at: string;
  completed_at: string | null;
  integrated: boolean;
  integrated_by_email: string | null;
  integrated_at: string | null;
};

export type TaskRow = {
  id: string;
  title: string;
  assignee_role: ModelReviewRole;
  status: "todo" | "in_progress" | "blocked" | "done";
  url: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: string;
  team: "model" | "web";
  notified_by_email: string;
  created_at: string;
};

export type ConsoleSettings = {
  confidence_threshold: number;
  retrain_threshold: number;
  updated_by_email: string | null;
  updated_at: string;
};

export type SharedStats = {
  imagesTested: number;
  latency: { avg: number; p50: number; p95: number; p99: number; samples: number };
  weeklyFalseSignals: number;
  dailyBars: { day: string; count: number }[];
  liveVersion: string;
  pendingVersion: string | null;
  currentRetrainRun: RetrainRun | null;
  settings: ConsoleSettings;
};
```

- [ ] **Step 2: Write `app/model-review-console/model-review-console.css`**

```css
.mrc-shell { display: flex; flex-direction: column; min-height: 100vh; }
.mrc-topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 28px 32px 0; }
.mrc-topbar h1 { margin: 0 0 6px; font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 700; }
.mrc-topbar p { margin: 0; color: var(--text-secondary, var(--muted)); }
.mrc-logout { color: var(--text-primary, var(--text)); text-decoration: none; font-weight: 600; }
.mrc-body { flex: 1; padding: 20px 32px 56px; display: grid; gap: 16px; }

.mrc-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.mrc-stat-card { padding: 16px 18px; }
.mrc-stat-label { margin: 0; color: var(--text-secondary, var(--muted)); font-size: .76rem; font-weight: 600; }
.mrc-stat-value { margin: 6px 0 0; font-size: 1.5rem; font-weight: 700; }
.mrc-stat-warn { color: #c9743f; }
.mrc-stat-small { font-size: 1rem; }
.mrc-stat-mono { font-family: "IBM Plex Mono", monospace; font-size: .95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.mrc-card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface-elevated, var(--surface)); box-shadow: var(--shadow-sm); padding: 20px; }
.mrc-card h2 { margin: 0 0 12px; font-size: 1.02rem; font-weight: 700; }
.mrc-muted { color: var(--text-secondary, var(--muted)); }

.mrc-controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.mrc-btn-primary { min-height: 42px; border-radius: var(--radius-sm); padding: 0 18px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--primary); background: var(--primary); color: #fff; }
.mrc-btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.mrc-btn-secondary { min-height: 42px; border-radius: var(--radius-sm); padding: 0 18px; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--text-primary, var(--text)); }
.mrc-btn-secondary:disabled { opacity: .55; cursor: not-allowed; }
.mrc-disabled { opacity: .55; }
input[type="file"] { display: none; }

.mrc-status { margin: 0; padding: 11px 14px; border-radius: var(--radius-sm); background: var(--surface); border: 1px solid var(--border); }
.mrc-error { margin: 0; padding: 11px 14px; border-radius: var(--radius-sm); background: var(--danger-soft); border: 1px solid var(--danger); color: var(--danger); }

.mrc-toolbar { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; }
.mrc-field { display: flex; flex-direction: column; gap: 6px; font-size: .8rem; font-weight: 600; color: var(--text-secondary, var(--muted)); }
.mrc-field select, .mrc-field input[type="range"] { min-height: 38px; }
.mrc-retrain-controls { display: flex; align-items: center; gap: 12px; }
.mrc-badge { padding: 6px 13px; border-radius: 999px; font-size: .78rem; font-weight: 700; background: var(--surface-muted, var(--light)); color: var(--text-secondary, var(--muted)); }
.mrc-badge-ready { background: var(--primary-soft, var(--primary-xlight)); color: var(--primary); }

.mrc-chart { display: flex; align-items: flex-end; gap: 12px; height: 96px; }
.mrc-chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; height: 100%; justify-content: flex-end; font-size: .72rem; color: var(--text-secondary, var(--muted)); }
.mrc-bar { width: 100%; max-width: 30px; background: var(--primary); border-radius: 5px 5px 0 0; }

.mrc-grid-2 { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, 1fr); gap: 16px; }
.mrc-image-stage { position: relative; width: 100%; overflow: hidden; border-radius: var(--radius-sm); background: var(--surface-muted, var(--light)); line-height: 0; }
.mrc-image-stage img { display: block; width: 100%; height: auto; }
.mrc-image-stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.mrc-box rect:first-child { fill: rgba(53, 240, 139, .08); stroke: var(--primary); stroke-width: 3; }
.mrc-box-label-bg { fill: var(--primary); }
.mrc-box text { fill: #fff; font: 700 12px Arial, sans-serif; }

.mrc-detection-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
.mrc-detection-list li { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.mrc-detection-list small { grid-column: 1 / -1; overflow-wrap: anywhere; color: var(--text-secondary, var(--muted)); }
.mrc-confidence { color: var(--primary); font-weight: 800; }
.mrc-flagged-tag { grid-column: 1 / -1; justify-self: start; font-size: .78rem; font-weight: 600; padding: 5px 11px; border-radius: 7px; background: #fef8f3; color: #c9743f; }
.mrc-flag-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; }
.mrc-flag-actions input { flex: 1 1 100%; min-height: 36px; padding: 0 9px; border-radius: 7px; border: 1px solid var(--border); }
.mrc-flag-actions button { font-size: .76rem; font-weight: 600; padding: 5px 10px; border-radius: 7px; cursor: pointer; border: 1px solid #e6c3aa; background: #fef8f3; color: #c9743f; }

.mrc-banner { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.mrc-mono-box { font-family: "IBM Plex Mono", monospace; background: var(--surface-muted, var(--light)); padding: 8px 10px; border-radius: 7px; }
.mrc-latency-status { font-size: .8rem; font-weight: 700; }
.mrc-latency-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px 12px; margin: 8px 0; }

.mrc-stepper { display: flex; align-items: center; gap: 0; }
.mrc-stepper > div { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; text-align: center; }
.mrc-stepper span { width: 30px; height: 30px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
.mrc-stepper small { font-size: .78rem; color: var(--text-secondary, var(--muted)); }

.mrc-notify-log { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.mrc-notify-log li { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: .82rem; }

.mrc-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
.mrc-table th, .mrc-table td { padding: 9px 6px; border-bottom: 1px solid var(--border); text-align: left; }
.mrc-table th { font-size: .72rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-secondary, var(--muted)); }
```

- [ ] **Step 3: Write `app/model-review-console/layout.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import PageHtml from "@/components/PageHtml";
import "./model-review-console.css";

export default function ModelReviewConsoleLayout({ children }: { children: ReactNode }) {
  return <PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app" dataPage="model-review-console">
    <div className="mrc-shell">
      <header className="mrc-topbar">
        <div>
          <h1>Model Review Console</h1>
          <p>Test the detector, track retrain readiness, and hand off between teams.</p>
        </div>
        <a href="/auth/signout" className="mrc-logout">Log out</a>
      </header>
      <main className="mrc-body" id="main-content">{children}</main>
    </div>
  </PageHtml>;
}
```

- [ ] **Step 4: Write `app/model-review-console/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActiveModelReview } from "@/lib/admin";
import ModelReviewConsole from "@/components/model-review-console/ModelReviewConsole";

export const metadata: Metadata = { title: "PurityLoop AI | Model Review Console" };
export const dynamic = "force-dynamic";

export default async function ModelReviewConsolePage() {
  const context = await requireActiveModelReview();
  if ("error" in context) redirect("/login");
  return <ModelReviewConsole role={context.profile.role as "model_team" | "web_team" | "project_manager"} />;
}
```

This imports `ModelReviewConsole` from Task 10, which does not exist yet — `pnpm exec tsc --noEmit` will fail until Task 10 lands. That's expected; note it and continue (this whole plan is meant to be applied task-by-task without necessarily type-checking green in between page/component tasks — the full green check happens at the end of Task 13).

- [ ] **Step 5: Append assertions**

```js
const types = fs.readFileSync("components/model-review-console/types.ts", "utf8");
const layout = fs.readFileSync("app/model-review-console/layout.tsx", "utf8");
const page = fs.readFileSync("app/model-review-console/page.tsx", "utf8");
assert.match(types, /export type ModelReviewRole = "model_team" \| "web_team" \| "project_manager"/);
assert.match(types, /export type SharedStats = \{/);
assert.match(layout, /PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app"/);
assert.match(page, /requireActiveModelReview\(\)/);
assert.match(page, /redirect\("\/login"\)/);
```

- [ ] **Step 6: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add components/model-review-console/types.ts app/model-review-console/model-review-console.css app/model-review-console/layout.tsx app/model-review-console/page.tsx tests/model-review-console.test.cjs
git commit -m "feat: add model review console page shell and shared types"
```

---

## Task 10: `ModelReviewConsole.tsx`

**Files:**
- Create: `components/model-review-console/ModelReviewConsole.tsx`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `ModelReviewRole`, `SharedStats` from Task 9's `types.ts`; `GET /api/model-review/run`, `GET /api/model-review/flags`, `GET /api/model-review/retrain`, `GET /api/model-review/settings` from Tasks 3/4/5/8.
- Produces: default export `ModelReviewConsole({ role: ModelReviewRole })`. Renders the shared stat-card row, then dispatches to `ModelTeamPanel` (Task 11), `WebTeamPanel` (Task 12), or `PmPanel` (Task 13) based on `role`, passing `{ stats: SharedStats; onChanged: () => void }`. This satisfies the `import ModelReviewConsole from "@/components/model-review-console/ModelReviewConsole"` in `page.tsx` from Task 9.

- [ ] **Step 1: Write `components/model-review-console/ModelReviewConsole.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { ModelReviewRole, SharedStats } from "./types";
import ModelTeamPanel from "./ModelTeamPanel";
import WebTeamPanel from "./WebTeamPanel";
import PmPanel from "./PmPanel";

type Props = { role: ModelReviewRole };

async function fetchSharedStats(): Promise<SharedStats> {
  const [runRes, flagsRes, retrainRes, settingsRes] = await Promise.all([
    fetch("/api/model-review/run"),
    fetch("/api/model-review/flags"),
    fetch("/api/model-review/retrain"),
    fetch("/api/model-review/settings")
  ]);
  const [runData, flagsData, retrainData, settingsData] = await Promise.all([
    runRes.json(), flagsRes.json(), retrainRes.json(), settingsRes.json()
  ]);
  return {
    imagesTested: runData.imagesTested,
    latency: runData.latency,
    weeklyFalseSignals: flagsData.weeklyFalseSignals,
    dailyBars: flagsData.dailyBars,
    liveVersion: retrainData.liveVersion,
    pendingVersion: retrainData.pendingVersion,
    currentRetrainRun: retrainData.current,
    settings: settingsData.settings
  };
}

const ROLE_LABEL: Record<ModelReviewRole, string> = {
  model_team: "Model team",
  web_team: "Web team",
  project_manager: "Project manager"
};

export default function ModelReviewConsole({ role }: Props) {
  const [stats, setStats] = useState<SharedStats | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = () => setRefreshToken((token) => token + 1);

  useEffect(() => {
    let cancelled = false;
    fetchSharedStats().then((next) => { if (!cancelled) setStats(next); });
    return () => { cancelled = true; };
  }, [refreshToken]);

  if (!stats) return <p className="mrc-status">Loading console…</p>;

  return (
    <>
      <section className="mrc-stats" aria-label="Session overview">
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Images tested</p>
          <p className="mrc-stat-value">{stats.imagesTested}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Flagged for review</p>
          <p className="mrc-stat-value mrc-stat-warn">{stats.weeklyFalseSignals}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Role</p>
          <p className="mrc-stat-value mrc-stat-small">{ROLE_LABEL[role]}</p>
        </div>
        <div className="mrc-card mrc-stat-card">
          <p className="mrc-stat-label">Checkpoint</p>
          <p className="mrc-stat-value mrc-stat-mono" title={stats.liveVersion}>{stats.liveVersion}</p>
        </div>
      </section>

      {role === "model_team" && <ModelTeamPanel stats={stats} onChanged={refresh} />}
      {role === "web_team" && <WebTeamPanel stats={stats} onChanged={refresh} />}
      {role === "project_manager" && <PmPanel stats={stats} onChanged={refresh} />}
    </>
  );
}
```

This imports `ModelTeamPanel`, `WebTeamPanel`, `PmPanel` from Tasks 11/12/13, which don't exist yet — `tsc --noEmit` stays red until Task 13 lands. Expected at this point in the plan.

- [ ] **Step 2: Append assertions**

```js
const console_ = fs.readFileSync("components/model-review-console/ModelReviewConsole.tsx", "utf8");
assert.match(console_, /export default function ModelReviewConsole\(\{ role \}: Props\)/);
assert.match(console_, /role === "model_team" && <ModelTeamPanel/);
assert.match(console_, /role === "web_team" && <WebTeamPanel/);
assert.match(console_, /role === "project_manager" && <PmPanel/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add components/model-review-console/ModelReviewConsole.tsx tests/model-review-console.test.cjs
git commit -m "feat: add model review console shared shell component"
```

---

## Task 11: `ModelTeamPanel.tsx`

**Files:**
- Create: `components/model-review-console/ModelTeamPanel.tsx`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `SharedStats` from `types.ts`; `MODEL_CONFIG` from `@/lib/inference/model-config`; `runModel` from `@/lib/inference/onnx-session`; `postprocessOutput` from `@/lib/inference/postprocess`; `preprocessImage` from `@/lib/inference/preprocess`; `Detection` type from `@/lib/inference/types`; `POST /api/model-review/run` (Task 3), `POST /api/model-review/flags` (Task 4), `POST /api/model-review/retrain` (Task 5), `PATCH /api/model-review/settings` (Task 8).
- Produces: default export `ModelTeamPanel({ stats: SharedStats; onChanged: () => void })`, consumed by `ModelReviewConsole` (Task 10).

- [ ] **Step 1: Write `components/model-review-console/ModelTeamPanel.tsx`**

```tsx
"use client";

import { ChangeEvent, useRef, useState } from "react";
import { MODEL_CONFIG } from "@/lib/inference/model-config";
import { runModel } from "@/lib/inference/onnx-session";
import { postprocessOutput } from "@/lib/inference/postprocess";
import { preprocessImage } from "@/lib/inference/preprocess";
import type { Detection } from "@/lib/inference/types";
import type { SharedStats } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

function loadImage(source: string, filename: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight
      ? resolve(image)
      : reject(new Error(`"${filename}" has invalid image dimensions.`));
    image.onerror = () => reject(new Error(`"${filename}" could not be decoded.`));
    image.src = source;
  });
}

export default function ModelTeamPanel({ stats, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef("");
  const runningRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [status, setStatus] = useState("Choose one image to begin.");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [flaggedKeys, setFlaggedKeys] = useState<Set<string>>(new Set());
  const [classFilter, setClassFilter] = useState("all");
  // Local display filter only — never written to MODEL_CONFIG, never affects production /upload.
  // Can only raise the effective bar above MODEL_CONFIG.confidenceThreshold (0.32), since
  // postprocessOutput already drops anything below that before this component sees it.
  const [confidenceThreshold, setConfidenceThreshold] = useState(stats.settings.confidence_threshold);
  const [suggestedLabels, setSuggestedLabels] = useState<Record<string, string>>({});
  const [retraining, setRetraining] = useState(false);

  const revokePreviewUrl = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
  };

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;
    revokePreviewUrl();
    setFile(null); setPreviewUrl(""); setImage(null); setDetections([]); setRunId(null); setError("");
    setStatus("Validating image…");
    const nextPreviewUrl = URL.createObjectURL(selected);
    previewUrlRef.current = nextPreviewUrl;
    try {
      const nextImage = await loadImage(nextPreviewUrl, selected.name);
      setFile(selected); setPreviewUrl(nextPreviewUrl); setImage(nextImage);
      setStatus("Image ready. Run detection when ready.");
    } catch (nextError) {
      revokePreviewUrl(); input.value = "";
      setError(nextError instanceof Error ? nextError.message : "Unable to read image.");
      setStatus("Image rejected.");
    }
  };

  const runDetection = async () => {
    if (!file || !image || runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true); setError(""); setStatus("Loading ONNX model and running browser inference…");
    const startedAt = performance.now();
    try {
      const preprocessed = preprocessImage(image);
      const result = await runModel(preprocessed.data);
      const output = postprocessOutput(result.output, preprocessed.letterbox);
      const durationMs = performance.now() - startedAt;
      setDetections(output.detections);
      setFlaggedKeys(new Set());
      setStatus(output.detections.length
        ? `Detection complete: ${output.detections.length} bounding box${output.detections.length === 1 ? "" : "es"}.`
        : `Detection complete: no detections met confidence ${MODEL_CONFIG.confidenceThreshold}.`);

      const runResponse = await fetch("/api/model-review/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detectionCount: output.detections.length, durationMs })
      });
      const runData = await runResponse.json();
      if (runResponse.ok) { setRunId(runData.run.id); onChanged(); }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "ONNX inference failed.");
      setStatus("Detection failed.");
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  const reset = () => {
    if (runningRef.current) return;
    revokePreviewUrl();
    if (inputRef.current) inputRef.current.value = "";
    setFile(null); setPreviewUrl(""); setImage(null); setDetections([]); setRunId(null);
    setError(""); setStatus("Choose one image to begin.");
  };

  const flagDetection = async (detection: Detection, signalType: "fp" | "fn") => {
    const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
    const response = await fetch("/api/model-review/flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runId, className: detection.className, confidence: detection.confidence,
        x1: detection.x1, y1: detection.y1, x2: detection.x2, y2: detection.y2,
        signalType, suggestedLabel: suggestedLabels[key] || ""
      })
    });
    if (response.ok) {
      setFlaggedKeys((keys) => new Set(keys).add(key));
      onChanged();
    }
  };

  const updateConfidenceThreshold = async (value: number) => {
    setConfidenceThreshold(value);
    await fetch("/api/model-review/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confidenceThreshold: value })
    });
  };

  const startRetrain = async () => {
    setRetraining(true);
    const response = await fetch("/api/model-review/retrain", { method: "POST" });
    setRetraining(false);
    if (response.ok) onChanged();
  };

  const exportFlags = async () => {
    const response = await fetch("/api/model-review/flags");
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data.flags, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "false-signals.json";
    document.body.appendChild(link); link.click();
    window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1000);
  };

  const visibleDetections = detections
    .filter((detection) => classFilter === "all" || detection.className === classFilter)
    .filter((detection) => detection.confidence >= confidenceThreshold);

  const readyToRetrain = stats.weeklyFalseSignals >= stats.settings.retrain_threshold;
  const maxDaily = Math.max(...stats.dailyBars.map((bar) => bar.count), 1);

  return (
    <>
      <section className="mrc-controls" aria-label="Model test controls">
        <label className={`mrc-btn-primary${isRunning ? " mrc-disabled" : ""}`}>
          Select image
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={selectImage} disabled={isRunning} />
        </label>
        <button type="button" className="mrc-btn-primary" onClick={runDetection} disabled={!image || isRunning}>
          {isRunning ? "Running…" : "Run detection"}
        </button>
        <button type="button" className="mrc-btn-secondary" onClick={reset} disabled={isRunning}>Reset</button>
        <button type="button" className="mrc-btn-secondary" onClick={exportFlags} disabled={stats.weeklyFalseSignals === 0}>Export all false signals</button>
      </section>

      <p className="mrc-status" role="status">{status}</p>
      {error && <p className="mrc-error" role="alert">{error}</p>}

      <div className="mrc-card mrc-toolbar">
        <label className="mrc-field">
          Material class
          <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
            <option value="all">All classes</option>
            {MODEL_CONFIG.classes.map((className) => <option key={className} value={className}>{className}</option>)}
          </select>
        </label>
        <label className="mrc-field">
          Confidence threshold ({confidenceThreshold.toFixed(2)})
          <input type="range" min={0.1} max={0.9} step={0.01} value={confidenceThreshold}
            onChange={(event) => updateConfidenceThreshold(Number(event.target.value))} />
        </label>
        <div className="mrc-retrain-controls">
          <span className={`mrc-badge${readyToRetrain ? " mrc-badge-ready" : ""}`}>
            {readyToRetrain ? "Ready to retrain" : `${stats.settings.retrain_threshold - stats.weeklyFalseSignals} more to trigger retrain`}
          </span>
          <button type="button" className="mrc-btn-primary" onClick={startRetrain} disabled={!readyToRetrain || retraining}>
            {retraining ? "Retraining…" : "Start retrain"}
          </button>
        </div>
      </div>

      <div className="mrc-card">
        <h2>Cumulative false signals by day</h2>
        <p className="mrc-muted">{stats.weeklyFalseSignals} unresolved &middot; retrain at {stats.settings.retrain_threshold}</p>
        <div className="mrc-chart">
          {stats.dailyBars.map((bar) => (
            <div key={bar.day} className="mrc-chart-col">
              <span>{bar.count}</span>
              <div className="mrc-bar" style={{ height: `${Math.max(6, (bar.count / maxDaily) * 100)}%` }} />
              <span>{bar.day}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Uploaded image</h2>
          {previewUrl && image ? (
            <div className="mrc-image-stage">
              <img src={previewUrl} alt={file?.name || "Selected upload"} />
              <svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} preserveAspectRatio="none">
                {visibleDetections.map((detection) => (
                  <DetectionBox key={`${detection.classId}-${detection.x1}-${detection.y1}`} detection={detection} />
                ))}
              </svg>
            </div>
          ) : <p className="mrc-muted">No image selected yet.</p>}
        </div>

        <div className="mrc-card">
          <h2>Detections</h2>
          <p className="mrc-muted">Flag anything wrong — it routes straight to the model team.</p>
          {!detections.length && <p className="mrc-muted">Run detection to see results here.</p>}
          {!!detections.length && !visibleDetections.length && <p className="mrc-muted">No detections meet confidence {confidenceThreshold.toFixed(2)}.</p>}
          <ol className="mrc-detection-list">
            {visibleDetections.map((detection) => {
              const key = `${detection.classId}-${detection.x1}-${detection.y1}`;
              const isFlagged = flaggedKeys.has(key);
              return (
                <li key={key}>
                  <strong>{detection.className}</strong>
                  <span className="mrc-confidence">{(detection.confidence * 100).toFixed(1)}%</span>
                  <small>[{detection.x1.toFixed(1)}, {detection.y1.toFixed(1)}, {detection.x2.toFixed(1)}, {detection.y2.toFixed(1)}]</small>
                  {isFlagged ? (
                    <span className="mrc-flagged-tag">✓ Flagged</span>
                  ) : (
                    <div className="mrc-flag-actions">
                      <input type="text" placeholder="Ops-suggested label" value={suggestedLabels[key] || ""}
                        onChange={(event) => setSuggestedLabels((labels) => ({ ...labels, [key]: event.target.value }))} />
                      <button type="button" onClick={() => flagDetection(detection, "fp")}>False positive</button>
                      <button type="button" onClick={() => flagDetection(detection, "fn")}>False negative</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    </>
  );
}

function DetectionBox({ detection }: { detection: Detection }) {
  const width = detection.x2 - detection.x1;
  const height = detection.y2 - detection.y1;
  const label = `${detection.className} ${(detection.confidence * 100).toFixed(1)}%`;
  return (
    <g className="mrc-box">
      <rect x={detection.x1} y={detection.y1} width={width} height={height} />
      <rect className="mrc-box-label-bg" x={detection.x1} y={Math.max(0, detection.y1 - 24)} width={Math.max(108, label.length * 7)} height="22" />
      <text x={detection.x1 + 5} y={Math.max(15, detection.y1 - 8)}>{label}</text>
    </g>
  );
}
```

- [ ] **Step 2: Append assertions**

```js
const modelPanel = fs.readFileSync("components/model-review-console/ModelTeamPanel.tsx", "utf8");
assert.match(modelPanel, /import \{ runModel \} from "@\/lib\/inference\/onnx-session"/);
assert.match(modelPanel, /import \{ preprocessImage \} from "@\/lib\/inference\/preprocess"/);
assert.doesNotMatch(modelPanel, /MOCK_BOXES/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/run", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/flags", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/retrain", \{ method: "POST" \}\)/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add components/model-review-console/ModelTeamPanel.tsx tests/model-review-console.test.cjs
git commit -m "feat: add model team panel with real ONNX detection and flagging"
```

---

## Task 12: `WebTeamPanel.tsx`

**Files:**
- Create: `components/model-review-console/WebTeamPanel.tsx`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `SharedStats` from `types.ts`; `PATCH /api/model-review/retrain` (Task 5); `PATCH /api/model-review/settings` (Task 8).
- Produces: default export `WebTeamPanel({ stats: SharedStats; onChanged: () => void })`, consumed by `ModelReviewConsole` (Task 10).

- [ ] **Step 1: Write `components/model-review-console/WebTeamPanel.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { SharedStats } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

const SNIPPET = 'import { loadModel } from "@purityloop/inference";\n\nconst model = await loadModel("/models/purityloop/best.onnx");\nconst detections = await model.run(imageTensor);';

export default function WebTeamPanel({ stats, onChanged }: Props) {
  const [copyStatus, setCopyStatus] = useState("");
  const [retrainThreshold, setRetrainThreshold] = useState(stats.settings.retrain_threshold);
  const [integrating, setIntegrating] = useState(false);

  const copySnippet = () => {
    navigator.clipboard.writeText(SNIPPET)
      .then(() => setCopyStatus("Copied — paste into the web integration branch."))
      .catch(() => setCopyStatus("Could not access clipboard."));
  };

  const updateRetrainThreshold = async (value: number) => {
    setRetrainThreshold(value);
    await fetch("/api/model-review/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retrainThreshold: value })
    });
    onChanged();
  };

  const markIntegrated = async () => {
    if (!stats.currentRetrainRun) return;
    setIntegrating(true);
    const response = await fetch("/api/model-review/retrain", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: stats.currentRetrainRun.id })
    });
    setIntegrating(false);
    if (response.ok) onChanged();
  };

  const showRetrainBanner = !!stats.currentRetrainRun && stats.currentRetrainRun.status === "complete" && !stats.currentRetrainRun.integrated;
  const latencyStatus = stats.latency.p95 < 150 ? "Fast" : stats.latency.p95 < 300 ? "Nominal" : "Slow";

  return (
    <>
      {showRetrainBanner && (
        <div className="mrc-card mrc-banner">
          <div>
            <strong>Retrained checkpoint ready: {stats.pendingVersion}</strong>
            <p className="mrc-muted">Resolved this cycle's flagged false signals. Integrate when ready.</p>
          </div>
          <button type="button" className="mrc-btn-primary" onClick={markIntegrated} disabled={integrating}>
            {integrating ? "Integrating…" : "Mark integrated"}
          </button>
        </div>
      )}

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Current checkpoint</h2>
          <p className="mrc-mono-box">{stats.liveVersion}</p>
          <button type="button" className="mrc-btn-primary" onClick={copySnippet}>Copy integration snippet</button>
          <p className="mrc-muted">{copyStatus || "Copies the latest model load snippet for the web team's integration branch."}</p>
          <label className="mrc-field">
            Retrain threshold ({retrainThreshold})
            <input type="range" min={1} max={30} step={1} value={retrainThreshold}
              onChange={(event) => updateRetrainThreshold(Number(event.target.value))} />
          </label>
        </div>

        <div className="mrc-card">
          <h2>Inference latency <span className="mrc-latency-status">{latencyStatus}</span></h2>
          <div className="mrc-latency-grid">
            <div><p className="mrc-muted">Average</p><p className="mrc-stat-value">{stats.latency.avg} ms</p></div>
            <div><p className="mrc-muted">p50</p><p className="mrc-stat-value">{stats.latency.p50} ms</p></div>
            <div><p className="mrc-muted">p95</p><p className="mrc-stat-value">{stats.latency.p95} ms</p></div>
            <div><p className="mrc-muted">p99</p><p className="mrc-stat-value">{stats.latency.p99} ms</p></div>
          </div>
          <p className="mrc-muted">Based on {stats.latency.samples} console detection runs.</p>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Append assertions**

```js
const webPanel = fs.readFileSync("components/model-review-console/WebTeamPanel.tsx", "utf8");
assert.match(webPanel, /fetch\("\/api\/model-review\/retrain", \{\s*method: "PATCH"/);
assert.match(webPanel, /fetch\("\/api\/model-review\/settings", \{\s*method: "PATCH"/);
assert.match(webPanel, /retrainThreshold: value/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add components/model-review-console/WebTeamPanel.tsx tests/model-review-console.test.cjs
git commit -m "feat: add web team panel with checkpoint integration and latency"
```

---

## Task 13: `PmPanel.tsx`

**Files:**
- Create: `components/model-review-console/PmPanel.tsx`
- Modify: `tests/model-review-console.test.cjs`

**Interfaces:**
- Consumes: `SharedStats`, `TaskRow`, `NotificationRow` from `types.ts`; `GET`/`POST`/`PATCH /api/model-review/tasks` (Task 6); `GET`/`POST /api/model-review/notifications` (Task 7).
- Produces: default export `PmPanel({ stats: SharedStats; onChanged: () => void })`, consumed by `ModelReviewConsole` (Task 10). After this task, `ModelReviewConsole.tsx` (Task 10) and `page.tsx` (Task 9) both resolve — `tsc --noEmit` should be green.

- [ ] **Step 1: Write `components/model-review-console/PmPanel.tsx`**

```tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import type { NotificationRow, SharedStats, TaskRow } from "./types";

type Props = { stats: SharedStats; onChanged: () => void };

const STATUS_COLORS: Record<TaskRow["status"], string> = {
  done: "var(--status-success, var(--success))",
  in_progress: "#c9743f",
  blocked: "var(--danger)",
  todo: "var(--text-secondary, var(--muted))"
};

export default function PmPanel({ stats, onChanged }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [title, setTitle] = useState("");
  const [assigneeRole, setAssigneeRole] = useState<TaskRow["assignee_role"]>("model_team");
  const [url, setUrl] = useState("");

  const loadTasksAndNotifications = () => {
    fetch("/api/model-review/tasks").then((response) => response.json()).then((data) => setTasks(data.tasks || []));
    fetch("/api/model-review/notifications").then((response) => response.json()).then((data) => setNotifications(data.notifications || []));
  };

  useEffect(() => { loadTasksAndNotifications(); }, []);

  const createTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const response = await fetch("/api/model-review/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, assigneeRole, url })
    });
    if (response.ok) { setTitle(""); setUrl(""); loadTasksAndNotifications(); }
  };

  const updateTaskStatus = async (id: string, status: TaskRow["status"]) => {
    const response = await fetch("/api/model-review/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    if (response.ok) loadTasksAndNotifications();
  };

  const notify = async (team: "model" | "web") => {
    const response = await fetch("/api/model-review/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team })
    });
    if (response.ok) { loadTasksAndNotifications(); onChanged(); }
  };

  const taskCounts = tasks.reduce((counts, task) => ({ ...counts, [task.status]: (counts[task.status] || 0) + 1 }), {} as Record<string, number>);

  return (
    <>
      <div className="mrc-card">
        <h2>Handoff status</h2>
        <div className="mrc-stepper">
          <div><span>1</span><small>Model testing<br />{stats.imagesTested} images</small></div>
          <div><span>2</span><small>Flagged for review<br />{stats.weeklyFalseSignals} items</small></div>
          <div><span>3</span><small>Retrain<br />{stats.currentRetrainRun?.status || "idle"}</small></div>
          <div><span>4</span><small>Live in production<br />{stats.liveVersion}</small></div>
        </div>
      </div>

      <section className="mrc-grid-2">
        <div className="mrc-card">
          <h2>Request status update</h2>
          <div className="mrc-controls">
            <button type="button" className="mrc-btn-secondary" onClick={() => notify("model")}>Email model team</button>
            <button type="button" className="mrc-btn-secondary" onClick={() => notify("web")}>Email web team</button>
          </div>
        </div>
        <div className="mrc-card">
          <h2>Notification log</h2>
          {!notifications.length && <p className="mrc-muted">No notifications sent yet.</p>}
          <ul className="mrc-notify-log">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <span>Notified {notification.team} team</span>
                <span className="mrc-muted">{new Date(notification.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mrc-card">
        <h2>Task log</h2>
        <p className="mrc-muted">Todo {taskCounts.todo || 0} &middot; In progress {taskCounts.in_progress || 0} &middot; Blocked {taskCounts.blocked || 0} &middot; Done {taskCounts.done || 0}</p>
        <form className="mrc-controls" onSubmit={createTask}>
          <input type="text" placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <select value={assigneeRole} onChange={(event) => setAssigneeRole(event.target.value as TaskRow["assignee_role"])}>
            <option value="model_team">Model team</option>
            <option value="web_team">Web team</option>
            <option value="project_manager">Project manager</option>
          </select>
          <input type="text" placeholder="URL (optional)" value={url} onChange={(event) => setUrl(event.target.value)} />
          <button type="submit" className="mrc-btn-primary">Add task</button>
        </form>
        <table className="mrc-table">
          <thead>
            <tr><th>Task</th><th>Assignee</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.url ? <a href={task.url} target="_blank" rel="noopener">{task.title}</a> : task.title}</td>
                <td className="mrc-muted">{task.assignee_role}</td>
                <td>
                  <select value={task.status} onChange={(event) => updateTaskStatus(task.id, event.target.value as TaskRow["status"])}
                    style={{ color: STATUS_COLORS[task.status] }}>
                    <option value="todo">Todo</option>
                    <option value="in_progress">In progress</option>
                    <option value="blocked">Blocked</option>
                    <option value="done">Done</option>
                  </select>
                </td>
                <td className="mrc-muted">{new Date(task.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Append assertions**

```js
const pmPanel = fs.readFileSync("components/model-review-console/PmPanel.tsx", "utf8");
assert.match(pmPanel, /fetch\("\/api\/model-review\/tasks", \{\s*method: "POST"/);
assert.match(pmPanel, /fetch\("\/api\/model-review\/tasks", \{\s*method: "PATCH"/);
assert.match(pmPanel, /fetch\("\/api\/model-review\/notifications", \{/);
```

- [ ] **Step 3: Run the test**

Run: `node tests/model-review-console.test.cjs`
Expected: prints `model review console tests passed`, exit code 0.

- [ ] **Step 4: Full type-check (first time everything resolves)**

Run: `pnpm exec tsc --noEmit`
Expected: no output, exit code 0. If there are errors, they are almost certainly import/type mismatches between this task's files and Tasks 9–12 — fix by matching the exact type/property names shown in each task's "Interfaces" block above, not by loosening types.

- [ ] **Step 5: Commit**

```bash
git add components/model-review-console/PmPanel.tsx tests/model-review-console.test.cjs
git commit -m "feat: add project manager panel with task log and notifications"
```

---

## Task 14: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises the full stack built in Tasks 1–13 against a running dev server and a live Supabase project.

- [ ] **Step 1: Run the migration**

Apply `supabase/migrations/20260731000000_model_review_console.sql` against the live Supabase project (manually, via the Supabase SQL editor or CLI — same as every prior migration in this repo, there is no automated migration runner).

- [ ] **Step 2: Confirm at least one test account per role exists**

Check `user_profiles` for an active `model_team`, `web_team`, and `project_manager` account (create via `/admin/users` if missing).

- [ ] **Step 3: Start the dev server and sign in as `model_team`**

Run: `pnpm dev`
Visit `/model-review-console`. Confirm:
- Header stat cards render (Images tested, Flagged for review, Role, Checkpoint).
- Selecting a real image and clicking "Run detection" shows real bounding boxes (not `MOCK_BOXES` shapes) and the "Images tested" stat increments on reload.
- Flagging a detection (False positive or False negative) makes it show "✓ Flagged" and persists after a page reload.
- Moving the confidence-threshold slider changes which detections are visible without needing to re-run detection.
- Visiting `/upload` bounces back to `/model-review-console`.

- [ ] **Step 4: Sign in as `web_team`**

Confirm:
- Web team panel renders (not the model team panel).
- Latency numbers are non-zero after Step 3 ran at least one detection.
- Retrain-threshold slider updates and is reflected for `model_team` on next load (shared setting).
- `/upload` bounces back to `/model-review-console`.

- [ ] **Step 5: Trigger and integrate a retrain**

As `model_team`, flag detections until "Flagged for review" reaches the retrain threshold (default 5), then click "Start retrain". Confirm the flagged count resets to 0 and a new checkpoint version appears. As `web_team`, confirm the "Retrained checkpoint ready" banner appears and "Mark integrated" updates the Checkpoint stat for both roles.

- [ ] **Step 6: Sign in as `project_manager`**

Confirm:
- Handoff stepper shows real numbers matching Steps 3–5.
- Creating a task and changing its status persists after reload.
- "Email model team" / "Email web team" buttons add a row to the notification log (no real email is sent — confirm nothing appears in any inbox, this is expected).
- `/upload` bounces back to `/model-review-console`.

- [ ] **Step 7: Confirm existing roles/pages are unaffected**

Sign in as an `operator` (or any pre-existing role) and confirm `/upload`, `/review`, `/analytics` still work exactly as before. Sign in as `admin` and confirm they still land on `/admin/users`, and that visiting `/model-review-console` as admin redirects them to `/admin/users`.

- [ ] **Step 8: Cross-role 403 checks**

While signed in as `web_team`, run:
```bash
curl -i -X POST http://localhost:3000/api/model-review/run -H "Cookie: <web_team session cookie>"
```
Expected: `403`. Repeat for `PATCH /api/model-review/settings` with `{"confidenceThreshold":0.5}` as `web_team` → `403`.

- [ ] **Step 9: Final full-repo check**

Run: `pnpm exec tsc --noEmit` and `git diff --check`
Expected: both clean.

- [ ] **Step 10: Commit any fixes found during manual verification**

If Steps 3–9 surfaced bugs, fix them in the relevant task's file(s), re-run that task's assertions plus `tsc --noEmit`, then commit with a message describing the fix (not a new feat commit — a `fix:` commit).

---
