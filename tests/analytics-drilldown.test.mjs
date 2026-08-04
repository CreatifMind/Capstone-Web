import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/analytics/page.tsx", "utf8");
const script = readFileSync("public/js/script.js", "utf8");

test("analytics page defines the 4 new drill-through cards and detail panels", () => {
  [
    'data-drill-target="detail-reviewers"',
    'data-drill-target="detail-pipeline"',
    'data-drill-target="detail-risk"',
    'data-drill-target="detail-accuracy"',
    'id="detail-reviewers"',
    'id="detail-pipeline"',
    'id="detail-risk"',
    'id="detail-accuracy"',
    'id="overviewPipelineHealth"',
    'id="overviewRiskSeverity"',
    'id="overviewAiAccuracy"',
    'id="analyticsReviewerActivity"',
  ].forEach((needle) => assert.ok(page.includes(needle), `expected app/analytics/page.tsx to contain ${needle}`));
});

test("script.js maps the 4 new backend fields in the primary summary path", () => {
  [
    "reviewerActivity: plSafeArray(payload.reviewer_activity)",
    "uploadPipelineHealth: payload.upload_pipeline_health || null",
    "riskSeverityBreakdown: plSafeArray(payload.risk_severity_breakdown)",
    "aiAccuracyByCategory: plSafeArray(payload.ai_accuracy_by_category)",
  ].forEach((needle) => assert.ok(script.includes(needle), `expected plAnalyticsSummaryForActiveScope to map ${needle}`));
});

test("script.js computes the same 4 fields in the client-side fallback path", () => {
  [
    "reviewerActivity,",
    "uploadPipelineHealth: null,",
    "riskSeverityBreakdown,",
    "aiAccuracyByCategory",
  ].forEach((needle) => assert.ok(script.includes(needle), `expected plGetAnalyticsSummary fallback to return ${needle}`));
});

test("script.js defines and wires updateAnalyticsSecondaryPanels", () => {
  assert.match(script, /function updateAnalyticsSecondaryPanels\(summary\)/);
  assert.match(script, /updateAnalyticsSecondaryPanels\(plAnalyticsSummaryForActiveScope\(\)\)/);
});
