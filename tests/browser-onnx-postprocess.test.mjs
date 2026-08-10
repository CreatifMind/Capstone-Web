import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const postprocess = readFileSync("lib/inference/postprocess.ts", "utf8");

test("browser ONNX postprocess keeps General Trash detections for manual review persistence", () => {
  assert.match(postprocess, /detections:\s*reviewDetections/);
  assert.doesNotMatch(postprocess, /detections:\s*reviewDetections\.filter\(detection\s*=>\s*detection\.className\s*!==\s*"general_trash"\)/);
});
