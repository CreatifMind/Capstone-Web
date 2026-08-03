import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/api/auth/session/route.ts", "utf8");

test("session route reads Supabase SSR cookies and is dynamic", () => {
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
});

test("session route returns only access token and never refresh token", () => {
  assert.match(source, /accessToken:\s*sessionData\.session\.access_token/);
  assert.doesNotMatch(source, /refresh_token|refreshToken|service_role|SUPABASE_SERVICE_ROLE_KEY|password/i);
});

test("session route returns 401 for missing session and disables caching", () => {
  assert.match(source, /sessionResponse\(\{\s*error:\s*"unauthenticated"\s*\},\s*401\)/);
  assert.match(source, /"Cache-Control":\s*"private, no-store"/);
});
