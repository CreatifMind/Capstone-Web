import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const theme = readFileSync("public/js/theme.js", "utf8");
const styles = readFileSync("public/css/style.css", "utf8");
const landingSource = `${page}\n${theme}\n${styles}`;
const landingMarkupAndScript = `${page}\n${theme}`;

test("landing page removes unsupported impact metrics and counter wiring", () => {
  [
    "ILLUSTRATIVE PLATFORM METRICS",
    "Platform Performance at a Glance",
    "98.2%",
    "Contamination Reduction",
    "Audit Time Saved",
    "count-1",
    "count-2",
    "count-3",
    "initCountUp",
  ].forEach((text) => assert.doesNotMatch(landingMarkupAndScript, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  ["impact-section", "impact-grid"].forEach((text) => {
    assert.doesNotMatch(landingSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("landing page keeps all problem cards without statistic badges", () => {
  [
    "Contaminant Infiltration",
    "Zero Sorting Visibility",
    "Manual Review Backlog",
    "No Material Intelligence",
  ].forEach((heading) => assert.match(page, new RegExp(heading)));

  [
    "23% contamination rate",
    "31% audit failure rate",
    "8+ hrs avg delay",
    "$842k untapped revenue",
    "problem-stat",
  ].forEach((text) => assert.doesNotMatch(landingSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("landing page replaces unsupported capability claims with accurate wording", () => {
  [
    "97%+ average confidence",
    "Sub-second detection",
    "batteries and chemicals",
    "chemical containers",
    "Glass result at 82%",
    "Contaminant Blocking",
    "Live Detection Feed",
    "ONLINE",
    "Real-Time YOLOv8 Classification",
  ].forEach((text) => assert.doesNotMatch(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  [
    "Detection Preview",
    "DEMONSTRATION",
    "EXAMPLE RESULT",
    "Contaminant Review",
    "Audit Trail",
    "Analytics Workspace",
    "Image and Video Waste Detection",
    "Detection and classification across 9 supported waste categories",
    "Battery hazard alerts and configurable contaminant-review rules",
    "Ambiguous glass classification | manual review needed",
  ].forEach((text) => assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("landing page navigation uses existing destinations and does not target removed sections", () => {
  assert.match(page, /href="#hero"[^>]*>Home/);
  assert.match(page, /href="#methodology"[^>]*>Methodology/);
  assert.match(page, /href="#features"[^>]*>Features/);
  assert.match(page, /href="#analytics"[^>]*>Analytics/);
  assert.match(page, /href="\/login"[^>]*>Login/);
  assert.doesNotMatch(page, /href="#impact"/);
  assert.doesNotMatch(page, /href="#contact"/);
  assert.doesNotMatch(page, />Contact</);
});

test("landing page preserves methodology, challenge video, problem section, and dummy analytics visuals", () => {
  [
    "THE BUSINESS CHALLENGE",
    "The Problem",
    "Project Lifecycle",
    "Business Process",
    "AI Development Plan",
    "Validation Criteria",
    "Model Performance",
    "957t",
    "$799k",
    "8.1% Growth",
    "2026",
    "+$180k",
    "landingForecastChart",
    "landingInventoryChart",
    "landingRiskChart",
    "landingProcChart",
    "59.5",
    "0.606",
    "0.579",
    "0.918",
  ].forEach((text) => assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});
