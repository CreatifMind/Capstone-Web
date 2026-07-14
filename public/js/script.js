/* PurityLoop AI - Smart Waste Sorting & Contamination Detection */

/* RELIABLE prototype limits */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const MAX_BATCH_IMAGES = 10;
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100 MB per ZIP file
const MAX_ZIP_IMAGES = 50;
const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_EXTRACTED_SIZE = 500 * 1024 * 1024;
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
let plSelectedUploadFiles = [];

function plConfig() {
  return window.__PURITYLOOP_CONFIG__ || {};
}

function plUseSupabase() {
  const config = plConfig();
  return Boolean(config.useSupabase && config.supabaseUrl && config.supabaseAnonKey);
}

function plApiBaseUrl() {
  return String(plConfig().apiBaseUrl || "").replace(/\/$/, "");
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
const PL_CATEGORY_CLASS_MAP = {
  general_trash: "contaminant", food_organics: "contaminant", textile: "contaminant", battery: "contaminant",
  metal: "recyclable", plastic: "recyclable", glass: "recyclable", paper: "recyclable", cardboard: "recyclable"
};
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

function plEvaluateMaterial(material) {
  const decision = material?.review_decision;
  const category = plCategoryKey(decision?.chosen_category || material?.category || material?.material_name);
  const materialClass = ["recyclable", "contaminant"].includes(decision?.disposition) ? decision.disposition : (["recyclable", "contaminant"].includes(material?.material_class) ? material.material_class : (PL_CATEGORY_CLASS_MAP[category] || "unknown"));
  const confidence = plConfidencePercent(material?.confidence);
  const reviewOutcome = plNormalizeStatus(decision?.outcome || decision?.review_outcome || "confirmed");
  const rejected = Boolean(decision) && reviewOutcome === "rejected";
  const reviewRequired = !decision && (confidence < PL_CONFIRMATION_THRESHOLD || materialClass === "unknown");
  return {
    category,
    materialClass,
    confidence,
    reviewRequired,
    reviewOutcome,
    decisionStatus: rejected ? "rejected" : reviewRequired ? "review_needed" : "confirmed",
    displayStatus: rejected ? "Rejected" : reviewRequired ? "Review Needed" : materialClass === "recyclable" ? "Confirmed Recyclable" : materialClass === "contaminant" ? "Confirmed Contaminant" : "Review Needed",
    disposalRoute: reviewRequired || materialClass === "unknown" ? "Manual Audit Queue" : PL_CATEGORY_ROUTES[category]
  };
}

function plIsClean(material) {
  return plEvaluateMaterial(material).materialClass === "recyclable";
}

function plIsRecyclable(material) {
  return plEvaluateMaterial(material).materialClass === "recyclable";
}

function plIsContaminatedMaterial(material) {
  return plEvaluateMaterial(material).materialClass === "contaminant";
}

function plConfidencePercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function plScanNeedsReview(scan) {
  const materials = plSafeArray(scan?.detected_materials);
  return materials.length
    ? materials.some(material => plEvaluateMaterial(material).reviewRequired)
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
    created_at: scan.created_at || new Date().toISOString(),
    detected_materials: plSafeArray(scan.detected_materials).map(plNormalizeMaterial)
  };
}

async function plRefreshScanResultsFromSupabase() {
  if (!plUseSupabase()) {
    if (plConfig().useSupabase) console.error("PurityLoop: Supabase config missing.");
    return false;
  }
  const config = plConfig();
  const baseUrl = String(config.supabaseUrl).replace(/\/$/, "");
  const headers = {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`
  };
  try {
    const scanColumns = "id,image_url,preview_image_url,drive_file_id,drive_file_name,drive_web_url,source_name,source_size,created_at,overall_status,upload_status,contamination_risk,recommended_action,human_review_required,overall_confidence";
    const scansResponse = await fetch(`${baseUrl}/rest/v1/mock_scan_results?select=${scanColumns}&order=created_at.desc`, { headers });
    if (!scansResponse.ok) {
      console.error("PurityLoop: mock_scan_results fetch failed.", scansResponse.status, await scansResponse.text());
      return false;
    }

    const materialsResponse = await fetch(`${baseUrl}/rest/v1/mock_detected_materials?select=*`, { headers });
    if (!materialsResponse.ok) {
      console.error("PurityLoop: mock_detected_materials fetch failed.", materialsResponse.status, await materialsResponse.text());
      return false;
    }

    const reviewsResponse = await fetch(`${baseUrl}/rest/v1/scan_review_decisions?select=*`, { headers });
    const scansPayload = await scansResponse.json();
    const materialsPayload = await materialsResponse.json();
    const reviewsPayload = reviewsResponse.ok ? await reviewsResponse.json() : [];
    const latestReviews = plSafeArray(reviewsPayload).reduce((acc, review) => {
      const key = String(review.detected_material_id || "");
      if (!key || !acc[key] || String(acc[key].created_at || "") < String(review.created_at || "")) acc[key] = review;
      return acc;
    }, {});
    const groupedMaterials = plSafeArray(materialsPayload).reduce((acc, material) => {
      const scanResultId = String(material.scan_result_id || "");
      if (!scanResultId) return acc;
      acc[scanResultId] = acc[scanResultId] || [];
      acc[scanResultId].push({ ...material, review_decision: latestReviews[String(material.id || "")] || null });
      return acc;
    }, {});
    const scans = plSafeArray(scansPayload)
      .map(scan => ({ ...scan, detected_materials: groupedMaterials[String(scan.id || "")] || [] }))
      .map(plNormalizeScan)
      .filter(Boolean);
    plSetScanResults(scans);
    return true;
  } catch (error) {
    console.error("PurityLoop: Supabase scan refresh failed.", error);
    return false;
  }
}

function plGetScanResults() {
  return plSafeArray(plSafeJsonParse(localStorage.getItem(PL_SCAN_LOGS_KEY), [])).map(plNormalizeScan).filter(Boolean);
}

function plSetScanResults(scans) {
  const safeScans = plSafeArray(scans).filter(scan => scan && scan.id);
  plSetJson(PL_SCAN_LOGS_KEY, safeScans);
  if (safeScans[0]) plSetJson(PL_LATEST_SCAN_KEY, safeScans[0]);
}

function plSaveScanResult(scan) {
  if (!scan || !scan.id) return null;
  const scans = plGetScanResults().filter(item => item.id !== scan.id);
  const next = [scan, ...scans];
  plSetScanResults(next);
  return scan;
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
  return plGetScanResultById(params.get("scanId")) || plGetLatestScanResult();
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
      color: decision.materialClass === "contaminant" ? "#ff8000" : (detectionResults[decision.category]?.color || "#39d12f"),
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
  const decision = plEvaluateMaterial(material);
  return {
    id: `${scan.id}:${material.id || index}`,
    scanId: scan.id,
    materialId: material.id || "",
    material,
    timestamp: new Date(scan.created_at || Date.now()).getTime(),
    time: plFormatScanTime(scan),
    source: scan.source_name || "Uploaded image",
    category: plNormalizeCategory(decision.category),
    materialClass: decision.materialClass,
    weight: plFormatKg(getEstimatedWeightKg(material.category || material.material_name)),
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
  if (!apiBase || !scan?.id || !material?.id) throw new Error("Review persistence is not configured for this scan.");
  const reviewer = plSafeJsonParse(sessionStorage.getItem("purityloop_demo_user"), {})?.email || null;
  const disposition = PL_CATEGORY_CLASS_MAP[plCategoryKey(chosenCategory)] || "unknown";
  const response = await fetch(`${apiBase}/api/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scan_result_id: scan.id, detected_material_id: material.id, chosen_category: chosenCategory, disposition, outcome, reviewer_email: reviewer }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "Unable to save review.");
  await plRefreshScanResultsFromSupabase();
  return payload;
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

function getEstimatedResaleValueRm(material, count = 1) {
  const estimate = plMaterialEstimate(material);
  return estimate.averageWeightKg * count * estimate.pricePerKgRm;
}

function plFormatKg(value) {
  return `${(Number(value) || 0).toFixed(3)} kg`;
}

function plFormatRm(value) {
  return `RM ${(Number(value) || 0).toFixed(2)}`;
}

