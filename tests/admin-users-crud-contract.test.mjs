import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const client = readFileSync("app/admin/users/AdminUsersClient.tsx", "utf8");
const collectionRoute = readFileSync("app/api/admin/users/route.ts", "utf8");
const itemRoutePath = "app/api/admin/users/[id]/route.ts";
const itemRoute = readFileSync(itemRoutePath, "utf8");
const shared = readFileSync("app/api/admin/users/_shared.ts", "utf8");
const adminHelper = readFileSync("lib/admin.ts", "utf8");

test("admin user CRUD uses RESTful item route and safe response envelope", () => {
  assert.equal(existsSync(itemRoutePath), true);
  assert.match(client, /fetch\(`\/api\/admin\/users\/\$\{editTarget\.id\}`/);
  assert.match(client, /fetch\(`\/api\/admin\/users\/\$\{deleteTarget\.id\}`/);
  assert.match(shared, /success:\s*true/);
  assert.match(shared, /success:\s*false,\s*error:\s*\{\s*code,\s*message\s*\}/);
});

test("service role and Supabase admin APIs stay out of user-management client", () => {
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|service_role|auth\.admin|createSupabaseServiceClient/);
  assert.match(collectionRoute, /adminContext\(\)/);
  assert.match(itemRoute, /adminContext\(\)/);
  assert.match(adminHelper, /if \(!allowedRoles\.includes\(profile\.role\)\)/);
  assert.doesNotMatch(adminHelper, /profile\.role !== "plant_manager"/);
});

test("plant manager can access add and edit controls without exposing delete control", () => {
  assert.match(client, /profile\?\.role === "admin" \|\| profile\?\.role === "plant_manager"/);
  assert.match(client, /const canDeleteUsers = profile\?\.role === "admin"/);
  assert.match(client, /canManageUsers && <button className="admin-add primary-btn"/);
  assert.match(client, /title="Edit"/);
  assert.match(client, /\{canDeleteUsers && <button type="button" className="admin-icon-btn danger"/);
});

test("destructive and self-protection rules are enforced server-side", () => {
  assert.match(itemRoute, /confirmationEmail/);
  assert.match(itemRoute, /SELF_DELETE/);
  assert.match(itemRoute, /SELF_ADMIN_REMOVAL/);
  assert.match(itemRoute, /ensureNotFinalActiveAdmin/);
  assert.match(itemRoute, /auth\.admin\.deleteUser/);
  assert.match(itemRoute, /\.from\("user_profiles"\)\.delete\(\)/);
});

test("passwords are accepted only as write input and never returned", () => {
  assert.match(shared, /Passwords do not match/);
  assert.match(collectionRoute, /createUser\(\{/);
  assert.match(itemRoute, /password/);
  assert.doesNotMatch(collectionRoute, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(itemRoute, /console\.(log|info|warn|error)/);
  assert.doesNotMatch(collectionRoute, /password.*last_login|last_login.*password/);
  assert.doesNotMatch(itemRoute, /password.*last_login|last_login.*password/);
});
