import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync("public/js/script.js", "utf8");

test("browser ONNX persistence sends the unified decision threshold metadata", () => {
  assert.match(script, /const PL_DECISION_CONFIDENCE_THRESHOLD = 0\.32;/);
  assert.doesNotMatch(
    script,
    /formData\.append\("confidence_threshold", String\(PL_BROWSER_CONFIDENCE_THRESHOLD\)\);/
  );

  const decisionThresholdAppends = script.match(
    /formData\.append\("confidence_threshold", String\(PL_DECISION_CONFIDENCE_THRESHOLD\)\);/g
  ) || [];
  assert.equal(decisionThresholdAppends.length, 2);
});

test("browser ONNX persistence sends the backend NMS IoU contract value", () => {
  assert.match(script, /const PL_BROWSER_NMS_IOU_THRESHOLD = 0\.45;/);

  const nmsThresholdAppends = script.match(
    /formData\.append\("nms_iou_threshold", String\(PL_BROWSER_NMS_IOU_THRESHOLD\)\);/g
  ) || [];
  assert.equal(nmsThresholdAppends.length, 2);
});

test("review workspace always accepts server object summary", () => {
  assert.match(script, /if \(payload\.summary\) \{/);
  assert.doesNotMatch(
    script,
    /payload\.summary && !search\?\.value\.trim\(\) && !category\?\.value && !date\?\.value && !reviewStatusParam\(\)/
  );
});