function plAnalyticsDayStart(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function plGetAnalyticsSummary(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const requestedDays = Number(options.days);
  const hasRange = Boolean(options.rangeStart || options.rangeEnd || (Number.isFinite(requestedDays) && requestedDays > 0));
  const days = Math.max(1, requestedDays || 1);
  const rangeStart = options.rangeStart ? new Date(options.rangeStart) : hasRange ? (() => {
    const start = plAnalyticsDayStart(now);
    start.setDate(start.getDate() - (days - 1));
    return start;
  })() : new Date(0);
  const rangeEnd = options.rangeEnd ? new Date(options.rangeEnd) : hasRange ? now : new Date(8640000000000000);
  const allScans = plSafeArray(options.scans || plGetScanResults());
  const scans = allScans.filter(scan => {
    const createdAt = new Date(scan?.created_at || 0);
    return Number.isFinite(createdAt.getTime()) && createdAt >= rangeStart && createdAt <= rangeEnd;
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
  const confirmedRows = materialRows.filter(({ decision }) => decision.decisionStatus === "confirmed" && decision.materialClass !== "unknown");
  const confirmedMaterials = confirmedRows.map(row => row.material);
  const recyclableCount = confirmedRows.filter(({ decision }) => decision.materialClass === "recyclable").length;
  const contaminationCount = materialRows.filter(({ decision }) => decision.decisionStatus === "confirmed" && decision.materialClass === "contaminant").length;
  const reviewCount = materialRows.filter(({ decision }) => decision.reviewRequired).length;
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
  const trendByDay = new Map();
  for (let cursor = plAnalyticsDayStart(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
    trendByDay.set(cursor.toLocaleDateString([], { month: "short", day: "numeric" }), 0);
  }
  scans.forEach(scan => {
    const key = new Date(scan.created_at).toLocaleDateString([], { month: "short", day: "numeric" });
    trendByDay.set(key, (trendByDay.get(key) || 0) + 1);
  });
  const highRiskCount = confirmedRows.filter(({ decision }) => decision.category === "battery" && decision.materialClass === "contaminant").length;
  const recoveryOpportunityCount = confirmedRows.filter(({ material, decision }) => decision.materialClass === "recyclable" && getEstimatedResaleValueRm(material) > 0).length;
  const recentEvents = materialRows
    .sort((a, b) => new Date(b.scan.created_at || 0) - new Date(a.scan.created_at || 0))
    .slice(0, 5)
    .map(({ scan, material, decision }) => ({
      timestamp: scan.created_at,
      source: scan.source_name || scan.source_type || "Web Upload",
      event: material?.review_decision ? "Review Completed" : decision.decisionStatus === "rejected" ? "Scan Rejected" : decision.materialClass === "contaminant" && decision.decisionStatus === "confirmed" ? "Contaminant Alert" : "Scan Verified",
      status: decision.displayStatus,
      details: `${plNormalizeCategory(decision.category)} · ${decision.confidence.toFixed(1)}% confidence`
    }));
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
    totalEstimatedResaleValueRm,
    recyclableRows,
    contaminatedRows,
    recyclableCount,
    nonRecyclableCount: confirmedMaterials.filter(plIsContaminatedMaterial).length,
    contaminationCount,
    reviewCount,
    lowConfidenceCount: reviewCount,
    hazardCount: highRiskCount,
    clearedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "accepted").length,
    quarantinedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "quarantined").length,
    avgConfidence,
    confirmedTodayCount,
    recyclableTop,
    contaminantTop,
    highestValue,
    averageReviewTurnaroundMs,
    lastUpload: allScans.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null,
    sourceCounts,
    trendRows: Array.from(trendByDay, ([label, value]) => ({ label, value })),
    highRiskCount,
    recoveryOpportunityCount,
    recentEvents
  };
}

function plCategoryPalette(palette) {
  return [palette.green, palette.teal, palette.blue, palette.amber, palette.purple, palette.red, palette.slate, "#9FE870", "#FF8A65"];
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

async function plRunBackendPrediction(file, { showUploadProgress = true } = {}) {
  const apiBaseUrl = plApiBaseUrl();
  if (!apiBaseUrl) throw new Error("Backend API URL is not configured.");
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Upload one image file.");

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
    request.send(formData);
  });

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

/*****************************************
 * 1. IMAGE UPLOAD & WEBCAM CAPTURE PAGE *
 *****************************************/
function initUploadPage() {
  const fileUpload = document.getElementById("fileUpload");
  const zipUpload = document.getElementById("zipUpload");
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
  let isProcessing = false;
  let batchId = "";

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
        processSelectedFiles(files);
      }
    });
  }

  fileUpload.addEventListener("change", function () {
    if (fileUpload.files.length > 0) {
      processSelectedFiles(fileUpload.files);
    }
  });
  if (zipUpload) {
    zipUpload.addEventListener("change", function () {
      const archive = zipUpload.files?.[0];
      if (archive) processZipUpload(archive);
    });
  }

  if (clearUploadBtn) clearUploadBtn.addEventListener("click", clearQueue);
  if (scanImageBtn) scanImageBtn.addEventListener("click", () => runBatch(queue.filter(item => item.status === "ready")));

  // Open Webcam Modal
  const cameraLauncher = document.createElement("button");
  cameraLauncher.type = "button";
  cameraLauncher.className = "secondary-btn full-btn";
  cameraLauncher.id = "launchCameraBtn";
  cameraLauncher.innerHTML = '<i class="fa-solid fa-camera"></i> Open Camera Capture';
  cameraLauncher.style.marginTop = "10px";
  uploadBox.appendChild(cameraLauncher);

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
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
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
    if (!webcamStream) return;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // Draw mirrored if front facing, but environment usually is fine
    ctx.drawImage(webcamVideo, 0, 0, 640, 480);

    canvas.toBlob(async blob => {
      if (!blob) {
        showToast("Camera capture failed.", "error");
        return;
      }
      const file = new File([blob], "Camera_Snapshot_" + Date.now().toString().slice(-4) + ".jpg", { type: "image/jpeg" });
      try {
        const scan = await plRunBackendPrediction(file);
        stopWebcam();
        window.location.href = `/result?scanId=${encodeURIComponent(scan.id)}`;
      } catch (error) {
        showToast(error.message || "AI scan failed. Check backend and try again.", "error");
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

    for (const file of list) {
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      if (!/^image\/(jpeg|png|webp)$/.test(String(file.type || "").toLowerCase())) {
        rejected.push(`${file.name} - Unsupported file type.`);
        continue;
      }
      if (Number(file.size || 0) > MAX_IMAGE_SIZE) {
        rejected.push(`${file.name} - File exceeds 10 MB.`);
        continue;
      }
      if (keys.has(key)) {
        rejected.push(`${file.name} - Duplicate file.`);
        continue;
      }
      try {
        const item = await createQueueItem(file, key);
        queue.push(item);
        keys.add(key);
      } catch {
        rejected.push(`${file.name} - Image could not be read.`);
      }
    }

    if (fileUpload) fileUpload.value = "";
    if (!batchId && queue.length) batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (uploadBox) uploadBox.dataset.batchId = batchId;
    setMessages(queue.length ? `${queue.length} image${queue.length === 1 ? "" : "s"} added.` : "None of the selected files could be added.", rejected);
    renderQueue();
  }

  function showDirectUploadLimit(count) {
    setMessages(`You selected ${count} images. Direct upload supports up to 10 images. Upload the images as a ZIP file to process them together.`);
    if (!messagesEl) return;
    const actions = document.createElement("div");
    actions.className = "upload-message-actions";
    const uploadZip = document.createElement("button");
    uploadZip.type = "button";
    uploadZip.className = "secondary-btn";
    uploadZip.textContent = "Upload ZIP";
    uploadZip.addEventListener("click", () => zipUpload?.click());
    const chooseFewer = document.createElement("button");
    chooseFewer.type = "button";
    chooseFewer.className = "text-btn";
    chooseFewer.textContent = "Choose Fewer Images";
    chooseFewer.addEventListener("click", () => fileUpload?.click());
    actions.append(uploadZip, chooseFewer);
    messagesEl.appendChild(actions);
  }

  async function processZipUpload(archive) {
    if (isProcessing) return;
    if (!archive || !/\.zip$/i.test(archive.name) || Number(archive.size || 0) > MAX_ZIP_SIZE) {
      setMessages("ZIP upload failed. Choose a ZIP file no larger than 100 MB.");
      if (zipUpload) zipUpload.value = "";
      return;
    }

    try {
      const bytes = new Uint8Array(await archive.arrayBuffer());
      const entries = inspectZipEntries(bytes);
      const relevantEntries = entries.filter(entry => !entry.isDirectory && !isIgnoredZipEntry(entry.name));
      if (relevantEntries.length > MAX_ZIP_ENTRIES) {
        setMessages(`This ZIP contains ${relevantEntries.length} archive entries. The maximum ZIP archive is ${MAX_ZIP_ENTRIES} entries.`);
        return;
      }

      const supported = relevantEntries.filter(entry => isSupportedImageName(entry.name));
      const extractedSize = supported.reduce((total, entry) => total + entry.originalSize, 0);
      const oversized = supported.filter(entry => entry.originalSize > MAX_IMAGE_SIZE);
      if (oversized.length || extractedSize > MAX_ZIP_EXTRACTED_SIZE) {
        setMessages(
          oversized.length ? "This ZIP contains an image above the 10 MB extracted image limit." : "This ZIP exceeds the 500 MB total extracted size limit.",
          oversized.map(entry => `${entry.name} - File exceeds 10 MB.`)
        );
        return;
      }

      const extracted = await unzipArchive(bytes, new Set(supported.map(entry => entry.name)));
      const rejected = relevantEntries
        .filter(entry => !isSupportedImageName(entry.name))
        .map(entry => `${entry.name} - Unsupported file type.`);
      const keys = new Set(queue.map(item => item.key));
      const stagedItems = [];

      for (const entry of supported) {
        const data = extracted[entry.name];
        if (!data || data.length !== entry.originalSize) {
          rejected.push(`${entry.name} - Image could not be extracted.`);
          continue;
        }
        const mimeType = imageMimeTypeFromBytes(data);
        if (!mimeType) {
          rejected.push(`${entry.name} - Image MIME type is invalid.`);
          continue;
        }
        const key = `${archive.name}|${entry.name}|${entry.originalSize}|${archive.lastModified}`;
        if (keys.has(key)) {
          rejected.push(`${entry.name} - Duplicate file.`);
          continue;
        }
        try {
          const imageFile = new File([data], entry.name, { type: mimeType, lastModified: archive.lastModified });
          stagedItems.push(await createQueueItem(imageFile, key));
          keys.add(key);
        } catch {
          rejected.push(`${entry.name} - Image could not be read.`);
        }
      }

      if (stagedItems.length > MAX_ZIP_IMAGES) {
        stagedItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
        setMessages(`This ZIP contains ${stagedItems.length} supported images. The maximum ZIP batch is 50 images. Reduce the archive and try again.`, rejected);
        return;
      }
      if (queue.length + stagedItems.length > MAX_ZIP_IMAGES) {
        stagedItems.forEach(item => URL.revokeObjectURL(item.previewUrl));
        setMessages(`This ZIP contains ${stagedItems.length} supported images, but the current queue can contain up to ${MAX_ZIP_IMAGES} images. Remove queued images and try again.`, rejected);
        return;
      }
      queue.push(...stagedItems);

      if (!batchId && queue.length) batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (uploadBox) uploadBox.dataset.batchId = batchId;
      setMessages(
        stagedItems.length <= MAX_BATCH_IMAGES
          ? `This ZIP contains ${stagedItems.length} images. Direct image upload is recommended for batches of 10 or fewer.`
          : `${stagedItems.length} ZIP image${stagedItems.length === 1 ? "" : "s"} added.`,
        rejected
      );
      renderQueue();
    } catch (error) {
      setMessages(error?.message || "ZIP upload failed. Check the archive and try again.");
    } finally {
      if (zipUpload) zipUpload.value = "";
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

  async function createQueueItem(file, key) {
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
        key,
        file,
        previewUrl,
        dataUrl: createResultPreview(image),
        status: "ready",
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

  function renderQueue() {
    const hasItems = queue.length > 0;
    plSelectedUploadFiles = queue.map(item => item.file);
    if (fileName) fileName.textContent = hasItems ? `${queue.length} image${queue.length === 1 ? "" : "s"} selected` : "No images selected";
    if (scanImageBtn) {
      const readyCount = queue.filter(item => item.status === "ready").length;
      scanImageBtn.disabled = isProcessing || !readyCount;
      scanImageBtn.innerHTML = isProcessing
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Detecting Images'
        : `<i class="fa-solid fa-magnifying-glass-chart"></i> Detect ${readyCount} Image${readyCount === 1 ? "" : "s"}`;
    }
    if (fileUpload) fileUpload.disabled = isProcessing;
    if (zipUpload) zipUpload.disabled = isProcessing;
    if (clearUploadBtn) clearUploadBtn.disabled = isProcessing || !hasItems;
    if (!queueEl) return;
    queueEl.innerHTML = "";
    if (!hasItems) {
      queueEl.innerHTML = '<p class="upload-queue-empty">No images selected.</p>';
      return;
    }
    queue.forEach(item => {
      const row = document.createElement("div");
      row.className = `upload-queue-item status-${item.status}`;
      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = "";
      const details = document.createElement("div");
      details.className = "upload-queue-details";
      const name = document.createElement("strong");
      name.textContent = item.file.name;
      const meta = document.createElement("span");
      meta.textContent = formatFileSize(item.file.size);
      details.append(name, meta);
      const status = document.createElement("span");
      status.className = "upload-queue-status";
      status.textContent = queueStatusLabel(item.status);
      if (item.errorMessage) status.title = item.errorMessage;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "text-btn upload-queue-remove";
      remove.textContent = "Remove";
      remove.disabled = isProcessing || item.status === "processing";
      remove.setAttribute("aria-label", `Remove ${item.file.name}`);
      remove.addEventListener("click", () => removeQueueItem(item.localId));
      row.append(image, details, status, remove);
      queueEl.appendChild(row);
    });
  }

  function queueStatusLabel(status) {
    return ({ ready: "Ready", waiting: "Waiting", processing: "Analysing", completed: "Completed", review_needed: "Review Needed", failed: "Failed" })[status] || "Ready";
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
    renderQueue();
  }

  function clearQueue() {
    if (isProcessing) return;
    queue.forEach(item => URL.revokeObjectURL(item.previewUrl));
    queue = [];
    batchId = "";
    if (uploadBox) delete uploadBox.dataset.batchId;
    plSelectedUploadFiles = [];
    plSetJson(PL_UPLOADS_KEY, []);
    if (fileUpload) fileUpload.value = "";
    if (batchSummaryEl) batchSummaryEl.hidden = true;
    if (processingStatusEl) processingStatusEl.textContent = "";
    setMessages("No images selected.");
    renderQueue();
  }

  async function runBatch(items) {
    if (isProcessing || !items.length) return;
    const retrying = items.every(item => item.status === "failed");
    isProcessing = true;
    plHideUploadProgress();
    if (batchSummaryEl) batchSummaryEl.hidden = true;
    items.forEach(item => { item.status = "waiting"; item.errorMessage = ""; });
    renderQueue();
    if (uploadBox) uploadBox.classList.add("is-processing");

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      item.status = "processing";
      if (processingStatusEl) processingStatusEl.textContent = `${retrying ? "Retrying" : "Processing"} ${index + 1} of ${items.length} images`;
      renderQueue();
      try {
        const scan = await plRunBackendPrediction(item.file, { showUploadProgress: false });
        item.scanId = scan.id;
        item.status = plScanNeedsReview(scan) ? "review_needed" : "completed";
      } catch (error) {
        item.status = "failed";
        item.errorMessage = error?.message || "The image could not be processed. Check the connection and try again.";
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
    const firstScan = queue.find(item => item.scanId)?.scanId;
    batchSummaryEl.hidden = false;
    batchSummaryEl.innerHTML = "";
    const summary = document.createElement("p");
    summary.textContent = failed ? "Some images could not be processed." : review ? "Processing complete. Some detections require manager review." : "All images were processed successfully.";
    batchSummaryEl.appendChild(summary);
    const count = document.createElement("p");
    count.textContent = `${completed} completed, ${review} require review, ${failed} failed`;
    batchSummaryEl.appendChild(count);
    if (firstScan) {
      const view = document.createElement("button");
      view.type = "button";
      view.className = "primary-btn";
      view.textContent = review ? "Review Results" : "View Results";
      view.addEventListener("click", () => { window.location.href = `/result?scanId=${encodeURIComponent(firstScan)}`; });
      batchSummaryEl.appendChild(view);
    }
    if (failed) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = "Retry Failed Images";
      retry.addEventListener("click", () => runBatch(queue.filter(item => item.status === "failed")));
      batchSummaryEl.appendChild(retry);
    }
  }

  window.addEventListener("beforeunload", () => queue.forEach(item => URL.revokeObjectURL(item.previewUrl)), { once: true });

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
          <button type="button" class="primary-btn" id="captureWebcamBtn" disabled style="width: 100%;">Capture & Run AI Classification</button>
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

  const ctx2d = canvas.getContext("2d");
  const itemsScannedEl = document.getElementById("liveScanned");
  const itemsPurityEl = document.getElementById("livePurity");
  const liveFeed = document.getElementById("liveFeed");
  const actionText = document.getElementById("liveActionText");
  const actionBadge = document.getElementById("liveActionBadge");
  const activeBeltTitle = document.getElementById("liveStreamTitle");
  const previousScanBtn = document.getElementById("previousScanBtn");
  const nextScanBtn = document.getElementById("nextScanBtn");
  const navigationStatus = document.getElementById("finderNavigationStatus");

  const scans = plGetScanResults();
  const cachedUploadPreviews = plSafeArray(plSafeJsonParse(localStorage.getItem(PL_UPLOADS_KEY), []));
  const findCachedUploadPreview = sourceName => {
    const key = String(sourceName || "");
    const match = cachedUploadPreviews.find(upload => {
      const name = String(upload?.name || "");
      return upload?.dataUrl && name && (name === key || key.endsWith(name) || key.includes(name));
    });
    return match?.dataUrl || "";
  };
  let uploads = scans.map(scan => {
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
  const requestedScan = plGetRequestedScanResult();
  console.info("[result] scanId from URL", new URLSearchParams(window.location.search).get("scanId") || "");

  let activeIndex = 0;
  if (requestedScan) {
    const requestedIndex = uploads.findIndex(upload => upload.scanId === requestedScan.id);
    activeIndex = requestedIndex >= 0 ? requestedIndex : 0;
  }
  let activeScan = requestedScan || scans[0] || null;
  let activeImageObj = null;

  // Keep page headings aligned with the upload-to-result workflow
  const eyebrowEl = document.querySelector(".main-content .eyebrow");
  if (eyebrowEl) eyebrowEl.textContent = "AI Classification Hub";

  const headingEl = document.querySelector(".main-content h1");
  if (headingEl) headingEl.textContent = "Image Classification Results";

  const descEl = document.querySelector(".main-content header p");
  if (descEl) descEl.textContent = "Review uploaded images, confidence scores, contaminants, and recommended sorting action.";

  // Rename sidebar menu
  const sidebarNote = document.querySelector(".sidebar-note");
  if (sidebarNote) {
    sidebarNote.innerHTML = `
      <strong>Classification Hub</strong>
      <p>Audit uploaded datasets and webcam frame results before database ledger logging.</p>
    `;
  }


  // Render Finder Grid and Load Active image
  renderFinderGrid();
  if (activeScan) {
    loadActiveImage();
  } else {
    renderEmptyResult();
  }

  // Redraw canvas on window resize to stay responsive
  window.addEventListener('resize', () => {
    if (activeImageObj) drawCanvasFrame();
  });
  if (canvas.dataset.themeRedrawReady !== "true") {
    canvas.dataset.themeRedrawReady = "true";
    window.addEventListener("purityloop:theme-change", () => {
      if (activeImageObj) drawCanvasFrame();
      else drawEmptyScanCanvas("No scan data");
    });
  }

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
    activeIndex = (index + uploads.length) % uploads.length;
    activeScan = plGetScanResultById(uploads[activeIndex].scanId);
    if (activeScan) window.history.replaceState(null, "", `/result?scanId=${encodeURIComponent(activeScan.id)}`);
    renderFinderGrid();
    loadActiveImage();
  }

  if (previousScanBtn) previousScanBtn.addEventListener("click", () => selectScan(activeIndex - 1));
  if (nextScanBtn) nextScanBtn.addEventListener("click", () => selectScan(activeIndex + 1));

  function renderFinderGrid() {
    const grid = document.getElementById("finderGrid");
    const countText = document.getElementById("finderCountText");
    if (!grid) return;
    grid.innerHTML = "";
    if (countText) countText.textContent = `${uploads.length} item(s)`;
    if (navigationStatus) navigationStatus.textContent = uploads.length ? `Scan ${activeIndex + 1} of ${uploads.length}` : "No uploads";
    if (previousScanBtn) previousScanBtn.disabled = uploads.length < 2;
    if (nextScanBtn) nextScanBtn.disabled = uploads.length < 2;

    if (!uploads.length) {
      grid.innerHTML = `<div class="feed-empty">No uploaded images yet.</div>`;
      return;
    }

    uploads.forEach((file, index) => {
      const scan = plGetScanResultById(file.scanId);
      const fileResult = scan ? { statusClass: plNormalizeStatus(scan.overall_status) === "quarantined" ? "danger" : scan.human_review_required ? "warning" : "safe" } : detectWasteTypeFromFileName(file.name);
      let tagColor = "green";
      if (fileResult.statusClass === "danger") tagColor = "red";
      if (fileResult.statusClass === "warning") tagColor = "yellow";

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
    if (activeBeltTitle) activeBeltTitle.textContent = activeFile.name;

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
        ...detectWasteTypeFromFileName(activeFile.name),
        confidence: `${Math.round(plConfidencePercent(activeScan.overall_confidence))}%`,
        statusClass: plNormalizeStatus(activeScan.overall_status) === "quarantined" ? "danger" : activeScan.human_review_required ? "warning" : "safe",
        status: activeScan.overall_status,
        instruction: activeScan.recommended_action
      }, activeFile);
      return;
    }
    console.info("[result] preview image_url", activeScan.id, activeImageObj.src);

    const result = {
      ...detectWasteTypeFromFileName(activeFile.name),
      confidence: `${Math.round(plConfidencePercent(activeScan.overall_confidence))}%`,
      statusClass: plNormalizeStatus(activeScan.overall_status) === "quarantined" ? "danger" : activeScan.human_review_required ? "warning" : "safe",
      status: activeScan.overall_status,
      instruction: activeScan.recommended_action
    };
    updateResultDetails(result, activeFile);
  }

  function renderEmptyResult() {
    activeImageObj = null;
    if (activeBeltTitle) activeBeltTitle.textContent = "No scan selected";
    if (itemsScannedEl) itemsScannedEl.textContent = "0 items";
    if (itemsPurityEl) itemsPurityEl.textContent = "0%";
    const marketValueEl = document.getElementById("liveMarketValue");
    const reviewNeededEl = document.getElementById("liveReviewNeeded");
    const totalEstimatedResaleValueRm = boxes.reduce((sum, box) => sum + getEstimatedResaleValueRm(box.label), 0);
    if (marketValueEl) marketValueEl.textContent = plFormatRm(totalEstimatedResaleValueRm);
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
  }

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
    return activeScan ? plMaterialsToBoxes(activeScan.detected_materials) : [];
  }

  function updateResultDetails(result, file) {
    const scannedVal = document.getElementById("liveScanned");
    const purityVal = document.getElementById("livePurity");
    const actionPanel = document.getElementById("liveActionPanel");

    const boxes = getActiveBoxes();
    document.body.classList.remove("result-detected");
    requestAnimationFrame(() => document.body.classList.add("result-detected"));

    const materials = activeScan?.detected_materials?.length ? activeScan.detected_materials : plBoxesToMaterials(boxes);
    const confirmedMaterials = materials.filter(material => !plEvaluateMaterial(material).reviewRequired && plEvaluateMaterial(material).materialClass !== "unknown");
    const recyclableCount = confirmedMaterials.filter(plIsRecyclable).length;
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
      const reviewCount = materials.filter(material => plEvaluateMaterial(material).reviewRequired).length;
      reviewNeededEl.textContent = reviewCount ? `${reviewCount} item${reviewCount === 1 ? "" : "s"}` : "Clear";
    }

    // Next Steps Action Guide Generator
    if (actionText) {
      const reviewCount = materials.filter(material => plEvaluateMaterial(material).reviewRequired).length;
      const primary = materials[0];
      const primaryDecision = plEvaluateMaterial(primary);

      let actionHtml = "";
      if (reviewCount) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card review-required";
        if (actionBadge) actionBadge.textContent = "Awaiting human review";
        actionHtml = `
          <dl class="action-status-sheet">
            <div><dt>Status</dt><dd>Awaiting human review</dd></div>
            <div><dt>Next Step</dt><dd>Manual Audit Queue</dd></div>
            <div><dt>Route (Proposed)</dt><dd>${PL_CATEGORY_ROUTES[primaryDecision.category] || "Route after confirmation"}</dd></div>
          </dl>
          <p class="action-callout"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> This item will be routed to the Manual Audit Queue until a reviewer confirms the correct category.</p>
        `;
      } else {
        if (actionPanel) actionPanel.className = `mini-panel action-panel bbox-card ${primaryDecision.materialClass === "contaminant" ? "contaminant-confirmed" : "recovery-clear"}`;
        if (actionBadge) actionBadge.textContent = "Auto-confirmed";
        actionHtml = `
          <dl class="action-status-sheet">
            <div><dt>Status</dt><dd>${primaryDecision.displayStatus}</dd></div>
            <div><dt>Next Step</dt><dd>${primaryDecision.disposalRoute || "Route by material stream"}</dd></div>
            <div><dt>Route</dt><dd>${primaryDecision.disposalRoute || "Route by material stream"}</dd></div>
          </dl>
          <p class="action-callout"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> ${plNormalizeCategory(primaryDecision.category)} is confirmed${primary?.review_decision ? " after human review" : " automatically"}.</p>
        `;
      }
      actionText.innerHTML = actionHtml;
    }

    if (liveFeed) {
      liveFeed.innerHTML = "";

      const primaryMaterial = materials[0];
      const primaryDecision = plEvaluateMaterial(primaryMaterial);
      const primaryWeight = getEstimatedWeightKg(primaryDecision.category);
      const primaryValue = getEstimatedResaleValueRm(primaryDecision.category);
      const primaryRoute = PL_CATEGORY_ROUTES[primaryDecision.category] || "Route by material stream";
      const materialIcon = {
        battery: "fa-battery-full", plastic: "fa-bottle-water", metal: "fa-cube", glass: "fa-wine-bottle",
        paper: "fa-file-lines", cardboard: "fa-box", textile: "fa-shirt", food_organics: "fa-leaf", general_trash: "fa-trash-can"
      }[primaryDecision.category] || "fa-box";
      const summaryCard = document.createElement("section");
      summaryCard.className = `material-summary-card ${primaryDecision.reviewRequired ? "is-review" : ""}`;
      summaryCard.innerHTML = `
        <i class="fa-solid ${materialIcon}" aria-hidden="true"></i>
        <div>
          <strong>${plNormalizeCategory(primaryDecision.category)}</strong>
          <span>${primaryDecision.materialClass === "contaminant" ? "Contaminant" : "Recyclable"} | ${primaryDecision.displayStatus} | Qty: 1</span>
        </div>
        <div class="material-confidence"><strong>${Math.round(primaryDecision.confidence)}%</strong><span>Confidence</span></div>
      `;
      liveFeed.appendChild(summaryCard);

      const metrics = document.createElement("dl");
      metrics.className = "material-metrics";
      metrics.innerHTML = `
        <div><dt>Object Weight</dt><dd>${plFormatKg(primaryWeight)}</dd></div>
        <div><dt>Estimated Reusable Value</dt><dd>${plFormatRm(primaryValue)}</dd></div>
        <div><dt>Disposal / Route</dt><dd>${primaryDecision.reviewRequired ? primaryRoute : primaryDecision.disposalRoute}</dd></div>
      `;
      liveFeed.appendChild(metrics);

      if (materials.length > 1) {
        const count = document.createElement("p");
        count.className = "material-selection-note";
        count.textContent = `${materials.length} detections in this image. Summary shows the first detection.`;
        liveFeed.appendChild(count);
      }

      const unresolved = materials.find(material => plEvaluateMaterial(material).reviewRequired);
      if (unresolved?.id) {
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
            await plSaveReview(activeScan, unresolved, select.value, "confirmed");
            activeScan = plGetScanResultById(activeScan.id) || activeScan;
            showToast("Human review saved.", "success");
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
function initReviewModal() {
  const modal = document.getElementById("reviewModal");
  if (!modal) return;
  if (modal.dataset.historyReady === "true") return;
  modal.dataset.historyReady = "true";
  const tableBody = document.getElementById("ledgerTableBody");
  const searchInput = document.getElementById("historySearch");
  const dateInput = document.getElementById("historyDate");
  const statusInput = document.getElementById("historyStatus");
  const pageButtons = document.getElementById("historyPageButtons");
  const range = document.getElementById("historyRange");
  const state = { page: 1, sort: "timestamp", direction: -1 };
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
    const today = new Date().toDateString();
    const reviewRows = rows.filter(row => row.decisionStatus === "review_needed");
    const frequent = leadingCategory(rows);
    const reviewCategory = leadingCategory(reviewRows);
    const average = rows.length ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length : 0;
    const latest = scans.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    setText("historyConfirmed", statuses.filter(status => status === "confirmed").length);
    setText("historyReviewCount", statuses.filter(status => status === "review_needed").length);
    setText("historyRejected", statuses.filter(status => status === "rejected").length);
    setText("historyProcessedToday", scans.filter(scan => new Date(scan.created_at).toDateString() === today).length);
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

  function filteredRows(rows) {
    const query = String(searchInput?.value || "").trim().toLowerCase();
    const date = String(dateInput?.value || "");
    const status = String(statusInput?.value || "");
    return rows.filter(row => {
      const localDate = new Date(row.timestamp);
      const rowDate = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
      return (!query || `${row.source} ${row.category} ${row.materialClass} ${row.status}`.toLowerCase().includes(query)) && (!date || rowDate === date) && (!status || row.status === status);
    });
  }

  function openReview(log, trigger) {
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

  function closeModal() {
    if (!modal.classList.contains("active")) return;
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    activeLog = null;
    unlockPageScroll();
    restoreFocus();
  }

  function onModalKeydown(event) {
    if (!modal.classList.contains("active")) return;
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
    if (!tableBody) return;
    const allRows = getAuditLedger();
    updateSummary(allRows);
    const rows = filteredRows(allRows).sort((a, b) => (state.sort === "confidence" ? a.confidence - b.confidence : a.timestamp - b.timestamp) * state.direction);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    state.page = Math.min(state.page, totalPages);
    const visible = rows.slice((state.page - 1) * pageSize, state.page * pageSize);
    tableBody.innerHTML = visible.length ? visible.map(row => `<tr class="history-row ${row.decisionStatus === "review_needed" ? "history-row-review" : ""}"><td>${escape(row.time)}</td><td>${row.preview ? `<img class="history-thumb" src="${escape(row.preview)}" alt="${escape(row.category)} preview" />` : '<span class="history-preview-empty"><i class="fa-regular fa-image" aria-hidden="true"></i><span class="sr-only">No preview available</span></span>'}</td><td>${escape(row.category)}</td><td><span class="history-class ${escape(row.materialClass)}">${escape(row.materialClass)}</span></td><td>${escape(row.weight)}</td><td><div class="history-confidence"><strong>${escape(row.confidenceText)}</strong><span><i style="width:${Math.max(0, Math.min(100, row.confidence))}%"></i></span></div></td><td><span class="status-pill ${row.decisionStatus === "review_needed" ? "review" : row.decisionStatus === "rejected" ? "quarantine" : row.materialClass === "contaminant" ? "history-confirmed-contaminant" : "cleared"}">${escape(row.status)}</span></td><td>${row.decisionStatus === "review_needed" ? `<button class="secondary-btn history-row-action" type="button" data-review="${escape(row.id)}">Review</button>` : `<a class="secondary-btn history-row-action" href="/result?scanId=${encodeURIComponent(row.scanId)}">View</a>`}</td></tr>`).join("") : '<tr><td colspan="8"><div class="feed-empty">No scan history matches these filters.</div></td></tr>';
    const start = rows.length ? (state.page - 1) * pageSize + 1 : 0;
    if (range) range.textContent = `Showing ${start} to ${Math.min(state.page * pageSize, rows.length)} of ${rows.length} results`;
    if (pageButtons) pageButtons.innerHTML = Array.from({ length: totalPages }, (_, index) => `<button type="button" class="${state.page === index + 1 ? "active" : ""}" data-page="${index + 1}" aria-label="Page ${index + 1}" ${state.page === index + 1 ? 'aria-current="page"' : ""}>${index + 1}</button>`).join("");
    tableBody.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", () => openReview(allRows.find(row => row.id === button.dataset.review), button)));
    pageButtons?.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => { state.page = Number(button.dataset.page); render(); }));
  }

  [searchInput, dateInput, statusInput].forEach(input => input?.addEventListener("input", () => { state.page = 1; render(); }));
  statusInput?.addEventListener("change", () => { state.page = 1; render(); });
  document.querySelectorAll(".history-sort").forEach(button => button.addEventListener("click", () => { const next = button.dataset.sort; state.direction = state.sort === next ? -state.direction : -1; state.sort = next; document.querySelectorAll(".history-sort").forEach(item => item.setAttribute("aria-sort", item === button ? (state.direction === 1 ? "ascending" : "descending") : "none")); render(); }));
  document.getElementById("showReviewQueue")?.addEventListener("click", () => { if (statusInput) statusInput.value = "Review Needed"; state.page = 1; render(); document.querySelector(".ledger-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }); });
  document.getElementById("showAllHistory")?.addEventListener("click", () => { if (statusInput) statusInput.value = ""; state.page = 1; render(); });
  document.getElementById("exportHistory")?.addEventListener("click", () => { const headers = ["Timestamp", "Source", "Category", "Class", "Weight (kg)", "AI Confidence", "Status"]; const records = filteredRows(getAuditLedger()).map(row => [row.time, row.source, row.category, row.materialClass, row.weight, row.confidenceText, row.status]); const csv = [headers, ...records].map(record => record.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "purityloop-scan-history.csv"; link.click(); URL.revokeObjectURL(url); });
  document.getElementById("closeReviewModal")?.addEventListener("click", closeModal);
  modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
  document.addEventListener("keydown", onModalKeydown);
  window.addEventListener("purityloop:page-cleanup", () => {
    unlockPageScroll();
    document.removeEventListener("keydown", onModalKeydown);
  }, { once: true });
  async function saveReview(outcome, message) {
    if (!activeLog || isSaving) return;
    isSaving = true;
    const log = activeLog;
    try {
      await plSaveReview(plGetScanResultById(log.scanId), log.material, document.getElementById("reclassifySelect")?.value || log.category, outcome);
      closeModal();
      render();
      showToast(message, "success");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      isSaving = false;
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

function plEscapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

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

function renderAnalyticsOverview(days = 7, state = "ready") {
  const overview = document.querySelector(".analytics-overview");
  if (!overview) return;
  const summary = plGetAnalyticsSummary({ days });
  const stateEl = document.getElementById("analyticsOverviewState");
  const showState = (message, isError = false) => {
    if (!stateEl) return;
    stateEl.textContent = message;
    if (isError) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "secondary-btn";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => document.getElementById("analyticsRefresh")?.click());
      stateEl.appendChild(retry);
    }
    stateEl.hidden = !message;
    stateEl.classList.toggle("is-error", isError);
  };
  showState(state === "loading" ? "Refreshing analytics..." : state === "error" ? "Analytics data could not be loaded." : "", state === "error");

  plOverviewSet("needs-review", String(summary.reviewCount));
  plOverviewSet("needs-review-note", summary.reviewCount ? "Scans require attention" : "All scans are up to date");
  plOverviewSet("confirmed-today", String(summary.confirmedTodayCount));
  plOverviewSet("recoverable-value", plFormatRm(summary.totalEstimatedResaleValueRm));
  plOverviewSet("average-confidence", summary.materials.length ? `${summary.avgConfidence.toFixed(1)}%` : "No data");

  const banner = overview.querySelector("[data-overview='attention-banner']");
  const hasReviews = summary.reviewCount > 0;
  banner?.classList.toggle("is-clear", !hasReviews);
  plOverviewSet("attention-title", hasReviews ? `${summary.reviewCount} item${summary.reviewCount === 1 ? "" : "s"} need attention today` : "All scans are up to date");
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
  plOverviewSet("last-upload-meta", lastUpload ? `${summary.sourceCounts[lastUpload.source_name || lastUpload.source_type || "Web Upload"] || 1} scan${(summary.sourceCounts[lastUpload.source_name || lastUpload.source_type || "Web Upload"] || 1) === 1 ? "" : "s"} from this source` : "Upload images to begin");

  const visible = (name, shown) => overview.querySelectorAll(`[data-overview="${name}"]`).forEach(element => { element.hidden = !shown; });
  visible("mix-empty", !summary.materials.length);
  visible("value-empty", !summary.resaleRows.some(row => row.estimatedResaleValueRm > 0));
  visible("trend-empty", !summary.scans.length);
  plOverviewSet("mix-subtitle", summary.materials.length ? "By estimated weight" : "By weight");
  plOverviewSet("mix-summary", summary.materials.length ? `${plFormatKg(summary.resaleRows.reduce((total, row) => total + row.estimatedWeightKg, 0))} across ${summary.materials.length} detected item${summary.materials.length === 1 ? "" : "s"}.` : "");
  plOverviewSet("value-summary", summary.highestValue ? `${summary.highestValue.label} leads estimated recoverable value.` : "");
  plOverviewSet("trend-summary", summary.scans.length ? `${summary.scans.length} scan${summary.scans.length === 1 ? "" : "s"} in selected period.` : "");

  const colors = ["#54c979", "#35bfb4", "#4285e8", "#dca73a", "#90caa8", "#d85769", "#5e9f9d", "#7a8893", "#f08b58"];
  const chartText = "#52635a";
  const chartGrid = "#e8efea";
  const chartBase = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: true } } };
  if (summary.materials.length) {
    plOverviewChart("overviewMaterialMix", { type: "doughnut", data: { labels: summary.categoryLabels, datasets: [{ data: summary.categoryValues, backgroundColor: colors, borderColor: "#fff", borderWidth: 2 }] }, options: { ...chartBase, cutout: "62%", plugins: { ...chartBase.plugins, legend: { display: true, position: "bottom", labels: { boxWidth: 9, color: chartText, font: { size: 11 } } }, tooltip: { callbacks: { label: context => `${context.label}: ${context.raw}` } } } } });
  } else if (plOverviewCharts.overviewMaterialMix) { plOverviewCharts.overviewMaterialMix.destroy(); delete plOverviewCharts.overviewMaterialMix; }
  const valueRows = summary.resaleRows.filter(row => row.estimatedResaleValueRm > 0);
  if (valueRows.length) {
    plOverviewChart("overviewValueByCategory", { type: "bar", data: { labels: valueRows.map(row => row.label), datasets: [{ data: valueRows.map(row => row.estimatedResaleValueRm), backgroundColor: "#54c979", borderRadius: 6, maxBarThickness: 36 }] }, options: { ...chartBase, scales: { x: { grid: { display: false }, ticks: { color: chartText, font: { size: 10 } } }, y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText, callback: value => `RM ${value}` } } }, plugins: { ...chartBase.plugins, tooltip: { callbacks: { label: context => plFormatRm(context.raw) } } } } });
  } else if (plOverviewCharts.overviewValueByCategory) { plOverviewCharts.overviewValueByCategory.destroy(); delete plOverviewCharts.overviewValueByCategory; }
  if (summary.scans.length) {
    plOverviewChart("overviewDailyTrend", { type: "line", data: { labels: summary.trendRows.map(row => row.label), datasets: [{ data: summary.trendRows.map(row => row.value), borderColor: "#1d7048", backgroundColor: "rgba(84, 201, 121, 0.12)", fill: true, tension: 0.3, pointBackgroundColor: "#fff", pointBorderColor: "#1d7048", pointBorderWidth: 2, pointRadius: 3 }] }, options: { ...chartBase, scales: { x: { grid: { display: false }, ticks: { color: chartText, font: { size: 10 }, autoSkip: true, maxTicksLimit: 7 } }, y: { beginAtZero: true, grid: { color: chartGrid }, ticks: { color: chartText, precision: 0 } } } } });
  } else if (plOverviewCharts.overviewDailyTrend) { plOverviewCharts.overviewDailyTrend.destroy(); delete plOverviewCharts.overviewDailyTrend; }

  const actions = [
    hasReviews && { icon: "fa-triangle-exclamation", title: "Pending Reviews", text: "Unresolved low-confidence items", value: summary.reviewCount, tone: "warning" },
    summary.highRiskCount > 0 && { icon: "fa-battery-half", title: "High-Risk Items", text: "Confirmed battery items", value: summary.highRiskCount, tone: "danger" },
    summary.recoveryOpportunityCount > 0 && { icon: "fa-tag", title: "Recovery Opportunities", text: "Confirmed items with recoverable value", value: summary.recoveryOpportunityCount, tone: "success" }
  ].filter(Boolean);
  const actionList = document.getElementById("analyticsManagerActions");
  if (actionList) actionList.innerHTML = actions.length ? actions.map(action => `<div class="analytics-action-row ${action.tone}"><i class="fa-solid ${action.icon}" aria-hidden="true"></i><div><strong>${action.title}</strong><span>${action.text}</span></div><b>${action.value}</b></div>`).join("") : `<p class="analytics-empty-action">No manager actions are waiting.</p>`;

  const recentLog = document.getElementById("analyticsRecentLog");
  if (recentLog) recentLog.innerHTML = summary.recentEvents.length ? summary.recentEvents.map(event => `<tr><td>${plEscapeHtml(plFormatScanTime({ created_at: event.timestamp }))}</td><td>${plEscapeHtml(event.event)}</td><td>${plEscapeHtml(event.source)}</td><td><span class="analytics-status ${event.status === "Review Needed" ? "review" : event.status === "Rejected" ? "rejected" : "confirmed"}">${plEscapeHtml(event.status)}</span></td><td>${plEscapeHtml(event.details)}</td></tr>`).join("") : `<tr><td colspan="5" class="analytics-log-empty">No scans are available for selected period. <a href="/upload">Upload Images</a></td></tr>`;
}

function initAnalyticsOverview() {
  const range = document.getElementById("analyticsRange");
  const refresh = document.getElementById("analyticsRefresh");
  if (!range) return;
  const render = state => renderAnalyticsOverview(Number(range.value) || 7, state);
  render();
  if (!range.dataset.overviewBound) {
    range.addEventListener("change", () => render());
    range.dataset.overviewBound = "true";
  }
  if (refresh && !refresh.dataset.overviewBound) {
    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      refresh.classList.add("is-loading");
      render("loading");
      const refreshed = await plRefreshScanResultsFromSupabase();
      render(refreshed || !plUseSupabase() ? "ready" : "error");
      refresh.disabled = false;
      refresh.classList.remove("is-loading");
    });
    refresh.dataset.overviewBound = "true";
  }
}

function initAnalyticsCharts() {
  initAnalyticsOverview();
  updateAnalyticsDetailPanels(plGetAnalyticsSummary());
}

function initLegacyAnalyticsCharts() {
  const palette = {
    green: "#00F08A",
    blue: "#4F91FF",
    amber: "#D8A448",
    purple: "#7DDFA7",
    slate: "#78938D",
    red: "#D85E70",
    orange: "#00D6D6",
    teal: "#00D6D6",
    darkGreen: "#08211D"
  };
  const categoryPalette = plCategoryPalette(palette);

  const compositionCanvas = document.getElementById("compositionChart");
  if (!compositionCanvas) return; // Not on analytics page

  // Live clock ticking in topbar
  const clockEl = document.getElementById("liveClock");
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    clockEl.textContent = timeStr;
  }
  updateClock();
  setInterval(updateClock, 1000);

  const summary = plGetAnalyticsSummary();

  const kpiCards = document.querySelectorAll(".kpi-grid-four > .kpi-card");
  const kpiLabel = card => card.querySelector(":scope > span:not(.kpi-badge):not(.kpi-trend)");
  const setKpiProgress = (card, label, width) => {
    const fill = card?.querySelector(".kpi-progress-fill");
    const meta = card?.querySelector(".kpi-progress-meta strong");
    if (meta) meta.textContent = label;
    if (fill) {
      fill.style.setProperty("--target-width", width);
      fill.style.width = width;
    }
  };
  if (kpiCards[0]) {
    kpiLabel(kpiCards[0]) && (kpiLabel(kpiCards[0]).textContent = "Detected Materials");
    kpiCards[0].querySelector("strong").innerHTML = `${summary.savedScansCount}`;
    kpiCards[0].querySelector("p").textContent = summary.savedScansCount ? "From saved scans" : "No scan data yet";
    setKpiProgress(kpiCards[0], String(summary.savedScansCount), summary.savedScansCount ? "100%" : "0%");
  }
  if (kpiCards[1]) {
    kpiLabel(kpiCards[1]) && (kpiLabel(kpiCards[1]).textContent = "Revenue Data");
    kpiCards[1].querySelector("strong").textContent = summary.materials.length ? plFormatRm(summary.totalEstimatedResaleValueRm) : "No data";
    kpiCards[1].querySelector("p").textContent = summary.materials.length ? "Estimated from saved scan materials" : "No material data yet";
    setKpiProgress(kpiCards[1], summary.materials.length ? "100%" : "0%", summary.materials.length ? "100%" : "0%");
  }
  if (kpiCards[2]) {
    kpiLabel(kpiCards[2]) && (kpiLabel(kpiCards[2]).textContent = "Average Confidence");
    kpiCards[2].querySelector("strong").textContent = `${summary.avgConfidence.toFixed(1)}%`;
    kpiCards[2].querySelector("p").textContent = summary.materials.length ? "From detected material confidence" : summary.scans.length ? "From saved scan confidence" : "No scan data yet";
    setKpiProgress(kpiCards[2], `${summary.avgConfidence.toFixed(1)}%`, summary.avgConfidence ? `${Math.min(100, summary.avgConfidence)}%` : "0%");
  }
  if (kpiCards[3]) {
    kpiLabel(kpiCards[3]) && (kpiLabel(kpiCards[3]).textContent = "Contaminated Items");
    kpiCards[3].querySelector("strong").textContent = String(summary.reviewCount);
    kpiCards[3].querySelector("p").textContent = summary.reviewCount ? "From saved review load" : "No contamination data yet";
    setKpiProgress(kpiCards[3], String(summary.reviewCount), summary.reviewCount ? "100%" : "0%");
  }

  document.querySelectorAll(".kpi-grid-four .kpi-trend").forEach(item => { item.textContent = summary.scans.length ? "saved data" : "no data"; });

  // Update recent activity ledger preview list from localStorage
  const recentList = document.getElementById("dashLedgerList");
  if (recentList) {
    const ledger = getAuditLedger().slice(0, 3);
    recentList.innerHTML = "";

    if (!ledger.length) {
      recentList.innerHTML = `<div class="feed-empty">No scan history yet.</div>`;
    }

    ledger.forEach(log => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "drill-trigger";
      itemDiv.tabIndex = 0;

      let statusClass = "cleared";
      if (log.status === "Review Needed") statusClass = "review";
      if (log.status === "Quarantined" || log.status === "Quarantine") statusClass = "quarantine";

      itemDiv.innerHTML = `
        <span class="status-pill ${statusClass}">${log.status}</span>
        <strong>Scan Verification</strong>
        <p>${log.time}  -  ${getLogSourceLabel(log)}  -  ${log.category} (${log.confidence})</p>
      `;

      itemDiv.addEventListener("click", () => {
        renderMaterialDetail(log.category);
      });

      recentList.appendChild(itemDiv);
    });
  }

  const alertValues = document.querySelectorAll(".alert-row-value");
  if (alertValues[0]) alertValues[0].textContent = String(summary.reviewCount);
  if (alertValues[1]) alertValues[1].textContent = `${summary.avgConfidence.toFixed(1)}%`;
  if (alertValues[2]) alertValues[2].textContent = String(summary.contaminationCount);
  const alertRows = document.querySelectorAll(".alert-row");
  if (alertRows[0]) {
    alertRows[0].querySelector("strong").textContent = `${summary.reviewCount} Pending Reviews`;
    alertRows[0].querySelector("p").textContent = summary.savedScansCount ? `${summary.savedScansCount} saved scan(s).` : "No scan data yet.";
  }
  if (alertRows[1]) {
    alertRows[1].querySelector("p").textContent = summary.avgConfidence ? "Calculated from saved confidence values." : "No saved scans yet.";
  }
  if (alertRows[2]) {
    alertRows[2].querySelector("p").textContent = summary.contaminationCount ? "From detected material contamination status." : "No contamination data yet.";
  }
  const workloadMeter = document.querySelector(".workload-meter strong");
  if (workloadMeter) workloadMeter.textContent = String(summary.reviewCount);
  const workloadRows = document.querySelectorAll(".workload-row");
  const workloadMetrics = [
    ["Saved scans", summary.savedScansCount],
    ["Low confidence scans", summary.lowConfidenceCount],
    ["Hazard checks", summary.hazardCount],
    ["Operator corrections", 0]
  ];
  workloadRows.forEach((row, index) => {
    const metric = workloadMetrics[index];
    if (!metric) return;
    const value = metric[1];
    row.querySelector("span").textContent = metric[0];
    row.querySelector("strong").textContent = String(value);
    const bar = row.querySelector("i");
    if (bar) bar.style.width = `${summary.savedScansCount ? Math.min(100, Math.max(8, (value / Math.max(summary.savedScansCount, summary.detectedMaterialsCount, 1)) * 100)) : 0}%`;
  });
  const compositionSubtitle = compositionCanvas.closest(".chart-panel")?.querySelector(".chart-subtitle");
  if (compositionSubtitle) compositionSubtitle.textContent = summary.materials.length ? `${summary.detectedMaterialsCount} detected material record(s) from saved scans.` : "No material data yet. Upload scans to populate this chart.";
  const yieldSubtitle = document.getElementById("yieldChart")?.closest(".chart-panel")?.querySelector(".chart-subtitle");
  if (yieldSubtitle) yieldSubtitle.textContent = summary.materials.length ? "Saved material counts grouped by category." : "No scan data yet. Saved material counts appear here after uploads.";
  const resaleSubtitle = document.getElementById("resaleChart")?.closest(".chart-panel")?.querySelector(".chart-subtitle");
  if (resaleSubtitle) resaleSubtitle.textContent = summary.materials.length ? "Estimated resale value grouped by category." : "No resale data yet. Upload scans to populate this chart.";
  updateAnalyticsDetailPanels(summary);

  if (!summary.scans.length) {
    drawEmptyAnalyticsCharts();
    window.addEventListener("resize", drawEmptyAnalyticsCharts);
    return;
  }

  // Draw chart views
  if (!window.Chart) {
    drawFallbackAnalyticsCharts(palette);
    window.addEventListener("resize", function () {
      drawFallbackAnalyticsCharts(palette);
    });
    return;
  }

  // Register datalabels plugin
  if (window.ChartDataLabels) {
    Chart.register(ChartDataLabels);
  }

  const isLight = document.documentElement.dataset.theme === "light";
  const tickColor = isLight ? "#6c7b74" : "rgba(244,255,249,0.62)";
  const gridColor = isLight ? "#dce7e1" : "rgba(178,255,224,0.16)";
  const labelColor = isLight ? "#14221b" : "rgba(244,255,249,0.88)";
  const legendColor = isLight ? "#6c7b74" : "rgba(244,255,249,0.68)";
  const donutBorderColor = isLight ? "#ffffff" : "rgba(4,15,13,0.92)";

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          boxWidth: 12,
          color: legendColor
        }
      }
    }
  };

  // 1. COMPOSITION CHART (Updated to the new 9 categories)
  new Chart(compositionCanvas, {
    type: "doughnut",
    data: {
      labels: summary.categoryLabels,
      datasets: [{
        data: summary.categoryValues,
        backgroundColor: [
          palette.green,
          palette.teal,
          palette.blue,
          palette.purple,
          palette.amber,
          "#63CFA2",
          palette.slate,
          "#2FA6A6",
          palette.red
        ],
        borderColor: donutBorderColor,
        borderWidth: 2
      }]
    },
    options: {
      ...chartDefaults,
      cutout: "68%",
      plugins: {
        ...chartDefaults.plugins,
        legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 }, color: legendColor } },
        datalabels: {
          color: "#ffffff",
          font: { weight: "bold", size: 10 },
          formatter: (value) => value > 0 ? value : "",
          display: (ctx) => ctx.dataset.data[ctx.dataIndex] >= 5,
          textShadowColor: "rgba(0,0,0,0.4)",
          textShadowBlur: 3
        }
      }
    }
  });

  // 2. RESALE CHART
  const resaleCanvas = document.getElementById("resaleChart");
  if (resaleCanvas) {
    if (!summary.resaleRows.length) {
      drawEmptyChart(resaleCanvas, "No resale data");
    } else {
      new Chart(resaleCanvas, {
      type: "bar",
      data: {
        labels: summary.resaleRows.map(row => row.label),
        datasets: [{ label: "Estimated resale value", data: summary.resaleRows.map(row => Number(row.estimatedResaleValueRm.toFixed(2))), backgroundColor: categoryPalette, borderRadius: 6 }]
      },
      options: {
        ...chartDefaults,
        plugins: {
          datalabels: { display: false },
          legend: { labels: { color: legendColor } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: tickColor, callback: value => `RM ${value}` }, grid: { color: gridColor } },
          x: { ticks: { color: tickColor }, grid: { display: false } }
        }
      }
      });
    }
  }

  // 3. YIELD CHART
  const yieldCanvas = document.getElementById("yieldChart");
  if (yieldCanvas) {
    new Chart(yieldCanvas, {
      type: "bar",
      data: {
        labels: summary.categoryLabels,
        datasets: [{ label: "Detected items", data: summary.categoryValues, backgroundColor: categoryPalette, borderRadius: 6 }]
      },
      options: {
        ...chartDefaults,
        plugins: {
          datalabels: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { color: tickColor }, grid: { color: gridColor } },
          x: { ticks: { color: tickColor }, grid: { display: false } }
        }
      }
    });
  }
}

