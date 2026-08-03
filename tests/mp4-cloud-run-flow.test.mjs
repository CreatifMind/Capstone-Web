import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("public/js/script.js", "utf8");
const mp4Start = source.indexOf("async function processVideoQueueItem");
const mp4End = source.indexOf("async function runBatch", mp4Start);
const mp4Flow = source.slice(mp4Start, mp4End);

test("MP4 upload follows start, chunk, ingest, poll sequence", () => {
  const start = mp4Flow.indexOf("/api/uploads/start");
  const chunk = mp4Flow.indexOf("/api/uploads/${encodeURIComponent(startPayload.upload_id)}");
  const ingest = mp4Flow.indexOf("/api/ingest");
  const poll = mp4Flow.indexOf("pollVideoJob(apiBase, ingestPayload.job_id");

  assert.ok(start > -1);
  assert.ok(chunk > start);
  assert.ok(ingest > chunk);
  assert.ok(poll > ingest);
});

test("MP4 flow submits exactly one ingest request and never calls worker directly", () => {
  assert.equal((mp4Flow.match(/\/api\/ingest/g) || []).length, 1);
  assert.doesNotMatch(mp4Flow, /\/internal\/jobs\/process/);
});

test("MP4 chunk uploads do not set Content-Type manually", () => {
  const chunkCall = mp4Flow.slice(
    mp4Flow.indexOf("/api/uploads/${encodeURIComponent(startPayload.upload_id)}"),
    mp4Flow.indexOf("const payload = await response.json", mp4Flow.indexOf("/api/uploads/${encodeURIComponent(startPayload.upload_id)}"))
  );

  assert.match(chunkCall, /"Content-Range"/);
  assert.doesNotMatch(chunkCall, /"Content-Type"/);
});
