/* PurityLoop AI - Smart Waste Sorting & Contamination Detection */

/* RELIABLE prototype limits */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const MAX_BATCH_IMAGES = 10;
const MAX_VIDEO_SIZE = 2 * 1024 * 1024 * 1024;
const DEFAULT_SCAN_ASSET = "/assets/items/upload-result-reference.png";

function plSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function plSafeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("PurityLoop: invalid stored JSON ignored.", error);
    return fallback;
  }
}

function plSetJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("PurityLoop: unable to save local state.", key, error);
  }
}

function plSafeFiles(files) {
  if (!files) return [];
  try {
    return Array.from(files).filter(Boolean);
  } catch {
    return [];
  }
}

const PL_SCAN_LOGS_KEY = "purityloop_scan_logs";
const PL_LATEST_SCAN_KEY = "purityloop_latest_scan";
const PL_UPLOADS_KEY = "purityloop_uploads";
const PL_VIDEO_JOBS_KEY = "purityloop_video_jobs";
const PL_SCAN_BOOTSTRAP_PAGE_SIZE = 10;
const PL_SCAN_META_KEY = "purityloop_scan_meta";
let plScanHistoryMeta = plSafeJsonParse(localStorage.getItem(PL_SCAN_META_KEY), {
  total: null,
  limit: PL_SCAN_BOOTSTRAP_PAGE_SIZE,
  offset: 0,
  summary: { confirmed: null, needs_review: null, rejected: null }
});
let plScanHistoryRefreshPromise = null;
let plAnalyticsDateData = null;
let plAnalyticsSelectedDate = null;
let plAnalyticsRequestId = 0;
let plSelectedUploadFiles = [];

function plConfig() {
  return window.__PURITYLOOP_CONFIG__ || {};
}

function plApiBaseUrl() {
  return String(plConfig().apiBaseUrl || "").replace(/\/$/, "");
}

function plBrowserModelUrl() {
  return "/models/purityloop/best.onnx";
}

function plApiErrorMessage(payload, fallback) {
  const detail = payload?.detail ?? payload?.error;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object") {
    const code = detail.code ? `${detail.code}: ` : "";
    const message = detail.message || detail.detail || fallback;
    const stage = detail.stage ? ` (${detail.stage})` : "";
    return `${code}${message}${stage}`;
  }
  return fallback;
}

function plVideoPollingDelay(transientFailures) {
  return Math.min(15000, 1000 * (2 ** Math.min(4, Math.max(0, transientFailures - 1)))) + Math.round(Math.random() * 250);
}

let plSessionTokenPromise = null;

function plPublicHeaders(extra = {}) {
  const ngrokHeader = plApiBaseUrl().includes(".ngrok-free.dev") ? { "ngrok-skip-browser-warning": "1" } : {};
  return { ...ngrokHeader, ...plPlainHeaders(extra) };
}

function plPlainHeaders(headers = {}) {
  if (headers instanceof Headers) {
    const result = {};
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...(headers || {}) };
}

function plRedirectToLogin() {
  const path = window.location?.pathname || "";
  if (path === "/") return;
  if (path.includes("/login") || path.includes("/auth/login")) return;
  window.location.assign("/login?reason=session_expired");
}

async function plAccessToken({ refresh = false } = {}) {
  if (refresh) plSessionTokenPromise = null;
  if (!plSessionTokenPromise) {
    plSessionTokenPromise = fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.accessToken) {
        plRedirectToLogin();
        throw new Error("Your session has expired. Please sign in again.");
      }
      return payload.accessToken;
    }).catch(error => {
      plSessionTokenPromise = null;
      throw error;
    });
  }
  return plSessionTokenPromise;
}

async function plAuthHeaders(extra = {}, options = {}) {
  const token = await plAccessToken(options);
  return { ...plPublicHeaders(extra), Authorization: `Bearer ${token}` };
}

async function plBackendFetch(input, init = {}, options = {}) {
  const headers = await plAuthHeaders(init.headers || {});
  const response = await fetch(input, { ...init, headers });
  if (response.status !== 401 || options.retryAuth === false) return response;
  const retryHeaders = await plAuthHeaders(init.headers || {}, { refresh: true });
  const retryResponse = await fetch(input, { ...init, headers: retryHeaders });
  if (retryResponse.status === 401) plRedirectToLogin();
  return retryResponse;
}

function plStoragePreviewUrl(sourceName) {
  const baseUrl = String(plConfig().supabaseUrl || "").replace(/\/$/, "");
  const path = String(sourceName || "");
  if (!baseUrl || !path.startsWith("purityloop_")) return "";
  return `${baseUrl}/storage/v1/object/public/mock_uploaded_images/${encodeURIComponent(path)}`;
}

function plSetUploadProgress(percent, label = "Uploading image") {
  const progress = document.getElementById("uploadProgress");
  const bar = document.getElementById("uploadProgressBar");
  const text = document.getElementById("uploadProgressPercent");
  const labelEl = document.getElementById("uploadProgressLabel");
  if (!progress || !bar || !text) return;
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  progress.hidden = false;
  bar.style.width = `${safePercent}%`;
  text.textContent = `${safePercent}%`;
  if (labelEl) labelEl.textContent = label;
}

function plHideUploadProgress() {
  const progress = document.getElementById("uploadProgress");
  if (progress) progress.hidden = true;
}

function plNormalizeCategory(value) {
  const text = String(value || "Unknown").trim();
  if (!text) return "Unknown";
  return text
    .replace(/_/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function plNormalizeStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const PL_CONFIRMATION_THRESHOLD = 85;
const PL_BROWSER_MODEL_CLASSES = ["plastic", "paper", "cardboard", "metal", "glass", "textile", "food_organic", "battery", "general_trash"];
const PL_BROWSER_MODEL_VERSION = "v3_ffremask_9cls";
const PL_BROWSER_CONFIDENCE_THRESHOLD = 0.32;
const PL_BROWSER_NMS_IOU_THRESHOLD = 0.70;
const PL_CATEGORY_CLASS_MAP = {
  general_trash: "contaminant", food_organics: "contaminant", textile: "contaminant", battery: "contaminant",
  metal: "recyclable", plastic: "recyclable", glass: "recyclable", paper: "recyclable", cardboard: "recyclable"
};

function plBrowserClassLabel(value) {
  if (value === "general_trash") return "Unsorted / Needs Review";
  if (value === "food_organic") return "Food Organic";
  return plNormalizeCategory(value);
}

function plLogInference(engine, modelName) {
  console.info(`[PurityLoop inference]\nengine=${engine}\nmodel=${modelName}\nsource=upload-page`);
}
const PL_CATEGORY_ROUTES = {
  general_trash: "General-Waste Disposal", food_organics: "Organic Waste / Compost", textile: "Textile Recovery / Contaminant Route", battery: "Battery / E-Waste Collection",
  metal: "Metal Sorting Bin", plastic: "Plastic Sorting Bin", glass: "Glass Sorting Bin", paper: "Paper Sorting Bin", cardboard: "Cardboard Sorting Bin"
};

function plCategoryKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (key.includes("food") || key.includes("organic")) return "food_organics";
  if (key.includes("general") || key.includes("trash") || key.includes("waste")) return "general_trash";
  if (key.includes("textile") || key.includes("fabric") || key.includes("cloth")) return "textile";
  if (key.includes("battery")) return "battery";
  if (key.includes("cardboard") || key.includes("box")) return "cardboard";
  if (key.includes("glass") || key.includes("jar")) return "glass";
  if (key.includes("paper")) return "paper";
  if (key.includes("metal") || key.includes("aluminum") || key.includes("aluminium") || key.includes("can")) return "metal";
  if (key.includes("plastic") || key.includes("bottle") || key.includes("pet") || key.includes("film")) return "plastic";
  return "unknown";
}

function plEvaluateMaterial(material, scan = {}) {
  const decision = material?.review_decision;
  const category = plCategoryKey(decision?.chosen_category || material?.category || material?.material_name);
  const materialClass = ["recyclable", "contaminant"].includes(decision?.disposition) ? decision.disposition : (["recyclable", "contaminant"].includes(material?.material_class) ? material.material_class : (PL_CATEGORY_CLASS_MAP[category] || "unknown"));
  const confidence = plConfidencePercent(material?.confidence);
  const reviewOutcome = plNormalizeStatus(decision?.outcome || decision?.review_outcome || "confirmed");
  const scanReviewStatus = plNormalizeStatus(scan?.review_status || scan?.overall_status);
  const verified = scanReviewStatus === "verified";
  const rejected = scanReviewStatus === "rejected" || (Boolean(decision) && reviewOutcome === "rejected");
  const reviewRequired = !verified && !rejected && !decision && (confidence < PL_CONFIRMATION_THRESHOLD || materialClass === "unknown");
  return {
    category,
    materialClass,
    confidence,
    reviewRequired,
    reviewOutcome,
    decisionStatus: rejected ? "rejected" : verified ? "verified" : reviewRequired ? "review_needed" : "confirmed",
    displayStatus: rejected ? "Rejected" : verified ? "Verified" : reviewRequired ? "Review Needed" : materialClass === "recyclable" ? "Confirmed Recyclable" : materialClass === "contaminant" ? "Confirmed Contaminant" : "Review Needed",
    disposalRoute: reviewRequired || materialClass === "unknown" ? "Manual Audit Queue" : PL_CATEGORY_ROUTES[category]
  };
}

function plIsClean(material, scan = {}) {
  return plEvaluateMaterial(material, scan).materialClass === "recyclable";
}

function plIsRecyclable(material, scan = {}) {
  return plEvaluateMaterial(material, scan).materialClass === "recyclable";
}

function plIsContaminatedMaterial(material, scan = {}) {
  return plEvaluateMaterial(material, scan).materialClass === "contaminant";
}

function plConfidencePercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function plScanNeedsReview(scan) {
  const materials = plSafeArray(scan?.detected_materials);
  return materials.length
    ? materials.some(material => plEvaluateMaterial(material, scan).reviewRequired)
    : Boolean(scan?.human_review_required) || plNormalizeStatus(scan?.overall_status) === "review_required";
}

function plNormalizeMaterial(material) {
  return {
    id: material?.id || "",
    material_name: material?.material_name || material?.category || "Detected material",
    category: plNormalizeCategory(material?.category),
    confidence: Number(material?.confidence || 0),
    recyclable_status: material?.recyclable_status || "unknown",
    contaminant_status: material?.contaminant_status || "unknown",
    material_class: material?.material_class,
    decision_status: material?.decision_status,
    review_required: material?.review_required,
    display_status: material?.display_status,
    disposal_route: material?.disposal_route,
    bbox_x: Number(material?.bbox_x || 0),
    bbox_y: Number(material?.bbox_y || 0),
    bbox_width: Number(material?.bbox_width || 0),
    bbox_height: Number(material?.bbox_height || 0),
    stable_object_id: material?.stable_object_id || "",
    track_id: material?.track_id || "",
    track_first_frame: material?.track_first_frame ?? null,
    track_last_frame: material?.track_last_frame ?? null,
    track_first_timestamp: material?.track_first_timestamp ?? null,
    track_last_timestamp: material?.track_last_timestamp ?? null,
    track_duration_seconds: material?.track_duration_seconds ?? null,
    track_avg_confidence: material?.track_avg_confidence ?? null,
    track_max_confidence: material?.track_max_confidence ?? null,
    track_frame_count: material?.track_frame_count ?? null,
    track_hazard_status: material?.track_hazard_status || "",
    track_counted: material?.track_counted,
    track_debug: material?.track_debug || null,
    track_path: plSafeArray(material?.track_path),
    object_uid: material?.object_uid || material?.stable_object_id || "",
    source_track_ids: plSafeArray(material?.source_track_ids),
    result_type: material?.result_type || "",
    segmentation_mask: material?.segmentation_mask || null,
    best_box: material?.best_box || null,
    review_decision: material?.review_decision || null
  };
}

function plDisplayableImageUrl(value) {
  const url = String(value || "");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const host = new URL(url).hostname;
      if (host === "drive.google.com" || host.endsWith(".drive.google.com") || host === "docs.google.com" || host.endsWith(".docs.google.com")) {
        return "";
      }
    } catch {
      return "";
    }
  }
  if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/assets/")) {
    return url;
  }
  return "";
}

function plNormalizeScan(scan) {
  if (!scan || !scan.id) return null;
  const sourceName = scan.source_name || scan.drive_file_name || "Uploaded image";
  const sourceType = scan.source_type || "image";
  const videoSummary = scan.video_tracking_summary && typeof scan.video_tracking_summary === "object" ? scan.video_tracking_summary : {};
  return {
    ...scan,
    image_url: String(scan.image_url || ""),
    preview_image_url: plDisplayableImageUrl(scan.preview_image_url),
    source_name: sourceName,
    overall_status: scan.overall_status || "review_required",
    contamination_risk: scan.contamination_risk || "unknown",
    recommended_action: scan.recommended_action || "Human review recommended before sorting.",
    human_review_required: Boolean(scan.human_review_required),
    overall_confidence: Number(scan.overall_confidence || 0),
    review_status: scan.review_status || null,
    verified_category: scan.verified_category || null,
    reviewed_at: scan.reviewed_at || null,
    result_kind: scan.result_kind || (sourceType === "tracked_video" ? "video_track_object" : sourceType === "video_frame" ? "legacy_video_frame" : "image_detection"),
    legacy_result: Boolean(scan.legacy_result || sourceType === "video_frame"),
    total_unique_objects: Number(scan.total_unique_objects || (sourceType === "tracked_video" ? 1 : 0)),
    video_tracking_summary: videoSummary,
    annotated_video_url: scan.annotated_video_url || videoSummary.annotated_video_url || "",
    annotated_video_storage_path: scan.annotated_video_storage_path || videoSummary.annotated_video_storage_path || "",
    annotated_video_status: scan.annotated_video_status || videoSummary.annotated_video_status || "",
    annotated_video_error: scan.annotated_video_error || videoSummary.annotated_video_error || "",
    annotated_video_probe: scan.annotated_video_probe || videoSummary.annotated_video_probe || null,
    created_at: scan.created_at || new Date().toISOString(),
    detected_materials: plSafeArray(scan.detected_materials).map(plNormalizeMaterial)
  };
}

async function plRefreshScanResultsFromSupabase(options = {}) {
  if (plScanHistoryRefreshPromise) return plScanHistoryRefreshPromise;
  const apiBase = plApiBaseUrl();
  if (!apiBase) {
    console.error("PurityLoop: backend API base URL is missing for scan history refresh.");
    return false;
  }
  plScanHistoryRefreshPromise = (async () => {
    try {
      const response = await plBackendFetch(`${apiBase}/api/scans?limit=${PL_SCAN_BOOTSTRAP_PAGE_SIZE}&offset=0`);
      const body = await response.text();
      if (!response.ok) {
        console.error("PurityLoop: scan history refresh failed.", { status: response.status, body });
        return false;
      }
      const payload = plSafeJsonParse(body, null);
      const scansPayload = Array.isArray(payload) ? payload : payload?.items || payload?.scans;
      if (!Array.isArray(scansPayload)) {
        console.error("PurityLoop: scan history refresh returned an unexpected payload.", { status: response.status, body });
        return false;
      }
      const scans = scansPayload
        .map(scan => ({ ...scan, source_name: scan.source_name || scan.source_type }))
        .map(plNormalizeScan)
        .filter(Boolean);
      plScanHistoryMeta = {
        total: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null,
        limit: Number(payload?.limit) || PL_SCAN_BOOTSTRAP_PAGE_SIZE,
        offset: Number(payload?.offset) || 0,
        summary: {
          confirmed: Number.isFinite(Number(payload?.summary?.confirmed)) ? Number(payload.summary.confirmed) : null,
          needs_review: Number.isFinite(Number(payload?.summary?.needs_review)) ? Number(payload.summary.needs_review) : null,
          rejected: Number.isFinite(Number(payload?.summary?.rejected)) ? Number(payload.summary.rejected) : null
        }
      };
      plSetJson(PL_SCAN_META_KEY, plScanHistoryMeta);
      plSetScanResults(scans);
      window.dispatchEvent(new Event("purityloop:scan-history-refreshed"));
      return true;
    } catch (error) {
      console.error("PurityLoop: scan history refresh request failed.", error);
      return false;
    } finally {
      plScanHistoryRefreshPromise = null;
    }
  })();
  return plScanHistoryRefreshPromise;
}

function plGetScanResults() {
  return plSafeArray(plSafeJsonParse(localStorage.getItem(PL_SCAN_LOGS_KEY), [])).map(plNormalizeScan).filter(Boolean);
}

function plSetScanResults(scans) {
  const safeScans = plSafeArray(scans).filter(scan => scan && scan.id);
  plSetJson(PL_SCAN_LOGS_KEY, safeScans);
  if (safeScans[0]) plSetJson(PL_LATEST_SCAN_KEY, safeScans[0]);
}

function plMergeScanResults(scans) {
  const incoming = plSafeArray(scans).map(plNormalizeScan).filter(scan => scan?.id);
  if (!incoming.length) return plGetScanResults();
  const byId = new Map(plGetScanResults().map(scan => [scan.id, scan]));
  incoming.forEach(scan => byId.set(scan.id, scan));
  const merged = [...byId.values()].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  plSetScanResults(merged);
  return merged;
}

function plSaveScanResult(scan) {
  if (!scan || !scan.id) return null;
  const scans = plGetScanResults().filter(item => item.id !== scan.id);
  const next = [scan, ...scans];
  plSetScanResults(next);
  return scan;
}

function plHistoryStatusBucket(scan) {
  const status = plNormalizeStatus(scan?.review_status || scan?.overall_status);
  if (["rejected", "quarantined"].includes(status)) return "rejected";
  return scan?.human_review_required || status === "review_required" ? "needs_review" : "confirmed";
}

function plUpdateHistorySummary(previousScan, nextScan) {
  const summary = plScanHistoryMeta?.summary;
  const fields = { confirmed: "confirmed", needs_review: "needs_review", rejected: "rejected" };
  const previous = plHistoryStatusBucket(previousScan), next = plHistoryStatusBucket(nextScan);
  if (previous === next || !Object.values(fields).every(field => Number.isFinite(Number(summary?.[field])))) return;
  summary[fields[previous]] = Math.max(0, Number(summary[fields[previous]]) - 1);
  summary[fields[next]] = Number(summary[fields[next]]) + 1;
  plSetJson(PL_SCAN_META_KEY, plScanHistoryMeta);
}

