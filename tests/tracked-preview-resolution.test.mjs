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
  vm.runInContext(`${source}\nglobalThis.previewResolution = { plNormalizeScan, plScanToLedger };`, context);
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

test("Review renders maskHeader overlay for video preview canvas", () => {
  assert.match(source, /maskHeader: true/);
  assert.match(source, /if \(box\.maskHeader\)/);
});
