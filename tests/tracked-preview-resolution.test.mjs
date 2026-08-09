import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = fs.readFileSync("public/js/script.js", "utf8");

function buildContext() {
  const context = {
    console,
    URL,
    URLSearchParams,
    setTimeout,
    window: { addEventListener() {} },
    document: {
      readyState: "loading",
      addEventListener() {},
      getElementById() { return null; },
      querySelectorAll() { return []; },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    sessionStorage: { getItem() { return null; } },
  };
  vm.createContext(context);
  vm.runInContext(`${source}\nglobalThis.previewResolution = { plNormalizeScan, plScanToLedger, plCleanPreviewBoxes, plMergeFreshAnalyticsSummary, PL_ANALYTICS_SUMMARY_CACHE_TTL_MS };`, context);
  return context.previewResolution;
}

test("Review and Analytics resolve tracked-video rows to the annotated preview URL", () => {
  const { plNormalizeScan, plScanToLedger } = buildContext();
  const scan = plNormalizeScan({
    id: "tracked-preview",
    source_type: "tracked_video",
    result_kind: "video_track_object",
    preview_image_url: "https://storage.example.test/annotated-track.jpg",
    image_url: "https://drive.google.com/raw-frame.jpg",
    created_at: "2026-07-14T00:00:00.000Z",
    detected_materials: [{ id: "track-material", category: "Plastic", confidence: 0.91, stable_object_id: "scan-track-4" }],
  });

  const ledger = plScanToLedger(scan, scan.detected_materials[0]);

  assert.equal(ledger.preview, "https://storage.example.test/annotated-track.jpg");
});

test("Review skips frontend canvas boxes for annotated tracked-video previews", () => {
  assert.match(source, /if \(isTrackedVideo\) \{[\s\S]*?return \[\];[\s\S]*?\}/);
});

test("Review image preview uses exactly one bounding-box layer", () => {
  assert.match(source, /let activeImageUsesBackendAnnotation = false/);
  assert.match(source, /dataUrl: cachedPreview/);
  assert.match(source, /activeImageUsesBackendAnnotation = isReviewWorkspace && !rawPreviewUrl && Boolean\(backendPreviewUrl && backendPreviewUrl === activeScan\.preview_image_url\)/);
  assert.match(source, /if \(rawPreviewUrl\) \{[\s\S]*?activeImageObj\.src = rawPreviewUrl;[\s\S]*?\} else if \(backendPreviewUrl\) \{[\s\S]*?activeImageObj\.src = backendPreviewUrl;/);
  assert.match(source, /if \(activeImageUsesBackendAnnotation\) return \[\];/);
});

test("Preview cleanup hides low-confidence and extreme edge strips only", () => {
  const { plCleanPreviewBoxes } = buildContext();
  const boxes = [
    { label: "left strip", confidence: "80%", x: 0, y: 0.10, w: 0.10, h: 0.80 },
    { label: "top strip", confidence: "79%", x: 0.10, y: 0, w: 0.80, h: 0.10 },
    { label: "inner strip", confidence: "78%", x: 0.45, y: 0.10, w: 0.10, h: 0.80 },
    { label: "edge object", confidence: "77%", x: 0, y: 0.10, w: 0.40, h: 0.50 },
    { label: "low confidence", confidence: "24%", x: 0.70, y: 0.70, w: 0.20, h: 0.20 },
    { label: "duplicate high", confidence: "93%", x: 0.20, y: 0.20, w: 0.30, h: 0.30 },
    { label: "duplicate low", confidence: "88%", x: 0.21, y: 0.21, w: 0.30, h: 0.30 },
  ];

  const clean = plCleanPreviewBoxes(boxes);

  assert.deepEqual(Array.from(clean, box => box.label), ["duplicate high", "inner strip", "edge object"]);
  assert.equal(boxes.length, 7);
});

test("Fresh analytics summary overrides stale history even when review count decreases", () => {
  const { plMergeFreshAnalyticsSummary, PL_ANALYTICS_SUMMARY_CACHE_TTL_MS } = buildContext();
  const merged = plMergeFreshAnalyticsSummary(
    { total_objects: 6717, confirmed_objects: 5198, needs_review_objects: 1516, rejected_objects: 3 },
    { total_objects: 6746, confirmed_objects: 6259, needs_review_objects: 476, rejected_objects: 11 }
  );

  assert.equal(merged.total_objects, 6746);
  assert.equal(merged.confirmed_objects, 6259);
  assert.equal(merged.needs_review_objects, 476);
  assert.equal(merged.rejected_objects, 11);
  assert.equal(PL_ANALYTICS_SUMMARY_CACHE_TTL_MS, 30000);
  assert.doesNotMatch(source, /Date\.now\(\) - \(cached\.timestamp \|\| 0\) < 86400000/);
  assert.ok(source.includes('plBackendFetch(`${plApiBaseUrl()}/api/analytics/summary`, { cache: "no-store" })'));
  assert.ok(source.includes('plBackendFetch(url, { cache: "no-store" })'));
});

test("Review KPI cards do not fall back to scan history summary totals", () => {
  assert.doesNotMatch(source, /const summary = plMergeFreshAnalyticsSummary\(historySummary, analyticsMetrics\);/);
  assert.doesNotMatch(source, /plScanHistoryMeta\.total\)\s*\?\s*Number\(plScanHistoryMeta\.total\)/);
  assert.match(source, /setMetric\("historyProcessedToday", analyticsMetrics\?\.total_objects\);/);
});