async function plFetchScanResultById(scanId) {
  const apiBase = plApiBaseUrl();
  if (!apiBase || !scanId) throw new Error("Review persistence is not configured for this scan.");
  let response;
  try {
    response = await plBackendFetch(`${apiBase}/api/scans/${encodeURIComponent(scanId)}`);
  } catch {
    throw new Error("Cannot reach the review backend. Check NEXT_PUBLIC_API_BASE_URL and that FastAPI is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 404 ? "Scan result was not found." : (payload.detail || "Unable to retrieve the persisted scan for review."));
  return plNormalizeScan(payload.scan_result);
}

function plGetScanResultById(id) {
  if (!id) return null;
  return plGetScanResults().find(scan => scan.id === id) || null;
}

function plGetLatestScanResult() {
  return plGetScanResults()[0] || null;
}

function plGetRequestedScanResult() {
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("scanId");
  return requestedId ? plGetScanResultById(requestedId) : plGetLatestScanResult();
}

function plNumberFromPercent(value) {
  const numeric = parseFloat(String(value || "").replace("%", ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function plIsContaminantLabel(label) {
  const text = String(label || "").toLowerCase();
  return text.includes("alert") || text.includes("hazard") || text.includes("trash") || text.includes("textile") || text.includes("contaminant") || text.includes("manual review");
}

function plMaterialCategoryFromLabel(label) {
  return plNormalizeCategory(plCategoryKey(label));
}

function plMaterialStatus(category, label) {
  if (PL_CATEGORY_CLASS_MAP[plCategoryKey(category || label)] === "contaminant") {
    return { recyclable_status: "Non-Recyclable", contaminant_status: "Contaminated" };
  }
  return { recyclable_status: "Recyclable", contaminant_status: "Clean" };
}

function plBoxesToMaterials(boxes) {
  return plSafeArray(boxes).map(box => {
    const category = plMaterialCategoryFromLabel(box.label);
    const status = plMaterialStatus(category, box.label);
    return {
      material_name: String(box.label || category).replace(" Alert", "").replace(" Contaminant", ""),
      category,
      confidence: plNumberFromPercent(box.confidence),
      recyclable_status: status.recyclable_status,
      contaminant_status: status.contaminant_status,
      bbox_x: Math.round(Number(box.x || 0) * 100),
      bbox_y: Math.round(Number(box.y || 0) * 100),
      bbox_width: Math.round(Number(box.w || 0) * 100),
      bbox_height: Math.round(Number(box.h || 0) * 100)
    };
  });
}

function plMaterialsToBoxes(materials) {
  return plSafeArray(materials).map(material => {
    const decision = plEvaluateMaterial(material);
    return {
      label: material.material_name || material.category || "Detected material",
      confidence: `${Math.round(plConfidencePercent(material.confidence))}%`,
      color: decision.materialClass === "contaminant" ? "#ff8000" : "#39d12f",
      x: Number(material.bbox_x || 0) / 100,
      y: Number(material.bbox_y || 0) / 100,
      w: Number(material.bbox_width || 0) / 100,
      h: Number(material.bbox_height || 0) / 100
    };
  });
}

function plFormatScanTime(scan) {
  const date = new Date(scan?.created_at || Date.now());
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function plScanToLedger(scan, material = {}, index = 0) {
  const decision = plEvaluateMaterial(material, scan);
  const isTrackedVideo = ["tracked_video_object", "video_track_object"].includes(scan.result_kind) || scan.source_type === "tracked_video" || Boolean(material?.stable_object_id);
  const sourceTypeLabel = isTrackedVideo ? "Tracked video object" : scan.legacy_result ? "Legacy frame-based video" : "Image result";
  const duration = material?.track_duration_seconds !== null && material?.track_duration_seconds !== undefined ? `${Number(material.track_duration_seconds).toFixed(2)}s` : "";
  return {
    id: `${scan.id}:${material.id || index}`,
    scanId: scan.id,
    materialId: material.id || "",
    material,
    timestamp: new Date(scan.created_at || Date.now()).getTime(),
    time: plFormatScanTime(scan),
    source: scan.source_name || "Uploaded image",
    sourceTypeLabel,
    duration,
    stableObjectId: material?.stable_object_id || "",
    category: plNormalizeCategory(decision.category),
    materialClass: decision.materialClass,
    weight: plDisplayWeight(material, scan),
    confidence: decision.confidence,
    confidenceText: `${Math.round(decision.confidence)}%`,
    status: decision.displayStatus,
    decisionStatus: decision.decisionStatus,
    reviewRequired: decision.reviewRequired,
    preview: scan.preview_image_url || scan.image_url || ""
  };
}

async function plSaveReview(scan, material, chosenCategory, outcome = "confirmed") {
  const apiBase = plApiBaseUrl();
  if (!apiBase || !scan?.id) throw new Error("Review persistence is not configured for this scan.");
  let persistedScan = scan;
  let persistedMaterial = material;
  if (!persistedMaterial?.id) {
    persistedScan = await plFetchScanResultById(scan.id);
    const candidates = plSafeArray(persistedScan?.detected_materials).filter(item => (
      plCategoryKey(item.category) === plCategoryKey(material?.category) &&
      Math.abs(Number(item.bbox_x || 0) - Number(material?.bbox_x || 0)) < 0.01 &&
      Math.abs(Number(item.bbox_y || 0) - Number(material?.bbox_y || 0)) < 0.01 &&
      Math.abs(Number(item.bbox_width || 0) - Number(material?.bbox_width || 0)) < 0.01 &&
      Math.abs(Number(item.bbox_height || 0) - Number(material?.bbox_height || 0)) < 0.01
    ));
    if (candidates.length !== 1) throw new Error("This scan cannot be matched to one persisted material for review.");
    persistedMaterial = candidates[0];
  }
  const action = outcome === "rejected" ? "reject" : "verify";
  let response;
  try {
    response = await plBackendFetch(`${apiBase}/api/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_result_id: persistedScan.id, detected_material_id: persistedMaterial.id, action, manual_category: chosenCategory }) });
  } catch {
    throw new Error("Cannot reach the review backend. Check NEXT_PUBLIC_API_BASE_URL and that FastAPI is running.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 404 ? "The scan or detected material no longer exists in Supabase." : (payload.detail || "Unable to save review."));
  let updatedScan = plNormalizeScan({
    ...persistedScan,
    ...payload.scan_result,
    review_status: payload.scan_result?.review_status || (action === "verify" ? "verified" : "rejected"),
    verified_category: payload.scan_result?.verified_category || (action === "verify" ? chosenCategory : persistedScan.verified_category),
    overall_status: payload.overall_status || persistedScan.overall_status,
    human_review_required: typeof payload.human_review_required === "boolean" ? payload.human_review_required : persistedScan.human_review_required,
    recommended_action: payload.recommended_action || persistedScan.recommended_action,
    detected_materials: plSafeArray(persistedScan.detected_materials).map(item => item.id === persistedMaterial.id ? {
      ...item,
      ...payload.material,
      category: payload.material?.category || chosenCategory,
      review_decision: payload.decision || { chosen_category: chosenCategory, outcome: action === "verify" ? "confirmed" : "rejected" }
    } : item)
  });
  let refreshWarning = "";
  try {
    updatedScan = await plFetchScanResultById(persistedScan.id);
  } catch (error) {
    refreshWarning = "Review saved, but current scan reload failed. Showing saved response; retry if details look stale.";
    console.warn("PurityLoop: review saved but canonical scan reload failed.", error);
  }
  if (updatedScan) {
    plSaveScanResult(updatedScan);
    plUpdateHistorySummary(scan, updatedScan);
    window.dispatchEvent(new Event("purityloop:scan-history-refreshed"));
  }
  return { ...payload, scan: updatedScan, refreshWarning };
}

const FINAL_CATEGORIES = ["general trash", "food organic", "metal", "plastic", "glass", "textile", "paper", "battery", "cardboard"];
const MATERIAL_ESTIMATES = {
  "general trash": { label: "General Trash", averageWeightKg: 0.100, pricePerKgRm: 0.00 },
  "food organic": { label: "Food Organic", averageWeightKg: 0.080, pricePerKgRm: 0.00 },
  metal: { label: "Metal", averageWeightKg: 0.020, pricePerKgRm: 1.20 },
  plastic: { label: "Plastic", averageWeightKg: 0.032, pricePerKgRm: 0.50 },
  glass: { label: "Glass", averageWeightKg: 0.300, pricePerKgRm: 0.10 },
  textile: { label: "Textile", averageWeightKg: 0.150, pricePerKgRm: 0.00 },
  paper: { label: "Paper", averageWeightKg: 0.005, pricePerKgRm: 0.30 },
  battery: { label: "Battery", averageWeightKg: 0.023, pricePerKgRm: 3.50 },
  cardboard: { label: "Cardboard", averageWeightKg: 0.125, pricePerKgRm: 0.25 }
};

function normalizeMaterialCategory(material) {
  const raw = typeof material === "string" ? material : (material?.material_name || material?.category || "");
  const key = String(raw).toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (key.includes("food") || key.includes("organic")) return "food organic";
  if (key.includes("general") || key.includes("trash") || key.includes("landfill") || key.includes("unknown")) return "general trash";
  return FINAL_CATEGORIES.find(category => key === category || key.includes(category)) || "general trash";
}

function plMaterialEstimate(material) {
  return MATERIAL_ESTIMATES[normalizeMaterialCategory(material)] || MATERIAL_ESTIMATES["general trash"];
}

function getEstimatedWeightKg(material, count = 1) {
  return plMaterialEstimate(material).averageWeightKg * count;
}

function plDisplayWeightKg(material, scan = {}) {
  const values = [material?.estimated_weight_kg, material?.estimated_weight, material?.weight_kg, material?.weight, scan?.estimated_weight_kg, scan?.estimated_weight, scan?.weight_kg, scan?.weight];
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  const category = material?.review_decision?.chosen_category || material?.category || material?.material_name;
  return category ? getEstimatedWeightKg(category) : null;
}

function plDisplayWeight(material, scan = {}) {
  const weight = plDisplayWeightKg(material, scan);
  return weight === null ? "-" : plFormatKg(weight);
}

function getEstimatedResaleValueRm(material, count = 1) {
  const estimate = plMaterialEstimate(material);
  return estimate.averageWeightKg * count * estimate.pricePerKgRm;
}

function plFormatKg(value) {
  return `${(Number(value) || 0).toFixed(3)} kg`;
}

function plEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function plHistoryExportRecords(rows) {
  return rows.map(row => ({
    timestamp: row.time || "-", source: row.source || row.scan?.source_name || "Uploaded image", category: row.category || "Unknown",
    materialClass: row.materialClass || "Unknown", weight: row.weight ?? "-", confidence: `${row.confidenceText || row.confidence || 0}%`,
    status: row.status || "Unknown", preview: row.preview || ""
  }));
}

function plDownloadHistoryExcel(rows, filename) {
  const headers = ["Timestamp", "Source", "Category", "Class", "Weight", "AI Confidence", "Status"];
  const quote = value => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers, ...plHistoryExportRecords(rows).map(row => [row.timestamp, row.source, row.category, row.materialClass, row.weight, row.confidence, row.status])].map(record => record.map(quote).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function plPrintHistoryPdf(rows, title, popup = window.open("", "_blank", "width=1000,height=760")) {
  if (!popup) { showToast("Allow pop-ups to export PDF.", "error"); return false; }
  const records = plHistoryExportRecords(rows);
  const cells = row => `<tr><td>${row.preview ? `<img src="${plEscapeHtml(row.preview)}" alt="${plEscapeHtml(row.category)} preview">` : "-"}</td><td>${plEscapeHtml(row.timestamp)}</td><td>${plEscapeHtml(row.source)}</td><td>${plEscapeHtml(row.category)}</td><td>${plEscapeHtml(row.materialClass)}</td><td>${plEscapeHtml(row.weight)}</td><td>${plEscapeHtml(row.confidence)}</td><td>${plEscapeHtml(row.status)}</td></tr>`;
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><title>${plEscapeHtml(title)}</title><style>body{font:12px Arial,sans-serif;color:#17251e;margin:28px}h1{margin:0 0 6px;font-size:22px}p{margin:0 0 20px;color:#5f7168}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9e4dc;padding:8px;text-align:left;vertical-align:middle}th{background:#edf5f0;font-size:10px;text-transform:uppercase;letter-spacing:.05em}img{display:block;width:72px;height:54px;object-fit:cover;border-radius:4px;background:#eef2ef}@media print{body{margin:12mm}tr{break-inside:avoid}}</style></head><body><h1>${plEscapeHtml(title)}</h1><p>Exported ${plEscapeHtml(new Date().toLocaleString())} · ${records.length} scan${records.length === 1 ? "" : "s"}</p><table><thead><tr><th>Preview</th><th>Timestamp</th><th>Source</th><th>Category</th><th>Class</th><th>Weight</th><th>AI confidence</th><th>Status</th></tr></thead><tbody>${records.map(cells).join("") || '<tr><td colspan="8">No scans to export.</td></tr>'}</tbody></table></body></html>`);
  popup.document.close();
  Promise.all([...popup.document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = image.onerror = resolve; }))).then(() => { popup.focus(); popup.print(); });
  return true;
}

function plFormatRm(value) {
  return `RM ${(Number(value) || 0).toFixed(2)}`;
}

function plAnalyticsDayStart(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function plAnalyticsDateBounds(date) {
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 86400000) };
}

function plGetAnalyticsSummary(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const selectedDate = options.date ? String(options.date) : "";
  const requestedDays = Number(options.days);
  const hasRange = Boolean(selectedDate || options.rangeStart || options.rangeEnd || (Number.isFinite(requestedDays) && requestedDays > 0));
  const days = Math.max(1, requestedDays || 1);
  const selectedBounds = selectedDate ? plAnalyticsDateBounds(selectedDate) : null;
  const rangeStart = selectedBounds ? selectedBounds.start : options.rangeStart ? new Date(options.rangeStart) : hasRange ? (() => {
    const start = plAnalyticsDayStart(now);
    start.setDate(start.getDate() - (days - 1));
    return start;
  })() : new Date(0);
  const rangeEnd = selectedBounds ? selectedBounds.end : options.rangeEnd ? new Date(options.rangeEnd) : hasRange ? now : new Date(8640000000000000);
  const allScans = plSafeArray(options.scans || plGetScanResults());
  const scans = allScans.filter(scan => {
    const createdAt = new Date(scan?.created_at || 0);
    return Number.isFinite(createdAt.getTime()) && createdAt >= rangeStart && createdAt < rangeEnd;
  });
  const materialRows = scans.flatMap(scan => plSafeArray(scan.detected_materials).map(material => ({ scan, material, decision: plEvaluateMaterial(material) })));
  const materials = materialRows.map(row => row.material);
  const categoryCounts = materials.reduce((acc, material) => {
    const category = plMaterialEstimate(material).label;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  const resaleRows = Object.entries(materials.reduce((acc, material) => {
    const category = normalizeMaterialCategory(material);
    const estimate = MATERIAL_ESTIMATES[category] || MATERIAL_ESTIMATES["general trash"];
    acc[category] = acc[category] || {
      category,
      label: estimate.label,
      count: 0,
      estimatedWeightKg: 0,
      pricePerKg: estimate.pricePerKgRm,
      estimatedResaleValueRm: 0
    };
    acc[category].count += 1;
    acc[category].estimatedWeightKg += estimate.averageWeightKg;
    acc[category].estimatedResaleValueRm += estimate.averageWeightKg * estimate.pricePerKgRm;
    return acc;
  }, {})).map(([, row]) => row).sort((a, b) => b.estimatedResaleValueRm - a.estimatedResaleValueRm || b.count - a.count);
  const totalEstimatedResaleValueRm = resaleRows.reduce((sum, row) => sum + row.estimatedResaleValueRm, 0);
  const materialMixRows = resaleRows
    .filter(row => row.estimatedWeightKg > 0)
    .slice()
    .sort((a, b) => b.estimatedWeightKg - a.estimatedWeightKg || b.count - a.count);
  const totalEstimatedWeightKg = materialMixRows.reduce((sum, row) => sum + row.estimatedWeightKg, 0);
  const confirmedRows = materialRows.filter(({ decision }) => decision.decisionStatus === "confirmed" && decision.materialClass !== "unknown");
  const confirmedMaterials = confirmedRows.map(row => row.material);
  const recyclableCount = confirmedRows.filter(({ decision }) => decision.materialClass === "recyclable").length;
  const contaminationCount = materialRows.filter(({ decision }) => decision.decisionStatus === "confirmed" && decision.materialClass === "contaminant").length;
  const reviewCount = materialRows.filter(({ decision }) => decision.reviewRequired).length;
  const allLowConfidenceCount = materialRows.filter(({ material }) => {
    const confidence = plConfidencePercent(material?.confidence);
    return Number.isFinite(confidence) && confidence < PL_CONFIRMATION_THRESHOLD;
  }).length;
  const materialConfidences = materialRows
    .filter(({ material, decision }) => decision.materialClass !== "unknown" && Number.isFinite(Number(material?.confidence)))
    .map(({ decision }) => decision.confidence)
    .filter(value => value >= 0);
  const scanConfidences = scans.map(scan => plConfidencePercent(scan.overall_confidence)).filter(value => value > 0);
  const avgConfidence = materialConfidences.length
    ? materialConfidences.reduce((sum, value) => sum + value, 0) / materialConfidences.length
    : scanConfidences.length
      ? scanConfidences.reduce((sum, value) => sum + value, 0) / scanConfidences.length
      : 0;
  const categoryRows = Object.entries(categoryCounts)
    .map(([label, value]) => [label, Number(value) || 0])
    .sort((a, b) => b[1] - a[1]);
  const recyclableRows = categoryRows
    .map(([label]) => [label, materials.filter(material => plMaterialEstimate(material).label === label && plIsRecyclable(material)).length])
    .filter(([, value]) => value > 0);
  const contaminatedRows = categoryRows
    .map(([label]) => [label, materials.filter(material => plMaterialEstimate(material).label === label && plIsContaminatedMaterial(material)).length])
    .filter(([, value]) => value > 0);
  const todayStart = plAnalyticsDayStart(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const confirmedTodayCount = confirmedRows.filter(({ scan }) => {
    const createdAt = new Date(scan.created_at || 0);
    return createdAt >= todayStart && createdAt < tomorrowStart;
  }).length;
  const confirmedScanCount = scans.filter(scan => !plScanNeedsReview(scan) && !["rejected", "quarantined"].includes(plNormalizeStatus(scan.overall_status))).length;
  const topBy = rows => rows.length ? rows.reduce((top, row) => row[1] > top[1] ? row : top) : null;
  const recyclableTop = topBy(recyclableRows);
  const contaminantTop = topBy(contaminatedRows);
  const highestValue = resaleRows.find(row => row.estimatedResaleValueRm > 0) || null;
  const reviewDurations = materialRows
    .filter(({ material }) => material?.review_decision?.created_at)
    .map(({ scan, material }) => new Date(material.review_decision.created_at).getTime() - new Date(scan.created_at || 0).getTime())
    .filter(value => Number.isFinite(value) && value >= 0);
  const averageReviewTurnaroundMs = reviewDurations.length ? reviewDurations.reduce((sum, value) => sum + value, 0) / reviewDurations.length : null;
  const sourceCounts = scans.reduce((acc, scan) => {
    const source = scan.source_name || scan.source_type || "Web Upload";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const scanDates = scans
    .map(scan => new Date(scan.created_at || 0))
    .filter(date => Number.isFinite(date.getTime()));
  // Default summaries include all saved scans, but their chart must only span saved dates.
  const trendRangeStart = hasRange
    ? rangeStart
    : scanDates.length
      ? plAnalyticsDayStart(Math.min(...scanDates.map(date => date.getTime())))
      : plAnalyticsDayStart(now);
  const trendRangeEnd = hasRange
    ? selectedBounds ? new Date(rangeEnd.getTime() - 1) : rangeEnd
    : scanDates.length
      ? plAnalyticsDayStart(Math.max(...scanDates.map(date => date.getTime())))
      : plAnalyticsDayStart(now);
  const trendByDay = new Map();
  for (let cursor = plAnalyticsDayStart(trendRangeStart); cursor <= trendRangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    trendByDay.set(cursor.toLocaleDateString([], { month: "short", day: "numeric" }), 0);
  }
  scans.forEach(scan => {
    const key = new Date(scan.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
    trendByDay.set(key, (trendByDay.get(key) || 0) + 1);
  });
  const highRiskCount = confirmedRows.filter(({ decision }) => decision.category === "battery" && decision.materialClass === "contaminant").length;
  const recoveryOpportunityCount = confirmedRows.filter(({ material, decision }) => decision.materialClass === "recyclable" && getEstimatedResaleValueRm(material) > 0).length;
  const materialEvents = materialRows
    .sort((a, b) => new Date(b.scan.created_at || 0) - new Date(a.scan.created_at || 0))
    .map(({ scan, material, decision }) => ({
      timestamp: scan.created_at,
      source: scan.source_name || scan.source_type || "Web Upload",
      event: material?.review_decision ? "Review Completed" : decision.decisionStatus === "rejected" ? "Scan Rejected" : decision.materialClass === "contaminant" && decision.decisionStatus === "confirmed" ? "Contaminant Alert" : "Scan Verified",
      status: decision.displayStatus,
      details: `${plNormalizeCategory(decision.category)} · ${decision.confidence.toFixed(1)}% confidence`
    }));
  const uploadEvents = scans
    .filter(scan => !plSafeArray(scan.detected_materials).length)
    .map(scan => ({
      timestamp: scan.created_at,
      source: scan.source_name || scan.source_type || "Web Upload",
      event: "Scan Upload",
      status: plNormalizeStatus(scan.processing_status) === "completed" ? "Completed" : "Uploaded",
      details: "No detected materials were returned"
    }));
  const recentEvents = [...materialEvents, ...uploadEvents]
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
    .slice(0, 5);
  const lastUpload = allScans.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
  const lastUploadBatchId = lastUpload?.batch_id || lastUpload?.batchId || lastUpload?.upload_batch_id || null;
  const lastUploadBatchCount = lastUploadBatchId
    ? allScans.filter(scan => (scan?.batch_id || scan?.batchId || scan?.upload_batch_id) === lastUploadBatchId).length
    : lastUpload ? 1 : 0;
  return {
    scans,
    materials,
    materialRows,
    rangeStart,
    rangeEnd,
    savedScansCount: scans.length,
    detectedMaterialsCount: materials.length,
    categoryLabels: categoryRows.map(row => row[0]),
    categoryValues: categoryRows.map(row => row[1]),
    categoryRows,
    resaleRows,
    materialMixRows,
    totalEstimatedWeightKg,
    totalEstimatedResaleValueRm,
    recyclableRows,
    contaminatedRows,
    recyclableCount,
    nonRecyclableCount: confirmedMaterials.filter(plIsContaminatedMaterial).length,
    contaminationCount,
    reviewCount,
    lowConfidenceCount: reviewCount,
    allLowConfidenceCount,
    hazardCount: highRiskCount,
    clearedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "accepted").length,
    quarantinedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "quarantined").length,
    avgConfidence,
    confirmedScanCount,
    confirmedTodayCount,
    recyclableTop,
    contaminantTop,
    highestValue,
    averageReviewTurnaroundMs,
    lastUpload,
    lastUploadBatchCount,
    sourceCounts,
    trendRows: Array.from(trendByDay, ([label, value]) => ({ label, value })),
    highRiskCount,
    recoveryOpportunityCount,
    recentEvents
  };
}

/* AI CLASSIFICATION METADATA MAP (9 Categories, No ESG/Carbon) */
const detectionResults = {
  battery: {
    title: "Battery Hazard Detected",
    confidence: "99%",
    category: "Battery",
    bin: "Hazardous Battery Bin",
    weight: "0.045 kg",
    statusClass: "danger",
    status: "Hazardous item detected. Fire risk.",
    instruction: "Divert battery immediately to a fire-safe hazardous waste storage bin.",
    color: "#b42318",
    imageSrc: "/assets/items/battery.png"
  },
  food_organics: {
    title: "Food Organics Contamination",
    confidence: "87%",
    category: "Food Organics",
    bin: "Organic Waste / Reject",
    weight: "0.120 kg",
    statusClass: "warning",
    status: "Contamination risk. Rinse or reject.",
    instruction: "Separate organic waste from recyclable batches to prevent bale rejection.",
    color: "#27ae60",
    imageSrc: "/assets/items/food-waste.png"
  },
  general_trash: {
    title: "General Trash Detected",
    confidence: "78%",
    category: "General Trash",
    bin: "Landfill Bin",
    weight: "0.085 kg",
    statusClass: "warning",
    status: "Non-recyclable material detected.",
    instruction: "Divert to general landfill waste. Check if clean packaging can be salvaged.",
    color: "#7f8c8d",
    imageSrc: "/assets/items/coffee-cup.png"
  },
  plastic: {
    title: "Plastic Bottle Detected",
    confidence: "95%",
    category: "Plastic",
    bin: "Plastic Sorting Bin",
    weight: "0.025 kg",
    statusClass: "safe",
    status: "Clean recyclable plastic detected.",
    instruction: "Ensure container is empty. Compress and place in plastic bale sorting queue.",
    color: "#2f6f8f",
    imageSrc: "/assets/items/plastic-bottle.png"
  },
  metal: {
    title: "Aluminium Can Detected",
    confidence: "94%",
    category: "Metal",
    bin: "Metal Sorting Bin",
    weight: "0.015 kg",
    statusClass: "safe",
    status: "High-value recyclable metal detected.",
    instruction: "Verify metal container is empty. Place in magnetic sorting line.",
    color: "#b7791f",
    imageSrc: "/assets/items/aluminum-can.png"
  },
  paper: {
    title: "Crumpled Paper Detected",
    confidence: "89%",
    category: "Paper",
    bin: "Paper Sorting Bin",
    weight: "0.030 kg",
    statusClass: "safe",
    status: "Recyclable paper material detected.",
    instruction: "Ensure paper is dry and clean of organic grease before packing.",
    color: "#8aa0a8",
    imageSrc: "/assets/items/crumpled-paper.png"
  },
  cardboard: {
    title: "Cardboard Packaging Detected",
    confidence: "92%",
    category: "Cardboard",
    bin: "Cardboard Sorting Bin",
    weight: "0.220 kg",
    statusClass: "safe",
    status: "High-grade cardboard material detected.",
    instruction: "Flatten cardboard package to save sorting dock volume. Keep dry.",
    color: "#e67e22",
    imageSrc: "/assets/items/cardboard.png"
  },
  glass: {
    title: "Glass Container Detected",
    confidence: "91%",
    category: "Glass",
    bin: "Glass Sorting Bin",
    weight: "0.180 kg",
    statusClass: "safe",
    status: "Recyclable glass material detected.",
    instruction: "Rinse container. Avoid glass breakage. Segregate in sorting bay.",
    color: "#8b5cf6",
    imageSrc: "/assets/items/glass-jar.png"
  },
  textile: {
    title: "Textile Scrap Detected",
    confidence: "83%",
    category: "Textile",
    bin: "Fabric Recovery / Landfill",
    weight: "0.140 kg",
    statusClass: "warning",
    status: "Textile contaminant detected.",
    instruction: "Fabric ruins optical gear sorting blades. Segregate manually.",
    color: "#1abc9c",
    imageSrc: "/assets/items/textile.png"
  },
  unknown: {
    title: "Unclassified Waste Detected",
    confidence: "60%",
    category: "General Trash",
    bin: "Manual Audit Queue",
    weight: "0.000 kg",
    statusClass: "warning",
    status: "AI confidence rating too low.",
    instruction: "Perform manual audit to inspect the material category.",
    color: "#a16207",
    imageSrc: "/assets/items/coffee-cup.png"
  },
  mixed_batch: {
    title: "Mixed Batch Scan Detected",
    confidence: "98%",
    category: "Mixed Recyclables",
    bin: "Multi-stream Recovery",
    weight: "0.485 kg",
    statusClass: "safe",
    status: "Recyclable materials detected.",
    instruction: "Recover PET bottle, aluminum can, cardboard packaging, and glass jar into their matching material streams.",
    color: "#00f08a",
    imageSrc: DEFAULT_SCAN_ASSET
  }
};

/* Maps a filename to multiple bounding boxes (Simulating Mixed Waste Detection) */
function getDetectedObjectsForFile(name) {
  const fileLower = name.toLowerCase();

  // New default viewport image from user screenshot
  if (fileLower.includes("viewport") || fileLower.includes("mixed-waste") || fileLower.includes("active_scan") || fileLower.includes("upload-result-reference")) {
    return [
      { label: "PET Bottle", confidence: "97%", color: "#39d12f", x: 0.025, y: 0.30, w: 0.235, h: 0.31 },
      { label: "Aluminum Can", confidence: "98%", color: "#39d12f", x: 0.285, y: 0.38, w: 0.185, h: 0.25 },
      { label: "Cardboard Box", confidence: "96%", color: "#39d12f", x: 0.505, y: 0.245, w: 0.255, h: 0.39 },
      { label: "Glass Jar", confidence: "95%", color: "#39d12f", x: 0.795, y: 0.365, w: 0.16, h: 0.30 }
    ];
  }

  // 1. Soda Can image gets the exact 6 bounding boxes from the attached camera stream image
  if (fileLower.includes("can") || fileLower.includes("metal") || fileLower.includes("sodacan")) {
    return [
      { label: "PET Bottle", confidence: "97%", color: "#27c93f", x: 0.18, y: 0.25, w: 0.20, h: 0.25 },
      { label: "PET Bottle", confidence: "96%", color: "#27c93f", x: 0.28, y: 0.55, w: 0.16, h: 0.22 },
      { label: "Aluminum Can", confidence: "94%", color: "#0080ff", x: 0.42, y: 0.36, w: 0.18, h: 0.20 },
      { label: "Food Waste Alert", confidence: "85%", color: "#ff8000", x: 0.50, y: 0.59, w: 0.22, h: 0.18 },
      { label: "Plastic Film Alert", confidence: "89%", color: "#ff8000", x: 0.65, y: 0.21, w: 0.20, h: 0.26 },
      { label: "Aluminum Can", confidence: "91%", color: "#0080ff", x: 0.72, y: 0.49, w: 0.14, h: 0.18 }
    ];
  }

  // 2. Plastic bottle mapping
  if (fileLower.includes("plastic") || fileLower.includes("bottle") || fileLower.includes("pet")) {
    return [
      { label: "PET Bottle", confidence: "95%", color: "#27c93f", x: 0.25, y: 0.20, w: 0.30, h: 0.50 },
      { label: "Plastic Film Alert", confidence: "88%", color: "#ff8000", x: 0.60, y: 0.30, w: 0.20, h: 0.35 },
      { label: "General Trash", confidence: "75%", color: "#7f8c8d", x: 0.45, y: 0.60, w: 0.15, h: 0.20 }
    ];
  }

  // 3. Battery mapping
  if (fileLower.includes("battery") || fileLower.includes("lithium")) {
    return [
      { label: "Battery Hazard Alert", confidence: "99%", color: "#b42318", x: 0.35, y: 0.30, w: 0.25, h: 0.35 },
      { label: "Plastic Film Alert", confidence: "84%", color: "#ff8000", x: 0.15, y: 0.50, w: 0.20, h: 0.30 },
      { label: "Paper Crumpled", confidence: "79%", color: "#8aa0a8", x: 0.65, y: 0.25, w: 0.20, h: 0.25 }
    ];
  }

  // 4. Cardboard mapping
  if (fileLower.includes("cardboard") || fileLower.includes("box") || fileLower.includes("package")) {
    return [
      { label: "Cardboard", confidence: "92%", color: "#e67e22", x: 0.15, y: 0.15, w: 0.50, h: 0.60 },
      { label: "PET Bottle", confidence: "90%", color: "#27c93f", x: 0.70, y: 0.40, w: 0.18, h: 0.35 }
    ];
  }

  // 5. Food organics mapping
  if (fileLower.includes("food") || fileLower.includes("organic") || fileLower.includes("peel")) {
    return [
      { label: "Food Waste Alert", confidence: "87%", color: "#ff8000", x: 0.25, y: 0.25, w: 0.40, h: 0.45 },
      { label: "Paper Crumpled", confidence: "81%", color: "#8aa0a8", x: 0.70, y: 0.50, w: 0.15, h: 0.25 },
      { label: "Textile Scrap Alert", confidence: "76%", color: "#1abc9c", x: 0.10, y: 0.60, w: 0.18, h: 0.22 }
    ];
  }

  // 6. Paper mapping
  if (fileLower.includes("paper") || fileLower.includes("newspaper") || fileLower.includes("sheet")) {
    return [
      { label: "Paper Crumpled", confidence: "89%", color: "#8aa0a8", x: 0.20, y: 0.20, w: 0.45, h: 0.45 },
      { label: "Plastic Film Alert", confidence: "82%", color: "#ff8000", x: 0.60, y: 0.40, w: 0.25, h: 0.35 }
    ];
  }

  // 7. Glass mapping
  if (fileLower.includes("glass") || fileLower.includes("jar")) {
    return [
      { label: "Glass Container", confidence: "91%", color: "#8b5cf6", x: 0.30, y: 0.20, w: 0.35, h: 0.55 },
      { label: "General Trash", confidence: "78%", color: "#7f8c8d", x: 0.10, y: 0.45, w: 0.18, h: 0.25 }
    ];
  }

  // 8. Textile mapping
  if (fileLower.includes("textile") || fileLower.includes("cloth") || fileLower.includes("fabric")) {
    return [
      { label: "Textile Scrap Alert", confidence: "83%", color: "#1abc9c", x: 0.25, y: 0.25, w: 0.45, h: 0.45 },
      { label: "General Trash", confidence: "70%", color: "#7f8c8d", x: 0.60, y: 0.50, w: 0.20, h: 0.30 }
    ];
  }

  // 9. General Trash mapping
  if (fileLower.includes("cup") || fileLower.includes("mug") || fileLower.includes("trash")) {
    return [
      { label: "General Trash", confidence: "78%", color: "#7f8c8d", x: 0.25, y: 0.25, w: 0.40, h: 0.50 },
      { label: "Plastic Film Alert", confidence: "80%", color: "#ff8000", x: 0.55, y: 0.35, w: 0.25, h: 0.35 }
    ];
  }

  // Dynamic fallback for custom uploaded files
  const matched = detectWasteTypeFromFileName(name);
  const primaryColor = matched.color;
  const primaryCat = matched.category;
  const primaryConf = matched.confidence;

  return [
    { label: primaryCat, confidence: primaryConf, color: primaryColor, x: 0.18, y: 0.20, w: 0.34, h: 0.46 },
    { label: "Manual Review Region", confidence: "82%", color: "#ff8000", x: 0.55, y: 0.34, w: 0.26, h: 0.34 }
  ];
}

/* Format file size helper */
function formatFileSize(bytes) {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb >= 1) return mb.toFixed(2) + " MB";
  return kb.toFixed(1) + " KB";
}

/* Match category from name */
function detectWasteTypeFromFileName(name) {
  const fileLower = name.toLowerCase();
  if (fileLower.includes("viewport") || fileLower.includes("mixed") || fileLower.includes("upload-result-reference")) return detectionResults.mixed_batch;
  if (fileLower.includes("battery") || fileLower.includes("lithium")) return detectionResults.battery;
  if (fileLower.includes("food") || fileLower.includes("organic") || fileLower.includes("apple") || fileLower.includes("banana")) return detectionResults.food_organics;
  if (fileLower.includes("trash") || fileLower.includes("waste") || fileLower.includes("cup") || fileLower.includes("mug")) return detectionResults.general_trash;
  if (fileLower.includes("plastic") || fileLower.includes("bottle") || fileLower.includes("pet")) return detectionResults.plastic;
  if (fileLower.includes("metal") || fileLower.includes("can") || fileLower.includes("aluminium") || fileLower.includes("steel")) return detectionResults.metal;
  if (fileLower.includes("paper") || fileLower.includes("newspaper") || fileLower.includes("sheet")) return detectionResults.paper;
  if (fileLower.includes("cardboard") || fileLower.includes("box") || fileLower.includes("package")) return detectionResults.cardboard;
  if (fileLower.includes("glass") || fileLower.includes("jar") || fileLower.includes("bottle_g")) return detectionResults.glass;
  if (fileLower.includes("textile") || fileLower.includes("cloth") || fileLower.includes("shirt") || fileLower.includes("fabric")) return detectionResults.textile;

  return detectionResults.unknown;
}

function getAuditLedger() {
  return plGetScanResults().flatMap(scan => {
    const materials = plSafeArray(scan.detected_materials);
    return materials.length ? materials.map((material, index) => plScanToLedger(scan, material, index)) : [plScanToLedger(scan)];
  });
}

function saveAuditLedger(ledger) {
  const scans = plGetScanResults();
  plSafeArray(ledger).forEach(log => {
    const scan = scans.find(item => item.id === log.scanId || item.id === log.id);
    if (scan) {
      scan.overall_status = log.status === "Quarantined" ? "Quarantined" : log.status === "Review Needed" ? "Human Review Required" : "Accepted";
      scan.human_review_required = log.status === "Review Needed";
      if (log.category && scan.detected_materials?.[0]) scan.detected_materials[0].category = log.category;
    }
  });
  plSetScanResults(scans);
}

function getLogSourceLabel(log) {
  if (log.source) return log.source;
  if (!log.station) return "Uploaded image";
  if (log.station === "UPLOAD-HUB") return "Upload queue";
  if (log.station === "MOBILE-APP") return "Camera upload";
  if (String(log.station).startsWith("STATION-")) return "Legacy uploaded image";
  return log.station;
}

function getLogSourceKey(log) {
  if (log.sourceKey) return log.sourceKey;
  if (log.source && log.source.toLowerCase().endsWith(".zip")) return "ZIP-BATCH";
  if (log.status === "Quarantined" || log.status === "Quarantine") return "QUARANTINE-UPLOAD";
  return "SINGLE-IMAGE";
}

function getUploadSourceDisplayName(sourceKey) {
  const labels = {
    "UPLOAD-HUB": "Upload queue",
    "SINGLE-IMAGE": "Single image upload",
    "ZIP-BATCH": "ZIP batch upload",
    "QUARANTINE-UPLOAD": "Flagged upload"
  };
  return labels[sourceKey] || "Uploaded image";
}

async function plSavePredictionPayload(payload, file) {
  const scan = plNormalizeScan({
    id: payload.scan_result_id,
    image_url: payload.image_url || "",
    preview_image_url: payload.preview_image_url || "",
    drive_file_id: payload.drive_file_id || "",
    drive_web_url: payload.drive_web_url || "",
    source_name: file.name || "Uploaded image",
    source_size: Number(file.size || 0),
    overall_status: payload.overall_status,
    contamination_risk: payload.contamination_risk,
    recommended_action: payload.recommended_action,
    human_review_required: payload.human_review_required,
    overall_confidence: payload.overall_confidence,
    created_at: new Date().toISOString(),
    detected_materials: payload.detected_materials
  });
  if (!scan) throw new Error("Backend did not return a scan id.");
  plSaveScanResult(scan);
  await plRefreshScanResultsFromSupabase();
  return plGetScanResultById(scan.id) || scan;
}

async function plRunBackendPrediction(file, { showUploadProgress = true } = {}) {
  const apiBaseUrl = plApiBaseUrl();
  if (!apiBaseUrl) throw new Error("Backend API URL is not configured.");
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Upload one image file.");

  plLogInference("backend-pytorch", "best.pt");
  const formData = new FormData();
  formData.append("file", file, file.name || "uploaded-image.jpg");

  if (showUploadProgress) plSetUploadProgress(1);
  const payload = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiBaseUrl}/api/predict`);
    request.timeout = 120000;
    request.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      if (showUploadProgress) plSetUploadProgress((event.loaded / event.total) * 90);
    };
    request.onload = () => {
      const body = plSafeJsonParse(request.responseText, {});
      if (request.status >= 200 && request.status < 300) {
        if (showUploadProgress) plSetUploadProgress(100, "Scan complete");
        resolve(body);
        return;
      }
      reject(new Error(body.detail || `AI scan failed (${request.status}). Check backend and try again.`));
    };
    request.onerror = () => reject(new Error("Cannot reach backend API. Check NEXT_PUBLIC_API_BASE_URL, backend hosting, and CORS."));
    request.ontimeout = () => reject(new Error("Backend scan timed out. Check backend logs."));
    plAuthHeaders().then(headers => {
      Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
      request.send(formData);
    }).catch(reject);
  });
  return plSavePredictionPayload(payload, file);
}

/*****************************************
 * 1. IMAGE UPLOAD & WEBCAM CAPTURE PAGE *
 *****************************************/
function initUploadPage() {
  const fileUpload = document.getElementById("fileUpload");
  if (!fileUpload) return; // Not on upload page
  if (fileUpload.dataset.uploadReady === "true") return;
  fileUpload.dataset.uploadReady = "true";

  const fileName = document.getElementById("fileName");
  const scanImageBtn = document.getElementById("scanImageBtn");
  const clearUploadBtn = document.getElementById("clearUploadBtn");
  const queueEl = document.getElementById("uploadQueue");
  const messagesEl = document.getElementById("uploadMessages");
  const processingStatusEl = document.getElementById("batchProcessingStatus");
  const batchSummaryEl = document.getElementById("batchSummary");
  let queue = [];
  let rejectedItems = [];
  let isProcessing = false;
  let batchId = "";
  let browserVerificationEl = null;
  let browserResizeObserver = null;
  let activeBrowserVerificationItemId = "";
  let browserQueuePaused = false;
  let browserQueueCancelled = false;

  function browserOnnxFlags() {
    const flag = document.getElementById("browserOnnxFeatureFlag")?.dataset;
    return {
      single: flag?.enabled === "true",
      multi: flag?.multi === "true",
      zip: flag?.zip === "true",
      webcam: flag?.webcam === "true"
    };
  }

  function isBrowserOnnxImage(item) {
    return item?.mediaType === "image" && /^image\/(jpeg|png|webp)$/i.test(String(item.file?.type || ""));
  }

  function shouldUseBrowserOnnxForItem(item) {
    const flags = browserOnnxFlags();
    if (!flags.single || !isBrowserOnnxImage(item)) return false;
    if (item.source === "zip") return flags.zip;
    if (item.source === "webcam") return flags.webcam;
    if (item.source !== "direct") return false;
    const directImages = queue.filter(candidate => candidate.source === "direct" && isBrowserOnnxImage(candidate));
    return directImages.length <= 1 || flags.multi;
  }

  function ensureBatchId() {
    if (!batchId) batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (uploadBox) uploadBox.dataset.batchId = batchId;
    return batchId;
  }

  // Set up webcam modal
  createWebcamModalElements();

  const startWebcamBtn = document.getElementById("startWebcamBtn");
  const captureWebcamBtn = document.getElementById("captureWebcamBtn");
  const closeWebcamBtn = document.getElementById("closeWebcamModal");
  const webcamModal = document.getElementById("webcamModal");
  const webcamVideo = document.getElementById("webcamVideo");
  let webcamStream = null;

  // Drag and drop events
  const uploadBox = document.querySelector(".upload-box");
  if (uploadBox) {
    ["dragenter", "dragover"].forEach(evt => {
      uploadBox.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadBox.classList.add("dragover");
      }, false);
    });

    ["dragleave", "drop"].forEach(evt => {
      uploadBox.addEventListener(evt, (e) => {
        e.preventDefault();
        uploadBox.classList.remove("dragover");
      }, false);
    });

    uploadBox.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        const dropped = plSafeFiles(files);
        const videos = dropped.filter(file => /^video\/mp4$/i.test(String(file.type || "")) || /\.mp4$/i.test(file.name || ""));
        const archives = dropped.filter(file => /\.zip$/i.test(file.name || ""));
        if (videos.length) processVideoUploads(videos);
        if (archives.length) processZipUploads(archives);
        const images = dropped.filter(file => !videos.includes(file) && !archives.includes(file));
        if (images.length) processSelectedFiles(images);
      }
    });
  }

  fileUpload.addEventListener("change", () => {
    const selected = plSafeFiles(fileUpload.files);
    fileUpload.value = "";
    const videos = selected.filter(file => /^video\/mp4$/i.test(String(file.type || "")) || /\.mp4$/i.test(file.name || ""));
    const archives = selected.filter(file => /\.zip$/i.test(file.name || ""));
    const images = selected.filter(file => !videos.includes(file) && !archives.includes(file));
    if (videos.length) processVideoUploads(videos);
    if (archives.length) processZipUploads(archives);
    if (images.length) processSelectedFiles(images);
  });

  if (clearUploadBtn) clearUploadBtn.addEventListener("click", clearQueue);
  if (scanImageBtn) scanImageBtn.addEventListener("click", () => runBatch(queue.filter(item => item.status === "ready")));
  initUploadInfoModals();
  void resumeVideoJobs();

  function addBrowserQueueControls() {
    const actions = document.querySelector(".upload-batch-actions");
    if (!actions || document.getElementById("pauseBrowserQueueBtn")) return;
    const makeButton = (id, text, handler) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = id;
      button.className = "text-btn";
      button.textContent = text;
      button.addEventListener("click", handler);
      actions.appendChild(button);
      return button;
    };
    makeButton("pauseBrowserQueueBtn", "Pause After Current", () => {
      browserQueuePaused = true;
      renderQueue();
    });
    makeButton("resumeBrowserQueueBtn", "Resume", () => {
      browserQueuePaused = false;
      browserQueueCancelled = false;
      runBatch(queue.filter(item => item.status === "ready"));
      renderQueue();
    });
    makeButton("cancelBrowserQueueBtn", "Cancel Remaining", () => {
      browserQueueCancelled = true;
      queue.filter(item => item.status === "ready" || item.status === "waiting").forEach(item => {
        if (shouldUseBrowserOnnxForItem(item)) {
          item.status = "cancelled";
          item.browserState = "cancelled";
        }
      });
      renderQueue();
      renderBatchSummary();
    });
    makeButton("saveAllBrowserVerifiedBtn", "Save All Verified", () => saveAllBrowserVerified());
    makeButton("clearCompletedBtn", "Clear Completed", clearCompletedItems);
  }

  function initUploadInfoModals() {
    const modals = [
      { opener: document.getElementById("openUploadTips"), modal: document.getElementById("uploadTipsModal") },
      { opener: document.getElementById("openBatchSummary"), modal: document.getElementById("uploadBatchSummaryModal") }
    ].filter(({ opener, modal }) => opener && modal);
    let activeModal = null;
    let activeOpener = null;

    const closeModal = () => {
      if (!activeModal) return;
      activeModal.classList.remove("active");
      activeModal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("upload-modal-open");
      const opener = activeOpener;
      activeModal = null;
      activeOpener = null;
      if (opener?.isConnected) opener.focus();
    };
    const onKeydown = event => {
      if (!activeModal) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...activeModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const atStart = document.activeElement === first || (event.shiftKey && document.activeElement === activeModal.querySelector('[role="dialog"]'));
      if (event.shiftKey ? atStart : document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };

    modals.forEach(({ opener, modal }) => {
      const dialog = modal.querySelector('[role="dialog"]');
      opener.addEventListener("click", () => {
        activeModal = modal;
        activeOpener = opener;
        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("upload-modal-open");
        window.requestAnimationFrame(() => dialog?.focus());
      });
      modal.querySelector("[data-upload-modal-close]")?.addEventListener("click", closeModal);
      modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
    });
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("purityloop:page-cleanup", () => {
      closeModal();
      document.removeEventListener("keydown", onKeydown);
    }, { once: true });
  }

  // Open Webcam Modal
  const cameraLauncher = document.createElement("button");
  cameraLauncher.type = "button";
  cameraLauncher.className = "secondary-btn full-btn";
  cameraLauncher.id = "launchCameraBtn";
  cameraLauncher.innerHTML = '<i class="fa-solid fa-camera"></i> Open Camera Capture';
  cameraLauncher.style.marginTop = "10px";
  (document.getElementById("uploadUtilityActions") || uploadBox).appendChild(cameraLauncher);

  cameraLauncher.addEventListener("click", () => {
    webcamModal.classList.add("active");
    webcamModal.setAttribute("aria-hidden", "false");
    startWebcam();
  });

  if (closeWebcamBtn) {
    closeWebcamBtn.addEventListener("click", stopWebcam);
  }

  if (startWebcamBtn) {
    startWebcamBtn.addEventListener("click", startWebcam);
  }

  if (captureWebcamBtn) {
    captureWebcamBtn.addEventListener("click", captureSnapshot);
  }

  function startWebcam() {
    if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } })
        .then(stream => {
          webcamStream = stream;
          webcamVideo.srcObject = stream;
          captureWebcamBtn.disabled = false;
          startWebcamBtn.style.display = "none";
        })
        .catch(err => {
          console.error("Camera access error:", err);
          stopWebcam();
          showToast("Webcam access not allowed or unavailable.", "warning");
        });
    } else {
      showToast("Browser camera api not supported.", "warning");
    }
  }

  function stopWebcam() {
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    webcamVideo.srcObject = null;
    webcamModal.classList.remove("active");
    webcamModal.setAttribute("aria-hidden", "true");
    startWebcamBtn.style.display = "inline-flex";
    captureWebcamBtn.disabled = true;
  }

  function captureSnapshot() {
    if (!webcamStream || captureWebcamBtn.disabled) return;
    captureWebcamBtn.disabled = true;
    const canvas = document.createElement("canvas");
    canvas.width = webcamVideo.videoWidth || 640;
    canvas.height = webcamVideo.videoHeight || 480;
    const ctx = canvas.getContext("2d");

    // Draw mirrored if front facing, but environment usually is fine
    ctx.drawImage(webcamVideo, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async blob => {
      if (!blob) {
        showToast("Camera capture failed.", "error");
        canvas.width = 1;
        canvas.height = 1;
        if (webcamStream) captureWebcamBtn.disabled = false;
        return;
      }
      const file = new File([blob], "Camera_Snapshot_" + Date.now().toString().slice(-4) + ".jpg", { type: "image/jpeg" });
      try {
        if (browserOnnxFlags().single && browserOnnxFlags().webcam) {
          const item = await createQueueItem(
            file,
            `webcam|${file.name}|${file.size}|${file.lastModified}`,
            "webcam",
            { batchId: ensureBatchId() }
          );
          queue.push(item);
          stopWebcam();
          renderQueue();
          await runBatch([item]);
        } else {
          const scan = await plRunBackendPrediction(file);
          stopWebcam();
          window.location.href = `/review?scanId=${encodeURIComponent(scan.id)}`;
        }
      } catch (error) {
        showToast(error.message || "AI scan failed. Check backend and try again.", "error");
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        if (webcamStream) captureWebcamBtn.disabled = false;
      }
    }, "image/jpeg", 0.9);
  }

  async function processSelectedFiles(files) {
    if (isProcessing) return;
    const list = plSafeFiles(files);
    if (!list.length) return;
    const directTotal = queue.length + list.length;
    if (list.length > MAX_BATCH_IMAGES || directTotal > MAX_BATCH_IMAGES) {
      showDirectUploadLimit(directTotal);
      if (fileUpload) fileUpload.value = "";
      return;
    }

    const rejected = [];
    const keys = new Set(queue.map(item => item.key));
    const currentBatchId = ensureBatchId();

    for (const file of list) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (!/^image\/(jpeg|png|webp)$/.test(String(file.type || "").toLowerCase())) {
        rejectFile(rejected, file.name, "Unsupported file type.", "direct");
        continue;
      }
      if (Number(file.size || 0) > MAX_IMAGE_SIZE) {
        rejectFile(rejected, file.name, "File exceeds 10 MB.", "direct");
        continue;
      }
      if (keys.has(key)) {
        rejectFile(rejected, file.name, "Duplicate file.", "direct");
        continue;
      }
      try {
        const item = await createQueueItem(file, key, "direct", { batchId: currentBatchId });
        queue.push(item);
        keys.add(key);
      } catch {
        rejectFile(rejected, file.name, "Image could not be read.", "direct");
      }
    }

    if (fileUpload) fileUpload.value = "";
    setMessages(queue.length ? `${queue.length} image${queue.length === 1 ? "" : "s"} added.` : "None of the selected files could be added.", rejected);
    renderQueue();
  }

  async function processVideoUploads(videos) {
    if (isProcessing) return;
    const keys = new Set(queue.map(item => item.key));
    const rejected = [];
    for (const video of videos) {
      const key = `${video.name}|${video.size}|${video.lastModified}`;
      if ((!/^video\/mp4$/i.test(String(video.type || "")) && !/\.mp4$/i.test(video.name || ""))) {
        rejectFile(rejected, video.name, "Unsupported video type.", "video");
      } else if (!Number(video.size || 0) || video.size > MAX_VIDEO_SIZE) {
        rejectFile(rejected, video.name, "MP4 must be larger than zero and no larger than 2 GB.", "video");
      } else if (keys.has(key)) {
        rejectFile(rejected, video.name, "Duplicate file.", "video");
      } else {
        queue.push(createVideoQueueItem(video, key));
        keys.add(key);
      }
    }
    ensureBatchId();
    setMessages(`${videos.length} MP4 file${videos.length === 1 ? "" : "s"} staged. Click Detect Images to start processing.`, rejected);
    renderQueue();
  }

  function createVideoQueueItem(file, key) {
    return {
      localId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      key,
      file,
      previewUrl: URL.createObjectURL(file),
      dataUrl: "",
      source: "video",
      mediaType: "video",
      status: "ready",
      errorMessage: "",
      scanId: ""
    };
  }

  async function processVideoUpload(video) {
    return processVideoUploads([video]);
  }

  async function pollVideoJob(apiBase, jobId, filename) {
    let transientFailures = 0;
    while (true) {
      let response;
      try {
        response = await plBackendFetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`);
      } catch {
        transientFailures += 1;
        const message = "Connection temporarily interrupted. Retrying…";
        if (processingStatusEl) processingStatusEl.textContent = message;
        setMessages(message);
        await new Promise(resolve => setTimeout(resolve, plVideoPollingDelay(transientFailures)));
        continue;
      }
      const job = await response.json().catch(() => ({}));
      if (response.status === 503 || job.retryable) {
        transientFailures += 1;
        const message = "Connection temporarily interrupted. Retrying…";
        if (processingStatusEl) processingStatusEl.textContent = message;
        setMessages(message);
        await new Promise(resolve => setTimeout(resolve, plVideoPollingDelay(transientFailures)));
        continue;
      }
      if (!response.ok) throw new Error(plApiErrorMessage(job, "Unable to read MP4 job status."));
      transientFailures = 0;
      if (job.status === "complete" || job.status === "completed") {
        plSetUploadProgress(100, "MP4 processing complete");
        const uniqueCount = Number(job.result_summary?.total_unique_objects ?? job.total_count ?? job.processed_count ?? 0);
        setMessages(`${filename} processed. ${uniqueCount} unique object${uniqueCount === 1 ? "" : "s"} saved.`);
        return job;
      }
      if (job.status === "failed") throw new Error(job.error || "MP4 processing failed.");
      if (processingStatusEl) processingStatusEl.textContent = `Processing MP4 (${Number(job.processed_count || 0)} unique objects)`;
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  function rememberVideoJob(jobId, filename) {
    const jobs = plSafeArray(plSafeJsonParse(localStorage.getItem(PL_VIDEO_JOBS_KEY), []))
      .filter(job => job?.jobId && job.jobId !== jobId && job.status !== "completed" && job.status !== "failed");
    jobs.push({ jobId, filename, status: "queued", updatedAt: Date.now() });
    plSetJson(PL_VIDEO_JOBS_KEY, jobs.slice(-5));
  }

  function forgetVideoJob(jobId, status = "completed") {
    const jobs = plSafeArray(plSafeJsonParse(localStorage.getItem(PL_VIDEO_JOBS_KEY), []))
      .filter(job => job?.jobId && job.jobId !== jobId);
    if (status !== "completed") jobs.push({ jobId, status, updatedAt: Date.now() });
    plSetJson(PL_VIDEO_JOBS_KEY, jobs);
  }

  async function resumeVideoJobs() {
    const apiBase = plApiBaseUrl();
    if (!apiBase) return;
    const jobs = plSafeArray(plSafeJsonParse(localStorage.getItem(PL_VIDEO_JOBS_KEY), []))
      .filter(job => job?.jobId && job.status !== "completed" && job.status !== "failed");
    if (!jobs.length) return;
    setMessages(`Resuming ${jobs.length} MP4 job${jobs.length === 1 ? "" : "s"}…`);
    for (const job of jobs) {
      try {
        const result = await pollVideoJob(apiBase, job.jobId, job.filename || "MP4");
        forgetVideoJob(job.jobId, "completed");
        if (result.scan_ids?.[0]) window.location.href = `/review?scanId=${encodeURIComponent(result.scan_ids[0])}`;
      } catch (error) {
        forgetVideoJob(job.jobId, "failed");
        setMessages(error?.message || "Unable to resume MP4 job.");
      }
    }
  }

  function showDirectUploadLimit(count) {
    setMessages(`You selected ${count} images. Direct upload supports up to 10 images. Upload the images as a ZIP file to process them together.`);
    if (!messagesEl) return;
    const actions = document.createElement("div");
    actions.className = "upload-message-actions";
    const uploadZip = document.createElement("button");
    uploadZip.type = "button";
    uploadZip.className = "secondary-btn";
    uploadZip.textContent = "Choose ZIP";
    uploadZip.addEventListener("click", () => fileUpload?.click());
    const chooseFewer = document.createElement("button");
    chooseFewer.type = "button";
    chooseFewer.className = "text-btn";
    chooseFewer.textContent = "Choose Fewer Images";
    chooseFewer.addEventListener("click", () => fileUpload?.click());
    actions.append(uploadZip, chooseFewer);
    messagesEl.appendChild(actions);
  }

  async function processZipUploads(archives) {
    if (isProcessing) return;
    for (const archive of archives) await processZipUpload(archive);
  }

  async function processZipUpload(archive) {
    if (isProcessing) return;
    if (!archive || !/\.zip$/i.test(archive.name)) {
      setMessages("ZIP upload failed. Choose a ZIP file.");
      return;
    }

    try {
      const bytes = new Uint8Array(await archive.arrayBuffer());
      const entries = inspectZipEntries(bytes);
      const relevantEntries = entries.filter(entry => !entry.isDirectory && !isIgnoredZipEntry(entry.name));

      const supported = relevantEntries.filter(entry => isSupportedImageName(entry.name));
      const oversized = supported.filter(entry => entry.originalSize > MAX_IMAGE_SIZE);
      if (oversized.length) {
        const rejected = [];
        oversized.forEach(entry => rejectFile(rejected, entry.name, "File exceeds 10 MB.", "zip"));
        setMessages("This ZIP contains an image above the 10 MB extracted image limit.", rejected);
        renderQueue();
        return;
      }

      const extracted = await unzipArchive(bytes, new Set(supported.map(entry => entry.name)));
      const rejected = [];
      relevantEntries
        .filter(entry => !isSupportedImageName(entry.name))
        .forEach(entry => rejectFile(rejected, entry.name, "Unsupported file type.", "zip"));
      const keys = new Set(queue.map(item => item.key));
      const stagedItems = [];
      const currentBatchId = ensureBatchId();

      for (const entry of supported) {
        const data = extracted[entry.name];
        if (!data || data.length !== entry.originalSize) {
          rejectFile(rejected, entry.name, "Image could not be extracted.", "zip");
          continue;
        }
        const mimeType = imageMimeTypeFromBytes(data);
        if (!mimeType) {
          rejectFile(rejected, entry.name, "Image MIME type is invalid.", "zip");
          continue;
        }
        const key = `${archive.name}|${entry.name}|${entry.originalSize}|${archive.lastModified}`;
        if (keys.has(key)) {
          rejectFile(rejected, entry.name, "Duplicate file.", "zip");
          continue;
        }
        try {
          const imageFile = new File([data], entry.name, { type: mimeType, lastModified: archive.lastModified });
          stagedItems.push(await createQueueItem(imageFile, key, "zip", {
            batchId: currentBatchId,
            zipRelativePath: entry.name,
            zipFilename: archive.name
          }));
          keys.add(key);
        } catch {
          rejectFile(rejected, entry.name, "Image could not be read.", "zip");
        }
      }

      queue.push(...stagedItems);

      setMessages(
        stagedItems.length <= MAX_BATCH_IMAGES
          ? `This ZIP contains ${stagedItems.length} images. Direct image upload is recommended for batches of 10 or fewer.`
          : `${stagedItems.length} ZIP image${stagedItems.length === 1 ? "" : "s"} added.`,
        rejected
      );
      renderQueue();
    } catch (error) {
      setMessages(error?.message || "ZIP upload failed. Check the archive and try again.");
    }
  }

  function isSupportedImageName(name) {
    return /\.(jpe?g|png|webp)$/i.test(String(name || ""));
  }

  function isIgnoredZipEntry(entryPath) {
    const normalized = String(entryPath || "").replace(/\\/g, "/");
    const segments = normalized.split("/");
    const baseName = segments[segments.length - 1];
    return normalized.startsWith("__MACOSX/") ||
      segments.includes("__MACOSX") ||
      baseName.startsWith("._") ||
      baseName === ".DS_Store" ||
      baseName === "Thumbs.db" ||
      segments.some(segment => segment.startsWith("."));
  }

  function imageMimeTypeFromBytes(data) {
    if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
    if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "image/png";
    if (data.length >= 12 && data[0] === 0x52 && data[1] === 0x49 && data[2] === 0x46 && data[3] === 0x46 && data[8] === 0x57 && data[9] === 0x45 && data[10] === 0x42 && data[11] === 0x50) return "image/webp";
    return "";
  }

  function inspectZipEntries(bytes) {
    let eocd = -1;
    for (let index = Math.max(0, bytes.length - 65557); index <= bytes.length - 22; index += 1) {
      if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) eocd = index;
    }
    if (eocd < 0) throw new Error("ZIP archive could not be read.");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entryCount = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    if (entryCount === 0xffff || cursor === 0xffffffff) throw new Error("ZIP64 archives are not supported.");
    const entries = [];
    for (let index = 0; index < entryCount; index += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("ZIP archive has an invalid directory.");
      const originalSize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      entries.push({ name, originalSize, isDirectory: name.endsWith("/") });
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  function unzipArchive(bytes, acceptedNames) {
    const unzip = window.__PURITYLOOP_ZIP__?.unzip;
    if (!unzip) return Promise.reject(new Error("ZIP support is still loading. Try again."));
    return new Promise((resolve, reject) => {
      unzip(bytes, { filter: entry => acceptedNames.has(entry.name) }, (error, files) => {
        if (error) reject(new Error("ZIP archive could not be extracted."));
        else resolve(files || {});
      });
    });
  }

  function rejectFile(rejected, name, reason, source) {
    rejected.push(`${name} - ${reason}`);
    rejectedItems.push({ name, reason, source });
  }

  async function createQueueItem(file, key, source, metadata = {}) {
    const previewUrl = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = previewUrl;
      });
      return {
        localId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        submissionId: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        batchId: metadata.batchId || ensureBatchId(),
        key,
        file,
        previewUrl,
        objectUrl: previewUrl,
        dataUrl: createResultPreview(image),
        source,
        zipRelativePath: metadata.zipRelativePath || "",
        zipFilename: metadata.zipFilename || "",
        mediaType: "image",
        status: "ready",
        browserState: "queued",
        persistenceState: "pending",
        inferenceEngine: "",
        modelName: "",
        originalWidth: image.naturalWidth || image.width,
        originalHeight: image.naturalHeight || image.height,
        browserDetections: [],
        browserReviewDetections: [],
        errorMessage: "",
        scanId: ""
      };
    } catch (error) {
      URL.revokeObjectURL(previewUrl);
      throw error;
    }
  }

  function createResultPreview(image) {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 400 / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.7);
  }

  function ensureBrowserVerificationEl() {
    if (browserVerificationEl?.isConnected) return browserVerificationEl;
    browserVerificationEl = document.createElement("section");
    browserVerificationEl.className = "panel browser-onnx-verification";
    browserVerificationEl.hidden = true;
    (batchSummaryEl || queueEl)?.insertAdjacentElement("afterend", browserVerificationEl);
    return browserVerificationEl;
  }

  function browserVerificationComplete(item) {
    return Boolean(item?.browserDetections?.length)
      && item.browserDetections.every(detection => detection.humanConfirmed);
  }

  function nextBrowserVerificationItem() {
    return queue.find(item => item.localId === activeBrowserVerificationItemId && item.browserState !== "saved")
      || queue.find(item => item.browserState === "awaiting-verification" || item.browserState === "verified")
      || queue.find(item => item.browserState === "no-detections" || item.browserState === "failed");
  }

  function showBrowserVerification(item = nextBrowserVerificationItem()) {
    activeBrowserVerificationItemId = item?.localId || "";
    renderBrowserVerification(item);
  }

  function drawBrowserDetectionBoxes(item) {
    const canvas = browserVerificationEl?.querySelector("canvas");
    const image = browserVerificationEl?.querySelector(".browser-onnx-image");
    if (!canvas || !image || !item?.originalWidth || !item?.originalHeight) return;
    const rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const scaleX = rect.width / item.originalWidth;
    const scaleY = rect.height / item.originalHeight;
    item.browserDetections.forEach(detection => {
      const x = detection.x1 * scaleX;
      const y = detection.y1 * scaleY;
      const width = (detection.x2 - detection.x1) * scaleX;
      const height = (detection.y2 - detection.y1) * scaleY;
      context.strokeStyle = detection.verifiedClass === "battery" ? "#dc2626" : "#16a34a";
      context.fillStyle = context.strokeStyle;
      context.lineWidth = 2;
      context.strokeRect(x, y, width, height);
      const label = `${plBrowserClassLabel(detection.verifiedClass)} ${(detection.confidence * 100).toFixed(1)}%`;
      context.font = "600 12px IBM Plex Sans, sans-serif";
      const labelWidth = Math.min(rect.width - x, context.measureText(label).width + 10);
      const labelY = Math.max(0, y - 22);
      context.fillRect(x, labelY, labelWidth, 22);
      context.fillStyle = "#fff";
      context.fillText(label, x + 5, labelY + 15, Math.max(0, labelWidth - 10));
    });
  }

  function renderBrowserVerification(item) {
    const panel = ensureBrowserVerificationEl();
    browserResizeObserver?.disconnect();
    panel.innerHTML = "";
    panel.hidden = !item || (!item.browserState && !item.browserDetections);
    if (panel.hidden) return;

    const header = document.createElement("header");
    header.className = "browser-onnx-header";
    const heading = document.createElement("div");
    heading.innerHTML = "<p class=\"eyebrow\">Local human verification</p><h2>Detected in this photo:</h2>";
    const badge = document.createElement("span");
    badge.className = "browser-onnx-engine";
    badge.textContent = item.inferenceLabel || "Browser ONNX — best.onnx";
    header.append(heading, badge);
    panel.appendChild(header);

    const status = document.createElement("p");
    status.className = `browser-onnx-status state-${item.browserState || "idle"}`;
    status.setAttribute("role", "status");
    status.textContent = ({
      detecting: "Running browser detection…",
      decoding: "Decoding image…",
      "loading-model": "Loading browser model…",
      "awaiting-verification": "Confirm or correct every detection before saving.",
      verified: "All detections confirmed. Ready to save.",
      "no-detections": `Nothing met the ${PL_BROWSER_CONFIDENCE_THRESHOLD} confidence threshold. No clean or contamination-free conclusion can be made.`,
      saving: "Saving verified result…",
      saved: "Verified result saved.",
      failed: item.errorMessage || "Browser inference failed."
    })[item.browserState] || "";
    panel.appendChild(status);

    if (item.browserDetections?.length) {
      const imageWrap = document.createElement("div");
      imageWrap.className = "browser-onnx-image-wrap";
      const image = document.createElement("img");
      image.className = "browser-onnx-image";
      image.src = item.previewUrl;
      image.alt = `Preview of ${item.file.name}`;
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-label", "Browser ONNX bounding-box overlay");
      imageWrap.append(image, canvas);
      panel.appendChild(imageWrap);

      const list = document.createElement("div");
      list.className = "browser-onnx-detection-list";
      item.browserDetections.forEach((detection, index) => {
        const row = document.createElement("div");
        row.className = "browser-onnx-detection-row";
        const summary = document.createElement("strong");
        summary.textContent = `Detection ${index + 1}: ${plBrowserClassLabel(detection.className)} · ${(detection.confidence * 100).toFixed(1)}%`;
        const selectLabel = document.createElement("label");
        selectLabel.textContent = "Verified category";
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Verified category for detection ${index + 1}`);
        PL_BROWSER_MODEL_CLASSES.forEach(className => {
          const option = document.createElement("option");
          option.value = className;
          option.textContent = plBrowserClassLabel(className);
          option.selected = className === detection.verifiedClass;
          select.appendChild(option);
        });
        select.disabled = item.browserState === "saving" || item.browserState === "saved";
        select.addEventListener("change", () => {
          detection.verifiedClass = select.value;
          detection.humanConfirmed = false;
          renderBrowserVerification(item);
        });
        selectLabel.appendChild(select);

        const confirmLabel = document.createElement("label");
        confirmLabel.className = detection.className === "battery" || detection.verifiedClass === "battery"
          ? "browser-onnx-confirm battery"
          : "browser-onnx-confirm";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(detection.humanConfirmed);
        checkbox.disabled = item.browserState === "saving" || item.browserState === "saved";
        const confirmText = document.createElement("span");
        confirmText.textContent = detection.className === "battery" || detection.verifiedClass === "battery"
          ? "Human confirms battery detection and hazardous handling is required."
          : "Human confirms this detection.";
        checkbox.addEventListener("change", () => {
          detection.humanConfirmed = checkbox.checked;
          item.browserState = browserVerificationComplete(item) ? "verified" : "awaiting-verification";
          renderBrowserVerification(item);
        });
        confirmLabel.append(checkbox, confirmText);
        row.append(summary, selectLabel, confirmLabel);
        list.appendChild(row);
      });
      panel.appendChild(list);

      const actions = document.createElement("div");
      actions.className = "browser-onnx-actions";
      const save = document.createElement("button");
      save.type = "button";
      save.className = "primary-btn";
      save.textContent = item.browserFailurePhase === "save" ? "Retry Save" : "Save Verified Result";
      save.disabled = !browserVerificationComplete(item) || item.browserState === "saving" || item.browserState === "saved";
      save.addEventListener("click", () => saveBrowserVerifiedResult(item));
      actions.appendChild(save);
      if (item.source === "webcam") {
        const retake = document.createElement("button");
        retake.type = "button";
        retake.className = "secondary-btn";
        retake.textContent = "Retake";
        retake.disabled = item.browserState === "saving" || item.browserState === "saved";
        retake.addEventListener("click", () => {
          removeQueueItem(item.localId);
          webcamModal.classList.add("active");
          webcamModal.setAttribute("aria-hidden", "false");
          startWebcam();
        });
        actions.appendChild(retake);
      }
      panel.appendChild(actions);

      image.addEventListener("load", () => drawBrowserDetectionBoxes(item), { once: true });
      browserResizeObserver = new ResizeObserver(() => drawBrowserDetectionBoxes(item));
      browserResizeObserver.observe(image);
      window.requestAnimationFrame(() => drawBrowserDetectionBoxes(item));
    } else if (item.browserState === "failed" || item.browserState === "no-detections") {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = item.browserFailurePhase === "save" ? "Retry Save" : "Retry Browser Detection";
      retry.addEventListener("click", () => {
        if (item.browserFailurePhase === "save") {
          saveBrowserVerifiedResult(item);
          return;
        }
        item.status = "ready";
        item.browserState = "";
        item.browserFailurePhase = "";
        item.errorMessage = "";
        runBatch([item]);
      });
      panel.appendChild(retry);
    }
  }

  async function runBrowserDetection(item) {
    if (item.browserDetecting) return;
    item.browserDetecting = true;
    item.submissionId ||= window.crypto?.randomUUID?.();
    if (!item.submissionId) throw new Error("Browser cannot generate a stable submission UUID.");
    item.inferenceLabel = "Browser ONNX — best.onnx";
    item.inferenceEngine = "browser-onnx";
    item.modelName = "best.onnx";
    item.browserState = "decoding";
    item.browserFailurePhase = "";
    item.browserDetections = [];
    item.browserReviewDetections = [];
    renderQueue();
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    item.browserState = "loading-model";
    renderQueue();
    try {
      const bridge = window.__PURITYLOOP_BROWSER_ONNX__;
      if (!bridge?.enabled) throw new Error("Browser ONNX bridge is unavailable. Reload the Upload page and retry.");
      const browserItems = queue.filter(candidate => shouldUseBrowserOnnxForItem(candidate));
      const source = item.source === "direct"
        ? (browserItems.filter(candidate => candidate.source === "direct").length > 1 ? "direct-multiple" : "direct-single")
        : item.source;
      const sourceItems = browserItems.filter(candidate => (
        source === "direct-multiple" ? candidate.source === "direct" : candidate.source === source
      ));
      const itemIndex = sourceItems.indexOf(item) + 1;
      console.info(`[PurityLoop inference]\nengine=browser-onnx\nmodel=best.onnx\nsource=${source}${source === "direct-multiple" || source === "zip" ? `\nitem=${itemIndex}` : ""}`);
      item.browserState = "detecting";
      renderQueue();
      const result = await bridge.detect(item.file);
      item.originalWidth = result.originalWidth;
      item.originalHeight = result.originalHeight;
      item.browserDetections = result.detections;
      item.browserReviewDetections = result.reviewDetections || result.detections;
      await saveBrowserDetectedResult(item);
    } catch (error) {
      item.browserState = "failed";
      item.browserFailurePhase = "detect";
      item.status = "failed";
      item.errorMessage = `Browser inference failed: ${error?.message || "Unknown browser inference error."}`;
      throw error;
    } finally {
      item.browserDetecting = false;
      renderQueue();
    }
  }

  async function saveBrowserDetectedResult(item) {
    if (item.browserSaving) return;
    const apiBase = plApiBaseUrl();
    if (!apiBase) throw new Error("Backend API URL is not configured.");
    item.browserSaving = true;
    item.browserState = "saving";
    item.browserFailurePhase = "";
    item.errorMessage = "";
    renderQueue();
    const detections = (item.browserReviewDetections || item.browserDetections).map((detection, index) => ({
      detection_index: index,
      class_id: detection.classId,
      model_class_name: detection.className,
      confidence: detection.confidence,
      x1: detection.x1,
      y1: detection.y1,
      x2: detection.x2,
      y2: detection.y2
    }));
    const formData = new FormData();
    formData.append("file", item.file, item.file.name || "uploaded-image.jpg");
    formData.append("submission_id", item.submissionId);
    formData.append("original_width", String(item.originalWidth));
    formData.append("original_height", String(item.originalHeight));
    formData.append("model_name", "best.onnx");
    formData.append("model_version", PL_BROWSER_MODEL_VERSION);
    formData.append("inference_engine", "browser-onnx");
    formData.append("confidence_threshold", String(PL_BROWSER_CONFIDENCE_THRESHOLD));
    formData.append("nms_iou_threshold", String(PL_BROWSER_NMS_IOU_THRESHOLD));
    formData.append("detections", JSON.stringify(detections));
    try {
      const response = await plBackendFetch(`${apiBase}/api/scans/browser-detected`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Detection save failed (${response.status}).`);
      const scan = await plSavePredictionPayload(payload, item.file);
      item.scanId = scan.id;
      item.browserState = "saved";
      item.persistenceState = "saved";
      item.status = plScanNeedsReview(scan) ? "review_needed" : "completed";
      saveCompletedPreviewCache();
    } catch (error) {
      item.browserState = "failed";
      item.browserFailurePhase = "save";
      item.persistenceState = "failed";
      item.status = "failed";
      item.errorMessage = `Save failed: ${error?.message || "Detected result could not be saved."}`;
      throw error;
    } finally {
      item.browserSaving = false;
      renderQueue();
    }
  }

  async function saveBrowserVerifiedResult(item) {
    if (item.browserSaving || !browserVerificationComplete(item)) return;
    const apiBase = plApiBaseUrl();
    if (!apiBase) {
      item.browserState = "failed";
      item.browserFailurePhase = "save";
      item.errorMessage = "Backend API URL is not configured.";
      renderBrowserVerification(item);
      return;
    }
    item.browserSaving = true;
    item.browserState = "saving";
    item.browserFailurePhase = "";
    item.errorMessage = "";
    renderQueue();
    renderBrowserVerification(item);

    const verifiedDetections = item.browserDetections.map((detection, index) => ({
      detection_index: index,
      class_id: detection.classId,
      model_class_name: detection.className,
      verified_class: detection.verifiedClass,
      confidence: detection.confidence,
      x1: detection.x1,
      y1: detection.y1,
      x2: detection.x2,
      y2: detection.y2,
      verification_status: detection.className === "battery" || detection.verifiedClass === "battery"
        ? "battery-confirmed"
        : "verified"
    }));
    const formData = new FormData();
    formData.append("file", item.file, item.file.name || "uploaded-image.jpg");
    formData.append("submission_id", item.submissionId);
    formData.append("original_width", String(item.originalWidth));
    formData.append("original_height", String(item.originalHeight));
    formData.append("model_name", "best.onnx");
    formData.append("model_version", PL_BROWSER_MODEL_VERSION);
    formData.append("inference_engine", "browser-onnx");
    formData.append("confidence_threshold", String(PL_BROWSER_CONFIDENCE_THRESHOLD));
    formData.append("nms_iou_threshold", String(PL_BROWSER_NMS_IOU_THRESHOLD));
    formData.append("verified_detections", JSON.stringify(verifiedDetections));
    formData.append("verification_outcome", "verified");

    try {
      const response = await plBackendFetch(`${apiBase}/api/scans/browser-verified`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || `Verified result save failed (${response.status}).`);
      const scan = await plSavePredictionPayload(payload, item.file);
      item.scanId = scan.id;
      item.browserState = "saved";
      item.persistenceState = "saved";
      item.status = "completed";
      saveCompletedPreviewCache();
      renderBatchSummary();
    } catch (error) {
      item.browserState = "failed";
      item.browserFailurePhase = "save";
      item.persistenceState = "failed";
      item.status = "failed";
      item.errorMessage = `Save failed: ${error?.message || "Verified result could not be saved."}`;
    } finally {
      item.browserSaving = false;
      renderQueue();
      showBrowserVerification(nextBrowserVerificationItem());
    }
  }

  async function saveAllBrowserVerified() {
    const verified = queue.filter(item => item.browserState === "verified" && !item.browserSaving);
    for (const item of verified) await saveBrowserVerifiedResult(item);
  }

  function clearCompletedItems() {
    if (isProcessing) return;
    const completed = new Set(queue.filter(item => item.status === "completed" || item.browserState === "saved").map(item => item.localId));
    queue.filter(item => completed.has(item.localId)).forEach(item => URL.revokeObjectURL(item.previewUrl));
    queue = queue.filter(item => !completed.has(item.localId));
    activeBrowserVerificationItemId = "";
    if (!queue.length) batchId = "";
    renderQueue();
    renderBatchSummary();
  }

  function renderQueue() {
    const hasItems = queue.length > 0;
    const hasSelection = hasItems || rejectedItems.length > 0;
    renderUploadStats();
    plSelectedUploadFiles = queue.map(item => item.file);
    if (fileName) fileName.textContent = hasSelection ? `${queue.length + rejectedItems.length} file${queue.length + rejectedItems.length === 1 ? "" : "s"} selected` : "No files selected";
    if (scanImageBtn) {
      const readyCount = queue.filter(item => item.status === "ready").length;
      scanImageBtn.disabled = isProcessing || !readyCount;
      scanImageBtn.innerHTML = isProcessing
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Detecting Images'
        : `<i class="fa-solid fa-magnifying-glass-chart"></i> Detect ${readyCount} File${readyCount === 1 ? "" : "s"}`;
    }
    if (fileUpload) fileUpload.disabled = isProcessing;
    if (clearUploadBtn) clearUploadBtn.disabled = isProcessing || !hasSelection;
    if (cameraLauncher) cameraLauncher.disabled = isProcessing;
    if (!queueEl) return;
    queueEl.innerHTML = "";
    if (!hasItems) {
      queueEl.innerHTML = '<p class="upload-queue-empty">No valid files selected.</p>';
    }
    queue.forEach(item => {
      const row = document.createElement("div");
      row.className = `upload-queue-item status-${item.status}`;
      const preview = item.mediaType === "video" ? document.createElement("video") : document.createElement("img");
      preview.src = item.previewUrl;
      preview.alt = "";
      if (item.mediaType === "video") {
        preview.controls = true;
        preview.muted = true;
        preview.playsInline = true;
        preview.preload = "metadata";
      }
      const details = document.createElement("div");
      details.className = "upload-queue-details";
      const name = document.createElement("strong");
      name.textContent = item.file.name;
      const meta = document.createElement("span");
      meta.textContent = formatFileSize(item.file.size);
      details.append(name, meta);
      if (item.inferenceLabel) {
        const engine = document.createElement("span");
        engine.className = "upload-inference-engine";
        engine.textContent = item.inferenceLabel;
        details.appendChild(engine);
      }
      const status = document.createElement("span");
      status.className = "upload-queue-status";
      status.textContent = queueStatusLabel(item.status, item);
      if (item.errorMessage) status.title = item.errorMessage;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-btn upload-queue-remove";
      remove.textContent = "Remove";
      remove.disabled = isProcessing || item.status === "processing";
      remove.setAttribute("aria-label", `Remove ${item.file.name}`);
      remove.addEventListener("click", () => removeQueueItem(item.localId));
      row.append(preview, details, status, remove);
      queueEl.appendChild(row);
    });
    if (rejectedItems.length) {
      const rejectedDetails = document.createElement("details");
      rejectedDetails.className = "rejected-upload-details";
      const summary = document.createElement("summary");
      summary.textContent = `${rejectedItems.length} unsupported or skipped file${rejectedItems.length === 1 ? "" : "s"}`;
      const list = document.createElement("ul");
      rejectedItems.forEach(item => {
        const line = document.createElement("li");
        line.textContent = `${item.name}: ${item.reason}`;
        list.appendChild(line);
      });
      rejectedDetails.append(summary, list);
      queueEl.appendChild(rejectedDetails);
    }
  }

  function renderUploadStats() {
    // Completed files remain valid in the batch; count them in the displayed
    // ready total without making them eligible for another detection run.
    const ready = queue.filter(item => item.status === "ready" || item.status === "completed").length;
    const review = queue.filter(item => item.status === "review_needed").length;
    const failed = queue.filter(item => item.status === "failed").length;
    const total = queue.length + rejectedItems.length;
    const zipDetected = queue.some(item => item.source === "zip") || rejectedItems.some(item => item.source === "zip");
    const setText = (id, value) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    };

    setText("uploadQueueCount", `(${total})`);
    setText("uploadSelectedCount", total);
    setText("uploadReadyCount", ready);
    setText("uploadReviewCount", review);
    setText("uploadFailedCount", failed);
    setText("batchTotalSelected", `${total} ${total === 1 ? "image" : "images"}`);
    setText("batchValidImages", `${queue.length} ${queue.length === 1 ? "image" : "images"}`);
    setText("batchNeedReview", `${review} ${review === 1 ? "image" : "images"}`);
    setText("batchSkippedImages", `${rejectedItems.length} ${rejectedItems.length === 1 ? "file" : "files"}`);
    setText("batchZipDetected", zipDetected ? "Yes" : "No");
  }

  function queueStatusLabel(status, item) {
    const browserStates = {
      queued: "Queued",
      decoding: "Decoding",
      "loading-model": "Loading Model",
      detecting: "Detecting",
      "awaiting-verification": "Awaiting Verification",
      verified: "Verified",
      saving: "Saving",
      saved: "Saved",
      "no-detections": "No Detections",
      failed: "Failed",
      cancelled: "Cancelled"
    };
    if (item?.inferenceEngine === "browser-onnx" && browserStates[item.browserState]) return browserStates[item.browserState];
    return ({
      ready: "Ready",
      waiting: "Waiting",
      processing: "Analysing",
      completed: "Completed",
      review_needed: item?.browserState === "awaiting-verification" ? "Awaiting Verification" : "Review Needed",
      failed: "Failed",
      cancelled: "Cancelled"
    })[status] || "Ready";
  }

  function setMessages(message, rejected = []) {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    const text = document.createElement("p");
    text.textContent = message;
    messagesEl.appendChild(text);
    if (rejected.length) {
      const list = document.createElement("ul");
      rejected.forEach(item => {
        const line = document.createElement("li");
        line.textContent = item;
        list.appendChild(line);
      });
      messagesEl.appendChild(list);
    }
  }

  function removeQueueItem(localId) {
    const item = queue.find(entry => entry.localId === localId);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    queue = queue.filter(entry => entry.localId !== localId);
    if (!queue.length) batchId = "";
    if (!queue.length) {
      browserResizeObserver?.disconnect();
      if (browserVerificationEl) browserVerificationEl.hidden = true;
    }
    renderQueue();
  }

  function clearQueue() {
    if (isProcessing) return;
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    queue = [];
    rejectedItems = [];
    batchId = "";
    if (uploadBox) delete uploadBox.dataset.batchId;
    plSelectedUploadFiles = [];
    plSetJson(PL_UPLOADS_KEY, []);
    if (fileUpload) fileUpload.value = "";
    if (batchSummaryEl) batchSummaryEl.hidden = true;
    browserResizeObserver?.disconnect();
    if (browserVerificationEl) browserVerificationEl.hidden = true;
    if (processingStatusEl) processingStatusEl.textContent = "";
    setMessages("No files selected.");
    renderQueue();
  }

  async function processVideoQueueItem(item) {
    const apiBase = plApiBaseUrl();
    if (!apiBase) throw new Error("Backend API URL is not configured.");
    const startResponse = await plBackendFetch(`${apiBase}/api/uploads/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: item.file.name, size_bytes: item.file.size, mime: "video/mp4" }) });
    const startPayload = await startResponse.json().catch(() => ({}));
    if (!startResponse.ok || !startPayload.upload_id) throw new Error(plApiErrorMessage(startPayload, "Unable to start MP4 upload."));
    const chunkSize = Number(startPayload.chunk_size || 8 * 1024 * 1024);
    let offset = 0;
    let driveFile = null;
    while (offset < item.file.size) {
      const end = Math.min(item.file.size, offset + chunkSize);
      const response = await plBackendFetch(`${apiBase}/api/uploads/${encodeURIComponent(startPayload.upload_id)}`, { method: "PUT", headers: { "Content-Range": `bytes ${offset}-${end - 1}/${item.file.size}` }, body: item.file.slice(offset, end) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(plApiErrorMessage(payload, `MP4 chunk upload failed (${response.status}).`));
      if (payload.complete) driveFile = payload.drive_file || null;
      offset = end;
      plSetUploadProgress((offset / item.file.size) * 90, `Uploading ${item.file.name}`);
    }
    if (!driveFile?.id) throw new Error("Google Drive did not return the uploaded file id.");
    const ingestResponse = await plBackendFetch(`${apiBase}/api/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: "drive_file", ref: driveFile.id, options: { vid_stride: 30 } }) });
    const ingestPayload = await ingestResponse.json().catch(() => ({}));
    if (!ingestResponse.ok || !ingestPayload.job_id) throw new Error(plApiErrorMessage(ingestPayload, "Unable to queue MP4 processing."));
    rememberVideoJob(ingestPayload.job_id, item.file.name);
    const job = await pollVideoJob(apiBase, ingestPayload.job_id, item.file.name);
    forgetVideoJob(ingestPayload.job_id, "completed");
    item.scanId = job.scan_ids?.[0] || "";
    return job;
  }

  async function runBatch(items) {
    if (isProcessing || !items.length) return;
    const retrying = items.every(item => item.status === "failed");
    isProcessing = true;
    browserQueueCancelled = false;
    plHideUploadProgress();
    if (batchSummaryEl) batchSummaryEl.hidden = true;
    items.forEach(item => { item.status = "waiting"; item.errorMessage = ""; });
    renderQueue();
    if (uploadBox) uploadBox.classList.add("is-processing");

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (browserQueueCancelled && shouldUseBrowserOnnxForItem(item)) {
        item.status = "cancelled";
        item.browserState = "cancelled";
        continue;
      }
      if (browserQueuePaused && shouldUseBrowserOnnxForItem(item)) {
        item.status = "ready";
        item.browserState = "queued";
        continue;
      }
      item.status = "processing";
      if (processingStatusEl) processingStatusEl.textContent = `${retrying ? "Retrying" : "Processing"} ${index + 1} of ${items.length} file${items.length === 1 ? "" : "s"}`;
      renderQueue();
      try {
        if (item.mediaType === "video") {
          await processVideoQueueItem(item);
          item.status = "completed";
        } else if (shouldUseBrowserOnnxForItem(item)) {
          await runBrowserDetection(item);
        } else {
          throw new Error("Browser ONNX is required for image detection. Enable browser ONNX for this upload source.");
        }
      } catch (error) {
        item.status = "failed";
        item.errorMessage ||= error?.message || "The image could not be processed. Check the connection and try again.";
      }
      saveCompletedPreviewCache();
      renderQueue();
    }

    isProcessing = false;
    if (uploadBox) uploadBox.classList.remove("is-processing");
    plHideUploadProgress();
    if (processingStatusEl) processingStatusEl.textContent = "";
    renderQueue();
    renderBatchSummary();
  }

  function saveCompletedPreviewCache() {
    plSetJson(PL_UPLOADS_KEY, queue
      .filter(item => item.status === "completed" || item.status === "review_needed")
      .map(item => ({ name: item.file.name, size: item.file.size, dataUrl: item.dataUrl, resultAssetPath: "" })));
  }

  function renderBatchSummary() {
    if (!batchSummaryEl) return;
    const completed = queue.filter(item => item.status === "completed").length;
    const review = queue.filter(item => item.status === "review_needed").length;
    const failed = queue.filter(item => item.status === "failed").length;
    const failedBrowserSave = queue.find(item => item.status === "failed" && item.browserFailurePhase === "save");
    const failedBrowserDetection = queue.find(item => item.status === "failed" && item.browserFailurePhase === "detect");
    const firstScan = queue.find(item => item.scanId)?.scanId;
    batchSummaryEl.hidden = false;
    batchSummaryEl.innerHTML = "";
    const copy = document.createElement("div");
    copy.className = "batch-summary-copy";
    const summary = document.createElement("strong");
    summary.textContent = failed ? "Processing finished with failed images." : review ? "Processing complete. Review needed." : "Processing complete.";
    const count = document.createElement("span");
    count.textContent = `${completed} completed, ${review} require review, ${failed} failed`;
    copy.append(summary, count);
    batchSummaryEl.appendChild(copy);
    if (firstScan) {
      const view = document.createElement("button");
      view.type = "button";
      view.className = "primary-btn";
      view.textContent = review ? "Review Results" : "View Results";
      view.addEventListener("click", () => { window.location.href = `/review?scanId=${encodeURIComponent(firstScan)}`; });
      batchSummaryEl.appendChild(view);
    }
    if (failed) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = failedBrowserSave ? "Retry Save" : failedBrowserDetection ? "Retry Browser Detection" : "Retry Failed Images";
      retry.addEventListener("click", () => {
        if (failedBrowserSave) {
          saveBrowserDetectedResult(failedBrowserSave);
        } else {
          runBatch(queue.filter(item => item.status === "failed"));
        }
      });
      batchSummaryEl.appendChild(retry);
    }
  }

  window.addEventListener("purityloop:page-cleanup", () => {
    browserResizeObserver?.disconnect();
    stopWebcam();
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
  }, { once: true });

  function createWebcamModalElements() {
    if (document.getElementById("webcamModal")) return;
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.id = "webcamModal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 600px;">
        <button type="button" class="modal-close" id="closeWebcamModal" aria-label="Close webcam">×</button>
        <p class="eyebrow" style="color: var(--green);">AI Camera Scanner</p>
        <h2 style="font-size: 24px; margin-bottom: 8px;">Webcam Object Capture</h2>
        <p style="color: var(--muted); margin-bottom: 12px;">Position the waste object in front of the lens. The AI will segment and audit the material.</p>
        
        <div class="webcam-stream-wrap">
          <video id="webcamVideo" autoplay playsinline muted></video>
          <div class="scanner-laser"></div>
        </div>

        <div class="modal-actions" style="margin-top: 18px;">
          <button type="button" class="secondary-btn" id="startWebcamBtn" style="display: none;">Re-enable Camera</button>
          <button type="button" class="primary-btn" id="captureWebcamBtn" disabled style="width: 100%;">Scan Item</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Inject styles for webcam modal dynamically
    const style = document.createElement("style");
    style.textContent = `
      .webcam-stream-wrap {
        position: relative;
        aspect-ratio: 4 / 3;
        background: #111e18;
        border-radius: var(--radius);
        overflow: hidden;
        border: 2px solid var(--line);
      }
      #webcamVideo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .scanner-laser {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 5px;
        background: linear-gradient(180deg, rgba(32, 178, 107, 0), #20b26b, rgba(32, 178, 107, 0));
        box-shadow: 0 0 10px rgba(32, 178, 107, 0.8);
        animation: scanAnim 3s infinite linear;
        pointer-events: none;
      }
      @keyframes scanAnim {
        0% { top: 0%; }
        50% { top: 100%; }
        100% { top: 0%; }
      }
    `;
    document.head.appendChild(style);
  }
}