/* Fallback chart drawings inside plain canvas context */
function drawEmptyChart(canvas, label = "No data") {
  if (!canvas) return;
  const { ctx, width, height } = prepareCanvas(canvas);
  const isLight = document.documentElement.dataset.theme === "light";
  ctx.fillStyle = isLight ? "#edf4ef" : "#0c1812";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = isLight ? "#506259" : "#a9bbb0";
  ctx.font = "600 15px 'IBM Plex Sans', Arial";
  ctx.textAlign = "center";
  ctx.fillText(label, width / 2, height / 2);
}

function drawEmptyAnalyticsCharts() {
  drawEmptyChart(document.getElementById("compositionChart"), "No analytics data");
  drawEmptyChart(document.getElementById("resaleChart"), "No resale data");
  drawEmptyChart(document.getElementById("yieldChart"), "No scan data");
}

function prepareCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(240, Math.floor(rect.width * ratio));
  canvas.height = Math.max(180, Math.floor(rect.height * ratio));
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, width: rect.width, height: rect.height };
}

function drawFallbackAnalyticsCharts(palette) {
  const summary = plGetAnalyticsSummary();
  if (!summary.scans.length) {
    drawEmptyAnalyticsCharts();
    return;
  }

  const composition = document.getElementById("compositionChart");
  if (composition) {
    const { ctx, width, height } = prepareCanvas(composition);
    const values = summary.categoryValues;
    const colors = [palette.amber, palette.blue, palette.purple, palette.slate, palette.orange, palette.green, "#7f8c8d", palette.teal, palette.red];
    const total = values.reduce((sum, value) => sum + value, 0) || 1;
    const radius = Math.min(width, height) * 0.28;
    const centerX = width * 0.5;
    const centerY = height * 0.43;
    let start = -Math.PI / 2;

    values.forEach((value, index) => {
      const angle = (value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = colors[index];
      ctx.fill();
      start += angle;
    });

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = "#14221b";
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    ctx.fillText("Material Mix", centerX, centerY + 6);
  }

  const resale = document.getElementById("resaleChart");
  if (resale) {
    if (summary.resaleRows.length) {
      const { ctx, width, height } = prepareCanvas(resale);
      drawFallbackBars(
        ctx,
        width,
        height,
        summary.resaleRows.map(row => row.label),
        summary.resaleRows.map(row => Number(row.estimatedResaleValueRm.toFixed(2))),
        plCategoryPalette(palette),
        "RM ",
        ""
      );
    } else {
      drawEmptyChart(resale, "No resale data");
    }
  }

  const yieldCanvas = document.getElementById("yieldChart");
  if (yieldCanvas) {
    const { ctx, width, height } = prepareCanvas(yieldCanvas);
    drawFallbackBars(ctx, width, height, summary.categoryLabels, summary.categoryValues, plCategoryPalette(palette), "", "");
  }
}

function drawFallbackBars(ctx, width, height, labels, values, colors, prefix, suffix) {
  const max = Math.max(1, ...values) * 1.15;
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const barGap = 14;
  const barWidth = Math.max(20, (chartWidth - barGap * (labels.length - 1)) / labels.length);

  ctx.strokeStyle = "#d9e6df";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + chartHeight);
  ctx.lineTo(left + chartWidth, top + chartHeight);
  ctx.stroke();

  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  labels.forEach((label, index) => {
    const barHeight = (values[index] / max) * chartHeight;
    const x = left + index * (barWidth + barGap);
    const y = top + chartHeight - barHeight;
    ctx.fillStyle = colors[index % colors.length];
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = "#66756f";
    ctx.fillText(label, x + barWidth / 2, height - 20);
    ctx.fillStyle = "#14221b";
    ctx.font = "bold 11px Arial";
    const displayValue = prefix === "RM " ? Number(values[index]).toFixed(2) : values[index];
    ctx.fillText(prefix + displayValue + suffix, x + barWidth / 2, y - 6);
    ctx.font = "11px Arial";
  });
}

