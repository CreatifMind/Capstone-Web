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
  assert.match(page, /href="#about"[^>]*>About Us/);
  assert.match(page, /href="#methodology"[^>]*>Methodology/);
  assert.match(page, /href="#features"[^>]*>Features/);
  assert.match(page, /href="#analytics"[^>]*>Analytics/);
  assert.match(page, /href="#contact"[^>]*>Contact/);
  assert.match(page, /href="\/login"[^>]*>Login/);
  assert.doesNotMatch(page, /href="#impact"/);
});

test("landing page includes approved About Us and Contact content", () => {
  [
    "ABOUT PURITYLOOP AI",
    "Built to Make Waste-Sorting Decisions More Traceable",
    "PurityLoop AI is a capstone project that combines computer vision, human review, operational traceability, and analytics to support more structured waste-sorting workflows.",
    "Our Purpose",
    "How We Work",
    "Human-in-the-Loop",
    "Project Focus",
    "Want to Learn More About PurityLoop AI?",
    "purityloopai@info.com",
    "+6012 2818212",
    "mailto:purityloopai@info.com",
    "tel:+60122818212",
    "Message received. Thank you for contacting PurityLoop AI.",
  ].forEach((text) => assert.match(landingSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  ["Talvin — Data Quality", "Chris — Training Algorithm", "Naomi — Model Architecture", "about-team-strip"].forEach((text) => {
    assert.doesNotMatch(landingSource, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("landing contact form posts to server API without exposing webhook details", () => {
  const contactRoute = readFileSync("app/api/contact/route.ts", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(page, /<form id="contactForm"/);
  ["name", "email", "subject", "message", "website"].forEach((field) => {
    assert.match(page, new RegExp(`name="${field}"`));
  });
  assert.match(theme, /fetch\('\/api\/contact'/);
  assert.match(theme, /form\.dataset\.submitting === 'true'/);
  assert.match(contactRoute, /process\.env\.CONTACT_WEBHOOK_URL/);
  assert.match(contactRoute, /CONTACT_WEBHOOK_NOT_CONFIGURED/);
  assert.match(contactRoute, /CONTACT_INVALID_EMAIL/);
  assert.match(contactRoute, /CONTACT_SPAM_REJECTED/);
  assert.match(envExample, /^CONTACT_WEBHOOK_URL=$/m);
  assert.doesNotMatch(page, /CONTACT_WEBHOOK_URL/);
  assert.doesNotMatch(theme, /CONTACT_WEBHOOK_URL/);
});

test("landing page preserves methodology, challenge video, problem section, and dummy analytics visuals", () => {
  [
    "THE BUSINESS CHALLENGE",
    "The Problem",
    "Project Lifecycle",
    "Business Process",
    "AI Development Plan",
    "Validation Criteria",
    "Per-Class Model Performance",
    "Model Training &amp; Benchmarks",
    "59.5%",
    "61.9%",
    "91.8%",
    "Overall 9-Class mAP",
    "8-Class View mAP",
    "9-Class Per-Class Performance Breakdown",
    "Battery",
    "Textile",
    "Glass",
    "Metal",
    "Food Organic",
    "Cardboard",
    "Plastic",
    "Paper",
    "PurityLoop AI (Shipped Model)",
    "+4.3% Model Lift",
    "EcoDetect-YOLOv2",
    "TridentNet Baseline",
    "Field Benchmark Comparison",
  ].forEach((text) => assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
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