/******************************************
 * 2. CLASSIFICATION RESULT VIEWER PAGE *
 ******************************************/
function initResultPage() {
  const canvas = document.getElementById("liveInferenceCanvas");
  if (!canvas) return; // Not on the result route

  const isReviewWorkspace = document.body.dataset.page === "review";

  const ctx2d = canvas.getContext("2d");
  const itemsScannedEl = document.getElementById("liveScanned");
  const itemsPurityEl = document.getElementById("livePurity");
  const liveFeed = document.getElementById("liveFeed");
  const actionText = document.getElementById("liveActionText");
  const actionBadge = document.getElementById("liveActionBadge");
  const activeBeltTitle = document.getElementById("liveStreamTitle");
  const annotatedVideoPanel = document.getElementById("annotatedVideoPanel");
  const annotatedVideoBody = document.getElementById("annotatedVideoBody");
  const annotatedVideoStatus = document.getElementById("annotatedVideoStatus");
  const reviewMediaTabs = document.getElementById("reviewMediaTabs");
  const reviewDetectedObjectsTab = document.getElementById("reviewDetectedObjectsTab");
  const reviewAnnotatedVideoTab = document.getElementById("reviewAnnotatedVideoTab");
  const detectedObjectsPanel = document.getElementById("detectedObjectsPanel");
  const previousScanBtn = document.getElementById("previousScanBtn");
  const nextScanBtn = document.getElementById("nextScanBtn");
  const navigationStatus = document.getElementById("finderNavigationStatus");
  const resultSourceState = document.getElementById("resultSourceState");
  const reviewCategorySelect = document.getElementById("reviewCategorySelect");
  const reviewVerifyButton = document.getElementById("reviewVerifyButton");
  const reviewRejectButton = document.getElementById("reviewRejectButton");
  const reviewFeedback = document.getElementById("reviewActionFeedback");
  let activeReviewMaterial = null;
  let isReviewSaving = false;
  let reviewMediaMode = "detected";
  let isReviewNavigating = false;
  let reviewNavigationState = null;
  let reviewSelectionCleared = false;

  const cachedUploadPreviews = plSafeArray(plSafeJsonParse(localStorage.getItem(PL_UPLOADS_KEY), []));
  const findCachedUploadPreview = sourceName => {
    const key = String(sourceName || "");
    const match = cachedUploadPreviews.find(upload => {
      const name = String(upload?.name || "");
      return upload?.dataUrl && name && (name === key || key.endsWith(name) || key.includes(name));
    });
    return match?.dataUrl || "";
  };
  const scanUploads = scanList => scanList.map(scan => {
    const previewUrl = scan.preview_image_url || "";
    const hasScanImage = Boolean(previewUrl);
    const cachedPreview = findCachedUploadPreview(scan.source_name || scan.drive_file_name);
    return {
      name: scan.source_name || scan.id,
      size: scan.source_size || 0,
      thumbnailSrc: previewUrl,
      dataUrl: hasScanImage ? "" : cachedPreview,
      assetPath: previewUrl,
      scanId: scan.id
    };
  });
  const scans = plGetScanResults();
  let uploads = scanUploads(scans);
  const requestedScanId = new URLSearchParams(window.location.search).get("scanId") || "";
  const requestedScan = plGetRequestedScanResult();
  console.info("[result] scanId from URL", requestedScanId);

  let activeIndex = 0;
  if (requestedScan) {
    const requestedIndex = uploads.findIndex(upload => upload.scanId === requestedScan.id);
    activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  }
  let activeScan = requestedScan || scans[0] || null;
  let activeImageObj = null;
  if (resultSourceState) resultSourceState.textContent = activeScan ? "Saved AI result" : "No saved result";

  if (!isReviewWorkspace) {
    // Keep page headings aligned with the upload-to-result workflow.
    const eyebrowEl = document.querySelector(".main-content .eyebrow");
    if (eyebrowEl) eyebrowEl.textContent = "AI Classification Hub";

    const headingEl = document.querySelector(".main-content h1");
    if (headingEl) headingEl.textContent = "Image Classification Results";

    const descEl = document.querySelector(".main-content header p");
    if (descEl) descEl.textContent = "Review uploaded images, confidence scores, contaminants, and recommended sorting action.";

    const sidebarNote = document.querySelector(".sidebar-note");
    if (sidebarNote) {
      sidebarNote.innerHTML = `
        <strong>Classification Hub</strong>
        <p>Audit uploaded datasets and webcam frame results before database ledger logging.</p>
      `;
    }
  }


  // Render Finder Grid and Load Active image
  renderFinderGrid();
  if (activeScan) {
    loadActiveImage();
  } else {
    renderEmptyResult();
  }

  // Redraw canvas on window resize to stay responsive.
  const onResultResize = () => {
    if (activeImageObj) drawCanvasFrame();
  };
  const onResultHistoryRefresh = () => {
    const refreshedScans = plGetScanResults();
    uploads = scanUploads(refreshedScans);
    const refreshedActive = activeScan ? plGetScanResultById(activeScan.id) : null;
    activeScan = refreshedActive || (isReviewWorkspace && requestedScanId ? activeScan : (isReviewWorkspace && reviewSelectionCleared ? null : refreshedScans[0])) || null;
    activeIndex = Math.max(0, uploads.findIndex(upload => upload.scanId === activeScan?.id));
    renderFinderGrid();
    if (activeScan) {
      loadActiveImage();
      if (isReviewWorkspace) {
        window.dispatchEvent(new CustomEvent("purityloop:review-scan-selected", { detail: { scanId: activeScan.id } }));
      }
    } else renderEmptyResult();
  };
  const loadReviewScanById = async scanId => {
    if (!isReviewWorkspace || !scanId) return false;
    let scan = plGetScanResultById(scanId);
    if (!scan) {
      if (resultSourceState) resultSourceState.textContent = "Loading selected scan";
      try {
        scan = await plFetchScanResultById(scanId);
        plMergeScanResults([scan]);
      } catch (error) {
        reviewSelectionCleared = true;
        activeScan = null;
        activeIndex = -1;
        if (resultSourceState) resultSourceState.textContent = "Selected scan unavailable";
        renderEmptyResult();
        if (liveFeed) liveFeed.innerHTML = `<div class="feed-empty">${plEscapeHtml(error.message || "Unable to load selected scan.")}</div>`;
        return false;
      }
    }
    const refreshedScans = plGetScanResults();
    uploads = scanUploads(refreshedScans);
    activeScan = scan;
    activeIndex = Math.max(0, uploads.findIndex(upload => upload.scanId === scan.id));
    reviewSelectionCleared = false;
    renderFinderGrid();
    loadActiveImage();
    window.dispatchEvent(new CustomEvent("purityloop:review-scan-selected", { detail: { scanId: scan.id } }));
    return true;
  };
  const onResultThemeChange = () => {
    if (activeImageObj) drawCanvasFrame();
    else drawEmptyScanCanvas("No scan data");
  };
  const onReviewScanSelection = event => {
    const scanId = event?.detail?.scanId;
    if (!scanId) {
      reviewSelectionCleared = true;
      activeScan = null;
      activeIndex = -1;
      renderFinderGrid();
      renderEmptyResult();
      return;
    }
    const selectedIndex = uploads.findIndex(upload => upload.scanId === scanId);
    if (selectedIndex >= 0) {
      reviewSelectionCleared = false;
      selectScan(selectedIndex);
    } else {
      loadReviewScanById(scanId);
    }
  };
  const onReviewNavigationState = event => {
    reviewNavigationState = event?.detail || null;
    updateNavigationButtons();
  };
  window.addEventListener('resize', onResultResize);
  window.addEventListener("purityloop:scan-history-refreshed", onResultHistoryRefresh);
  window.addEventListener("purityloop:scan-cache-updated", onResultHistoryRefresh);
  window.addEventListener("purityloop:theme-change", onResultThemeChange);
  if (isReviewWorkspace) window.addEventListener("purityloop:review-select-scan", onReviewScanSelection);
  if (isReviewWorkspace) window.addEventListener("purityloop:review-navigation-state", onReviewNavigationState);

  // Live Auto-Scan simulation
  const autoScanCheckbox = document.getElementById("autoScanCheckbox");
  let autoScanInterval = null;

  function startAutoScanSimulation() {
    showToast("Upload a file to create scan data.", "warning");
    if (autoScanCheckbox) autoScanCheckbox.checked = false;
  }

  function stopAutoScanSimulation() {
    if (autoScanInterval) {
      clearInterval(autoScanInterval);
      autoScanInterval = null;
    }
  }
  window.addEventListener("purityloop:page-cleanup", () => {
    stopAutoScanSimulation();
    window.removeEventListener('resize', onResultResize);
    window.removeEventListener("purityloop:scan-history-refreshed", onResultHistoryRefresh);
    window.removeEventListener("purityloop:scan-cache-updated", onResultHistoryRefresh);
    window.removeEventListener("purityloop:theme-change", onResultThemeChange);
    if (isReviewWorkspace) window.removeEventListener("purityloop:review-select-scan", onReviewScanSelection);
    if (isReviewWorkspace) window.removeEventListener("purityloop:review-navigation-state", onReviewNavigationState);
  }, { once: true });

  if (autoScanCheckbox) {
    autoScanCheckbox.addEventListener("change", () => {
      if (autoScanCheckbox.checked) {
        startAutoScanSimulation();
      } else {
        stopAutoScanSimulation();
      }
    });
  }

  function selectScan(index) {
    if (!uploads.length) return;
    if (index < 0 || index >= uploads.length) return;
    activeIndex = index;
    activeScan = plGetScanResultById(uploads[activeIndex].scanId);
    reviewSelectionCleared = false;
    if (activeScan) window.history.replaceState(null, "", `${window.location.pathname}?scanId=${encodeURIComponent(activeScan.id)}`);
    renderFinderGrid();
    loadActiveImage();
    if (isReviewWorkspace && activeScan) {
      window.dispatchEvent(new CustomEvent("purityloop:review-scan-selected", { detail: { scanId: activeScan.id } }));
    }
  }

  function canNavigateScan(direction) {
    if (isReviewWorkspace && reviewNavigationState) return direction < 0 ? reviewNavigationState.hasPrevious : reviewNavigationState.hasNext;
    return direction < 0 ? activeIndex > 0 : activeIndex < uploads.length - 1;
  }

  function updateNavigationButtons() {
    const disabled = isReviewNavigating;
    if (previousScanBtn) previousScanBtn.disabled = disabled || !canNavigateScan(-1);
    if (nextScanBtn) nextScanBtn.disabled = disabled || !canNavigateScan(1);
  }

  function navigateScan(direction) {
    if (isReviewNavigating || !canNavigateScan(direction)) return;
    isReviewNavigating = true;
    updateNavigationButtons();
    const moved = isReviewWorkspace && typeof window.plReviewNavigateScan === "function"
      ? window.plReviewNavigateScan(direction)
      : (selectScan(activeIndex + direction), true);
    if (!moved) {
      isReviewNavigating = false;
      updateNavigationButtons();
      return;
    }
    window.setTimeout(() => {
      isReviewNavigating = false;
      updateNavigationButtons();
    }, 160);
  }

  if (previousScanBtn) previousScanBtn.addEventListener("click", () => navigateScan(-1));
  if (nextScanBtn) nextScanBtn.addEventListener("click", () => navigateScan(1));
  if (requestedScanId && !requestedScan) loadReviewScanById(requestedScanId);

  function renderFinderGrid() {
    const grid = document.getElementById("finderGrid");
    const countText = document.getElementById("finderCountText");
    const totalUploads = Number.isFinite(Number(plScanHistoryMeta.total)) ? Number(plScanHistoryMeta.total) : null;
    if (countText) countText.textContent = totalUploads === null ? "— item(s)" : `${totalUploads} item(s)`;
    if (navigationStatus) navigationStatus.textContent = uploads.length
      ? `Scan ${activeIndex + 1} of ${totalUploads === null ? "—" : totalUploads}`
      : totalUploads ? `0 of ${totalUploads} loaded` : "No uploads";
    updateNavigationButtons();

    if (isReviewWorkspace || !grid) return;
    grid.innerHTML = "";

    if (!uploads.length) {
      grid.innerHTML = `<div class="feed-empty">No uploaded images yet.</div>`;
      return;
    }

    uploads.forEach((file, index) => {
      const scan = plGetScanResultById(file.scanId);
      const fileResult = scan ? { statusClass: plNormalizeStatus(scan.overall_status) === "quarantined" ? "danger" : scan.human_review_required ? "warning" : "safe" } : { statusClass: "unknown" };
      let tagColor = "green";
      if (fileResult.statusClass === "danger") tagColor = "red";
      if (fileResult.statusClass === "warning") tagColor = "yellow";
      if (fileResult.statusClass === "unknown") tagColor = "gray";

      const card = document.createElement("div");
      card.className = `finder-file-card ${index === activeIndex ? "active" : ""}`;
      if (file.isNewGlow) {
        card.classList.add("new-file-glow");
        setTimeout(() => {
          card.classList.remove("new-file-glow");
          delete file.isNewGlow;
        }, 3000);
      }

      const tag = document.createElement("span");
      tag.className = `finder-tag-dot ${tagColor}`;
      card.appendChild(tag);

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "finder-thumbnail-wrap";
      const imgSrc = plDisplayableImageUrl(file.thumbnailSrc);
      if (imgSrc) {
        const thumb = document.createElement("img");
        thumb.src = imgSrc;
        thumb.alt = file.name || "Uploaded image";
        thumb.addEventListener("error", () => {
          thumb.replaceWith(Object.assign(document.createElement("div"), { className: "finder-file-placeholder", innerHTML: '<i class="fa-solid fa-image"></i>' }));
        }, { once: true });
        thumbWrap.appendChild(thumb);
      } else {
        thumbWrap.innerHTML = `<div class="finder-file-placeholder"><i class="fa-solid fa-image"></i></div>`;
      }
      card.appendChild(thumbWrap);

      const filename = document.createElement("div");
      filename.className = "finder-filename";
      filename.title = file.name;
      filename.textContent = file.name;
      card.appendChild(filename);

      card.addEventListener("click", () => {
        selectScan(index);
      });

      grid.appendChild(card);
    });
  }

  function loadActiveImage() {
    const activeFile = uploads[activeIndex];
    if (!activeFile || !activeScan) {
      renderEmptyResult();
      return;
    }
    if (activeBeltTitle) {
      activeBeltTitle.textContent = activeFile.name;
      activeBeltTitle.title = activeFile.name;
    }
    if (resultSourceState) {
      resultSourceState.textContent = ["tracked_video_object", "video_track_object"].includes(activeScan?.result_kind) || activeScan?.source_type === "tracked_video"
        ? "Tracked video result"
        : activeScan?.legacy_result
          ? "Legacy frame-based video result"
          : "Image result";
    }
    renderAnnotatedVideoPanel(activeScan);

    activeImageObj = new Image();
    activeImageObj.onload = function () {
      drawCanvasFrame();
    };
    activeImageObj.onerror = function () {
      console.info("[result] preview image failed", activeScan.id, activeImageObj.src);
      if (activeFile.dataUrl && activeImageObj.src !== activeFile.dataUrl) {
        activeImageObj = new Image();
        activeImageObj.onload = function () {
          drawCanvasFrame();
        };
        activeImageObj.onerror = function () {
          console.info("[result] cached preview failed", activeScan.id);
          activeImageObj = null;
          drawEmptyScanCanvas("No image preview");
        };
        activeImageObj.src = activeFile.dataUrl;
        return;
      }
      activeImageObj = null;
      drawEmptyScanCanvas("No image preview");
    };
    if (activeFile.assetPath) {
      activeImageObj.src = activeFile.assetPath;
    } else if (activeFile.dataUrl) {
      activeImageObj.src = activeFile.dataUrl;
    } else {
      activeImageObj = null;
      console.info("[result] preview image_url", activeScan.id, "");
      drawEmptyScanCanvas("No image preview");
      updateResultDetails({
        category: activeScan.detected_materials?.[0]?.category || "unknown",
        confidence: `${Math.round(plConfidencePercent(activeScan.overall_confidence))}%`,
        statusClass: plNormalizeStatus(activeScan.overall_status) === "quarantined" ? "danger" : activeScan.human_review_required ? "warning" : "safe",
        status: activeScan.overall_status,
        instruction: activeScan.recommended_action
      }, activeFile);
      return;
    }
    console.info("[result] preview image_url", activeScan.id, activeImageObj.src);

    const result = {
      category: activeScan.detected_materials?.[0]?.category || "unknown",
      confidence: `${Math.round(plConfidencePercent(activeScan.overall_confidence))}%`,
      statusClass: plNormalizeStatus(activeScan.overall_status) === "quarantined" ? "danger" : activeScan.human_review_required ? "warning" : "safe",
      status: activeScan.overall_status,
      instruction: activeScan.recommended_action
    };
    updateResultDetails(result, activeFile);
  }

  function renderEmptyResult() {
    activeImageObj = null;
    renderAnnotatedVideoPanel(null);
    if (activeBeltTitle) {
      activeBeltTitle.textContent = "No scan selected";
      activeBeltTitle.title = "No scan selected";
    }
    if (itemsScannedEl) itemsScannedEl.textContent = "0 items";
    if (itemsPurityEl) itemsPurityEl.textContent = "0%";
    const marketValueEl = document.getElementById("liveMarketValue");
    const reviewNeededEl = document.getElementById("liveReviewNeeded");
    if (marketValueEl) marketValueEl.textContent = plFormatRm(0);
    if (reviewNeededEl) reviewNeededEl.textContent = "No data";
    if (liveFeed) liveFeed.innerHTML = `<div class="feed-empty">No scan selected. Upload an image to generate results.</div>`;
    if (actionText) {
      actionText.innerHTML = `
        <strong>No results yet</strong>
        <p>Upload an image and run a scan to create model output.</p>
      `;
    }
    if (canvas && ctx2d) {
      drawEmptyScanCanvas("No scan data");
    }
    if (reviewCategorySelect) {
      reviewCategorySelect.value = "";
      reviewCategorySelect.disabled = true;
    }
    if (reviewVerifyButton) reviewVerifyButton.disabled = true;
    if (reviewRejectButton) reviewRejectButton.disabled = true;
    if (reviewFeedback) reviewFeedback.textContent = "";
    ["reviewMetaSource", "reviewMetaTime", "reviewMetaStatus"].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = "-";
    });
  }

  function setReviewMediaMode(mode) {
    if (!isReviewWorkspace || !reviewMediaTabs || !detectedObjectsPanel || !annotatedVideoPanel) return;
    reviewMediaMode = mode === "annotated" ? "annotated" : "detected";
    const annotatedAvailable = annotatedVideoPanel.dataset.available === "true";
    const showAnnotated = annotatedAvailable && reviewMediaMode === "annotated";
    detectedObjectsPanel.hidden = showAnnotated;
    annotatedVideoPanel.hidden = !showAnnotated;
    reviewDetectedObjectsTab?.classList.toggle("active", !showAnnotated);
    reviewAnnotatedVideoTab?.classList.toggle("active", showAnnotated);
    reviewDetectedObjectsTab?.setAttribute("aria-selected", String(!showAnnotated));
    reviewAnnotatedVideoTab?.setAttribute("aria-selected", String(showAnnotated));
    if (!showAnnotated) drawCanvasFrame();
  }

  function renderAnnotatedVideoPanel(scan) {
    if (!annotatedVideoPanel || !annotatedVideoBody) return;
    const isVideoScan = ["tracked_video_object", "video_track_object"].includes(scan?.result_kind) || scan?.source_type === "tracked_video" || Boolean(scan?.annotated_video_status || scan?.annotated_video_url);
    if (!scan || !isVideoScan) {
      if (reviewMediaTabs) reviewMediaTabs.hidden = true;
      annotatedVideoPanel.dataset.available = "false";
      annotatedVideoPanel.hidden = true;
      if (detectedObjectsPanel) detectedObjectsPanel.hidden = false;
      annotatedVideoBody.innerHTML = "";
      if (annotatedVideoStatus) annotatedVideoStatus.textContent = "Unavailable";
      return;
    }
    const status = plNormalizeStatus(scan.annotated_video_status || "unavailable");
    const videoUrl = plDisplayableImageUrl(scan.annotated_video_url || "");
    annotatedVideoPanel.dataset.available = "true";
    if (reviewMediaTabs) reviewMediaTabs.hidden = false;
    if (!isReviewWorkspace) annotatedVideoPanel.hidden = false;
    if (annotatedVideoStatus) {
      annotatedVideoStatus.textContent = ({
        ready: "Ready",
        uploaded: "Ready",
        processing: "Processing",
        failed: "Failed",
        expired: "Expired",
        unavailable: "Unavailable"
      })[status] || plNormalizeCategory(status || "unavailable");
    }
    if (videoUrl && (status === "ready" || status === "uploaded")) {
      annotatedVideoBody.innerHTML = `
        <video class="annotated-result-video" controls preload="metadata" playsinline poster="${plEscapeHtml(scan.preview_image_url || "")}">
          <source src="${plEscapeHtml(videoUrl)}" type="video/mp4">
          Your browser does not support MP4 video playback.
        </video>
        <a class="annotated-video-download" href="${plEscapeHtml(videoUrl)}" download>Download annotated MP4</a>
        <p class="annotated-video-note">Annotated video output. Frame results remain available below.</p>
      `;
      const video = annotatedVideoBody.querySelector("video");
      video?.addEventListener("error", () => {
        if (annotatedVideoStatus) annotatedVideoStatus.textContent = "Expired";
        annotatedVideoBody.querySelector(".annotated-video-note").textContent = "The annotated video URL could not be loaded. It may be expired; refresh the scan result to request a fresh URL.";
      }, { once: true });
    } else if (status === "processing") {
      annotatedVideoBody.innerHTML = `<p class="feed-empty">Annotated video is still being generated. Refresh this result shortly.</p>`;
    } else if (status === "expired") {
      annotatedVideoBody.innerHTML = `<p class="feed-empty">Annotated video URL has expired. Refresh this result to request a fresh signed URL.</p>`;
    } else if (status === "failed") {
      annotatedVideoBody.innerHTML = `<p class="feed-empty">Annotated video generation failed${scan.annotated_video_error ? `: ${plEscapeHtml(scan.annotated_video_error)}` : "."} Frame results were preserved.</p>`;
    } else {
      annotatedVideoBody.innerHTML = scan.legacy_result
        ? `<p class="feed-empty">Annotated video was not generated for this earlier scan. Frame results are shown below.</p>`
        : `<p class="feed-empty">Annotated video is unavailable for this scan. Frame results are shown below.</p>`;
    }
    if (isReviewWorkspace) setReviewMediaMode(reviewMediaMode);
  }

  function setReviewWorkspaceControls(materials) {
    if (!isReviewWorkspace || !reviewCategorySelect || !reviewVerifyButton || !reviewRejectButton) return;
    const primaryMaterial = materials[0];
    const primaryDecision = plEvaluateMaterial(primaryMaterial, activeScan);
    const unresolved = materials.find(material => plEvaluateMaterial(material, activeScan).reviewRequired) || null;
    activeReviewMaterial = unresolved;
    const selectedCategory = plCategoryKey((unresolved || primaryMaterial)?.category);

    reviewCategorySelect.value = Object.keys(PL_CATEGORY_CLASS_MAP).includes(selectedCategory) ? selectedCategory : "";
    reviewCategorySelect.disabled = !unresolved || isReviewSaving;
    reviewVerifyButton.disabled = !unresolved || !reviewCategorySelect.value || isReviewSaving;
    reviewRejectButton.disabled = !unresolved || !reviewCategorySelect.value || isReviewSaving;
    if (reviewFeedback && !isReviewSaving) reviewFeedback.textContent = "";

    const source = document.getElementById("reviewMetaSource");
    const uploaded = document.getElementById("reviewMetaTime");
    const status = document.getElementById("reviewMetaStatus");
    if (source) source.textContent = activeScan?.source_name || activeScan?.id || "-";
    if (uploaded) uploaded.textContent = activeScan?.created_at ? plFormatScanTime(activeScan) : "-";
    if (status) status.textContent = primaryDecision.displayStatus || "-";
  }

  async function saveReviewFromWorkspace(outcome) {
    if (!activeScan || !activeReviewMaterial || !reviewCategorySelect?.value || isReviewSaving) return;
    isReviewSaving = true;
    if (reviewFeedback) reviewFeedback.textContent = "";
    if (reviewVerifyButton) reviewVerifyButton.disabled = true;
    if (reviewRejectButton) reviewRejectButton.disabled = true;
    if (reviewCategorySelect) reviewCategorySelect.disabled = true;
    try {
      const savedReview = await plSaveReview(activeScan, activeReviewMaterial, reviewCategorySelect.value, outcome);
      activeScan = plGetScanResultById(activeScan.id) || activeScan;
      showToast(savedReview.refreshWarning || (outcome === "rejected" ? "Result rejected." : "Review saved."), savedReview.refreshWarning ? "warning" : "success");
      renderFinderGrid();
      loadActiveImage();
      if (isReviewWorkspace && activeScan) {
        window.dispatchEvent(new CustomEvent("purityloop:review-scan-selected", { detail: { scanId: activeScan.id } }));
      }
    } catch (error) {
      if (reviewFeedback) reviewFeedback.textContent = error.message || "Unable to save review.";
    } finally {
      isReviewSaving = false;
      if (activeScan?.detected_materials) setReviewWorkspaceControls(activeScan.detected_materials);
    }
  }

  reviewCategorySelect?.addEventListener("change", () => {
    const enabled = Boolean(activeReviewMaterial && reviewCategorySelect.value && !isReviewSaving);
    if (reviewVerifyButton) reviewVerifyButton.disabled = !enabled;
    if (reviewRejectButton) reviewRejectButton.disabled = !enabled;
  });
  reviewDetectedObjectsTab?.addEventListener("click", () => setReviewMediaMode("detected"));
  reviewAnnotatedVideoTab?.addEventListener("click", () => setReviewMediaMode("annotated"));
  reviewVerifyButton?.addEventListener("click", () => saveReviewFromWorkspace("confirmed"));
  reviewRejectButton?.addEventListener("click", () => saveReviewFromWorkspace("rejected"));

  function drawEmptyScanCanvas(label) {
    if (!canvas || !ctx2d) return;
    const parent = canvas.parentElement;
    const rect = parent?.getBoundingClientRect?.() || { width: 640, height: 360 };
    canvas.width = rect.width || 640;
    canvas.height = rect.height || Math.round(canvas.width * (9 / 16));
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const isLightTheme = document.documentElement.dataset.theme === "light";
    ctx2d.fillStyle = isLightTheme ? "#e7efe9" : "#0c1812";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.fillStyle = isLightTheme ? "#506259" : "#a9bbb0";
    ctx2d.font = "600 15px 'IBM Plex Sans', Arial";
    ctx2d.textAlign = "center";
    ctx2d.fillText(label, canvas.width / 2, canvas.height / 2);
  }

  function getActiveBoxes() {
    if (!activeScan) return [];
    const isTrackedVideo = ["tracked_video_object", "video_track_object"].includes(activeScan.result_kind) || activeScan.source_type === "tracked_video";
    if (isTrackedVideo) {
      const hasOriginalFramePreview = plSafeArray(activeScan.detected_materials).some(material => material?.track_debug?.representative_frame_dimensions);
      if (!hasOriginalFramePreview) {
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          console.info("[review-preview] Skipping overlay for legacy crop-based tracked-video preview.", { scanId: activeScan.id });
        }
        return [];
      }
    }
    return plMaterialsToBoxes(activeScan.detected_materials);
  }

  function getActiveTrackPath() {
    const material = activeScan?.detected_materials?.[0];
    return plSafeArray(material?.track_path).filter(point => Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)));
  }

  function updateResultDetails(result, file) {
    const scannedVal = document.getElementById("liveScanned");
    const purityVal = document.getElementById("livePurity");
    const actionPanel = document.getElementById("liveActionPanel");

    const boxes = getActiveBoxes();
    document.body.classList.remove("result-detected");
    requestAnimationFrame(() => document.body.classList.add("result-detected"));

    const materials = activeScan?.detected_materials?.length ? activeScan.detected_materials : plBoxesToMaterials(boxes);
    const confirmedMaterials = materials.filter(material => {
      const decision = plEvaluateMaterial(material, activeScan);
      return !decision.reviewRequired && decision.materialClass !== "unknown";
    });
    const recyclableCount = confirmedMaterials.filter(material => plIsRecyclable(material, activeScan)).length;
    const purityPct = confirmedMaterials.length ? Math.round((recyclableCount / confirmedMaterials.length) * 100) : 0;

    if (scannedVal) scannedVal.textContent = `${boxes.length} items`;
    if (purityVal) {
      purityVal.textContent = `${purityPct}%`;

      const ringFill = document.getElementById("purityRingFill");
      const circumference = 314.16;
      const offset = circumference - (purityPct / 100) * circumference;

      if (ringFill) {
        ringFill.style.strokeDashoffset = offset;
      }

      // Color-code the purity value
      if (purityPct === 100) {
        purityVal.style.color = "var(--green)";
        if (ringFill) ringFill.style.stroke = "var(--green)";
      } else if (purityPct >= 70) {
        purityVal.style.color = "var(--warning)";
        if (ringFill) ringFill.style.stroke = "var(--warning)";
      } else {
        purityVal.style.color = "var(--danger)";
      }
    }

    const marketValueEl = document.getElementById("liveMarketValue");
    const reviewNeededEl = document.getElementById("liveReviewNeeded");
    if (marketValueEl) marketValueEl.textContent = plFormatRm(materials.reduce((sum, material) => sum + getEstimatedResaleValueRm(material), 0));
    if (reviewNeededEl) {
      const reviewCount = materials.filter(material => plEvaluateMaterial(material, activeScan).reviewRequired).length;
      reviewNeededEl.textContent = reviewCount ? `${reviewCount} item${reviewCount === 1 ? "" : "s"}` : "No manual review";
    }

    // Next Steps Action Guide Generator
    if (actionText) {
      const reviewCount = materials.filter(material => plEvaluateMaterial(material, activeScan).reviewRequired).length;
      const primary = materials[0];
      const primaryDecision = plEvaluateMaterial(primary, activeScan);

      let actionHtml = "";
      const confirmedAiStatus = primaryDecision.materialClass === "contaminant" ? "Confirmed Contaminant" : "Confirmed Recyclable";
      const reviewStatusFooter = status => `<dl class="review-route-status"><div><dt>AI status</dt><dd>${status}</dd></div></dl>`;
      if (primaryDecision.decisionStatus === "rejected") {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card route-rejected";
        if (actionBadge) actionBadge.textContent = "Rejected";
        actionHtml = isReviewWorkspace ? `<div class="review-route-content"><span>Final decision</span><strong>Result Rejected</strong><p>This result has been rejected and will not be routed as a confirmed detection.</p>${reviewStatusFooter("Rejected")}</div>` : `<dl class="action-status-sheet"><div><dt>Status</dt><dd>Rejected</dd></div></dl>`;
      } else if (primaryDecision.decisionStatus === "verified") {
        if (actionPanel) actionPanel.className = `mini-panel action-panel bbox-card route-verified ${primaryDecision.materialClass === "contaminant" ? "contaminant-confirmed" : "recovery-clear"}`;
        if (actionBadge) actionBadge.textContent = "Verified";
        const description = primaryDecision.materialClass === "contaminant" ? "This verified contaminant should be removed from the recyclable stream." : "This verified result is ready for the indicated sorting stream.";
        actionHtml = isReviewWorkspace ? `<div class="review-route-content"><span>Sorting destination</span><strong>${primaryDecision.disposalRoute || "Route by material stream"}</strong><p>${description}</p>${reviewStatusFooter(confirmedAiStatus)}</div>` : `<dl class="action-status-sheet"><div><dt>Status</dt><dd>${confirmedAiStatus}</dd></div><div><dt>Recommended route</dt><dd>${primaryDecision.disposalRoute || "Route by material stream"}</dd></div></dl>`;
      } else if (reviewCount) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card route-review";
        if (actionBadge) actionBadge.textContent = "Awaiting human review";
        actionHtml = isReviewWorkspace ? `
          <div class="review-route-content">
            <span>Sorting decision</span>
            <strong>Manual Audit Queue</strong>
            <p>Choose a verified category before this item is routed.</p>
            ${reviewStatusFooter("Low confidence — review required")}
          </div>
        ` : `
          <dl class="action-status-sheet">
            <div><dt>Status</dt><dd>Awaiting human review</dd></div>
            <div><dt>Next Step</dt><dd>Manual Audit Queue</dd></div>
            <div><dt>Route (Proposed)</dt><dd>${PL_CATEGORY_ROUTES[primaryDecision.category] || "Route after confirmation"}</dd></div>
          </dl>
          <p class="action-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> This item will be routed to the Manual Audit Queue until a reviewer confirms the correct category.</p>
        `;
      } else {
        if (actionPanel) actionPanel.className = `mini-panel action-panel bbox-card route-auto ${primaryDecision.materialClass === "contaminant" ? "contaminant-confirmed" : "recovery-clear"}`;
        if (actionBadge) actionBadge.textContent = "Auto-confirmed";
        const description = primaryDecision.materialClass === "contaminant" ? "This confirmed contaminant should be removed from the recyclable stream." : "This result is ready for the indicated sorting stream.";
        actionHtml = isReviewWorkspace ? `
          <div class="review-route-content">
            <span>Sorting destination</span>
            <strong>${primaryDecision.disposalRoute || "Route by material stream"}</strong>
            <p>${description}</p>
            ${reviewStatusFooter(confirmedAiStatus)}
          </div>
        ` : `
          <dl class="action-status-sheet">
            <div><dt>Status</dt><dd>${primaryDecision.displayStatus}</dd></div>
            <div><dt>Recommended route</dt><dd>${primaryDecision.disposalRoute || "Route by material stream"}</dd></div>
          </dl>
          <p class="action-callout"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${plNormalizeCategory(primaryDecision.category)} is confirmed${primary?.review_decision ? " after human review" : " automatically"}.</p>
        `;
      }
      actionText.innerHTML = actionHtml;
    }

    if (liveFeed) {
      liveFeed.innerHTML = "";

      const primaryMaterial = materials[0];
      const primaryDecision = plEvaluateMaterial(primaryMaterial, activeScan);
      const primaryWeight = getEstimatedWeightKg(primaryDecision.category);
      const primaryValue = getEstimatedResaleValueRm(primaryDecision.category);
      const primaryRoute = PL_CATEGORY_ROUTES[primaryDecision.category] || "Route by material stream";
      const quantity = primaryMaterial?.quantity ?? primaryMaterial?.count ?? activeScan?.quantity ?? 1;
      const isTrackedVideo = ["tracked_video_object", "video_track_object"].includes(activeScan?.result_kind) || activeScan?.source_type === "tracked_video" || Boolean(primaryMaterial?.stable_object_id);
      const resultLabel = isTrackedVideo ? "Tracked video object" : activeScan?.legacy_result ? "Legacy frame-based video" : "Image result";
      const materialIcon = {
        battery: "fa-battery-full", plastic: "fa-bottle-water", metal: "fa-cube", glass: "fa-wine-bottle",
        paper: "fa-file-lines", cardboard: "fa-box", textile: "fa-shirt", food_organics: "fa-leaf", general_trash: "fa-trash-can"
      }[primaryDecision.category] || "fa-box";
      const summaryCard = document.createElement("section");
      const materialClassLabel = primaryDecision.materialClass === "contaminant" ? "Contaminant" : "Recyclable";
      summaryCard.className = `material-summary-card ${primaryDecision.reviewRequired ? "is-review" : ""} ${isReviewWorkspace ? "review-material-summary" : ""}`;
      summaryCard.innerHTML = isReviewWorkspace ? `
        <i class="fa-solid ${materialIcon}" aria-hidden="true"></i>
        <div class="review-material-identity">
          <strong>${plNormalizeCategory(primaryDecision.category)}</strong>
          <span class="review-material-class ${primaryDecision.materialClass}" title="${resultLabel}">${materialClassLabel}</span>
        </div>
      ` : `
        <i class="fa-solid ${materialIcon}" aria-hidden="true"></i>
        <div>
          <strong>${plNormalizeCategory(primaryDecision.category)}</strong>
          <span>${materialClassLabel} | ${primaryDecision.displayStatus} | Qty: 1</span>
        </div>
        <div class="material-confidence"><strong>${Math.round(primaryDecision.confidence)}%</strong><span>Confidence</span></div>
      `;
      liveFeed.appendChild(summaryCard);

      const metrics = document.createElement("dl");
      metrics.className = "material-metrics";
      metrics.innerHTML = isReviewWorkspace ? `
        <div><dt>Confidence</dt><dd>${Math.round(primaryDecision.confidence)}%</dd></div>
        <div><dt>Estimated Weight</dt><dd>${plDisplayWeight(primaryMaterial, activeScan)}</dd></div>
        <div><dt>Quantity</dt><dd>${quantity}</dd></div>
      ` : `
        <div><dt>Estimated Weight</dt><dd>${plFormatKg(primaryWeight)}</dd></div>
        <div><dt>Illustrative Recovery Value</dt><dd>${plFormatRm(primaryValue)}</dd></div>
        <div><dt>Recommended Route</dt><dd>${primaryDecision.reviewRequired ? primaryRoute : primaryDecision.disposalRoute}</dd></div>
      `;
      liveFeed.appendChild(metrics);
      const observations = plSafeArray(primaryMaterial?.track_debug?.frame_observations);
      if (isReviewWorkspace && observations.length) {
        const debugPanel = document.createElement("details");
        debugPanel.className = "track-observations-panel";
        debugPanel.innerHTML = `
          <summary>Frame observations (${observations.length})</summary>
          <div class="track-observations-list">
            ${observations.slice(0, 12).map(item => `<span>Frame ${Number(item.frame)} · ${Number(item.timestamp).toFixed(2)}s · ${Math.round(plConfidencePercent(item.confidence))}%</span>`).join("")}
            ${observations.length > 12 ? `<span>+ ${observations.length - 12} more observations</span>` : ""}
          </div>
        `;
        liveFeed.appendChild(debugPanel);
      }

      const unresolved = materials.find(material => plEvaluateMaterial(material, activeScan).reviewRequired);
      if (isReviewWorkspace) {
        setReviewWorkspaceControls(materials);
      } else if (unresolved?.id) {
        const reviewPanel = document.createElement("form");
        reviewPanel.className = "human-review-panel";
        reviewPanel.innerHTML = `
          <strong><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Low-confidence result - human review required</strong>
          <p>Please confirm or correct the predicted category.</p>
          <label>Correct category
            <select required aria-label="Correct category">
              <option value="">Select category</option>
              ${Object.keys(PL_CATEGORY_CLASS_MAP).map(category => `<option value="${category}">${plNormalizeCategory(category)}</option>`).join("")}
            </select>
          </label>
          <div class="category-choice-grid" aria-label="Official material categories">
            ${Object.keys(PL_CATEGORY_CLASS_MAP).map(category => `<button type="button" data-category="${category}" aria-pressed="false">${plNormalizeCategory(category)}</button>`).join("")}
          </div>
          <div class="review-actions"><button type="submit" class="primary-btn" disabled>Confirm</button><button type="button" class="secondary-btn">Cancel</button></div>
          <p class="review-feedback" role="status" aria-live="polite"></p>
        `;
        const select = reviewPanel.querySelector("select");
        const confirm = reviewPanel.querySelector('button[type="submit"]');
        const cancel = reviewPanel.querySelector('button[type="button"]');
        const feedback = reviewPanel.querySelector(".review-feedback");
        const setCategory = category => {
          select.value = category;
          confirm.disabled = !category;
          reviewPanel.querySelectorAll("[data-category]").forEach(button => {
            const isSelected = button.dataset.category === category;
            button.classList.toggle("is-selected", isSelected);
            button.setAttribute("aria-pressed", String(isSelected));
          });
        };
        select.addEventListener("change", () => setCategory(select.value));
        reviewPanel.querySelectorAll("[data-category]").forEach(button => button.addEventListener("click", () => setCategory(button.dataset.category)));
        cancel.addEventListener("click", () => { setCategory(""); feedback.textContent = "Selection discarded. Review still required."; });
        reviewPanel.addEventListener("submit", async event => {
          event.preventDefault();
          if (!select.value || !activeScan) return;
          const disposition = PL_CATEGORY_CLASS_MAP[select.value];
          confirm.disabled = true;
          cancel.disabled = true;
          confirm.textContent = "Saving…";
          feedback.textContent = "";
          try {
            const savedReview = await plSaveReview(activeScan, unresolved, select.value, "confirmed");
            activeScan = plGetScanResultById(activeScan.id) || activeScan;
            showToast(savedReview.refreshWarning || "Human review saved.", savedReview.refreshWarning ? "warning" : "success");
            renderFinderGrid();
            loadActiveImage();
          } catch (error) {
            feedback.textContent = error.message || "Unable to save review.";
            confirm.textContent = "Confirm";
            cancel.disabled = false;
            confirm.disabled = !select.value;
          }
        });
        liveFeed.appendChild(reviewPanel);
      }

    }

    renderStationDetail("UPLOAD-HUB", { activate: false });
    renderMaterialDetail(result.category, { activate: false });
  }

  // Helper to draw rounded rectangle pills
  function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();
  }

  function drawCanvasFrame() {
    if (!canvas || !activeImageObj) return;

    const parent = canvas.parentElement;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height || Math.round(rect.width * (9 / 16));

    // - 1. Draw full uploaded image without cropping (object-fit: contain style) -
    const imgW = activeImageObj.width;
    const imgH = activeImageObj.height;
    const scale = Math.min(canvas.width / imgW, canvas.height / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = (canvas.width - drawW) / 2;
    const drawY = (canvas.height - drawH) / 2;
    if ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && activeScan?.detected_materials?.length) {
      console.info("[review-preview] contain transform", {
        scanId: activeScan.id,
        source: { width: imgW, height: imgH },
        rendered: { width: Math.round(drawW), height: Math.round(drawH) },
        canvas: { width: canvas.width, height: canvas.height },
        offset: { x: Math.round(drawX), y: Math.round(drawY) },
        scale,
        bbox: activeScan.detected_materials[0]?.best_bbox_norm || activeScan.detected_materials[0]?.best_box || {
          x: activeScan.detected_materials[0]?.bbox_x,
          y: activeScan.detected_materials[0]?.bbox_y,
          width: activeScan.detected_materials[0]?.bbox_width,
          height: activeScan.detected_materials[0]?.bbox_height,
        },
      });
    }

    ctx2d.fillStyle = document.documentElement.dataset.theme === "light" ? "#dfe9e2" : "#07110d";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
    ctx2d.drawImage(activeImageObj, drawX, drawY, drawW, drawH);

    // - 2. Subtle dark vignette overlay (like NANDO AI dims the image slightly) -
    ctx2d.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);

    // - 3. Redraw image at 88% brightness on top (creates the "dim background" look) -
    ctx2d.globalAlpha = 0.88;
    ctx2d.drawImage(activeImageObj, drawX, drawY, drawW, drawH);
    ctx2d.globalAlpha = 1.0;

    // - 4. Draw all bounding boxes (NANDO AI static style) -
    const boxes = getActiveBoxes();

    boxes.forEach(box => {
      const boxX = drawX + drawW * box.x;
      const boxY = drawY + drawH * box.y;
      const boxW = drawW * box.w;
      const boxH = drawH * box.h;

      // Determine if this is a hazard/contaminant (red) vs recyclable (green/other)
      const isHazard = box.color === "#b42318" || box.color === "#ff8000" ||
        box.label.includes("Alert") || box.label.includes("Hazard") ||
        box.label.includes("Trash") || box.label.includes("Textile") ||
        box.label.includes("Film") || box.label.includes("Contaminant");
      const borderColor = isHazard ? "#e63030" : box.color;

      // Semi-transparent colored fill inside box (NANDO AI signature look)
      ctx2d.fillStyle = isHazard
        ? "rgba(240, 68, 56, 0.34)"
        : hexToRgba(borderColor, 0.30);
      ctx2d.fillRect(boxX, boxY, boxW, boxH);

      // Solid border - 2px, matches NANDO AI
      ctx2d.strokeStyle = borderColor;
      ctx2d.lineWidth = 2.4;
      ctx2d.strokeRect(boxX, boxY, boxW, boxH);

      // - Label tag at top-left of box (NANDO AI flat dark chip style) -
      ctx2d.font = "bold 11.5px 'Courier New', monospace";
      const rawLabel = box.label.replace(" Alert", "").replace(" Contaminant", "").toUpperCase().replace(/ /g, "_");
      const labelText = `${rawLabel} ${box.confidence}`;
      const textW = ctx2d.measureText(labelText).width;
      const tagW = textW + 14;
      const tagH = 21;
      const tagX = boxX;
      const tagY = boxY;

      // Dark chip background (exactly like NANDO AI - very dark, slight transparency)
      ctx2d.fillStyle = "rgba(4, 8, 6, 0.88)";
      ctx2d.fillRect(tagX, tagY, tagW, tagH);

      // Thin colored top border on tag (category color accent)
      ctx2d.fillStyle = borderColor;
      ctx2d.fillRect(tagX, tagY, tagW, 2);

      // White label text
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fillText(labelText, tagX + 7, tagY + 15);
    });

    const path = getActiveTrackPath();
    if (path.length > 1) {
      ctx2d.save();
      ctx2d.strokeStyle = "rgba(32, 178, 107, 0.92)";
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      path.forEach((point, index) => {
        const x = drawX + drawW * Number(point.x);
        const y = drawY + drawH * Number(point.y);
        if (index === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      });
      ctx2d.stroke();
      ctx2d.restore();
    }

    // - 5. Bottom telemetry bar (subtle, minimal - doesn't distract from image) -
    const hudY = canvas.height - 30;
    ctx2d.fillStyle = "rgba(4, 8, 6, 0.70)";
    ctx2d.fillRect(0, hudY, canvas.width, 30);
    ctx2d.fillStyle = "rgba(46, 204, 113, 0.85)";
    ctx2d.font = "10px 'Courier New', monospace";
    const now = new Date();
    const tsStr = now.toISOString().replace("T", "  ").substring(0, 19) + " UTC";
    ctx2d.fillText(`YOLOv8x  |  ${boxes.length} objects detected  |  ${tsStr}`, 14, hudY + 19);
  }

  // Utility: convert hex colour to rgba string
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }


  function triggerAuditLoggedNotification() {
    const badge = document.createElement("div");
    badge.className = "audit-badge-animation";
    badge.innerHTML = `Audit verified<br><strong>Logged to Ledger</strong>`;

    document.body.appendChild(badge);

    setTimeout(() => {
      badge.remove();
    }, 2800);

    if (!document.getElementById("badgeAnimStyles")) {
      const styles = document.createElement("style");
      styles.id = "badgeAnimStyles";
      styles.textContent = `
        .audit-badge-animation {
          position: fixed;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: var(--green-dark);
          color: #ffffff;
          border: 2px solid #20b26b;
          border-radius: var(--radius);
          padding: 20px 40px;
          text-align: center;
          font-size: 18px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          z-index: 9999;
          animation: floatUpBadge 2.8s ease-out;
        }
        @keyframes floatUpBadge {
          0% { opacity: 0; transform: translate(-50%, -30%); }
          15% { opacity: 1; transform: translate(-50%, -50%); }
          80% { opacity: 1; transform: translate(-50%, -50%); }
          100% { opacity: 0; transform: translate(-50%, -70%); }
        }
      `;
      document.head.appendChild(styles);
    }
  }
}

