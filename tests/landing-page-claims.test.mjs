import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
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
    "59.5%",
    "60.6%",
    "57.9%",
    "Box mAP@0.5",
    "Primary detection metric",
    "Correctness of retained predictions",
    "Share of target objects detected",
    "Held-out validation data",
    "Detection Considerations",
    "Strongest performance",
    "Large, clearly visible objects",
    "More challenging",
    "Small, overlapping, or partially obscured objects",
    "Human review",
    "Low-confidence and General Trash results",
    "Model Selection &amp; Web Deployment",
    "Validated checkpoint",
    "The deployed model was selected from the best validated YOLOv8m-seg checkpoint.",
    "best.onnx enables browser-compatible inference through ONNX Runtime Web",
    "best.pt remains the PyTorch model format used mainly for training and Python-based backend workflows.",
    "9 waste categories",
  ].forEach((text) => assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  [
    "Naming accuracy",
    "0.606",
    "0.579",
    "0.918",
    "Detection Performance by Scene Complexity",
    "~85% detected",
    "~56% detected",
    "~42% detected",
    "Why This Model Was Shipped",
    "0.552",
    "0.595",
    "312",
    "0/30",
    "ONNX parity",
  ].forEach((text) => assert.doesNotMatch(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("methodology removes separate targets panel while preserving methodology assets", () => {
  [
    "TARGETS — NOT FINAL RESULTS",
    "methodology-target-badge",
    "methodology-target-list",
    "Standard class threshold",
    "Battery / hazardous threshold",
  ].forEach((text) => assert.doesNotMatch(landingSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  [
    "/assets/DL Framework & Development Plan.png",
    "/assets/Production Model Success Metrics.png",
  ].forEach((text) => assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
});

test("white DL framework infographic asset remains available at expected dimensions", () => {
  const assetPath = "public/assets/DL Framework & Development Plan.png";
  const asset = readFileSync(assetPath);
  const signature = asset.subarray(0, 8).toString("hex");
  const width = asset.readUInt32BE(16);
  const height = asset.readUInt32BE(20);

  assert.equal(signature, "89504e470d0a1a0a");
  assert.equal(width, 1536);
  assert.equal(height, 1024);
  assert.ok(statSync(assetPath).size > 100_000);
});

test("landing nav scroll spy observes only sections represented by nav links", () => {
  assert.match(theme, /function initLandingNav\(\)/);
  assert.match(theme, /const setActiveSection = sectionId =>/);
  assert.match(theme, /const updateActiveFromViewport = \(\) =>/);
  assert.match(theme, /const navTargets = \[\.\.\.new Set/);
  assert.match(theme, /document\.getElementById\(href\.slice\(1\)\)/);
  assert.match(theme, /link\.setAttribute\('aria-current', 'page'\)/);
  assert.doesNotMatch(theme, /const sections = document\.querySelectorAll\('section\\[id\\]'\)/);
  assert.doesNotMatch(theme, /new IntersectionObserver/);
});
