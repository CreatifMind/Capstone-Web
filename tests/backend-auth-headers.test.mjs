import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function createContext({ sessionToken = "test-access-token-1", refreshedSessionToken = "test-access-token-2", backendStatus = 200 } = {}) {
  const fetchCalls = [];
  let sessionCalls = 0;
  const context = {
    console,
    Headers,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: async (input, init = {}) => {
      fetchCalls.push({ input, init });
      if (String(input) === "/api/auth/session") {
        sessionCalls += 1;
        const accessToken = sessionCalls > 1 ? refreshedSessionToken : sessionToken;
        return {
          status: accessToken ? 200 : 401,
          ok: Boolean(accessToken),
          json: async () => accessToken ? { accessToken } : { error: "unauthenticated" }
        };
      }
      return { status: backendStatus, ok: backendStatus < 400, json: async () => ({}), blob: async () => new Blob([]) };
    },
    window: {
      __PURITYLOOP_CONFIG__: {
        apiBaseUrl: "https://backend.example.test",
        supabaseUrl: "https://project.supabase.co",
        supabaseAnonKey: "anon-key"
      },
      location: { pathname: "/history", assign(value) { this.assigned = value; } },
      addEventListener() {}
    },
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; } },
    Blob
  };
  vm.createContext(context);
  const source = readFileSync("public/js/script.js", "utf8");
  vm.runInContext(
    `${source}\nglobalThis.authHelpers = { plAuthHeaders, plBackendFetch, plPublicHeaders };`,
    context
  );
  return { context, fetchCalls };
}

test("backend JSON requests include Supabase bearer token", async () => {
  const { context } = createContext();

  const headers = await context.authHelpers.plAuthHeaders({ "Content-Type": "application/json" });

  assert.equal(headers.Authorization, "Bearer test-access-token-1");
  assert.equal(headers["Content-Type"], "application/json");
});

test("Cloud Run API base does not receive ngrok-only headers", async () => {
  const { context } = createContext();
  context.window.__PURITYLOOP_CONFIG__.apiBaseUrl = "https://purityloop-api-cqthaeqncq-as.a.run.app";

  const headers = context.authHelpers.plPublicHeaders();

  assert.equal(headers["ngrok-skip-browser-warning"], undefined);
});

test("ngrok-only header remains scoped to ngrok development backend", async () => {
  const { context } = createContext();
  context.window.__PURITYLOOP_CONFIG__.apiBaseUrl = "https://dev-tunnel.ngrok-free.dev";

  const headers = context.authHelpers.plPublicHeaders();

  assert.equal(headers["ngrok-skip-browser-warning"], "1");
});

test("multipart backend requests do not set Content-Type manually", async () => {
  const { context } = createContext();

  const headers = await context.authHelpers.plAuthHeaders();

  assert.equal(headers.Authorization, "Bearer test-access-token-1");
  assert.equal(headers["Content-Type"], undefined);
});

test("export and polling calls use authenticated backend fetch", async () => {
  const { context, fetchCalls } = createContext();

  await context.authHelpers.plBackendFetch("https://backend.example.test/api/history/export?format=pdf");
  await context.authHelpers.plBackendFetch("https://backend.example.test/api/jobs/job-1");

  const backendCalls = fetchCalls.filter(call => String(call.input).startsWith("https://backend.example.test"));
  assert.equal(backendCalls.length, 2);
  assert.equal(backendCalls[0].init.headers.Authorization, "Bearer test-access-token-1");
  assert.equal(backendCalls[1].init.headers.Authorization, "Bearer test-access-token-1");
});

test("missing session stops before protected backend call", async () => {
  const { context, fetchCalls } = createContext({ sessionToken: null, refreshedSessionToken: null });

  await assert.rejects(
    context.authHelpers.plBackendFetch("https://backend.example.test/api/scans"),
    /session has expired|Authentication is not configured/
  );

  assert.equal(fetchCalls.filter(call => String(call.input).startsWith("https://backend.example.test")).length, 0);
  assert.equal(context.window.location.assigned, "/login?reason=session_expired");
});

test("401 refreshes once and does not retry forever", async () => {
  const { context, fetchCalls } = createContext();
  context.fetch = async (input, init = {}) => {
    fetchCalls.push({ input, init });
    if (String(input) === "/api/auth/session") {
      const sessionFetches = fetchCalls.filter(call => String(call.input) === "/api/auth/session").length;
      const token = sessionFetches > 1 ? "test-access-token-2" : "test-access-token-1";
      return { status: 200, ok: true, json: async () => ({ accessToken: token }) };
    }
    return { status: 401, ok: false, json: async () => ({ detail: "Authentication required." }) };
  };

  const response = await context.authHelpers.plBackendFetch("https://backend.example.test/api/scans");

  assert.equal(response.status, 401);
  const backendCalls = fetchCalls.filter(call => String(call.input).startsWith("https://backend.example.test"));
  assert.equal(backendCalls.length, 2);
  assert.equal(backendCalls[0].init.headers.Authorization, "Bearer test-access-token-1");
  assert.equal(backendCalls[1].init.headers.Authorization, "Bearer test-access-token-2");
  assert.equal(context.window.location.assigned, "/login?reason=session_expired");
});