/**************************************
 * 3. VERIFICATION LEDGER AUDIT PAGE  *
 **************************************/
function initReviewWorkspace() {
  const list = document.getElementById("reviewHistoryList");
  const modal = document.getElementById("reviewHistoryModal");
  if (!list || !modal || list.dataset.historyReady === "true") return;
  list.dataset.historyReady = "true";
  const search = document.getElementById("historySearch");
  const date = document.getElementById("historyDate");
  const category = document.getElementById("historyCategory");
  const status = document.getElementById("historyStatus");
  const range = document.getElementById("historyRange");
  const pager = document.getElementById("historyPageButtons");
  const state = { page: 1, sort: "timestamp", direction: -1, bucket: "", selectedId: new URLSearchParams(location.search).get("scanId") || plGetLatestScanResult()?.id || "", items: [], total: 0, loading: false, error: "", requestId: 0 };
  const pageSize = 10;
  const escape = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const selectedId = () => state.selectedId;
  const scanRow = scan => {
    const material = scan.detected_materials?.[0] || {};
    const decision = plEvaluateMaterial(material, scan);
    const categoryKey = plCategoryKey(scan.verified_category || material.review_decision?.chosen_category || material.category || material.material_name);
    const row = plScanToLedger(scan, material);
    return { scan, id: scan.id, scanId: scan.id, materialId: material.id || "", source: scan.source_name || scan.id, sourceTypeLabel: row.sourceTypeLabel, duration: row.duration, preview: scan.preview_image_url || "", category: plNormalizeCategory(categoryKey), categoryKey, materialClass: decision.materialClass === "contaminant" ? "Contaminant" : "Recyclable", weight: plDisplayWeight(material, scan), confidence: Math.round(plConfidencePercent(scan.overall_confidence || material.confidence)), timestamp: new Date(scan.created_at).getTime(), time: plFormatScanTime(scan), decisionStatus: decision.decisionStatus, status: decision.displayStatus };
  };
  const labelForBucket = bucket => ({ review_needed: "Review Needed", rejected: "Rejected" })[bucket] || "";
  const reviewStatusParam = () => {
    const selectedStatus = labelForBucket(state.bucket) || String(status?.value || "");
    if (selectedStatus === "Review Needed") return "review_needed";
    if (selectedStatus === "Rejected") return "rejected";
    if (selectedStatus.startsWith("Confirmed") || selectedStatus === "Verified") return "confirmed";
    return "";
  };
  const reviewHistoryParams = (limit, offset) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      sort: state.sort,
      direction: state.direction === -1 ? "desc" : "asc"
    });
    const statusValue = reviewStatusParam();
    if (search?.value.trim()) params.set("search", search.value.trim());
    if (category?.value) params.set("category", category.value);
    if (statusValue) params.set("status", statusValue);
    if (date?.value) {
      const start = new Date(`${date.value}T00:00:00+08:00`);
      const end = new Date(start.getTime() + 86400000);
      params.set("start_date", start.toISOString());
      params.set("end_date", end.toISOString());
    }
    return params;
  };
  const currentRows = () => state.items.map(scanRow);
  const exportParams = (params, format, scope) => { params.delete("limit"); params.delete("offset"); params.set("format", format); params.set("scope", scope); return params; };
  const filenameFromDisposition = (value, fallback) => {
    const match = String(value || "").match(/filename="?([^";]+)"?/i);
    return match ? match[1] : fallback;
  };
  const downloadHistoryExport = async (button, format, params, fallbackName) => {
    if (!button || button.dataset.exporting === "true") return;
    const original = button.innerHTML;
    button.dataset.exporting = "true";
    button.disabled = true;
    button.textContent = format === "pdf" ? "Preparing PDF..." : "Preparing Excel...";
    try {
      const response = await plBackendFetch(`${plApiBaseUrl()}/api/history/export?${params}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Unable to export history.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFromDisposition(response.headers.get("content-disposition"), fallbackName);
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      showToast(error.message || "Unable to export history.", "error");
    } finally {
      button.innerHTML = original;
      button.disabled = false;
      delete button.dataset.exporting;
    }
  };
  const activateTab = name => {
    const tab = name === "history" ? "history" : "selected";
    document.getElementById("reviewHistoryPanel")?.classList.toggle("is-active-tab", tab === "history");
    document.getElementById("reviewSelectedPanel")?.classList.toggle("is-active-tab", tab === "selected");
    document.getElementById("reviewTabHistory")?.classList.toggle("active", tab === "history");
    document.getElementById("reviewTabSelected")?.classList.toggle("active", tab === "selected");
    document.getElementById("reviewTabHistory")?.setAttribute("aria-selected", String(tab === "history"));
    document.getElementById("reviewTabSelected")?.setAttribute("aria-selected", String(tab === "selected"));
  };
  const select = id => {
    state.selectedId = id;
    activateTab("selected");
    window.dispatchEvent(new CustomEvent("purityloop:review-select-scan", { detail: { scanId: id } }));
  };
  const renderPager = (root, page, pages, onPage) => {
    if (!root) return;
    const choices = [...new Set([1, pages, page - 1, page, page + 1].filter(item => item >= 1 && item <= pages))].sort((a, b) => a - b);
    root.innerHTML = `<button type="button" data-review-page="${Math.max(1, page - 1)}" ${page === 1 ? "disabled" : ""}>‹</button>${choices.map((item, index) => `${index && item - choices[index - 1] > 1 ? '<span aria-hidden="true">…</span>' : ""}<button type="button" data-review-page="${item}" ${item === page ? 'aria-current="page" class="active"' : ""}>${item}</button>`).join("")}<button type="button" data-review-page="${Math.min(pages, page + 1)}" ${page === pages ? "disabled" : ""}>›</button>`;
    root.querySelectorAll("[data-review-page]").forEach(button => button.addEventListener("click", () => onPage(Number(button.dataset.reviewPage))));
  };
  const updateSummary = () => {
    const summary = plScanHistoryMeta.summary || {};
    const total = Number.isFinite(Number(plScanHistoryMeta.total)) ? Number(plScanHistoryMeta.total) : state.total;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const pageRows = currentRows();
    set("historyProcessedToday", total); set("historyConfirmed", summary.confirmed ?? pageRows.filter(row => row.decisionStatus === "confirmed").length); set("historyReviewCount", summary.needs_review ?? pageRows.filter(row => row.decisionStatus === "review_needed").length); set("historyRejected", summary.rejected ?? pageRows.filter(row => row.decisionStatus === "rejected").length);
  };
  const render = () => {
    updateSummary();
    const visible = currentRows();
    const pages = Math.max(1, Math.ceil(state.total / pageSize));
    state.page = Math.min(state.page, pages);
    list.innerHTML = state.loading ? '<div class="feed-empty">Loading scans...</div>' : (state.error ? `<div class="feed-empty">${escape(state.error)}</div>` : (visible.length ? visible.map(row => `<button type="button" class="review-history-row ${row.id === selectedId() ? "is-selected" : ""}" data-select-scan="${escape(row.id)}" aria-pressed="${row.id === selectedId()}"><span class="review-history-thumb">${row.preview ? `<img src="${escape(row.preview)}" alt="${escape(row.category)} preview" />` : '<i class="fa-regular fa-image" aria-hidden="true"></i>'}</span><span class="review-history-main"><strong>${escape(row.category)}</strong><small>${escape(row.sourceTypeLabel)} · ${escape(row.duration || row.time)} · ${row.confidence}% confidence</small></span><span class="status-pill ${row.decisionStatus === "review_needed" ? "review" : row.decisionStatus === "rejected" ? "quarantine" : "cleared"}">${escape(row.status)}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join("") : '<div class="feed-empty">No scan history matches these filters.</div>'));
    list.querySelectorAll("[data-select-scan]").forEach(button => button.addEventListener("click", () => select(button.dataset.selectScan)));
    if (range) range.textContent = state.loading ? "Loading scans" : `Showing ${visible.length ? (state.page - 1) * pageSize + 1 : 0} to ${Math.min(state.page * pageSize, state.total)} loaded results of ${state.total} total`;
    renderPager(pager, state.page, pages, page => fetchReviewPage(page));
    const index = visible.findIndex(row => row.id === selectedId());
    const absoluteIndex = index >= 0 ? (state.page - 1) * pageSize + index : -1;
    window.dispatchEvent(new CustomEvent("purityloop:review-navigation-state", { detail: { hasPrevious: absoluteIndex > 0, hasNext: absoluteIndex >= 0 && absoluteIndex < state.total - 1 } }));
  };
  const fetchReviewPage = async (page = state.page, options = {}) => {
    const requestId = ++state.requestId;
    state.page = Math.max(1, page);
    state.loading = true;
    render();
    try {
      const response = await plBackendFetch(`${plApiBaseUrl()}/api/scans?${reviewHistoryParams(pageSize, (state.page - 1) * pageSize)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Unable to load scan history.");
      if (requestId !== state.requestId) return;
      state.error = "";
      state.items = (payload.items || []).map(plNormalizeScan).filter(Boolean);
      plMergeScanResults(state.items);
      window.dispatchEvent(new Event("purityloop:scan-cache-updated"));
      state.total = Number(payload.total) || 0;
      const pages = Math.max(1, Math.ceil(state.total / pageSize));
      if (state.page > pages) {
        state.loading = false;
        return fetchReviewPage(pages, options);
      }
      if (payload.summary && !search?.value.trim() && !category?.value && !date?.value && !reviewStatusParam()) {
        plScanHistoryMeta = {
          ...plScanHistoryMeta,
          total: state.total,
          limit: Number(payload.limit) || pageSize,
          offset: Number(payload.offset) || 0,
          summary: payload.summary
        };
        plSetJson(PL_SCAN_META_KEY, plScanHistoryMeta);
      }
      if (options.selectEdge && state.items.length) {
        select(options.selectEdge === "last" ? state.items[state.items.length - 1].id : state.items[0].id);
      }
    } catch (error) {
      if (requestId === state.requestId) {
        state.items = [];
        state.error = error.message || "Unable to load history.";
        showToast(error.message || "Unable to load scan history.", "error");
      }
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        render();
      }
    }
  };
  window.plReviewNavigateScan = direction => {
    const all = currentRows();
    const index = all.findIndex(row => row.id === selectedId());
    const target = all[index + direction];
    if (target) {
      select(target.id);
      render();
      return true;
    }
    const pages = Math.max(1, Math.ceil(state.total / pageSize));
    const targetPage = direction < 0 ? state.page - 1 : state.page + 1;
    if (targetPage < 1 || targetPage > pages) return false;
    fetchReviewPage(targetPage, { selectEdge: direction < 0 ? "last" : "first" });
    return true;
  };
  const applyFilters = () => { state.page = 1; fetchReviewPage(1); };
  [search, date].forEach(input => input?.addEventListener("input", () => { state.bucket = ""; applyFilters(); }));
  category?.addEventListener("change", () => { state.bucket = ""; applyFilters(); });
  status?.addEventListener("change", () => { state.bucket = ""; applyFilters(); });
  document.querySelectorAll(".review-summary-card[data-kpi-filter]").forEach(card => {
    const activate = () => { state.bucket = card.dataset.kpiFilter || ""; if (status) status.value = labelForBucket(state.bucket); state.page = 1; fetchReviewPage(1); activateTab("history"); };
    card.addEventListener("click", activate); card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); } });
  });
  document.querySelectorAll(".review-tab").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  document.querySelectorAll(".history-sort").forEach(button => button.addEventListener("click", () => { const next = button.dataset.sort || (button.id.includes("Confidence") ? "confidence" : "timestamp"); state.direction = state.sort === next ? -state.direction : -1; state.sort = next; document.querySelectorAll(".review-filter-toolbar .history-sort").forEach(item => item.classList.toggle("active", item.dataset.sort === next)); applyFilters(); }));
  let modalOpener = null; let modalState = { page: 1, sort: "timestamp", direction: "desc" }; let remote = { items: [], total: 0 };
  const fullSearch = document.getElementById("fullHistorySearch"), fullDate = document.getElementById("fullHistoryDate"), fullCategory = document.getElementById("fullHistoryCategory"), fullStatus = document.getElementById("fullHistoryStatus"), fullBody = document.getElementById("fullHistoryTableBody"), fullRange = document.getElementById("reviewHistoryModalRange"), fullPager = document.getElementById("fullHistoryPageButtons");
  const auditModal = document.getElementById("auditReviewModal"), auditTitle = document.getElementById("auditReviewTitle"), auditDescription = document.getElementById("auditReviewDescription"), auditBanner = document.getElementById("auditReviewBanner"), auditPreview = document.getElementById("auditReviewPreview"), auditPrediction = document.getElementById("auditReviewPrediction"), auditConfidence = document.getElementById("auditReviewConfidence"), auditWeight = document.getElementById("auditReviewWeight"), auditClass = document.getElementById("auditReviewClass"), auditFinalCategory = document.getElementById("auditReviewFinalCategory"), auditStatus = document.getElementById("auditReviewStatus"), auditTimestamp = document.getElementById("auditReviewTimestamp"), auditQuantity = document.getElementById("auditReviewQuantity"), auditQuantityRow = document.getElementById("auditReviewQuantityRow"), auditCategory = document.getElementById("auditReviewCategory"), auditFeedback = document.getElementById("auditReviewFeedback"), auditVerify = document.getElementById("auditReviewVerify"), auditReject = document.getElementById("auditReviewReject");
  let auditScan = null, auditMaterial = null, auditSubmitting = false, auditMode = "review", auditSession = null;
  const closeFullHistory = () => { auditSession = null; modal.classList.remove("active"); modal.setAttribute("aria-hidden", "true"); document.body.classList.remove("review-history-modal-open"); modalOpener?.focus(); };
  const restoreAuditHistory = async refresh => {
    const session = auditSession; auditSession = null;
    if (!session) return;
    modal.classList.add("active"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("review-history-modal-open");
    if (refresh) await fetchFullHistory();
    requestAnimationFrame(() => {
      modal.querySelector(".review-history-modal-body")?.scrollTo({ top: session.scrollTop });
      const target = [...fullBody.querySelectorAll("[data-full-history-action]")].find(button => button.dataset.fullHistoryAction === session.scanId);
      (target || session.opener)?.focus();
    });
  };
  const closeAuditReview = async (force = false, refresh = false) => {
    if (!auditModal || (auditSubmitting && !force)) return;
    auditModal.classList.remove("active", "audit-readonly"); auditModal.setAttribute("aria-hidden", "true"); document.body.classList.remove("audit-review-modal-open");
    auditScan = null; auditMaterial = null; auditFeedback.textContent = ""; await restoreAuditHistory(refresh);
  };
  const resolveAuditScan = async (scanId, materialId = "") => {
    let scan = remote.items.find(item => item.id === scanId) || plGetScanResultById(scanId);
    if (!scan?.detected_materials?.length || (materialId && !scan.detected_materials.some(item => item.id === materialId))) {
      const response = await plBackendFetch(`${plApiBaseUrl()}/api/scans/${encodeURIComponent(scanId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Unable to load selected scan.");
      scan = plNormalizeScan(payload.scan_result);
    }
    return scan;
  };
  const openAuditDetails = async (scanId, materialId, mode, opener) => {
    if (!auditModal || auditSubmitting) return;
    try {
      const scan = await resolveAuditScan(scanId, materialId); const material = scan.detected_materials?.find(item => item.id === materialId) || scan.detected_materials?.[0];
      if (!material) throw new Error("Selected scan has no reviewable material.");
      const decision = plEvaluateMaterial(material, scan), category = scan.verified_category || material.review_decision?.chosen_category || material.category;
      auditScan = scan; auditMaterial = material; auditMode = mode;
      auditSession = { scanId, materialId, opener, scrollTop: modal.querySelector(".review-history-modal-body")?.scrollTop || 0 };
      auditTitle.textContent = mode === "view" ? `View ${plNormalizeCategory(category)} Result` : `Review ${plNormalizeCategory(material.category)}`;
      auditDescription.textContent = mode === "view" ? "View the saved scan details and review decision." : "Confirm the AI result, correct the category, or reject this result.";
      auditBanner.textContent = mode === "view" ? ({ verified: "VERIFIED RESULT", rejected: "REJECTED RESULT", confirmed: decision.materialClass === "contaminant" ? "CONFIRMED CONTAMINANT" : "CONFIRMED RECYCLABLE" }[decision.decisionStatus] || decision.displayStatus.toUpperCase()) : "LOW CONFIDENCE - HUMAN AUDIT REQUIRED";
      auditPrediction.textContent = plNormalizeCategory(material.category); auditConfidence.textContent = `${Math.round(plConfidencePercent(material.confidence || scan.overall_confidence))}%`; auditWeight.textContent = plDisplayWeight(material, scan); auditClass.textContent = plNormalizeCategory(decision.materialClass); auditFinalCategory.textContent = plNormalizeCategory(category); auditStatus.textContent = decision.displayStatus; auditTimestamp.textContent = plFormatScanTime(scan); auditCategory.value = plCategoryKey(category);
      const quantity = material.quantity ?? material.count ?? scan.quantity;
      auditQuantityRow.hidden = quantity === null || quantity === undefined || quantity === ""; if (!auditQuantityRow.hidden) auditQuantity.textContent = String(quantity);
      const preview = scan.preview_image_url || scan.image_url || "";
      auditPreview.hidden = !preview; if (preview) auditPreview.src = preview; else auditPreview.removeAttribute("src");
      auditModal.classList.toggle("audit-readonly", mode === "view"); modal.classList.remove("active"); modal.setAttribute("aria-hidden", "true"); document.body.classList.remove("review-history-modal-open"); auditModal.classList.add("active"); auditModal.setAttribute("aria-hidden", "false"); document.body.classList.add("audit-review-modal-open");
      requestAnimationFrame(() => auditModal.querySelector("[role=dialog]")?.focus());
    } catch (error) { showToast(error.message || "Unable to open review.", "error"); opener?.focus(); }
  };
  const saveAuditReview = async outcome => {
    if (auditMode !== "review" || auditSubmitting || !auditScan || !auditMaterial) return;
    auditSubmitting = true; auditFeedback.textContent = ""; auditVerify.disabled = true; auditReject.disabled = true; auditCategory.disabled = true;
    try {
      const savedReview = await plSaveReview(auditScan, auditMaterial, auditCategory.value, outcome);
      await fetchReviewPage(state.page); await closeAuditReview(true, true); showToast(savedReview.refreshWarning || (outcome === "rejected" ? "Result rejected." : "Review saved."), savedReview.refreshWarning ? "warning" : "success");
    } catch (error) { auditFeedback.textContent = error.message || "Unable to save review."; }
    finally { auditSubmitting = false; auditVerify.disabled = false; auditReject.disabled = false; auditCategory.disabled = false; }
  };
  const fetchFullHistory = async () => {
    const params = fullHistoryParams(pageSize, (modalState.page - 1) * pageSize);
    fullRange.textContent = "Loading scans";
    try { const response = await plBackendFetch(`${plApiBaseUrl()}/api/scans?${params}`); const payload = await response.json(); if (!response.ok) throw new Error(payload.detail || "Unable to load history."); remote = { items: (payload.items || []).map(plNormalizeScan), total: Number(payload.total) || 0 }; }
    catch (error) { remote = { items: [], total: 0 }; showToast(error.message || "Unable to load history.", "error"); }
    const historyRows = remote.items.map(scanRow);
    fullBody.innerHTML = historyRows.length ? historyRows.map(row => `<tr><td>${escape(row.time)}</td><td>${row.preview ? `<img class="history-thumb" src="${escape(row.preview)}" alt="" />` : "-"}</td><td>${escape(row.category)}</td><td>${escape(row.materialClass)}</td><td>${escape(row.weight)}</td><td>${row.confidence}%</td><td><span class="status-pill ${row.decisionStatus === "review_needed" ? "review" : row.decisionStatus === "rejected" ? "quarantine" : "cleared"}">${escape(row.status)}</span></td><td><button type="button" class="secondary-btn" data-full-history-action="${escape(row.id)}" data-full-history-material="${escape(row.materialId)}" data-full-history-mode="${row.decisionStatus === "review_needed" ? "review" : "view"}">${row.decisionStatus === "review_needed" ? "Review" : "View"}</button></td></tr>`).join("") : '<tr><td colspan="8">No scan history matches these filters.</td></tr>';
    fullBody.querySelectorAll("[data-full-history-action]").forEach(button => button.addEventListener("click", () => openAuditDetails(button.dataset.fullHistoryAction, button.dataset.fullHistoryMaterial, button.dataset.fullHistoryMode, button)));
    const pages = Math.max(1, Math.ceil(remote.total / pageSize)); if (fullRange) fullRange.textContent = `Showing ${remote.items.length ? (modalState.page - 1) * pageSize + 1 : 0} to ${Math.min(modalState.page * pageSize, remote.total)} of ${remote.total} total`;
    renderPager(fullPager, modalState.page, pages, page => { modalState.page = page; fetchFullHistory(); });
  };
  const fullHistoryParams = (limit, offset) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), sort: modalState.sort, direction: modalState.direction });
    if (fullSearch?.value.trim()) params.set("search", fullSearch.value.trim());
    if (fullCategory?.value) params.set("category", fullCategory.value);
    if (fullStatus?.value) params.set("status", fullStatus.value);
    if (fullDate?.value) { const start = new Date(`${fullDate.value}T00:00:00+08:00`), end = new Date(start.getTime() + 86400000); params.set("start_date", start.toISOString()); params.set("end_date", end.toISOString()); }
    return params;
  };
  const openFullHistory = event => {
    modalOpener = event.currentTarget;
    if (fullSearch) fullSearch.value = search?.value || "";
    if (fullDate) fullDate.value = date?.value || "";
    if (fullCategory) fullCategory.value = category?.value || "";
    if (fullStatus) fullStatus.value = ({ "Review Needed": "review_needed", Rejected: "rejected" })[status?.value] || (status?.value?.startsWith("Confirmed") || status?.value === "Verified" ? "confirmed" : "");
    modalState = { page: 1, sort: state.sort, direction: state.direction === -1 ? "desc" : "asc" };
    document.querySelectorAll(".review-history-modal .history-sort").forEach(button => button.classList.toggle("active", button.id === (state.sort === "confidence" ? "fullHistorySortConfidence" : "fullHistorySortTimestamp")));
    modal.classList.add("active"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("review-history-modal-open"); requestAnimationFrame(() => modal.querySelector("[role=dialog]")?.focus()); fetchFullHistory();
  };
  document.getElementById("openFullHistory")?.addEventListener("click", openFullHistory);
  document.getElementById("exportReviewHistoryPdf")?.addEventListener("click", event => downloadHistoryExport(event.currentTarget, "pdf", exportParams(reviewHistoryParams(1, 0), "pdf", "scan"), "purityloop-scan-history.pdf"));
  document.getElementById("exportReviewHistoryExcel")?.addEventListener("click", event => downloadHistoryExport(event.currentTarget, "excel", exportParams(reviewHistoryParams(1, 0), "excel", "scan"), "purityloop-scan-history.xlsx"));
  document.getElementById("exportAuditHistoryPdf")?.addEventListener("click", event => downloadHistoryExport(event.currentTarget, "pdf", exportParams(fullHistoryParams(1, 0), "pdf", "audit"), "purityloop-audit-history.pdf"));
  document.getElementById("exportAuditHistoryExcel")?.addEventListener("click", event => downloadHistoryExport(event.currentTarget, "excel", exportParams(fullHistoryParams(1, 0), "excel", "audit"), "purityloop-audit-history.xlsx"));
  modal.querySelectorAll("[data-review-history-close]").forEach(button => button.addEventListener("click", closeFullHistory)); modal.addEventListener("click", event => { if (event.target === modal) closeFullHistory(); });
  auditModal?.querySelectorAll("[data-audit-review-close]").forEach(button => button.addEventListener("click", closeAuditReview)); auditModal?.addEventListener("click", event => { if (event.target === auditModal) closeAuditReview(); });
  auditVerify?.addEventListener("click", () => saveAuditReview("confirmed")); auditReject?.addEventListener("click", () => saveAuditReview("rejected"));
  [fullSearch, fullDate, fullCategory, fullStatus].forEach(input => input?.addEventListener(input === fullCategory || input === fullStatus ? "change" : "input", () => { modalState.page = 1; fetchFullHistory(); }));
  document.getElementById("fullHistorySortTimestamp")?.addEventListener("click", () => { modalState.sort = "timestamp"; modalState.direction = modalState.direction === "desc" ? "asc" : "desc"; fetchFullHistory(); });
  document.getElementById("fullHistorySortConfidence")?.addEventListener("click", () => { modalState.sort = "confidence"; modalState.direction = modalState.direction === "desc" ? "asc" : "desc"; fetchFullHistory(); });
  document.addEventListener("keydown", event => { if (!modal.classList.contains("active")) return; if (event.key === "Escape") { event.preventDefault(); closeFullHistory(); return; } if (event.key !== "Tab") return; const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(item => item.offsetParent); const first = focusable[0], last = focusable.at(-1); if (!first || !last) return; if (event.shiftKey ? document.activeElement === first : document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); } });
  document.addEventListener("keydown", event => { if (!auditModal?.classList.contains("active")) return; if (event.key === "Escape") { event.preventDefault(); closeAuditReview(); return; } if (event.key !== "Tab") return; const focusable = [...auditModal.querySelectorAll('button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(item => item.offsetParent); const first = focusable[0], last = focusable.at(-1); if (!first || !last) return; if (event.shiftKey ? document.activeElement === first : document.activeElement === last) { event.preventDefault(); (event.shiftKey ? last : first).focus(); } });
  window.addEventListener("purityloop:scan-history-refreshed", () => fetchReviewPage(state.page)); window.addEventListener("purityloop:review-scan-selected", event => { state.selectedId = event.detail?.scanId || ""; render(); }); window.addEventListener("purityloop:page-cleanup", () => { delete window.plReviewNavigateScan; document.body.classList.remove("review-history-modal-open", "audit-review-modal-open"); });
  fetchReviewPage(1);
}

function initReviewModal() {
  if (document.body.dataset.page === "review") return initReviewWorkspace();
  const modal = document.getElementById("reviewModal");
  const tableBody = document.getElementById("ledgerTableBody");
  const historyList = document.getElementById("reviewHistoryList");
  const historyRoot = modal || historyList || tableBody;
  if (!historyRoot) return;
  if (historyRoot.dataset.historyReady === "true") return;
  historyRoot.dataset.historyReady = "true";
  const searchInput = document.getElementById("historySearch");
  const dateInput = document.getElementById("historyDate");
  const statusInput = document.getElementById("historyStatus");
  const pageButtons = document.getElementById("historyPageButtons");
  const range = document.getElementById("historyRange");
  const state = { page: 1, sort: "timestamp", direction: -1, kpiBucket: "" };
  const pageSize = 10;
  let activeLog = null;
  let isSaving = false;
  let lastTrigger = null;
  let scrollState = null;
  const escape = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const setText = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
  const countBy = rows => rows.reduce((all, row) => { all[row.category] = (all[row.category] || 0) + 1; return all; }, {});
  const leadingCategory = rows => Object.entries(countBy(rows)).sort((a, b) => b[1] - a[1])[0];

  const reviewTitle = document.getElementById("reviewTitle");
  const reviewDescription = document.getElementById("reviewDescription");
  const snapshotItems = document.querySelector(".review-snapshot .snapshot-items");
  const modalActions = document.querySelector(".modal-actions");
  if (modalActions && !document.getElementById("reclassifySelect")) {
    const reclassify = document.createElement("div");
    reclassify.className = "history-reclassify";
    reclassify.innerHTML = `<label for="reclassifySelect">Manual category</label><select id="reclassifySelect">${["Plastic", "Metal", "Glass", "Paper", "Cardboard", "Food Organics", "General Trash", "Textile", "Battery"].map(category => `<option>${category}</option>`).join("")}</select>`;
    document.querySelector("#reviewModal .modal-body")?.appendChild(reclassify);
  }

  function lockPageScroll() {
    if (scrollState) return;
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    scrollState = { scrollY, bodyStyle: body.style.cssText, rootStyle: root.style.cssText };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    body.style.paddingRight = `${Math.max(0, window.innerWidth - root.clientWidth)}px`;
    root.style.scrollBehavior = "auto";
  }

  function unlockPageScroll() {
    if (!scrollState) return;
    const { scrollY, bodyStyle, rootStyle } = scrollState;
    document.body.style.cssText = bodyStyle;
    document.documentElement.style.cssText = rootStyle;
    window.scrollTo(0, scrollY);
    scrollState = null;
  }

  function restoreFocus() {
    const fallback = document.getElementById("historySearch");
    window.requestAnimationFrame(() => (lastTrigger?.isConnected ? lastTrigger : fallback)?.focus());
  }

  function scanSummary(rows, scans) {
    return scans.map(scan => {
      const scanRows = rows.filter(row => row.scanId === scan.id);
      const statuses = scanRows.map(row => row.decisionStatus);
      return statuses.includes("rejected") ? "rejected" : statuses.includes("review_needed") ? "review_needed" : "confirmed";
    });
  }

  function updateSummary(rows) {
    const scans = plGetScanResults();
    const statuses = scanSummary(rows, scans);
    const reviewRows = rows.filter(row => row.decisionStatus === "review_needed");
    const frequent = leadingCategory(rows);
    const reviewCategory = leadingCategory(reviewRows);
    const average = rows.length ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length : 0;
    const latest = scans.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const exactSummary = plScanHistoryMeta.summary || {};
    const confirmedCount = statuses.filter(status => status === "confirmed").length;
    const reviewScanCount = statuses.filter(status => status === "review_needed").length;
    const rejectedCount = statuses.filter(status => status === "rejected").length;
    const totalUploads = Number.isFinite(Number(plScanHistoryMeta.total)) ? Number(plScanHistoryMeta.total) : scans.length;
    const resolvedReviewCount = Number.isFinite(Number(exactSummary.needs_review)) ? Number(exactSummary.needs_review) : reviewScanCount;
    setText("historyConfirmed", Number.isFinite(Number(exactSummary.confirmed)) ? exactSummary.confirmed : confirmedCount);
    setText("historyReviewCount", resolvedReviewCount);
    setText("historyRejected", Number.isFinite(Number(exactSummary.rejected)) ? exactSummary.rejected : rejectedCount);
    setText("historyProcessedToday", totalUploads);
    setText("historyFrequentCategory", frequent ? frequent[0] : "No scan data");
    setText("historyFrequentCategoryMeta", frequent ? `${frequent[1]} item${frequent[1] === 1 ? "" : "s"}` : "-");
    setText("historyAverageConfidence", rows.length ? `${Math.round(average)}%` : "No data");
    setText("historyReviewCategory", reviewCategory ? reviewCategory[0] : "No review items");
    setText("historyReviewCategoryMeta", reviewCategory ? `${reviewCategory[1]} item${reviewCategory[1] === 1 ? "" : "s"}` : "-");
    setText("historyLastUpload", latest ? plFormatScanTime(latest) : "No recent uploads");
    setText("historyLastUploadMeta", latest ? latest.source_name || "Uploaded image" : "-");
    const reviewCount = reviewRows.length;
    setText("historyActionTitle", reviewCount ? `${reviewCount} scan${reviewCount === 1 ? " is" : "s are"} waiting for review` : "All scans are up to date");
    setText("historyActionText", reviewCount ? "These items need your attention to keep your data accurate and up to date." : "No unresolved classifications require attention.");
    const badge = document.querySelector(".review-badge span");
    if (badge) badge.textContent = `${reviewCount} review needed`;
  }

  function matchesKpiBucket(row, bucket) {
    if (!bucket || bucket === "total") return true;
    if (bucket === "confirmed") return row.decisionStatus !== "rejected" && row.decisionStatus !== "review_needed";
    return row.decisionStatus === bucket;
  }

  function filteredRows(rows) {
    const query = String(searchInput?.value || "").trim().toLowerCase();
    const date = String(dateInput?.value || "");
    const status = String(statusInput?.value || "");
    return rows.filter(row => {
      const localDate = new Date(row.timestamp);
      const rowDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
      return (!query || `${row.source} ${row.category} ${row.materialClass} ${row.status}`.toLowerCase().includes(query)) && (!date || rowDate === date) && (!status || row.status === status) && matchesKpiBucket(row, state.kpiBucket);
    });
  }

  function sortedVisibleRows() {
    return filteredRows(getAuditLedger()).sort((a, b) => (state.sort === "confidence" ? a.confidence - b.confidence : a.timestamp - b.timestamp) * state.direction);
  }

  function selectedRowIndex(rows) {
    const selectedScanId = new URLSearchParams(window.location.search).get("scanId") || plGetLatestScanResult()?.id || "";
    return rows.findIndex(row => row.scanId === selectedScanId);
  }

  function publishNavigationState(rows = sortedVisibleRows()) {
    const selectedIndex = selectedRowIndex(rows);
    window.dispatchEvent(new CustomEvent("purityloop:review-navigation-state", {
      detail: {
        hasPrevious: selectedIndex > 0,
        hasNext: selectedIndex >= 0 && selectedIndex < rows.length - 1
      }
    }));
  }

  window.plReviewNavigateScan = direction => {
    const rows = sortedVisibleRows();
    const selectedIndex = selectedRowIndex(rows);
    const targetIndex = selectedIndex + direction;
    if (selectedIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) return false;
    state.page = Math.floor(targetIndex / pageSize) + 1;
    render();
    window.dispatchEvent(new CustomEvent("purityloop:review-select-scan", { detail: { scanId: rows[targetIndex].scanId } }));
    return true;
  };

  function openReview(log, trigger) {
    if (!modal) return;
    activeLog = log;
    lastTrigger = trigger || document.activeElement;
    if (reviewTitle) reviewTitle.textContent = `Review ${log.category}`;
    if (reviewDescription) reviewDescription.textContent = "Confirm the AI result, correct the category, or reject this result.";
    const selected = document.getElementById("reclassifySelect");
    if (selected) selected.value = log.category;
    if (snapshotItems) snapshotItems.innerHTML = `${log.preview ? `<img src="${escape(log.preview)}" alt="${escape(log.category)} preview" class="review-preview" />` : '<div class="review-preview">No preview available</div>'}<div class="history-review-details"><div><strong>AI prediction:</strong> ${escape(plNormalizeCategory(log.material.category || log.category))}</div><div><strong>Confidence:</strong> ${escape(log.confidenceText)}</div><div><strong>Weight:</strong> ${escape(log.weight)}</div></div>`;
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    lockPageScroll();
    window.requestAnimationFrame(() => document.getElementById("closeReviewModal")?.focus());
  }

  function closeModal(force = false) {
    if (!modal || !modal.classList.contains("active") || (isSaving && !force)) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    activeLog = null;
    unlockPageScroll();
    restoreFocus();
  }

  function onModalKeydown(event) {
    if (!modal || !modal.classList.contains("active")) return;
    if (event.key === "Escape") {
      if (!isSaving) closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...modal.querySelectorAll('button:not([disabled]), [href], select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (!modal.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  function render() {
    const allRows = getAuditLedger();
    updateSummary(allRows);
    document.body.classList.toggle("review-drilled", !!state.kpiBucket);
    const rows = sortedVisibleRows();
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const visible = rows.slice((state.page - 1) * pageSize, state.page * pageSize);
    const exportButton = document.getElementById("exportHistory");
    if (exportButton) exportButton.disabled = rows.length === 0;
    const reviewButton = document.getElementById("showReviewQueue");
    if (reviewButton) reviewButton.disabled = !rows.some(row => row.decisionStatus === "review_needed");
    if (tableBody) {
      tableBody.innerHTML = visible.length ? visible.map(row => `<tr class="history-row ${row.decisionStatus === "review_needed" ? "history-row-review" : ""}"><td>${escape(row.time)}</td><td>${row.preview ? `<img class="history-thumb" src="${escape(row.preview)}" alt="${escape(row.category)} preview" />` : '<span class="history-preview-empty"><i class="fa-regular fa-image" aria-hidden="true"></i><span class="sr-only">No preview available</span></span>'}</td><td>${escape(row.category)}</td><td><span class="history-class ${escape(row.materialClass)}">${escape(row.materialClass)}</span></td><td>${escape(row.weight)}</td><td><div class="history-confidence"><strong>${escape(row.confidenceText)}</strong><span><i style="width:${Math.max(0, Math.min(100, row.confidence))}%"></i></span></div></td><td><span class="status-pill ${row.decisionStatus === "review_needed" ? "review" : row.decisionStatus === "rejected" ? "quarantine" : row.decisionStatus === "verified" ? "cleared" : row.materialClass === "contaminant" ? "history-confirmed-contaminant" : "cleared"}">${escape(row.status)}</span></td><td>${row.decisionStatus === "review_needed" ? `<button class="secondary-btn history-row-action" type="button" data-review="${escape(row.id)}">Review</button>` : `<a class="secondary-btn history-row-action" href="/review?scanId=${encodeURIComponent(row.scanId)}">View</a>`}</td></tr>`).join("") : '<tr><td colspan="8"><div class="feed-empty">No scan history matches these filters.</div></td></tr>';
    }
    if (historyList) {
      const selectedScanId = new URLSearchParams(window.location.search).get("scanId") || plGetLatestScanResult()?.id || "";
      historyList.innerHTML = visible.length ? visible.map(row => `<button type="button" class="review-history-row ${row.scanId === selectedScanId ? "is-selected" : ""}" data-select-scan="${escape(row.scanId)}" aria-pressed="${row.scanId === selectedScanId}"><span class="review-history-thumb">${row.preview ? `<img src="${escape(row.preview)}" alt="${escape(row.category)} preview" />` : '<i class="fa-regular fa-image" aria-hidden="true"></i>'}</span><span class="review-history-main"><strong>${escape(row.category)}</strong><small>${escape(row.sourceTypeLabel)} · ${escape(row.duration || row.time)} · ${escape(row.confidenceText)} confidence</small></span><span class="status-pill ${row.decisionStatus === "review_needed" ? "review" : row.decisionStatus === "rejected" ? "quarantine" : row.decisionStatus === "verified" ? "cleared" : row.materialClass === "contaminant" ? "history-confirmed-contaminant" : "cleared"}">${escape(row.status)}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`).join("") : '<div class="feed-empty">No scan history matches these filters.</div>';
    }
    const start = rows.length ? (state.page - 1) * pageSize + 1 : 0;
    const resultTotal = Number.isFinite(Number(plScanHistoryMeta.total)) ? Number(plScanHistoryMeta.total) : rows.length;
    if (range) range.textContent = `Showing ${start} to ${Math.min(state.page * pageSize, rows.length)} loaded results of ${resultTotal} total`;
    if (pageButtons) {
      const pages = new Set([1, totalPages, state.page - 1, state.page, state.page + 1].filter(page => page >= 1 && page <= totalPages));
      const pageItems = [];
      [...pages].sort((a, b) => a - b).forEach((page, index, visiblePages) => {
        if (index && page - visiblePages[index - 1] > 1) pageItems.push('<span class="history-page-gap" aria-hidden="true">…</span>');
        pageItems.push(`<button type="button" class="${state.page === page ? "active" : ""}" data-page="${page}" aria-label="Page ${page}" ${state.page === page ? 'aria-current="page"' : ""}>${page}</button>`);
      });
      pageButtons.innerHTML = `<button type="button" class="history-page-prev" data-page="${Math.max(1, state.page - 1)}" aria-label="Previous page" ${state.page === 1 ? "disabled" : ""}>‹</button>${pageItems.join("")}<button type="button" class="history-page-next" data-page="${Math.min(totalPages, state.page + 1)}" aria-label="Next page" ${state.page === totalPages ? "disabled" : ""}>›</button>`;
    }
    tableBody?.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", () => openReview(allRows.find(row => row.id === button.dataset.review), button)));
    historyList?.querySelectorAll("[data-select-scan]").forEach(button => button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("purityloop:review-select-scan", { detail: { scanId: button.dataset.selectScan } }));
    }));
    pageButtons?.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => { state.page = Number(button.dataset.page); render(); }));
    publishNavigationState(rows);
  }

  function activateTab(name) {
    document.getElementById("reviewHistoryPanel")?.classList.toggle("is-active-tab", name === "history");
    document.getElementById("reviewSelectedPanel")?.classList.toggle("is-active-tab", name === "selected");
    document.getElementById("reviewTabHistory")?.classList.toggle("active", name === "history");
    document.getElementById("reviewTabSelected")?.classList.toggle("active", name === "selected");
    document.getElementById("reviewTabHistory")?.setAttribute("aria-selected", String(name === "history"));
    document.getElementById("reviewTabSelected")?.setAttribute("aria-selected", String(name === "selected"));
  }
  document.querySelectorAll(".review-tab").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  document.querySelectorAll(".review-summary-card[data-kpi-filter]").forEach(card => {
    const bucket = card.dataset.kpiFilter;
    const activateKpiDrilldown = () => {
      state.kpiBucket = bucket;
      if (statusInput) statusInput.value = bucket === "review_needed" ? "Review Needed" : bucket === "rejected" ? "Rejected" : "";
      activateTab("history");
      state.page = 1;
      render();
      document.querySelector(".review-history-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    card.addEventListener("click", activateKpiDrilldown);
    card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activateKpiDrilldown(); } });
  });

  [searchInput, dateInput, statusInput].forEach(input => input?.addEventListener("input", () => { state.page = 1; render(); }));
  statusInput?.addEventListener("change", () => { state.kpiBucket = ""; state.page = 1; render(); });
  document.querySelectorAll(".history-sort").forEach(button => button.addEventListener("click", () => { const next = button.dataset.sort; state.direction = state.sort === next ? -state.direction : -1; state.sort = next; document.querySelectorAll(".history-sort").forEach(item => { item.setAttribute("aria-sort", item === button ? (state.direction === 1 ? "ascending" : "descending") : "none"); item.classList.toggle("active", item === button); }); render(); }));
  document.getElementById("showReviewQueue")?.addEventListener("click", () => { if (statusInput) statusInput.value = "Review Needed"; state.page = 1; render(); document.querySelector(".ledger-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.getElementById("showAllHistory")?.addEventListener("click", () => { if (statusInput) statusInput.value = ""; state.page = 1; render(); });
  document.getElementById("exportHistory")?.addEventListener("click", () => { const headers = ["Timestamp", "Source", "Category", "Class", "Weight (kg)", "AI Confidence", "Status"]; const records = filteredRows(getAuditLedger()).map(row => [row.time, row.source, row.category, row.materialClass, row.weight, row.confidenceText, row.status]); const csv = [headers, ...records].map(record => record.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "purityloop-scan-history.csv"; link.click(); URL.revokeObjectURL(url); });
  document.getElementById("closeReviewModal")?.addEventListener("click", closeModal);
  modal?.addEventListener("click", event => { if (!isSaving && event.target === modal) closeModal(); });
  if (modal) document.addEventListener("keydown", onModalKeydown);
  window.addEventListener("purityloop:scan-history-refreshed", render);
  window.addEventListener("purityloop:review-scan-selected", render);
  window.addEventListener("purityloop:page-cleanup", () => {
    unlockPageScroll();
    document.body.classList.remove("review-drilled");
    if (modal) document.removeEventListener("keydown", onModalKeydown);
    window.removeEventListener("purityloop:scan-history-refreshed", render);
    window.removeEventListener("purityloop:review-scan-selected", render);
    if (window.plReviewNavigateScan) delete window.plReviewNavigateScan;
  }, { once: true });
  async function saveReview(outcome, message) {
    if (!activeLog || isSaving) return;
    isSaving = true;
    const controls = [document.getElementById("clearSegment"), document.getElementById("quarantineSegment"), document.getElementById("reclassifySelect"), document.getElementById("closeReviewModal")].filter(Boolean);
    controls.forEach(control => { control.disabled = true; });
    const log = activeLog;
    try {
      await plSaveReview(plGetScanResultById(log.scanId), log.material, document.getElementById("reclassifySelect")?.value || log.category, outcome);
      closeModal(true);
      render();
      showToast(message, "success");
      void plRefreshScanResultsFromSupabase().then(refreshed => {
        if (!refreshed) showToast("Review saved. History refresh failed—retry or reload the page.", "warning");
      });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      isSaving = false;
      controls.forEach(control => { control.disabled = false; });
    }
  }
  document.getElementById("clearSegment")?.addEventListener("click", () => saveReview("confirmed", "Review saved."));
  document.getElementById("quarantineSegment")?.addEventListener("click", () => saveReview("rejected", "Result rejected."));
  render();
}

/******************************************
 * 4. OPERATIONS DASHBOARD PAGE           *
 ******************************************/
const plOverviewCharts = {};

function plFormatReviewTurnaround(milliseconds) {
  if (!Number.isFinite(milliseconds)) return "No completed reviews";
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function plOverviewSet(name, value) {
  document.querySelectorAll(`[data-overview="${name}"]`).forEach(element => { element.textContent = value; });
}

function plOverviewChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return false;
  if (plOverviewCharts[canvasId]) plOverviewCharts[canvasId].destroy();
  plOverviewCharts[canvasId] = new Chart(canvas, config);
  return true;
}

function plAnalyticsSummaryForActiveScope() {
  const payload = plAnalyticsDateData?.summary;
  if (!payload) return plGetAnalyticsSummary({ date: plAnalyticsSelectedDate || "", scans: plAnalyticsDateData?.items });
  const materialMixRows = plSafeArray(payload.material_mix);
  const resaleRows = plSafeArray(payload.recoverable_value_by_category);
  return {
    scans: { length: Number(payload.total_scans) || 0 },
    materials: { length: Number(payload.detected_materials_count) || 0 },
    savedScansCount: Number(payload.total_scans) || 0,
    detectedMaterialsCount: Number(payload.detected_materials_count) || 0,
    categoryRows: materialMixRows.map(row => [row.label, Number(row.count) || 0]),
    resaleRows,
    materialMixRows,
    totalEstimatedWeightKg: Number(payload.total_estimated_weight_kg) || 0,
    totalEstimatedResaleValueRm: Number(payload.estimated_recovery_value) || 0,
    recyclableRows: plSafeArray(payload.recyclable_rows),
    contaminatedRows: plSafeArray(payload.contaminated_rows),
    recyclableCount: plSafeArray(payload.recyclable_rows).reduce((total, [, count]) => total + (Number(count) || 0), 0),
    contaminationCount: plSafeArray(payload.contaminated_rows).reduce((total, [, count]) => total + (Number(count) || 0), 0),
    reviewCount: Number(payload.review_count) || 0,
    allLowConfidenceCount: 0,
    avgConfidence: Number(payload.average_detection_confidence) || 0,
    confirmedScanCount: Number(payload.confirmed_count) || 0,
    recyclableTop: payload.top_recyclable_material ? [payload.top_recyclable_material.label, Number(payload.top_recyclable_material.count) || 0] : null,
    contaminantTop: payload.top_contamination_source ? [payload.top_contamination_source.label, Number(payload.top_contamination_source.count) || 0] : null,
    highestValue: payload.highest_value_category || null,
    averageReviewTurnaroundMs: payload.average_review_turnaround_ms,
    lastUpload: payload.last_upload || null,
    lastUploadBatchCount: Number(payload.last_upload_batch_count) || 0,
    trendRows: plSafeArray(payload.daily_scan_trend),
    highRiskCount: Number(payload.high_risk_count) || 0,
    recoveryOpportunityCount: Number(payload.recovery_opportunity_count) || 0,
    recentEvents: plSafeArray(payload.recent_events),
    clearedCount: Number(payload.confirmed_count) || 0,
    quarantinedCount: Number(payload.rejected_count) || 0,
    nonRecyclableCount: plSafeArray(payload.contaminated_rows).reduce((total, [, count]) => total + (Number(count) || 0), 0)
  };
}

function renderAnalyticsOverview(dateValue = "", state = "ready") {
  const overview = document.querySelector(".analytics-overview");
  if (!overview) return;
  const stateEl = document.getElementById("analyticsOverviewState");
  const showState = (message, isError = false) => {
    if (!stateEl) return;
    stateEl.textContent = message;
    if (isError) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => window.location.reload());
      stateEl.appendChild(retry);
    }
    stateEl.hidden = !message;
    stateEl.classList.toggle("is-error", isError);
  };
  overview.classList.toggle("is-loading", state === "loading");
  overview.classList.toggle("is-error", state === "error");
  showState(state === "loading" ? "Refreshing analytics..." : state === "error" ? "Analytics data could not be loaded." : "", state === "error");

  if (state === "loading") {
    ["needs-review", "confirmed-today", "recoverable-value", "average-confidence"].forEach(name => plOverviewSet(name, "—"));
    Object.values(plOverviewCharts).forEach(chart => chart.destroy());
    Object.keys(plOverviewCharts).forEach(key => delete plOverviewCharts[key]);
    const actions = document.getElementById("analyticsManagerActions");
    if (actions) actions.textContent = "Loading analytics...";
    return;
  }
  if (state === "error") {
    ["needs-review", "confirmed-today", "recoverable-value", "average-confidence"].forEach(name => plOverviewSet(name, "—"));
    return;
  }

  const summary = plAnalyticsSummaryForActiveScope();
  const exactReviewCount = summary.reviewCount;
  const exactConfirmedCount = summary.confirmedScanCount;
  const updated = document.getElementById("analyticsLastUpdated");
  if (updated) {
    const now = new Date();
    updated.dateTime = now.toISOString();
    updated.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  plOverviewSet("needs-review", String(exactReviewCount));
  plOverviewSet("needs-review-note", exactReviewCount ? "Scans require attention" : "All scans are up to date");
  plOverviewSet("confirmed-today", String(exactConfirmedCount));
  const confirmedLabel = document.getElementById("analyticsConfirmedLabel");
  if (confirmedLabel) confirmedLabel.textContent = dateValue ? "Confirmed on Selected Date" : "Confirmed Scans";
  plOverviewSet("recoverable-value", plFormatRm(summary.totalEstimatedResaleValueRm));
  plOverviewSet("average-confidence", summary.materials.length ? `${summary.avgConfidence.toFixed(1)}%` : "No data");

  const banner = overview.querySelector("[data-overview='attention-banner']");
  const hasReviews = exactReviewCount > 0;
  banner?.classList.toggle("is-clear", !hasReviews);
  plOverviewSet("attention-title", hasReviews ? `${exactReviewCount} item${exactReviewCount === 1 ? "" : "s"} need attention ${dateValue ? "on this date" : "in all history"}` : "All scans are up to date");
  plOverviewSet("attention-copy", hasReviews ? "Review low-confidence items to keep reporting accurate and reduce contamination." : "No unresolved classifications require attention.");
  const reviewLink = overview.querySelector("[data-overview='review-link']");
  if (reviewLink) reviewLink.textContent = hasReviews ? "Open Review Queue" : "View History";

  const insightMeta = (top, total, label) => top ? `${Math.round((top[1] / Math.max(total, 1)) * 100)}% of ${label}` : "No data";
  plOverviewSet("top-contaminant", summary.contaminantTop?.[0] || "No confirmed contaminants");
  plOverviewSet("top-contaminant-meta", insightMeta(summary.contaminantTop, summary.contaminationCount, "confirmed contaminants"));
  plOverviewSet("top-recyclable", summary.recyclableTop?.[0] || "No confirmed recyclables");
  plOverviewSet("top-recyclable-meta", insightMeta(summary.recyclableTop, summary.recyclableCount, "confirmed recyclables"));
  plOverviewSet("review-turnaround", plFormatReviewTurnaround(summary.averageReviewTurnaroundMs));
  plOverviewSet("highest-value", summary.highestValue?.label || "No valued category");
  plOverviewSet("highest-value-meta", summary.highestValue ? plFormatRm(summary.highestValue.estimatedResaleValueRm) : "No pricing data");
  const lastUpload = summary.lastUpload;
  plOverviewSet("last-upload", lastUpload ? plFormatScanTime(lastUpload) : "No uploads yet");
  plOverviewSet("last-upload-meta", lastUpload ? `${summary.lastUploadBatchCount} scan${summary.lastUploadBatchCount === 1 ? "" : "s"} in this upload batch` : "Upload images to begin");

  plOverviewSet("mix-subtitle", summary.materials.length ? "By estimated weight" : "By weight");
  plOverviewSet("mix-summary", summary.materials.length ? `${plFormatKg(summary.totalEstimatedWeightKg)} across ${summary.materials.length} detected item${summary.materials.length === 1 ? "" : "s"}.` : "");
  plOverviewSet("value-summary", summary.highestValue ? `${summary.highestValue.label} leads estimated recoverable value.` : "");
  plOverviewSet("trend-summary", summary.scans.length ? `${summary.scans.length} scan${summary.scans.length === 1 ? "" : "s"} in selected period.` : "");
  const mixCenter = overview.querySelector("[data-overview='mix-center']");
  if (mixCenter) mixCenter.hidden = !summary.materialMixRows.length;
  plOverviewSet("mix-total", summary.totalEstimatedWeightKg ? plFormatKg(summary.totalEstimatedWeightKg) : String(summary.materials.length));
  plOverviewSet("mix-total-label", summary.totalEstimatedWeightKg ? "Total weight" : "Total items");
  const chartSummary = (canvasId, label) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", label);
  };
  chartSummary("overviewMaterialMix", summary.materialMixRows.length ? `Material mix by estimated weight: ${summary.materialMixRows.map(row => `${row.label} ${plFormatKg(row.estimatedWeightKg)}`).join(", ")}.` : "Material mix: no material data in the selected period.");

  const isDark = document.documentElement.dataset.theme === "dark";
  const colors = isDark ? ["#4ade80", "#22d3ee", "#60a5fa", "#fbbf24", "#86efac", "#f87171", "#5eead4", "#94a3b8", "#fb923c"] : ["#54c979", "#35bfb4", "#4285e8", "#dca73a", "#90caa8", "#d85769", "#5e9f9d", "#7a8893", "#f08b58"];
  const chartText = isDark ? "#a9bbb0" : "#52635a";
  const chartGrid = isDark ? "rgba(255,255,255,0.09)" : "#e8efea";
  const chartSurface = isDark ? "#0c1812" : "#fff";
  const chartValueText = isDark ? "#f3f7f4" : "#26382d";
  const chartPrimary = isDark ? "#4ade80" : "#1d7048";
  const chartBase = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } } };
  if (summary.materialMixRows.length) {
    plOverviewChart("overviewMaterialMix", { type: "doughnut", data: { labels: summary.materialMixRows.map(row => row.label), datasets: [{ data: summary.materialMixRows.map(row => row.estimatedWeightKg), backgroundColor: colors, borderColor: chartSurface, borderWidth: 2 }] }, options: { ...chartBase, cutout: "70%", plugins: { ...chartBase.plugins, legend: { display: true, position: "bottom", labels: { boxWidth: 8, boxHeight: 8, padding: 10, color: chartText, font: { size: 10 } } }, tooltip: { callbacks: { label: context => `${context.label}: ${plFormatKg(context.raw)}` } } } } });
  } else if (plOverviewCharts.overviewMaterialMix) { plOverviewCharts.overviewMaterialMix.destroy(); delete plOverviewCharts.overviewMaterialMix; }
  const valueRows = summary.resaleRows.filter(row => row.estimatedResaleValueRm > 0);
  chartSummary("overviewValueByCategory", valueRows.length ? `Estimated recoverable value by category: ${valueRows.map(row => `${row.label} ${plFormatRm(row.estimatedResaleValueRm)}`).join(", ")}.` : "Recoverable value: no priced materials in the selected period.");
  chartSummary("overviewDailyTrend", summary.scans.length ? `Daily scan trend for the selected period: ${summary.trendRows.map(row => `${row.label} ${row.value}`).join(", ")}.` : "Daily scan trend: no scan activity in the selected period.");
  if (valueRows.length) {
    const valueLabelsPlugin = { id: "overviewValueLabels", afterDatasetsDraw(chart) { const { ctx } = chart; const meta = chart.getDatasetMeta(0); ctx.save(); ctx.fillStyle = chartValueText; ctx.font = "700 10px IBM Plex Sans, Arial"; ctx.textAlign = "center"; meta.data.forEach((bar, index) => ctx.fillText(Number(valueRows[index].estimatedResaleValueRm).toFixed(2), bar.x, Math.max(13, bar.y - 7))); ctx.restore(); } };
    plOverviewChart("overviewValueByCategory", { type: "bar", plugins: [valueLabelsPlugin], data: { labels: valueRows.map(row => row.label), datasets: [{ data: valueRows.map(row => row.estimatedResaleValueRm), backgroundColor: colors.slice(0, valueRows.length), borderRadius: 5, maxBarThickness: 34 }] }, options: { ...chartBase, layout: { padding: { top: 18 } }, scales: { x: { grid: { display: false }, ticks: { color: chartText, font: { size: 10 }, maxRotation: 0, minRotation: 0 } }, y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText, callback: value => `RM ${value}` } } }, plugins: { ...chartBase.plugins, tooltip: { callbacks: { label: context => plFormatRm(context.raw) } } } } });
  } else if (plOverviewCharts.overviewValueByCategory) { plOverviewCharts.overviewValueByCategory.destroy(); delete plOverviewCharts.overviewValueByCategory; }
  if (summary.scans.length) {
    plOverviewChart("overviewDailyTrend", { type: "line", data: { labels: summary.trendRows.map(row => row.label), datasets: [{ data: summary.trendRows.map(row => row.value), borderColor: chartPrimary, backgroundColor: isDark ? "rgba(74, 222, 128, 0.14)" : "rgba(84, 201, 121, 0.12)", fill: true, tension: 0.3, pointBackgroundColor: chartSurface, pointBorderColor: chartPrimary, pointBorderWidth: 2, pointRadius: 3 }] }, options: { ...chartBase, scales: { x: { grid: { display: false }, ticks: { color: chartText, font: { size: 10 }, autoSkip: true, maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText, precision: 0 } } } } });
  } else if (plOverviewCharts.overviewDailyTrend) { plOverviewCharts.overviewDailyTrend.destroy(); delete plOverviewCharts.overviewDailyTrend; }

  const actions = [
    hasReviews && { icon: "fa-triangle-exclamation", title: "Pending Reviews", text: "Unresolved low-confidence items", value: summary.reviewCount, tone: "warning" },
    summary.highRiskCount > 0 && { icon: "fa-battery-half", title: "High-Risk Items", text: "Confirmed battery items", value: summary.highRiskCount, tone: "danger" },
    summary.allLowConfidenceCount > 0 && summary.allLowConfidenceCount !== summary.reviewCount && { icon: "fa-circle-exclamation", title: "Low-Confidence Scans", text: "Includes resolved low-confidence detections", value: summary.allLowConfidenceCount, tone: "warning" },
    summary.recoveryOpportunityCount > 0 && { icon: "fa-tag", title: "Recovery Opportunities", text: "Confirmed items with recoverable value", value: summary.recoveryOpportunityCount, tone: "success" }
  ].filter(Boolean);
  const actionList = document.getElementById("analyticsManagerActions");
  if (actionList) actionList.innerHTML = actions.length ? actions.map(action => `<div class="analytics-action-row ${action.tone}"><i class="fa-solid ${action.icon}" aria-hidden="true"></i><div><strong>${action.title}</strong><span>${action.text}</span></div><b>${action.value}</b></div>`).join("") : `<p class="analytics-empty-action">No manager actions are waiting.</p>`;

  const recentLog = document.getElementById("analyticsRecentLog");
  if (recentLog) recentLog.innerHTML = summary.recentEvents.length ? summary.recentEvents.map(event => `<tr><td>${plEscapeHtml(plFormatScanTime({ created_at: event.timestamp }))}</td><td>${plEscapeHtml(event.event)}</td><td>${plEscapeHtml(event.source)}</td><td><span class="analytics-status ${event.status === "Review Needed" ? "review" : event.status === "Rejected" ? "rejected" : "confirmed"}">${plEscapeHtml(event.status)}</span></td><td>${plEscapeHtml(event.details)}</td></tr>`).join("") : `<tr><td colspan="5" class="analytics-log-empty">No scans are available for selected period. <a href="/upload">Upload Images</a></td></tr>`;
}