function drawFallbackLines(ctx, width, height, months, series) {
  const allValues = series.flatMap(item => item.data);
  const max = Math.max(...allValues) * 1.15;
  const left = 44;
  const right = 18;
  const top = 18;
  const bottom = 52;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;

  ctx.strokeStyle = "#d9e6df";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (chartHeight / 4) * i;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + chartWidth, y); ctx.stroke();
  }

  ctx.font = "11px Arial";
  ctx.fillStyle = "#66756f";
  ctx.textAlign = "center";
  months.forEach((label, index) => {
    const x = left + (chartWidth / (months.length - 1)) * index;
    ctx.fillText(label, x, top + chartHeight + 24);
  });

  series.forEach(item => {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    item.data.forEach((value, index) => {
      const x = left + (chartWidth / (item.data.length - 1)) * index;
      const y = top + chartHeight - (value / max) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

/******************************************
 * 5. SIDEBAR DRILL-DOWN INTERACTIONS     *
 ******************************************/
const drillMaterialData = {
  Metal: {
    color: "#b7791f",
    isContaminant: false,
    tonnage: "450 tons",
    value: "$540,000",
    rate: "@ $1,200/ton market rate",
    purity: "99.1%",
    status: "Clean recyclable metal grade",
    subtitle: "30-day recovery trend, purity grade, and upload source mix for audited metals.",
    trend: [12, 14, 15, 13, 16, 18, 17, 15, 14, 15, 16, 14, 13, 15, 17, 19, 18, 16, 15, 14],
    zones: [["Single image", 180], ["ZIP batch", 150], ["Demo dataset", 120]]
  },
  Plastic: {
    color: "#2f6f8f",
    isContaminant: false,
    tonnage: "380 tons",
    value: "$152,000",
    rate: "@ $400/ton market rate",
    purity: "97.4%",
    status: "Bale-ready recyclables",
    subtitle: "Plastic recovery trend, resale value, and uploaded image review logs.",
    trend: [10, 11, 12, 11, 13, 14, 13, 12, 11, 12, 13, 11, 10, 12, 14, 15, 14, 12, 11, 10],
    zones: [["Single image", 150], ["ZIP batch", 130], ["Demo dataset", 100]]
  },
  Glass: {
    color: "#8b5cf6",
    isContaminant: false,
    tonnage: "127 tons",
    value: "$107,051",
    rate: "@ $843/ton market rate",
    purity: "91.8%",
    status: "Recalibration recommended",
    subtitle: "Glass recovery is stable, but audit reviews suggest color segregation holds potential value.",
    trend: [2, 3, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3, 4, 3],
    zones: [["Single image", 60], ["ZIP batch", 40], ["Demo dataset", 27]]
  },
  Paper: {
    color: "#8aa0a8",
    isContaminant: false,
    tonnage: "150 tons",
    value: "$15,000",
    rate: "@ $100/ton market rate",
    purity: "93.2%",
    status: "Clean recyclable paper grade",
    subtitle: "Paper recovery logs showing dry-fiber bale consistency.",
    trend: [4, 5, 4, 6, 5, 4, 5, 6, 4, 5, 4, 6, 7, 5, 4, 5, 6, 4, 5, 6],
    zones: [["Single image", 40], ["ZIP batch", 80], ["Demo dataset", 30]]
  },
  Cardboard: {
    color: "#e67e22",
    isContaminant: false,
    tonnage: "140 tons",
    value: "$21,000",
    rate: "@ $150/ton market rate",
    purity: "95.4%",
    status: "Bale-ready high-grade fibers",
    subtitle: "Cardboard recovery, fiber purity, and sorting source distribution.",
    trend: [3, 4, 5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 6, 5, 4, 3, 4, 5, 4],
    zones: [["Single image", 30], ["ZIP batch", 90], ["Demo dataset", 20]]
  },
  "Food Organics": {
    color: "#27ae60",
    isContaminant: true,
    tonnage: "1,420 incidents",
    value: "-$12,000",
    rate: "Estimated washing / bale sorting overhead",
    purity: "Medium",
    status: "High residue hazard",
    subtitle: "Organic contamination flags, cleaning costs, and incident hotspots.",
    trend: [50, 48, 52, 45, 60, 55, 49, 45, 42, 50, 48, 44, 46, 52, 55, 60, 58, 45, 40, 38],
    zones: [["Single image", 600], ["ZIP batch", 500], ["Demo dataset", 320]]
  },
  "General Trash": {
    color: "#7f8c8d",
    isContaminant: true,
    tonnage: "950 incidents",
    value: "-$14,200",
    rate: "Estimated landfill disposal fees",
    purity: "Low",
    status: "Unrecoverable waste logs",
    subtitle: "General trash contamination patterns and landfill diversion rates.",
    trend: [30, 32, 28, 35, 30, 29, 31, 33, 30, 28, 35, 34, 32, 30, 29, 31, 33, 35, 30, 28],
    zones: [["Single image", 400], ["ZIP batch", 350], ["Demo dataset", 200]]
  },
  Textile: {
    color: "#1abc9c",
    isContaminant: true,
    tonnage: "780 incidents",
    value: "-$8,500",
    rate: "Estimated machine downtime cost",
    purity: "High",
    status: "Tangling / Jamming risk",
    subtitle: "Fabric logs showing machine safety overrides and manual redirects.",
    trend: [25, 24, 26, 28, 25, 24, 27, 26, 25, 23, 28, 29, 25, 24, 26, 27, 25, 24, 23, 25],
    zones: [["Single image", 300], ["ZIP batch", 280], ["Demo dataset", 200]]
  },
  Battery: {
    color: "#b42318",
    isContaminant: true,
    tonnage: "210 incidents",
    value: "-$28,000",
    rate: "Estimated fire safety containment risk",
    purity: "Critical",
    status: "Fire risk - immediate quarantine",
    subtitle: "Quarantined lithium battery incidents found in uploaded images.",
    trend: [8, 6, 9, 7, 5, 8, 10, 6, 7, 5, 9, 8, 6, 7, 5, 8, 9, 6, 7, 5],
    zones: [["Single image", 100], ["ZIP batch", 70], ["Demo dataset", 40]]
  }
};

const drillStationData = {
  "UPLOAD-HUB": {
    load: "On-demand",
    capacity: "Upload queue",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Web upload",
    motor: "Online",
    air: "100 MB batch limit",
    action: "Operational",
    insight: "Uploaded images are queued for classification, confidence scoring, and human review.",
    uptime: [["Completed reviews", 82], ["Pending review", 18]],
    composition: [["Single images", 52], ["ZIP batches", 36], ["Demo samples", 12]]
  },
  "SINGLE-IMAGE": {
    load: "Single file",
    capacity: "JPG, PNG, WEBP",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Local image upload",
    motor: "Online",
    air: "10 MB image limit",
    action: "Operational",
    insight: "Single image uploads are processed immediately and can be approved or moved to human review.",
    uptime: [["Auto-cleared", 74], ["Manual review", 26]],
    composition: [["Plastic", 34], ["Metal", 26], ["Paper", 22], ["Contaminants", 18]]
  },
  "ZIP-BATCH": {
    load: "Batch archive",
    capacity: "Up to 100 MB",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Batch Precision",
    scanner: "ZIP image batch",
    motor: "Online",
    air: "50 file cap",
    action: "Review recommended",
    insight: "ZIP batches can contain mixed materials, so low-confidence images are routed into human review.",
    uptime: [["Auto-cleared", 61], ["Manual review", 39]],
    composition: [["Glass", 28], ["Plastic", 24], ["Cardboard", 21], ["Contaminants", 27]]
  },
  "QUARANTINE-UPLOAD": {
    load: "Flagged upload",
    capacity: "Human decision required",
    speed: "AI-Model active",
    maxSpeed: "v2.4 Core Precision",
    scanner: "Rejected or hazard image",
    motor: "Online",
    air: "Override required",
    action: "Quarantine",
    insight: "Hazards, organics, textile scraps, and general trash are isolated in the review queue before final logging.",
    uptime: [["Rejected", 68], ["Corrected", 32]],
    composition: [["General Trash", 45], ["Food Organics", 27], ["Batteries", 18], ["Textile", 10]]
  }
};

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
    const ledger = getAuditLedger();
    ledgerBody.innerHTML = ledger.length
      ? ledger.slice(0, 10).map(log => `
          <tr onclick="window.location.href='/result?scanId=${encodeURIComponent(log.scanId || log.id)}'">
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
  const summary = plGetAnalyticsSummary();
  const materials = summary.materials.filter(material => normalizeMaterialCategory(material) === normalizedCategory);
  const count = materials.length;
  const estimatedWeightKg = getEstimatedWeightKg(normName, count);
  const estimatedResaleValueRm = getEstimatedResaleValueRm(normName, count);
  const pricePerKgRm = plMaterialEstimate(normName).pricePerKgRm;
  const contaminated = materials.filter(plIsContaminatedMaterial).length;
  const recyclable = materials.filter(plIsRecyclable).length;
  const avgConfidence = count ? materials.reduce((sum, material) => sum + plConfidencePercent(material.confidence), 0) / count : 0;
  const isContaminant = contaminated > 0 && recyclable === 0;
  const color = drillMaterialData[normName]?.color || "#00F08A";
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
  panel.querySelectorAll("[data-material-trend]").forEach(el => renderSparkBars(el, count ? materials.map(material => plConfidencePercent(material.confidence)) : [], color));
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

  const summary = plGetAnalyticsSummary();
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

/*****************************************
 * SUBMIT TICKET PAGE                    *
 *****************************************/
function initSubmitTicketPage() {
  const submitBtn = document.getElementById("submitTicketBtn");
  if (!submitBtn || submitBtn.dataset.ticketReady === "true") return;
  submitBtn.dataset.ticketReady = "true";

  submitBtn.addEventListener("click", () => {
    const title = document.getElementById("ticketTitle");
    const description = document.getElementById("ticketDescription");

    if (!title?.value.trim() || !description?.value.trim()) {
      showToast("Add a ticket title and description before submitting.", "warning");
      return;
    }

    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';

    setTimeout(() => {
      showToast("Ticket submitted. Status set to Open for operator review.", "success");
      title.value = "";
      description.value = "";
      const image = document.getElementById("ticketImage");
      if (image) image.value = "";
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Ticket Submitted';

      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }, 1800);
    }, 420);
  });
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

/* Page Navigation Match & Trigger */
async function initPurityLoopApp() {
  // Navigation terminology updates across all files
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

  initPasswordToggle();
  // initMobileNav(); // Handled by theme.js
  animateProgressBars();
  await plRefreshScanResultsFromSupabase();
  initUploadPage();
  initResultPage();
  initSubmitTicketPage();
  initReviewModal();
  initAnalyticsCharts();
  initDrillThrough();
}

window.initPurityLoopApp = initPurityLoopApp;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPurityLoopApp);
} else {
  initPurityLoopApp();
}

window.addEventListener('purityloop:page-ready', initPurityLoopApp);
