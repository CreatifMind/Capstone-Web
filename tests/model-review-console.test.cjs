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