function initAnalyticsOverview() {
  const dateInput = document.getElementById("analyticsDate");
  if (!dateInput) return;
  const clearDateButton = document.getElementById("analyticsClearDate");
  if (dateInput.dataset.overviewBound === "true") return;
  const render = state => renderAnalyticsOverview(plAnalyticsSelectedDate || "", state);
  const refreshAnalytics = async () => {
    const date = plAnalyticsSelectedDate;
    const requestId = ++plAnalyticsRequestId;
    plAnalyticsDateData = null;
    render("loading");
    try {
      let url = `${plApiBaseUrl()}/api/analytics/summary`;
      if (date) {
        const { start, end } = plAnalyticsDateBounds(date);
        url += `?start_date=${encodeURIComponent(start.toISOString())}&end_date=${encodeURIComponent(end.toISOString())}`;
      }
      let payload;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await plBackendFetch(url);
          payload = await response.json();
          if (response.ok) break;
          if (response.status < 500 && response.status !== 429) {
            const error = new Error(payload?.detail || "Unable to load analytics summary");
            error.nonRetryable = true;
            throw error;
          }
          lastError = new Error(payload?.detail || "Analytics service is temporarily unavailable");
        } catch (error) {
          if (error?.nonRetryable) throw error;
          lastError = error;
        }
        if (requestId !== plAnalyticsRequestId || attempt === 2) throw lastError;
        await new Promise(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
      }
      if (requestId !== plAnalyticsRequestId) return;
      plAnalyticsDateData = { summary: payload };
      render();
      updateAnalyticsDetailPanels(plAnalyticsSummaryForActiveScope());
    } catch (error) {
      if (requestId !== plAnalyticsRequestId) return;
      console.error("PurityLoop: date analytics refresh failed.", error);
      render("error");
    }
  };
  const syncSelection = value => {
    plAnalyticsSelectedDate = value || null;
    dateInput.value = plAnalyticsSelectedDate || "";
    if (clearDateButton) clearDateButton.disabled = !plAnalyticsSelectedDate;
    return refreshAnalytics();
  };
  dateInput.addEventListener("change", () => void syncSelection(dateInput.value));
  clearDateButton?.addEventListener("click", () => void syncSelection(""));
  const onThemeChange = () => render();
  window.addEventListener("purityloop:theme-change", onThemeChange);
  window.addEventListener("purityloop:page-cleanup", () => window.removeEventListener("purityloop:theme-change", onThemeChange), { once: true });
  dateInput.dataset.overviewBound = "true";
  void syncSelection("");
}

