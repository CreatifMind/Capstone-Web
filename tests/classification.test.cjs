const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/script.js", "utf8");
const analyticsPage = fs.readFileSync("app/analytics/page.tsx", "utf8");
const uploadPage = fs.readFileSync("app/upload/page.tsx", "utf8");
const adminUsersPage = fs.readFileSync("app/admin/users/AdminUsersClient.tsx", "utf8");
const themeSource = fs.readFileSync("public/js/theme.js", "utf8");
assert.match(source, /const readyCount = queue\.filter\(item => item\.status === "ready"\)\.length;/);
assert.match(source, /Detect \$\{readyCount\} File\$\{readyCount === 1 \? "" : "s"\}/);
assert.match(uploadPage, /id="fileUpload"[^>]*accept="[^"]*video\/mp4[^"]*\.zip[^"]*"[^>]*multiple/);
assert.match(source, /function processVideoUploads\(videos\)/);
assert.match(source, /function processZipUploads\(archives\)/);
assert.match(source, /mediaType === "video"/);
assert.doesNotMatch(source.slice(source.indexOf("function processVideoUploads"), source.indexOf("function createVideoQueueItem")), /fetch\(/);
assert.doesNotMatch(source, /for \(let offset = 0; ; offset \+=/);
assert.match(source, /api\/scans\?limit=\$\{PL_SCAN_BOOTSTRAP_PAGE_SIZE\}&offset=0/);
assert.match(source, /payload\?\.summary\?\.confirmed/);
assert.doesNotMatch(source, /total:\s*[^\n]*:\s*scans\.length/);
assert.match(source, /plScanHistoryMeta\.total/);
assert.match(source, /void plRunAppInit\("Supabase scan refresh"/);
assert.match(source, /!\["\/", "\/login"\]\.includes\(window\.location\?\.pathname \|\| ""\)/);
assert.match(analyticsPage, /data-drill-target="detail-composition"/);
assert.match(analyticsPage, /data-drill-target="detail-resale"/);
assert.match(analyticsPage, /data-drill-target="detail-yield"/);
assert.match(analyticsPage, /id="analyticsDrillDetails"/);
assert.match(adminUsersPage, /Create User/);
assert.match(adminUsersPage, /onSubmit=\{create\}/);
assert.doesNotMatch(adminUsersPage, /Request Administrator Invite/);
assert.match(themeSource, /No account or password was saved/);
const context = {
  console,
  URLSearchParams,
  setTimeout,
  window: { addEventListener() {} },
  document: { readyState: "loading", addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } },
  localStorage: { getItem() { return null; }, setItem() {} },
  sessionStorage: { getItem() { return null; } },
};
vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.classification = { plEvaluateMaterial, plScanNeedsReview, plScanToLedger, plGetAnalyticsSummary };`, context);

const { plEvaluateMaterial, plScanNeedsReview, plScanToLedger, plGetAnalyticsSummary } = context.classification;
assert.deepEqual(
  ["General Trash", "general_trash", "Food Organics", "battery"].map(value => plEvaluateMaterial({ category: value, confidence: 0.98 }).category),
  ["general_trash", "general_trash", "food_organics", "battery"]
);
assert.equal(plEvaluateMaterial({ category: "Glass", confidence: 0.95 }).displayStatus, "Confirmed Recyclable");
const battery = plEvaluateMaterial({ category: "Battery", confidence: 0.98 });
assert.equal(battery.displayStatus, "Confirmed Contaminant");
assert.equal(battery.reviewRequired, false);
assert.equal(battery.disposalRoute, "Battery / E-Waste Collection");
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.79 }).reviewRequired, false);
assert.equal(plEvaluateMaterial({ category: "Textile", confidence: 0.55 }).reviewRequired, false);
assert.equal(plEvaluateMaterial({ category: "Cardboard", confidence: 0.32 }).displayStatus, "Confirmed Recyclable");
assert.equal(plEvaluateMaterial({ category: "Cardboard", confidence: 0.3199 }).displayStatus, "Review Needed");
for (const confidence of [0.10, 0.31, 0.32, 0.75, 0.99]) {
  const trash = plEvaluateMaterial({ category: "General Trash", confidence });
  assert.equal(trash.reviewRequired, confidence < 0.32);
  assert.equal(trash.displayStatus, confidence < 0.32 ? "Review Needed" : "Confirmed Contaminant");
  assert.equal(trash.disposalRoute, confidence < 0.32 ? "Manual Audit Queue" : "General-Waste Disposal");
}
assert.equal(plEvaluateMaterial({ category: "Food Organics", confidence: 0.88 }).displayStatus, "Confirmed Contaminant");
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.72, review_decision: { chosen_category: "Battery", disposition: "contaminant" } }).displayStatus, "Confirmed Contaminant");
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.72, review_decision: { chosen_category: "Plastic", disposition: "recyclable", outcome: "rejected" } }).displayStatus, "Rejected");
assert.equal(plScanToLedger({ id: "scan-1", created_at: "2026-07-14T00:00:00.000Z", source_name: "scan.jpg" }, { id: "material-1", category: "Battery", confidence: 0.99 }).status, "Confirmed Contaminant");
assert.equal(plScanNeedsReview({ detected_materials: [
  { category: "Plastic", confidence: 0.95 },
  { category: "Food Organics", confidence: 0.88 },
  { category: "Cardboard", confidence: 0.31 },
] }), true);
assert.equal([0.95, 0.88, 0.62, 0.319].filter(confidence => plEvaluateMaterial({ category: "Cardboard", confidence }).reviewRequired).length, 1);

const overviewScans = [
  { id: "battery", created_at: "2026-07-14T01:00:00.000Z", source_name: "battery.jpg", detected_materials: [{ id: "battery-item", category: "Battery", confidence: 0.99 }] },
  { id: "trash", created_at: "2026-07-14T02:00:00.000Z", source_name: "trash.jpg", detected_materials: [{ id: "trash-item", category: "General Trash", confidence: 0.96 }] },
  { id: "plastic", created_at: "2026-07-14T03:00:00.000Z", source_name: "plastic.jpg", detected_materials: [{ id: "plastic-item", category: "Plastic", confidence: 0.91 }] },
  { id: "cardboard-low", created_at: "2026-07-14T04:00:00.000Z", source_name: "cardboard.jpg", detected_materials: [{ id: "cardboard-low-item", category: "Cardboard", confidence: 0.31 }] },
  { id: "organic", created_at: "2026-07-14T05:00:00.000Z", source_name: "organic.jpg", detected_materials: [{ id: "organic-item", category: "Food Organic", confidence: 0.88 }] },
  { id: "boundary", created_at: "2026-07-14T06:00:00.000Z", source_name: "boundary.jpg", detected_materials: [{ id: "boundary-item", category: "Metal", confidence: 0.32 }] },
  { id: "boundary-low", created_at: "2026-07-14T07:00:00.000Z", source_name: "boundary-low.jpg", detected_materials: [{ id: "boundary-low-item", category: "Paper", confidence: 0.3199 }] },
  { id: "reviewed-low", created_at: "2026-07-14T08:00:00.000Z", source_name: "reviewed.jpg", detected_materials: [{ id: "reviewed-low-item", category: "Paper", confidence: 0.60, review_decision: { chosen_category: "Paper", disposition: "recyclable", outcome: "confirmed", created_at: "2026-07-14T10:00:00.000Z" } }] },
  { id: "missing-optional", created_at: "2026-07-14T11:00:00.000Z", detected_materials: [] },
];
const overview = plGetAnalyticsSummary({ scans: overviewScans, days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(overview.reviewCount, 2, "only low-confidence objects need review");
assert.equal(overview.allLowConfidenceCount, 2, "resolved low-confidence detections remain visible to the overview");
assert.equal(overview.confirmedTodayCount, 6, "confirmed contaminants and completed reviews count as confirmed, not review");
assert.equal(overview.highRiskCount, 1, "confirmed battery is high risk");
assert.equal(overview.recoveryOpportunityCount, 3, "only confirmed recyclables with value are recovery opportunities");
assert.equal(Number(overview.avgConfidence.toFixed(1)), 66.2, "average confidence uses stored material confidences");
assert.equal(overview.confirmedScanCount, 5, "confirmed object count is material-based");
assert.equal(overview.trendRows.reduce((sum, row) => sum + row.value, 0), 9, "trend includes scans without optional preview/source fields");
assert.equal(overview.lastUpload.id, "missing-optional");
assert.equal(overview.lastUploadBatchCount, 1, "single uploads have a safe batch fallback");
assert.equal(overview.averageReviewTurnaroundMs, 7200000, "review turnaround uses review completion timestamps");
assert.ok(overview.materialMixRows.length > 0 && overview.totalEstimatedWeightKg > 0, "material mix is derived from real category weights");
const batchSummary = plGetAnalyticsSummary({ scans: [
  { id: "batch-1", created_at: "2026-07-14T01:00:00.000Z", batch_id: "upload-a", detected_materials: [] },
  { id: "batch-2", created_at: "2026-07-14T02:00:00.000Z", batch_id: "upload-a", detected_materials: [] },
], days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(batchSummary.lastUploadBatchCount, 2, "batch-aware upload detail counts matching upload ids");
const zeroValue = plGetAnalyticsSummary({ scans: [{ id: "zero", created_at: "2026-07-14T01:00:00.000Z", detected_materials: [{ category: "General Trash", confidence: 0.95 }] }], days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(zeroValue.totalEstimatedResaleValueRm, 0, "RM0.00 remains a valid numeric value");
const mixedConfidence = plGetAnalyticsSummary({ scans: [{ id: "mixed", created_at: "2026-07-14T01:00:00.000Z", detected_materials: [{ category: "Plastic", confidence: 0.91 }, { category: "Metal", confidence: 75 }, { category: "Glass", confidence: "bad" }] }], days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(Number(mixedConfidence.avgConfidence.toFixed(1)), 83.0, "mixed decimal/percentage confidence values normalize once and invalid values are excluded");
assert.equal(plGetAnalyticsSummary({ scans: [], days: 7, now: "2026-07-14T12:00:00.000Z" }).scans.length, 0, "empty overview stays empty");
assert.equal(plGetAnalyticsSummary({ scans: [], days: 7, now: "2026-07-14T12:00:00.000Z" }).avgConfidence, null, "empty confidence set uses N/A state");
assert.equal(plGetAnalyticsSummary({ scans: overviewScans, days: 7, now: "2026-07-30T12:00:00.000Z" }).scans.length, 0, "selected ranges can be empty without falling back to all scans");
const unfilteredOverview = plGetAnalyticsSummary({ scans: overviewScans, now: "2026-07-14T12:00:00.000Z" });
assert.equal(unfilteredOverview.scans.length, overviewScans.length, "unfiltered summaries retain all saved scans");
assert.ok(unfilteredOverview.trendRows.length <= 2, "unfiltered trend only spans saved scan dates");
console.log("frontend classification tests passed");
