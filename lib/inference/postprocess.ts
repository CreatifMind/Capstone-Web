import { MODEL_CONFIG } from "./model-config";
import { classAwareNms } from "./nms";
import type { LetterboxInfo, Detection, PostprocessResult } from "./types";

const CANDIDATE_COUNT = 8400;

function clamp(value: number, maximum: number) {
  return Math.min(Math.max(value, 0), maximum);
}

export function restoreBox(centerX: number, centerY: number, width: number, height: number, letterbox: LetterboxInfo) {
  if (![centerX, centerY, width, height, letterbox.scale].every(Number.isFinite) || letterbox.scale <= 0) return null;
  const x1 = clamp(((centerX - (width / 2)) - letterbox.padX) / letterbox.scale, letterbox.originalWidth);
  const y1 = clamp(((centerY - (height / 2)) - letterbox.padY) / letterbox.scale, letterbox.originalHeight);
  const x2 = clamp(((centerX + (width / 2)) - letterbox.padX) / letterbox.scale, letterbox.originalWidth);
  const y2 = clamp(((centerY + (height / 2)) - letterbox.padY) / letterbox.scale, letterbox.originalHeight);
  return x2 > x1 && y2 > y1 ? { x1, y1, x2, y2 } : null;
}

export function postprocessOutput(output: Float32Array, letterbox: LetterboxInfo): PostprocessResult {
  const candidates: Detection[] = [];
  for (let candidate = 0; candidate < CANDIDATE_COUNT; candidate += 1) {
    let classId = 0;
    let confidence = output[(4 * CANDIDATE_COUNT) + candidate];
    for (let classIndex = 1; classIndex < MODEL_CONFIG.classes.length; classIndex += 1) {
      const score = output[((4 + classIndex) * CANDIDATE_COUNT) + candidate];
      if (score > confidence) {
        confidence = score;
        classId = classIndex;
      }
    }
    if (!Number.isFinite(confidence) || confidence < MODEL_CONFIG.confidenceThreshold) continue;

    const centerX = output[candidate];
    const centerY = output[CANDIDATE_COUNT + candidate];
    const width = output[(2 * CANDIDATE_COUNT) + candidate];
    const height = output[(3 * CANDIDATE_COUNT) + candidate];
    const box = restoreBox(centerX, centerY, width, height, letterbox);
    if (!box) continue;
    candidates.push({ classId, className: MODEL_CONFIG.classes[classId], confidence, ...box });
  }

  const reviewDetections = classAwareNms(candidates, MODEL_CONFIG.nmsIouThreshold);
  return {
    rawCandidates: CANDIDATE_COUNT,
    confidenceCandidates: candidates.length,
    detections: reviewDetections.filter(detection => detection.className !== "general_trash"),
    reviewDetections
  };
}