function initAnalyticsCharts() {
  const dateInput = document.getElementById("analyticsDate");
  if (!dateInput || dateInput.dataset.analyticsReady === "true") return;
  dateInput.dataset.analyticsReady = "true";
  initAnalyticsOverview();
  window.addEventListener("purityloop:page-cleanup", () => {
    Object.values(plOverviewCharts).forEach(chart => chart.destroy());
    Object.keys(plOverviewCharts).forEach(key => delete plOverviewCharts[key]);
  }, { once: true });
}

async function initSettingsPage() {
  if (!document.getElementById("settingsBackendStatus")) return;
  const modelStatus = document.getElementById("settingsModelStatus");
  const backendStatus = document.getElementById("settingsBackendStatus");
  const themeStatus = document.getElementById("settingsThemeStatus");
  const renderTheme = () => {
    const preference = document.documentElement.dataset.themePreference || localStorage.getItem("purityloop-theme") || "system";
    if (themeStatus) themeStatus.textContent = preference.charAt(0).toUpperCase() + preference.slice(1);
  };
  renderTheme();
  window.addEventListener("purityloop:theme-change", renderTheme);
  window.addEventListener("purityloop:page-cleanup", () => window.removeEventListener("purityloop:theme-change", renderTheme), { once: true });
  try {
    const response = await fetch(plBrowserModelUrl(), { method: "HEAD" });
    if (modelStatus) modelStatus.textContent = response.ok ? "Browser ONNX available" : "Browser ONNX unavailable";
  } catch {
    if (modelStatus) modelStatus.textContent = "Browser ONNX unavailable";
  }
  const apiBase = plApiBaseUrl();
  if (!apiBase) {
    if (backendStatus) backendStatus.textContent = "Backend unavailable";
    return;
  }
  try {
    const response = await fetch(`${apiBase}/api/health`, { headers: plPublicHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error("Health check failed");
    if (backendStatus) backendStatus.textContent = "Connected";
  } catch {
    if (backendStatus) backendStatus.textContent = "Backend unavailable";
  }
}

/******************************************
 * 5. SIDEBAR DRILL-DOWN INTERACTIONS     *
 ******************************************/
function activateDetailPanel(targetId) {
  const panel = document.getElementById(targetId);
  if (!panel) return;

  const dock = panel.closest(".detail-dock");
  if (dock) {
    dock.querySelectorAll(".detail-panel").forEach(item => item.classList.remove("active"));
  }
  panel.classList.add("active");
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSparkBars(container, values, color) {
  if (!container) return;
  const safeValues = plSafeArray(values).map(value => Number(value)).filter(Number.isFinite);
  if (!safeValues.length) {
    container.innerHTML = "";
    return;
  }
  const max = Math.max(...safeValues, 1);
  container.innerHTML = safeValues
    .map(value => `<span style="height:${Math.max(12, (value / max) * 100)}%; background:${color}" title="${value}"></span>`)
    .join("");
}

function renderBarRows(container, rows, color, suffix = "") {
  if (!container) return;
  const safeRows = plSafeArray(rows)
    .map(row => Array.isArray(row) ? row : ["No data", 0])
    .map(([label, value]) => [label, Number(value) || 0]);
  if (!safeRows.length) {
    container.innerHTML = `
      <div>
        <span>No analytics data available</span>
        <strong>0${suffix}</strong>
        <i style="width:0%; background:${color}"></i>
      </div>
    `;
    return;
  }
  const max = Math.max(...safeRows.map(row => row[1]), 1);
  container.innerHTML = safeRows
    .map(([label, value]) => `
      <div>
        <span>${label}</span>
        <strong>${value}${suffix}</strong>
        <i style="width:${Math.max(4, (value / max) * 100)}%; background:${color}"></i>
      </div>
    `)
    .join("");
}

function updateAnalyticsDetailPanels(summary) {
  const yieldPanel = document.getElementById("detail-yield");
  if (yieldPanel) {
    const yieldGrid = yieldPanel.querySelector(".detail-grid.five");
    if (yieldGrid) {
      yieldGrid.innerHTML = summary.materials.length
        ? summary.categoryRows.map(([label, count]) => `
            <button type="button" class="metric-tile static" data-material-detail="${label}">
              <span>${label}</span>
              <strong>${count}</strong>
              <small>Detected material records</small>
            </button>
          `).join("")
        : `<div class="feed-empty">No material data yet.</div>`;
    }
    const monthTable = yieldPanel.querySelector(".month-table");
    if (monthTable) {
      monthTable.innerHTML = summary.materials.length
        ? `
          <div><span>Saved scans</span><strong>${summary.savedScansCount}</strong></div>
          <div><span>Detected materials</span><strong>${summary.detectedMaterialsCount}</strong></div>
          <div><span>Avg confidence</span><strong>${summary.avgConfidence.toFixed(1)}%</strong></div>
        `
        : `<div><span>No saved scans</span><strong>0</strong></div>`;
    }
  }

  const resalePanel = document.getElementById("detail-resale");
  const resaleBody = resalePanel?.querySelector("tbody");
  if (resaleBody) {
    resaleBody.innerHTML = summary.resaleRows.length
      ? summary.resaleRows.map(row => `
          <tr>
            <td>${row.label}</td>
            <td>${plFormatKg(row.estimatedWeightKg)}</td>
            <td>RM ${row.pricePerKg.toFixed(2)}/kg</td>
            <td>${plFormatRm(row.estimatedResaleValueRm)}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="4"><div class="feed-empty">No resale data yet.</div></td></tr>`;
  }

  const purityPanel = document.getElementById("detail-purity");
  if (purityPanel) {
    renderBarRows(
      purityPanel.querySelector(".bar-list"),
      summary.materials.length ? [["Average confidence", Number(summary.avgConfidence.toFixed(1))], ["Clean recyclable", summary.recyclableCount], ["Pending review", summary.reviewCount]] : [],
      "#00F08A",
      ""
    );
  }

  const compositionPanel = document.getElementById("detail-composition");
  if (compositionPanel) {
    const lists = compositionPanel.querySelectorAll(".bar-list.compact");
    renderBarRows(lists[0], summary.recyclableRows, "#00F08A", "");
    renderBarRows(lists[1], summary.contaminatedRows, "#D85E70", "");
  }

  const contaminantsPanel = document.getElementById("detail-contaminants");
  if (contaminantsPanel) {
    const grid = contaminantsPanel.querySelector(".detail-grid.four");
    if (grid) {
      grid.innerHTML = summary.contaminationCount
        ? summary.contaminatedRows.map(([label, count]) => `
            <button type="button" class="metric-tile static" data-material-detail="${label}">
              <span>${label}</span>
              <strong>${count}</strong>
              <small>Contaminated records</small>
            </button>
          `).join("")
        : `<div class="feed-empty">No contaminant logs yet.</div>`;
    }
  }

  const ledgerPanel = document.getElementById("detail-ledger");
  const ledgerBody = ledgerPanel?.querySelector("tbody");
  if (ledgerBody) {
    const ledger = plAnalyticsDateData?.summary
      ? summary.recentEvents.map(event => ({ time: plFormatScanTime({ created_at: event.timestamp }), source: event.source, category: event.event, weight: "—", confidence: "—", status: event.status }))
      : getAuditLedger();
    ledgerBody.innerHTML = ledger.length
      ? ledger.slice(0, 10).map(log => `
          <tr${log.scanId || log.id ? ` onclick="window.location.href='/review?scanId=${encodeURIComponent(log.scanId || log.id)}'"` : ""}>
            <td>${log.time}</td>
            <td>${getLogSourceLabel(log)}</td>
            <td>${log.category}</td>
            <td>${log.weight}</td>
            <td>${log.confidence}</td>
            <td>${log.status}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="6"><div class="feed-empty">No scan history yet.</div></td></tr>`;
  }
}

function renderMaterialDetail(materialName, options = {}) {
  const activate = options.activate !== false;

  const normalizedCategory = normalizeMaterialCategory(materialName);
  const normName = MATERIAL_ESTIMATES[normalizedCategory].label;

  const panel = document.getElementById("detail-material");
  if (!panel) return;
  const summary = plAnalyticsSummaryForActiveScope();
  const aggregateRow = plAnalyticsDateData?.summary
    ? plSafeArray(plAnalyticsDateData.summary.material_mix).find(row => normalizeMaterialCategory(row.category || row.label) === normalizedCategory)
    : null;
  const materials = aggregateRow ? [] : summary.materials.filter(material => normalizeMaterialCategory(material) === normalizedCategory);
  const count = aggregateRow ? Number(aggregateRow.count) || 0 : materials.length;
  const estimatedWeightKg = getEstimatedWeightKg(normName, count);
  const estimatedResaleValueRm = getEstimatedResaleValueRm(normName, count);
  const pricePerKgRm = plMaterialEstimate(normName).pricePerKgRm;
  const contaminated = aggregateRow ? Number(aggregateRow.contaminant_count) || 0 : materials.filter(plIsContaminatedMaterial).length;
  const recyclable = aggregateRow ? Number(aggregateRow.recyclable_count) || 0 : materials.filter(plIsRecyclable).length;
  const avgConfidence = aggregateRow ? Number(aggregateRow.averageConfidence) || 0 : count ? materials.reduce((sum, material) => sum + plConfidencePercent(material.confidence), 0) / count : 0;
  const isContaminant = contaminated > 0 && recyclable === 0;
  const color = "#00F08A";
  const subtitle = count ? `${count} saved detection(s) from scan results.` : "No saved detections for this material yet.";
  const zones = count ? [["Recyclable", recyclable], ["Contaminated", contaminated], ["Other", Math.max(count - recyclable - contaminated, 0)]] : [];

  panel.querySelectorAll("[data-material-title]").forEach(el => { el.textContent = normName; });
  panel.querySelectorAll("[data-material-subtitle]").forEach(el => { el.textContent = subtitle; });
  panel.querySelectorAll("[data-material-tonnage]").forEach(el => { el.textContent = plFormatKg(estimatedWeightKg); el.style.color = color; });
  panel.querySelectorAll("[data-material-value]").forEach(el => { el.textContent = plFormatRm(estimatedResaleValueRm); el.style.color = color; });
  panel.querySelectorAll("[data-material-rate]").forEach(el => { el.textContent = `RM ${pricePerKgRm.toFixed(2)}/kg`; });
  panel.querySelectorAll("[data-material-purity]").forEach(el => { el.textContent = `${avgConfidence.toFixed(1)}%`; el.style.color = color; });
  panel.querySelectorAll("[data-material-status]").forEach(el => { el.textContent = count ? `${contaminated} contaminated` : "No data"; });
  panel.querySelectorAll("[data-material-kpi-one]").forEach(el => { el.textContent = "Estimated Weight"; });
  panel.querySelectorAll("[data-material-kpi-two]").forEach(el => { el.textContent = "Resale Value"; });
  panel.querySelectorAll("[data-material-kpi-three]").forEach(el => { el.textContent = "Avg Confidence"; });
  panel.querySelectorAll("[data-material-trend-title]").forEach(el => { el.textContent = "Saved Scan Trend"; });
  panel.querySelectorAll("[data-material-zone-title]").forEach(el => { el.textContent = "Saved Material Status"; });
  panel.querySelectorAll("[data-material-trend]").forEach(el => renderSparkBars(el, count ? aggregateRow ? [avgConfidence] : materials.map(material => plConfidencePercent(material.confidence)) : [], color));
  panel.querySelectorAll("[data-material-zones]").forEach(el => renderBarRows(el, zones, color, ""));

  if (activate) activateDetailPanel("detail-material");
}

function renderStationDetail(stationId, options = {}) {
  const activate = options.activate !== false;

  // Normalize
  let normId = stationId;
  if (stationId === "BELT-A01" || stationId === "BELT-B02" || stationId === "STATION-A01" || stationId === "STATION-B02") normId = "SINGLE-IMAGE";
  if (stationId === "BELT-C03" || stationId === "STATION-C03") normId = "ZIP-BATCH";
  if (stationId === "BELT-D04" || stationId === "STATION-D04") normId = "QUARANTINE-UPLOAD";

  const summary = plAnalyticsSummaryForActiveScope();
  const data = {
    load: String(summary.scans.length),
    capacity: "Saved scans",
    speed: "YOLOv8 backend",
    maxSpeed: "Supabase records",
    scanner: getUploadSourceDisplayName(normId),
    motor: summary.scans.length ? "Data available" : "No data",
    air: "Upload-triggered",
    action: summary.reviewCount ? "Review needed" : "No pending review",
    insight: summary.scans.length ? "Saved scans are loaded from Supabase records." : "No scan data yet. Upload a file to generate model results.",
    uptime: [["Cleared", summary.clearedCount], ["Review", summary.reviewCount], ["Quarantined", summary.quarantinedCount]],
    composition: [["Recyclable", summary.recyclableCount], ["Non-recyclable", summary.nonRecyclableCount], ["Contaminated", summary.contaminationCount]]
  };
  const panel = document.getElementById("detail-belt");
  if (!panel) return;

  const sourceLabel = getUploadSourceDisplayName(normId);
  panel.querySelectorAll("[data-belt-id]").forEach(el => { el.textContent = sourceLabel; });
  panel.querySelectorAll("[data-belt-load]").forEach(el => { el.textContent = data.load; });
  panel.querySelectorAll("[data-belt-capacity]").forEach(el => { el.textContent = data.capacity; });
  panel.querySelectorAll("[data-belt-speed]").forEach(el => { el.textContent = data.speed; });
  panel.querySelectorAll("[data-belt-max-speed]").forEach(el => { el.textContent = data.maxSpeed; });
  panel.querySelectorAll("[data-belt-scanner]").forEach(el => { el.textContent = data.scanner; });
  panel.querySelectorAll("[data-belt-motor]").forEach(el => { el.textContent = data.motor; });
  panel.querySelectorAll("[data-belt-air]").forEach(el => { el.textContent = data.air; });
  panel.querySelectorAll("[data-belt-action]").forEach(el => { el.textContent = data.action; });
  panel.querySelectorAll("[data-belt-insight]").forEach(el => { el.textContent = data.insight; });
  panel.querySelectorAll("[data-belt-uptime]").forEach(el => renderBarRows(el, data.uptime, "#167647", "%"));
  panel.querySelectorAll("[data-belt-composition]").forEach(el => renderBarRows(el, data.composition, "#2f6f8f", "%"));

  // Adjust headings of drill-down to upload-source layout
  const kicker = panel.querySelector(".eyebrow");
  if (kicker) kicker.textContent = "Upload source";
  const title = panel.querySelector("h2");
  if (title) title.innerHTML = `Source: <span data-belt-id>${sourceLabel}</span>`;

  const labels = panel.querySelectorAll(".detail-card h3");
  if (labels[0]) labels[0].textContent = "Upload diagnostics";
  if (labels[1]) labels[1].textContent = "Review reliability and material mix";

  const rows = panel.querySelectorAll(".detail-list dt");
  if (rows[0]) rows[0].textContent = "Input channel";
  if (rows[1]) rows[1].textContent = "Compute state";
  if (rows[2]) rows[2].textContent = "File policy";

  if (activate) activateDetailPanel("detail-belt");
}

function initDrillThrough() {
  document.querySelectorAll("[data-drill-target]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      if (event.target.closest("[data-material-detail], [data-belt-detail]")) return;
      activateDetailPanel(trigger.dataset.drillTarget);
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateDetailPanel(trigger.dataset.drillTarget);
      }
    });
  });

  document.querySelectorAll("[data-material-detail]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      renderMaterialDetail(trigger.dataset.materialDetail);
    });
  });

  document.querySelectorAll("[data-belt-detail]").forEach(trigger => {
    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      renderStationDetail(trigger.dataset.beltDetail);
    });
  });

  if (document.querySelector(".belt-detail-output")) {
    const defaultBelt = document.querySelector("[data-belt-id]")?.textContent?.trim() || "UPLOAD-HUB";
    renderStationDetail(defaultBelt, { activate: false });
  }
}

