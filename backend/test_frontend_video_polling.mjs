import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../public/js/script.js", import.meta.url), "utf8");
function functionSource(name) {
  const asyncStart = source.indexOf(`async function ${name}`);
  const start = asyncStart >= 0 ? asyncStart : source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} missing`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} body missing`);
}

const messages = [];
let fetches = 0;
const context = {
  Math,
  window: { location: { href: "" } },
  processingStatusEl: { textContent: "" },
  plAuthHeaders: async () => ({}),
  plSetUploadProgress: () => {},
  setMessages: message => messages.push(message),
  setTimeout: callback => callback(),
  fetch: async () => {
    fetches += 1;
    const temporary = fetches === 1;
    return { status: temporary ? 503 : 200, ok: !temporary, json: async () => temporary ? { retryable: true } : { status: "completed", processed_count: 1, scan_ids: ["scan-1"] } };
  },
};
vm.createContext(context);
vm.runInContext(functionSource("plVideoPollingDelay"), context);
vm.runInContext(functionSource("pollVideoJob"), context);
await context.pollVideoJob("http://api", "job-1", "video.mp4");

assert.equal(fetches, 2);
assert.ok(messages.includes("Connection temporarily interrupted. Retrying…"));
assert.equal(context.window.location.href, "/result?scanId=scan-1");
assert.ok(!source.includes("AbortController"), "page navigation must not cancel the server-side job");
console.log("frontend polling recovers after one 503");
