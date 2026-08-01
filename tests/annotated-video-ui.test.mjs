import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const resultPage = readFileSync("app/result/page.tsx", "utf8");
const reviewPage = readFileSync("app/review/page.tsx", "utf8");
const modelImprovementPage = readFileSync("app/model-improvement/page.tsx", "utf8");
const middleware = readFileSync("middleware.ts", "utf8");
const roles = readFileSync("lib/roles.ts", "utf8");
const loginRoute = readFileSync("app/auth/login/route.ts", "utf8");
const script = readFileSync("public/js/script.js", "utf8");
const styles = readFileSync("public/css/style.css", "utf8");

test("result page contains semantic annotated MP4 player shell", () => {
  assert.match(resultPage, /id="annotatedVideoPanel"/);
  assert.match(resultPage, /Annotated Result Video/);
  assert.match(script, /<video class="annotated-result-video" controls preload="metadata" playsinline poster=/);
  assert.match(script, /<source src="\$\{plEscapeHtml\(videoUrl\)\}" type="video\/mp4">/);
});

test("review page contains scan-level annotated MP4 tab and player shell", () => {
  assert.match(reviewPage, /id="reviewMediaTabs"/);
  assert.match(reviewPage, /Detected Objects/);
  assert.match(reviewPage, /Annotated Video/);
  assert.match(reviewPage, /id="annotatedVideoPanel"/);
  assert.match(reviewPage, /Annotated Video Result/);
});

test("annotated video UI supports ready, processing, failed, and expired states", () => {
  assert.match(script, /ready: "Ready"/);
  assert.match(script, /processing: "Processing"/);
  assert.match(script, /failed: "Failed"/);
  assert.match(script, /expired: "Expired"/);
  assert.match(script, /Annotated video is still being generated/);
  assert.match(script, /Annotated video generation failed/);
  assert.match(script, /annotated video URL could not be loaded/i);
});

test("annotated video panel remains scoped to video scans and keeps frame results below", () => {
  assert.match(script, /annotatedVideoPanel\.hidden = true/);
  assert.match(script, /setReviewMediaMode/);
  assert.match(script, /Frame results remain available below/);
  assert.match(script, /Download annotated MP4/);
  assert.match(styles, /\.annotated-result-video/);
  assert.match(styles, /max-width: 100%/);
});

test("MP4 upload flow surfaces structured backend errors", () => {
  assert.match(script, /function plApiErrorMessage/);
  assert.match(script, /detail\.code/);
  assert.match(script, /detail\.stage/);
  assert.match(script, /plApiErrorMessage\(startPayload, "Unable to start MP4 upload\."\)/);
  assert.match(script, /plApiErrorMessage\(payload, `MP4 chunk upload failed/);
  assert.match(script, /plApiErrorMessage\(ingestPayload, "Unable to queue MP4 processing\."\)/);
  assert.match(script, /plApiErrorMessage\(job, "Unable to read MP4 job status\."\)/);
});

test("image upload uses browser ONNX instead of backend PyTorch fallback", () => {
  assert.match(script, /Browser ONNX is required for image detection/);
  assert.doesNotMatch(script, /Backend PyTorch — best\.pt/);
  assert.match(script, /Browser ONNX — best\.onnx/);
});

test("model team has a protected Model Review route and role home", () => {
  assert.match(roles, /model_team/);
  assert.match(roles, /role === "model_team"\) return "\/model-improvement"/);
  assert.match(modelImprovementPage, /requireActiveRole\(\["model_team"\]\)/);
  assert.match(modelImprovementPage, /export const dynamic = "force-dynamic"/);
  assert.match(modelImprovementPage, /Model Review Workspace/);
});

test("middleware and login route model team users away from operator and admin workspaces", () => {
  assert.match(middleware, /const MODEL_REVIEW = "\/model-improvement"/);
  assert.match(middleware, /profile\.role === "model_team"/);
  assert.match(middleware, /isModelReview\) return response/);
  assert.match(middleware, /isModelReview\) return redirect\(request, "\/upload"/);
  assert.match(loginRoute, /roleHomePath\(profile\.role\)/);
});