/* Toast Notification System */
function showToast(message, type = "success") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success"
    ? '<i class="fa-solid fa-circle-check"></i>'
    : type === "error"
      ? '<i class="fa-solid fa-circle-xmark"></i>'
      : '<i class="fa-solid fa-triangle-exclamation"></i>';

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // Slide in
  setTimeout(() => toast.classList.add("show"), 10);

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
      // Remove container if empty
      if (container.childNodes.length === 0) {
        container.remove();
      }
    }, 350);
  }, 3500);
}

/* Mobile Sidebar Navigation & Toggle */
function initMobileNav() {
  const toggleBtn = document.getElementById("sidebarToggle");
  const sidebar = document.querySelector(".sidebar");
  if (!toggleBtn || !sidebar) return;

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  toggleBtn.addEventListener("click", () => {
    sidebar.classList.add("active");
    overlay.classList.add("active");
  });

  overlay.addEventListener("click", () => {
    sidebar.classList.remove("active");
    overlay.classList.remove("active");
  });

  // Close sidebar on link click
  sidebar.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    });
  });
}

/* 2. Login Password Reveal Toggle */
function initPasswordToggle() {
  const toggleBtn = document.getElementById("passwordToggle");
  const passwordInput = document.getElementById("password");
  if (!toggleBtn || !passwordInput) return;

  toggleBtn.addEventListener("click", () => {
    const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
    passwordInput.setAttribute("type", type);
    const icon = toggleBtn.querySelector("i");
    if (icon) {
      if (type === "text") {
        icon.className = "fa-solid fa-eye-slash";
      } else {
        icon.className = "fa-solid fa-eye";
      }
    }
  });
}

