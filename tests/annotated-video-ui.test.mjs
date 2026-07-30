import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resultPage = readFileSync("app/result/page.tsx", "utf8");
const script = readFileSync("public/js/script.js", "utf8");
const styles = readFileSync("public/css/style.css", "utf8");

test("result page contains semantic annotated MP4 player shell", () => {
  assert.match(resultPage, /id="annotatedVideoPanel"/);
  assert.match(resultPage, /Annotated Result Video/);
  assert.match(script, /<video class="annotated-result-video" controls preload="metadata" playsinline poster=/);
  assert.match(script, /<source src="\$\{plEscapeHtml\(videoUrl\)\}" type="video\/mp4">/);
});

test("annotated video UI supports ready, processing, failed, and expired states", () => {
  assert.match(script, /ready: "Ready"/);
  assert.match(script, /processing: "Processing"/);
  assert.match(script, /failed: "Failed"/);
  assert.match(script, /expired: "Expired"/);
  assert.match(script, /Annotated video is still being generated/);
  assert.match(script, /Annotated video generation failed/);
  assert.match(script, /annotated video URL could not be loaded/i);
});

test("annotated video panel remains scoped to video scans and keeps frame results below", () => {
  assert.match(script, /annotatedVideoPanel\.hidden = true/);
  assert.match(script, /Frame results remain available below/);
  assert.match(script, /Download annotated MP4/);
  assert.match(styles, /\.annotated-result-video/);
  assert.match(styles, /max-width: 100%/);
});
