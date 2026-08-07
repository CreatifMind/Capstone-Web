import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";

async function loadHeaders(value) {
  if (value === undefined) delete process.env.ALLOW_PRESENTATION_EMBED;
  else process.env.ALLOW_PRESENTATION_EMBED = value;

  const url = pathToFileURL("next.config.mjs");
  url.searchParams.set("v", `${value ?? "unset"}-${Date.now()}`);
  const { default: config } = await import(url.href);
  return config.headers();
}

test("keeps secure frame ancestors by default", async () => {
  const [{ headers }] = await loadHeaders(undefined);
  assert.deepEqual(headers, [
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors 'self' https://*.canva.com https://canva.com;"
    }
  ]);
});

test("allows HTTPS presentation embedding only when enabled", async () => {
  const [{ headers }] = await loadHeaders("true");
  assert.deepEqual(headers, [
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors https:;"
    }
  ]);
});
