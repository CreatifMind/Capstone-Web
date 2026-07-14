const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("public/js/script.js", "utf8");
assert.match(source, /const readyCount = queue\.filter\(item => item\.status === "ready"\)\.length;/);
assert.match(source, /Detect \$\{readyCount\} Image\$\{readyCount === 1 \? "" : "s"\}/);
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
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.79 }).reviewRequired, true);
assert.equal(plEvaluateMaterial({ category: "Textile", confidence: 0.55 }).reviewRequired, true);
assert.equal(plEvaluateMaterial({ category: "Cardboard", confidence: 0.85 }).displayStatus, "Confirmed Recyclable");
assert.equal(plEvaluateMaterial({ category: "Cardboard", confidence: 0.8499 }).displayStatus, "Review Needed");
assert.equal(plEvaluateMaterial({ category: "Food Organics", confidence: 0.88 }).displayStatus, "Confirmed Contaminant");
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.72, review_decision: { chosen_category: "Battery", disposition: "contaminant" } }).displayStatus, "Confirmed Contaminant");
assert.equal(plEvaluateMaterial({ category: "Plastic", confidence: 0.72, review_decision: { chosen_category: "Plastic", disposition: "recyclable", outcome: "rejected" } }).displayStatus, "Rejected");
assert.equal(plScanToLedger({ id: "scan-1", created_at: "2026-07-14T00:00:00.000Z", source_name: "scan.jpg" }, { id: "material-1", category: "Battery", confidence: 0.99 }).status, "Confirmed Contaminant");
assert.equal(plScanNeedsReview({ detected_materials: [
  { category: "Plastic", confidence: 0.95 },
  { category: "Food Organics", confidence: 0.88 },
  { category: "Cardboard", confidence: 0.62 },
] }), true);
assert.equal([0.95, 0.88, 0.62].filter(confidence => plEvaluateMaterial({ category: "Cardboard", confidence }).reviewRequired).length, 1);

const overviewScans = [
  { id: "battery", created_at: "2026-07-14T01:00:00.000Z", source_name: "battery.jpg", detected_materials: [{ id: "battery-item", category: "Battery", confidence: 0.99 }] },
  { id: "trash", created_at: "2026-07-14T02:00:00.000Z", source_name: "trash.jpg", detected_materials: [{ id: "trash-item", category: "General Trash", confidence: 0.96 }] },
  { id: "plastic", created_at: "2026-07-14T03:00:00.000Z", source_name: "plastic.jpg", detected_materials: [{ id: "plastic-item", category: "Plastic", confidence: 0.91 }] },
  { id: "cardboard-low", created_at: "2026-07-14T04:00:00.000Z", source_name: "cardboard.jpg", detected_materials: [{ id: "cardboard-low-item", category: "Cardboard", confidence: 0.72 }] },
  { id: "organic", created_at: "2026-07-14T05:00:00.000Z", source_name: "organic.jpg", detected_materials: [{ id: "organic-item", category: "Food Organic", confidence: 0.88 }] },
  { id: "boundary", created_at: "2026-07-14T06:00:00.000Z", source_name: "boundary.jpg", detected_materials: [{ id: "boundary-item", category: "Metal", confidence: 0.85 }] },
  { id: "boundary-low", created_at: "2026-07-14T07:00:00.000Z", source_name: "boundary-low.jpg", detected_materials: [{ id: "boundary-low-item", category: "Paper", confidence: 0.8499 }] },
  { id: "missing-optional", created_at: "2026-07-14T08:00:00.000Z", detected_materials: [] },
];
const overview = plGetAnalyticsSummary({ scans: overviewScans, days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(overview.reviewCount, 2, "only values below 85% need review");
assert.equal(overview.confirmedTodayCount, 5, "confirmed contaminants count as confirmed, not review");
assert.equal(overview.highRiskCount, 1, "confirmed battery is high risk");
assert.equal(overview.recoveryOpportunityCount, 2, "only confirmed recyclables with value are recovery opportunities");
assert.equal(overview.trendRows.reduce((sum, row) => sum + row.value, 0), 8, "trend includes scans without optional preview/source fields");
assert.equal(overview.lastUpload.id, "missing-optional");
const zeroValue = plGetAnalyticsSummary({ scans: [{ id: "zero", created_at: "2026-07-14T01:00:00.000Z", detected_materials: [{ category: "General Trash", confidence: 0.95 }] }], days: 7, now: "2026-07-14T12:00:00.000Z" });
assert.equal(zeroValue.totalEstimatedResaleValueRm, 0, "RM0.00 remains a valid numeric value");
assert.equal(plGetAnalyticsSummary({ scans: [], days: 7, now: "2026-07-14T12:00:00.000Z" }).scans.length, 0, "empty overview stays empty");
console.log("frontend classification tests passed");
