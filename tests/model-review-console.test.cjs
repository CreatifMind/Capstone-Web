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

const middleware = fs.readFileSync("middleware.ts", "utf8");
assert.match(middleware, /const isModelReviewApi = pathname\.startsWith\("\/api\/model-review\/"\)/);
assert.match(middleware, /const isModelReviewPage = pathname === "\/model-review-console"/);
assert.match(middleware, /if \(MODEL_REVIEW_ROLES\.has\(profile\.role\)\) \{/);
assert.match(middleware, /return redirect\(request, "\/model-review-console", response\)/);

const runRoute = fs.readFileSync("app/api/model-review/run/route.ts", "utf8");
assert.match(runRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(runRoute, /from\("model_review_runs"\)/);
assert.match(runRoute, /detectionCount and durationMs must be non-negative numbers/);

const flagsRoute = fs.readFileSync("app/api/model-review/flags/route.ts", "utf8");
assert.match(flagsRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(flagsRoute, /from\("model_review_flags"\)/);
assert.match(flagsRoute, /FLAG_TYPES = new Set\(\["fp", "fn"\]\)/);
assert.match(flagsRoute, /is\("resolved_at", null\)/);

const retrainRoute = fs.readFileSync("app/api/model-review/retrain/route.ts", "utf8");
assert.match(retrainRoute, /modelReviewContext\(\["model_team"\]\)/);
assert.match(retrainRoute, /modelReviewContext\(\["web_team"\]\)/);
assert.match(retrainRoute, /Not enough flagged false signals to trigger a retrain yet/);
assert.match(retrainRoute, /A retrain is already in progress/);

const tasksRoute = fs.readFileSync("app/api/model-review/tasks/route.ts", "utf8");
assert.match(tasksRoute, /modelReviewContext\(\["project_manager"\]\)/);
assert.match(tasksRoute, /from\("model_review_tasks"\)/);
assert.match(tasksRoute, /STATUSES = new Set\(\["todo", "in_progress", "blocked", "done"\]\)/);

const notificationsRoute = fs.readFileSync("app/api/model-review/notifications/route.ts", "utf8");
assert.match(notificationsRoute, /modelReviewContext\(\["project_manager"\]\)/);
assert.match(notificationsRoute, /from\("model_review_notifications"\)/);
assert.match(notificationsRoute, /TEAMS = new Set\(\["model", "web"\]\)/);

console.log("model review console tests passed");