/* KPI Progress Bars Animation */
function animateProgressBars() {
  document.querySelectorAll(".kpi-progress-bar i, .kpi-progress-fill").forEach(bar => {
    const targetWidth = bar.style.getPropertyValue("--target-width") || bar.style.width || "0%";
    if (!bar.style.getPropertyValue("--target-width")) {
      bar.style.setProperty("--target-width", targetWidth);
    }
    bar.style.width = "0%";

    // Force reflow
    bar.offsetHeight;

    setTimeout(() => {
      bar.style.width = bar.style.getPropertyValue("--target-width") || targetWidth;
    }, 160);
  });
}

function plRevealPageFallback() {
  document.body.classList.remove("page-loading", "page-leaving");
  document.body.classList.add("page-loaded");
}

async function plRunAppInit(name, init) {
  try {
    return await init();
  } catch (error) {
    console.error(`PurityLoop: ${name} failed.`, error);
    plRevealPageFallback();
    return null;
  }
}

let plAppInitKey = "";
let plAppInitPromise = null;
let plAppInitializedKey = "";

function plCurrentRouteKey() {
  return `${window.location.pathname}${window.location.search}::${document.body.dataset.page || "root"}`;
}

/* Page Navigation Match & Trigger */
async function initPurityLoopApp() {
  const routeKey = plCurrentRouteKey();
  if (plAppInitializedKey === routeKey) return plAppInitPromise;
  if (plAppInitPromise && plAppInitKey === routeKey) return plAppInitPromise;

  plAppInitKey = routeKey;
  plAppInitPromise = (async () => {
    await plRunAppInit("navigation label init", () => {
      const sideLinks = document.querySelectorAll(".side-nav a");
      sideLinks.forEach(link => {
        const text = link.textContent.trim();
        if (text === "Live AI Stream") {
          link.textContent = "Classification Result";
        } else if (text === "Review Logs") {
          link.textContent = "Verification Logs";
        } else if (text === "Analytics & Reports") {
          link.textContent = "Operations Dashboard";
        }
      });
    });

    await plRunAppInit("password toggle init", initPasswordToggle);
    await plRunAppInit("progress bar init", animateProgressBars);
    // Analytics owns its request so selected-date data cannot mix with shared history data.
    if (!["/", "/login"].includes(window.location?.pathname || "") && document.body.dataset.page !== "analytics") {
      void plRunAppInit("Supabase scan refresh", () => plRefreshScanResultsFromSupabase({ isCurrent: () => plCurrentRouteKey() === routeKey }));
    }
    if (plCurrentRouteKey() !== routeKey) return;
    await plRunAppInit("upload page init", initUploadPage);
    await plRunAppInit("result page init", initResultPage);
    await plRunAppInit("review modal init", initReviewModal);
    await plRunAppInit("analytics charts init", initAnalyticsCharts);
    await plRunAppInit("settings page init", initSettingsPage);
    await plRunAppInit("drill-through init", initDrillThrough);
    plAppInitializedKey = routeKey;
    plRevealPageFallback();
  })().finally(() => {
    if (plAppInitKey === routeKey) plAppInitPromise = null;
  });

  return plAppInitPromise;
}

window.initPurityLoopApp = initPurityLoopApp;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPurityLoopApp);
} else {
  initPurityLoopApp();
}

window.addEventListener('purityloop:page-ready', initPurityLoopApp);
