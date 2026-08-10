import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const postprocess = readFileSync("lib/inference/postprocess.ts", "utf8");
const CANDIDATE_COUNT = 8400;

function loadPostprocessModule() {
  const compiled = ts.transpileModule(postprocess, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const module = { exports: {} };
  const classes = ["plastic", "paper", "cardboard", "metal", "glass", "textile", "food_organic", "battery", "general_trash"];
  const require = (specifier) => {
    if (specifier === "./model-config") {
      return {
        CLASS_CONFIDENCE_THRESHOLDS: {
          plastic: 0.25,
          paper: 0.20,
          cardboard: 0.20,
          metal: 0.15,
          glass: 0.20,
          textile: 0.25,
          food_organic: 0.20,
          battery: 0.25,
          general_trash: 0.25,
        },
        MODEL_CONFIG: {
          classes,
          confidenceThreshold: 0.20,
          nmsIouThreshold: 0.45,
        },
      };
    }
    if (specifier === "./nms") {
      return {
        classAwareNms(detections, iouThreshold) {
          const iou = (a, b) => {
            const left = Math.max(a.x1, b.x1);
            const top = Math.max(a.y1, b.y1);
            const right = Math.min(a.x2, b.x2);
            const bottom = Math.min(a.y2, b.y2);
            const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
            const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection;
            return union > 0 ? intersection / union : 0;
          };
          const kept = [];
          const byClass = new Map();
          for (const detection of detections) {
            const group = byClass.get(detection.classId) || [];
            group.push(detection);
            byClass.set(detection.classId, group);
          }
          for (const group of byClass.values()) {
            const remaining = group.slice().sort((a, b) => b.confidence - a.confidence);
            while (remaining.length) {
              const best = remaining.shift();
              kept.push(best);
              for (let index = remaining.length - 1; index >= 0; index -= 1) {
                if (iou(best, remaining[index]) >= iouThreshold) remaining.splice(index, 1);
              }
            }
          }
          return kept.sort((a, b) => b.confidence - a.confidence);
        }
      };
    }
    throw new Error(`Unexpected import: ${specifier}`);
  };
  new Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports;
}

const letterbox = {
  originalWidth: 536,
  originalHeight: 166,
  resizedWidth: 640,
  resizedHeight: 198,
  scale: 640 / 536,
  padX: 0,
  padY: 221,
};

function emptyOutput(value = 0) {
  const output = new Float32Array(45 * CANDIDATE_COUNT);
  output.fill(value);
  return output;
}

function setBox(output, candidate, centerX, centerY, width, height) {
  output[candidate] = centerX;
  output[CANDIDATE_COUNT + candidate] = centerY;
  output[(2 * CANDIDATE_COUNT) + candidate] = width;
  output[(3 * CANDIDATE_COUNT) + candidate] = height;
}

function setClass(output, candidate, classId, confidence) {
  output[((4 + classId) * CANDIDATE_COUNT) + candidate] = confidence;
}

test("browser ONNX postprocess keeps General Trash detections for manual review persistence", () => {
  assert.match(postprocess, /detections:\s*reviewDetections/);
  assert.doesNotMatch(postprocess, /detections:\s*reviewDetections\.filter\(detection\s*=>\s*detection\.className\s*!==\s*"general_trash"\)/);
});

test("browser ONNX probability decoding clamps probabilities without sigmoid", () => {
  const { decodeClassProbability } = loadPostprocessModule();

  assert.equal(decodeClassProbability(-0.000001), 0);
  assert.equal(decodeClassProbability(0.949707), 0.949707);
  assert.equal(decodeClassProbability(0), 0);
  assert.equal(decodeClassProbability(1.000001), 1);
  assert.equal(decodeClassProbability(0.20), 0.20);
});

test("browser ONNX postprocess does not turn tiny negative class noise into 50 percent detections", () => {
  const { postprocessOutput } = loadPostprocessModule();
  const output = emptyOutput(-0.000001);

  setBox(output, 0, 318, 320, 636, 188);
  setClass(output, 0, 0, 0.949707);

  for (let candidate = 1; candidate <= 300; candidate += 1) {
    setBox(output, candidate, 40 + (candidate % 40) * 12, 240 + (candidate % 10) * 12, 80, 50);
  }

  const result = postprocessOutput(output, letterbox);

  assert.equal(result.rawCandidates, 8400);
  assert.equal(result.confidenceCandidates, 1);
  assert.equal(result.reviewDetections.length, 1);
  assert.equal(result.reviewDetections[0].className, "plastic");
  assert.ok(Math.abs(result.reviewDetections[0].confidence - 0.949707) < 1e-6);
  assert.equal(result.reviewDetections.filter(detection => detection.confidence > 0.49 && detection.confidence < 0.51).length, 0);
});
