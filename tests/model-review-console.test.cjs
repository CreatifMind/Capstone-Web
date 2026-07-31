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

const settingsRoute = fs.readFileSync("app/api/model-review/settings/route.ts", "utf8");
assert.match(settingsRoute, /Only model_team can edit the confidence threshold/);
assert.match(settingsRoute, /Only web_team or project_manager can edit the retrain threshold/);
assert.match(settingsRoute, /from\("model_review_settings"\)/);

const types = fs.readFileSync("components/model-review-console/types.ts", "utf8");
const layout = fs.readFileSync("app/model-review-console/layout.tsx", "utf8");
const page = fs.readFileSync("app/model-review-console/page.tsx", "utf8");
assert.match(types, /export type ModelReviewRole = "model_team" \| "web_team" \| "project_manager"/);
assert.match(types, /export type SharedStats = \{/);
assert.match(layout, /PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app"/);
assert.match(page, /requireActiveModelReview\(\)/);
assert.match(page, /redirect\("\/login"\)/);

const console_ = fs.readFileSync("components/model-review-console/ModelReviewConsole.tsx", "utf8");
assert.match(console_, /export default function ModelReviewConsole\(\{ role \}: Props\)/);
assert.match(console_, /role === "model_team" && <ModelTeamPanel/);
assert.match(console_, /role === "web_team" && <WebTeamPanel/);
assert.match(console_, /role === "project_manager" && <PmPanel/);

const modelPanel = fs.readFileSync("components/model-review-console/ModelTeamPanel.tsx", "utf8");
assert.match(modelPanel, /import \{ runModel \} from "@\/lib\/inference\/onnx-session"/);
assert.match(modelPanel, /import \{ preprocessImage \} from "@\/lib\/inference\/preprocess"/);
assert.doesNotMatch(modelPanel, /MOCK_BOXES/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/run", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/flags", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/retrain", \{ method: "POST" \}\)/);

console.log("model review console tests passed");
