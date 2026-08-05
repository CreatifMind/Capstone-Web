import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/analytics/page.tsx", "utf8");
const reviewPage = readFileSync("app/review/page.tsx", "utf8");
const script = readFileSync("public/js/script.js", "utf8");

test("analytics drill-through uses object labels, nine material cards, and overview return", () => {
  assert.ok(page.includes("Objects Needing Review"));
  assert.ok(page.includes("Confirmed Objects"));
  assert.doesNotMatch(page, /Items Needing Review/);
  assert.doesNotMatch(page, /Confirmed Scans/);
  [
    '"glass", "food organic", "general trash", "cardboard", "textile", "plastic", "metal", "battery", "paper"',
    "Detected material records",
    "View details",
    "function returnToAnalyticsOverview()",
    "Back to Analytics Overview",
    "data-analytics-return",
  ].forEach((needle) => assert.ok(script.includes(needle), `expected analytics script to contain ${needle}`));
  ["Saved scans", "Detected materials", "Avg confidence"].forEach((needle) => {
    assert.doesNotMatch(script, new RegExp(`<span>${needle}</span>`));
  });
});

test("review summary labels detected records, not unique physical objects", () => {
  assert.ok(reviewPage.includes("Total Detected Objects"));
  assert.ok(reviewPage.includes("All persisted detection records"));
  assert.doesNotMatch(reviewPage, /Unique Objects Detected/);
});

test("analytics summary uses object status and real confidence values", () => {
  assert.match(script, /function plValidConfidencePercent\(value\)/);
  assert.match(script, /decision: plEvaluateMaterial\(material, scan\)/);
  assert.match(script, /const confirmedRows = materialRows\.filter/);
  assert.match(script, /const reviewRows = materialRows\.filter/);
  assert.match(script, /const rejectedRows = materialRows\.filter/);
  assert.match(script, /const confirmedScanCount = confirmedRows\.length/);
  assert.match(script, /plOverviewSet\("average-confidence", hasAverageConfidence/);
});
