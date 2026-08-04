const assert = require("node:assert/strict");
const fs = require("node:fs");

const baseline = fs.readFileSync("supabase/migrations/20260802160435_remote_public_schema_baseline.sql", "utf8");
const permissionCleanup = fs.readFileSync("supabase/migrations/20260802161941_remote_public_schema_baseline.sql", "utf8");
const migration = `${baseline}\n${permissionCleanup}`;
const adminLib = fs.readFileSync("lib/admin.ts", "utf8");

assert.match(migration, /CREATE TABLE public\.model_review_runs/);
assert.match(migration, /CREATE TABLE public\.model_review_flags/);
assert.match(migration, /CREATE TABLE public\.model_review_retrain_runs/);
assert.match(migration, /CREATE TABLE public\.model_review_tasks/);
assert.match(migration, /CREATE TABLE public\.model_review_notifications/);
assert.match(migration, /CREATE TABLE public\.model_review_settings/);
assert.match(migration, /REVOKE ALL ON public\.model_review_runs FROM anon/);
assert.match(migration, /REVOKE ALL ON public\.model_review_runs FROM authenticated/);
assert.match(adminLib, /export async function requireActiveDevelopment\(\)/);
assert.match(adminLib, /return requireActiveRole\(\["development_team"\]\)/);
assert.match(adminLib, /export async function requireActiveDevelopmentWorkspace\(\)/);
assert.match(adminLib, /return requireActiveRole\(\["development_team", "plant_manager"\]\)/);

const middleware = fs.readFileSync("middleware.ts", "utf8");
assert.match(middleware, /const isModelReviewApi = pathname\.startsWith\("\/api\/model-review\/"\)/);
assert.match(middleware, /const DEVELOPMENT = "\/development"/);
assert.match(middleware, /const OVERVIEW = "\/overview"/);
assert.match(middleware, /profile\.role === "development_team"/);
assert.match(middleware, /profile\.role === "plant_manager"/);

const runRoute = fs.readFileSync("app/api/model-review/run/route.ts", "utf8");
assert.match(runRoute, /modelReviewContext\(\["development_team"\]\)/);
assert.match(runRoute, /from\("model_review_runs"\)/);
assert.match(runRoute, /detectionCount and durationMs must be non-negative numbers/);

const flagsRoute = fs.readFileSync("app/api/model-review/flags/route.ts", "utf8");
assert.match(flagsRoute, /modelReviewContext\(\["development_team"\]\)/);
assert.match(flagsRoute, /from\("model_review_flags"\)/);
assert.match(flagsRoute, /FLAG_TYPES = new Set\(\["fp", "fn"\]\)/);
assert.match(flagsRoute, /is\("resolved_at", null\)/);

const retrainRoute = fs.readFileSync("app/api/model-review/retrain/route.ts", "utf8");
assert.match(retrainRoute, /modelReviewContext\(\["development_team"\]\)/);
assert.match(retrainRoute, /Not enough flagged false signals to trigger a retrain yet/);
assert.match(retrainRoute, /A retrain is already in progress/);

const tasksRoute = fs.readFileSync("app/api/model-review/tasks/route.ts", "utf8");
assert.match(tasksRoute, /modelReviewContext\(\["development_team"\]\)/);
assert.match(tasksRoute, /from\("model_review_tasks"\)/);
assert.match(tasksRoute, /STATUSES = new Set\(\["todo", "in_progress", "blocked", "done"\]\)/);

const notificationsRoute = fs.readFileSync("app/api/model-review/notifications/route.ts", "utf8");
assert.match(notificationsRoute, /modelReviewContext\(\["development_team"\]\)/);
assert.match(notificationsRoute, /from\("model_review_notifications"\)/);
assert.match(notificationsRoute, /TEAMS = new Set\(\["development"\]\)/);

const settingsRoute = fs.readFileSync("app/api/model-review/settings/route.ts", "utf8");
assert.match(settingsRoute, /Only the development team can edit the confidence threshold/);
assert.match(settingsRoute, /Only the development team can edit the retrain threshold/);
assert.match(settingsRoute, /from\("model_review_settings"\)/);

const modelReviewContext = fs.readFileSync("lib/model-review/context.ts", "utf8");
assert.match(modelReviewContext, /requireActiveDevelopmentWorkspace/);
assert.match(modelReviewContext, /context\.profile\.role !== "plant_manager"/);

const types = fs.readFileSync("components/model-review-console/types.ts", "utf8");
const layout = fs.readFileSync("app/development/layout.tsx", "utf8");
const page = fs.readFileSync("app/development/page.tsx", "utf8");
assert.match(types, /export type DevelopmentRole = "development_team" \| "plant_manager"/);
assert.match(types, /export type SharedStats = \{/);
assert.match(layout, /PageHtml bodyClass="ops-pro-page mrc-page lab-ui dark-ai dark-app"/);
assert.match(page, /requireActiveDevelopmentWorkspace\(\)/);
assert.match(page, /redirect\("\/login"\)/);

const console_ = fs.readFileSync("components/model-review-console/ModelReviewConsole.tsx", "utf8");
assert.match(console_, /export default function ModelReviewConsole\(\{ role \}: Props\)/);
assert.match(console_, /<ModelTeamPanel stats=\{stats\} onChanged=\{refresh\} \/>/);
assert.match(console_, /<WebTeamPanel stats=\{stats\} onChanged=\{refresh\} \/>/);
assert.match(console_, /<PmPanel stats=\{stats\} onChanged=\{refresh\} \/>/);

const modelPanel = fs.readFileSync("components/model-review-console/ModelTeamPanel.tsx", "utf8");
assert.match(modelPanel, /import \{ runModel \} from "@\/lib\/inference\/onnx-session"/);
assert.match(modelPanel, /import \{ preprocessImage \} from "@\/lib\/inference\/preprocess"/);
assert.doesNotMatch(modelPanel, /MOCK_BOXES/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/run", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/flags", \{/);
assert.match(modelPanel, /fetch\("\/api\/model-review\/retrain", \{ method: "POST" \}\)/);

const webPanel = fs.readFileSync("components/model-review-console/WebTeamPanel.tsx", "utf8");
assert.match(webPanel, /fetch\("\/api\/model-review\/retrain", \{\s*method: "PATCH"/);
assert.match(webPanel, /fetch\("\/api\/model-review\/settings", \{\s*method: "PATCH"/);
assert.match(webPanel, /retrainThreshold: value/);

const pmPanel = fs.readFileSync("components/model-review-console/PmPanel.tsx", "utf8");
assert.match(pmPanel, /fetch\("\/api\/model-review\/tasks", \{\s*method: "POST"/);
assert.match(pmPanel, /fetch\("\/api\/model-review\/tasks", \{\s*method: "PATCH"/);
assert.match(pmPanel, /fetch\("\/api\/model-review\/notifications", \{/);

console.log("model review console tests passed");
