import type { Detection } from "./types";

function iou(a: Detection, b: Detection) {
  const left = Math.max(a.x1, b.x1);
  const top = Math.max(a.y1, b.y1);
  const right = Math.min(a.x2, b.x2);
  const bottom = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - intersection;
  return union > 0 ? intersection / union : 0;
}

export function classAwareNms(detections: Detection[], iouThreshold: number) {
  const kept: Detection[] = [];
  const byClass = new Map<number, Detection[]>();

  for (const detection of detections) {
    const group = byClass.get(detection.classId) || [];
    group.push(detection);
    byClass.set(detection.classId, group);
  }

  for (const group of Array.from(byClass.values())) {
    const remaining = group.slice().sort((a, b) => b.confidence - a.confidence);
    while (remaining.length) {
      const best = remaining.shift();
      if (!best) break;
      kept.push(best);
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        if (iou(best, remaining[index]) >= iouThreshold) remaining.splice(index, 1);
      }
    }
  }

  return kept.sort((a, b) => b.confidence - a.confidence);
}
