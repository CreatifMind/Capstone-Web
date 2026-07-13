/* PurityLoop AI - Smart Waste Sorting & Contamination Detection */

/* RELIABLE prototype limits */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB per image
const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100 MB per ZIP file
const MAX_TOTAL_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB total upload
const MAX_TOTAL_FILES = 50;
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

function plIsClean(material) {
  return plNormalizeStatus(material?.contaminant_status) === "clean";
}

function plIsRecyclable(material) {
  return plNormalizeStatus(material?.recyclable_status) === "recyclable";
}

function plIsContaminatedMaterial(material) {
  const contaminantStatus = plNormalizeStatus(material?.contaminant_status);
  const recyclableStatus = plNormalizeStatus(material?.recyclable_status);
  return material?.contaminant_status === true ||
    contaminantStatus === "true" ||
    contaminantStatus === "contaminated" ||
    recyclableStatus === "contaminated";
}

function plConfidencePercent(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function plNormalizeMaterial(material) {
  return {
    material_name: material?.material_name || material?.category || "Detected material",
    category: plNormalizeCategory(material?.category),
    confidence: Number(material?.confidence || 0),
    recyclable_status: material?.recyclable_status || "unknown",
    contaminant_status: material?.contaminant_status || "unknown",
    bbox_x: Number(material?.bbox_x || 0),
    bbox_y: Number(material?.bbox_y || 0),
    bbox_width: Number(material?.bbox_width || 0),
    bbox_height: Number(material?.bbox_height || 0)
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
  const sourceName = scan.source_name || scan.drive_file_name || scan.image_url || "Uploaded image";
  return {
    ...scan,
    image_url: plDisplayableImageUrl(scan.image_url),
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
    const scanColumns = "id,image_url,preview_image_url,drive_file_name,source_name,source_size,created_at,overall_status,upload_status,contamination_risk,recommended_action,human_review_required,overall_confidence";
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

    const scansPayload = await scansResponse.json();
    const materialsPayload = await materialsResponse.json();
    const groupedMaterials = plSafeArray(materialsPayload).reduce((acc, material) => {
      const scanResultId = String(material.scan_result_id || "");
      if (!scanResultId) return acc;
      acc[scanResultId] = acc[scanResultId] || [];
      acc[scanResultId].push(material);
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
  const text = String(label || "").toLowerCase();
  if (text.includes("battery")) return "Battery";
  if (text.includes("food") || text.includes("organic")) return "Food Organics";
  if (text.includes("trash")) return "General Trash";
  if (text.includes("textile") || text.includes("fabric")) return "Textile";
  if (text.includes("glass") || text.includes("jar")) return "Glass";
  if (text.includes("cardboard") || text.includes("box")) return "Cardboard";
  if (text.includes("paper")) return "Paper";
  if (text.includes("metal") || text.includes("can") || text.includes("aluminum")) return "Metal";
  if (text.includes("plastic") || text.includes("pet") || text.includes("bottle") || text.includes("film")) return "Plastic";
  return "Unknown";
}

function plMaterialStatus(category, label) {
  if (plIsContaminantLabel(label) || ["Battery", "Food Organics", "General Trash", "Textile"].includes(category)) {
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
    const isContaminant = !plIsClean(material);
    return {
      label: material.material_name || material.category || "Detected material",
      confidence: `${Math.round(plConfidencePercent(material.confidence))}%`,
      color: isContaminant ? "#ff8000" : (detectionResults[String(material.category || "").toLowerCase().replace(" ", "_")]?.color || "#39d12f"),
      x: Number(material.bbox_x || 0) / 100,
      y: Number(material.bbox_y || 0) / 100,
      w: Number(material.bbox_width || 0) / 100,
      h: Number(material.bbox_height || 0) / 100
    };
  });
}

function plFormatScanTime(scan) {
  const date = new Date(scan?.created_at || Date.now());
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function plScanToLedger(scan) {
  const materials = plSafeArray(scan?.detected_materials);
  const firstMaterial = materials[0] || {};
  return {
    id: scan.id,
    scanId: scan.id,
    time: plFormatScanTime(scan),
    source: scan.source_name || "Uploaded image",
    sourceKey: scan.source_name && scan.source_name.toLowerCase().endsWith(".zip") ? "ZIP-BATCH" : plNormalizeStatus(scan.overall_status) === "quarantined" ? "QUARANTINE-UPLOAD" : "SINGLE-IMAGE",
    category: firstMaterial.category || "Unknown",
    weight: scan.source_size ? formatFileSize(scan.source_size) : "N/A",
    confidence: `${Math.round(plConfidencePercent(scan.overall_confidence))}%`,
    status: plNormalizeStatus(scan.overall_status) === "accepted" ? "Cleared" : plNormalizeStatus(scan.overall_status) === "quarantined" ? "Quarantined" : "Review Needed"
  };
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

function plGetAnalyticsSummary() {
  const scans = plGetScanResults();
  const materials = scans.flatMap(scan => plSafeArray(scan.detected_materials));
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
  const recyclableCount = materials.filter(plIsRecyclable).length;
  const contaminationCount = materials.filter(plIsContaminatedMaterial).length;
  const reviewCount = scans.filter(scan => scan.human_review_required || plNormalizeStatus(scan.overall_status) === "review_required").length;
  const materialConfidences = materials.map(material => plConfidencePercent(material.confidence)).filter(value => value > 0);
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
  return {
    scans,
    materials,
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
    nonRecyclableCount: Math.max(materials.length - recyclableCount, 0),
    contaminationCount,
    reviewCount,
    lowConfidenceCount: materials.filter(material => {
      const confidence = plConfidencePercent(material.confidence);
      return confidence > 0 && confidence < 85;
    }).length,
    hazardCount: contaminationCount,
    clearedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "accepted").length,
    quarantinedCount: scans.filter(scan => plNormalizeStatus(scan.overall_status) === "quarantined").length,
    avgConfidence
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
  return plGetScanResults().map(plScanToLedger);
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

async function plRunBackendPrediction(file) {
  const apiBaseUrl = plApiBaseUrl();
  if (!apiBaseUrl) throw new Error("Backend API URL is not configured.");
  if (!file || !String(file.type || "").startsWith("image/")) throw new Error("Upload one image file.");

  const formData = new FormData();
  formData.append("file", file, file.name || "uploaded-image.jpg");

  plSetUploadProgress(1);
  const payload = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiBaseUrl}/api/predict`);
    request.timeout = 120000;
    request.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      plSetUploadProgress((event.loaded / event.total) * 90);
    };
    request.onload = () => {
      const body = plSafeJsonParse(request.responseText, {});
      if (request.status >= 200 && request.status < 300) {
        plSetUploadProgress(100, "Scan complete");
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
  if (!fileUpload) return; // Not on upload page
  if (fileUpload.dataset.uploadReady === "true") return;
  fileUpload.dataset.uploadReady = "true";

  const fileName = document.getElementById("fileName");
  const scanImageBtn = document.getElementById("scanImageBtn");
  const fileList = document.getElementById("fileList");
  const fileCountText = document.getElementById("fileCountText");
  const uploadSummary = document.getElementById("uploadSummary");

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
  const replaceUploadBtn = document.getElementById("replaceUploadBtn");
  const removeUploadBtn = document.getElementById("removeUploadBtn");
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

  if (replaceUploadBtn) replaceUploadBtn.addEventListener("click", () => fileUpload.click());
  if (removeUploadBtn) {
    removeUploadBtn.addEventListener("click", () => {
      plSelectedUploadFiles = [];
      fileUpload.value = "";
      fileName.textContent = "No file selected";
      document.getElementById("uploadPreviewContainer")?.style.setProperty("display", "none");
      if (scanImageBtn) scanImageBtn.disabled = true;
    });
  }

  if (scanImageBtn) {
    scanImageBtn.addEventListener("click", async () => {
      const uploadFile = plSelectedUploadFiles[0];
      if (!uploadFile) {
        showToast("Choose an image before scanning.", "warning");
        return;
      }
      scanImageBtn.disabled = true;
      scanImageBtn.classList.add("is-scanning");
      if (uploadBox) uploadBox.classList.add("is-processing");
      scanImageBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Scanning...';
      try {
        const scan = await plRunBackendPrediction(uploadFile);
        window.location.href = `/result?scanId=${encodeURIComponent(scan.id)}`;
      } catch (error) {
        showToast(error.message || "AI scan failed. Check backend and try again.", "error");
        scanImageBtn.disabled = false;
        scanImageBtn.classList.remove("is-scanning");
        if (uploadBox) uploadBox.classList.remove("is-processing");
        plHideUploadProgress();
        scanImageBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Scan Image';
      }
    });
  }

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

  function processSelectedFiles(files) {
    const list = plSafeFiles(files);
    plSelectedUploadFiles = [];
    plHideUploadProgress();
    if (!list.length) {
      alert("No files selected.");
      return;
    }

    // Validate sizes and types
    let totalSize = list.reduce((s, f) => s + Number(f.size || 0), 0);
    if (list.length > MAX_TOTAL_FILES) {
      alert(`Too many files selected. Maximum is ${MAX_TOTAL_FILES} files.`);
      return;
    }
    if (totalSize > MAX_TOTAL_UPLOAD_SIZE) {
      alert("Total files size exceeds 100MB threshold.");
      return;
    }

    fileName.textContent = `Selected: ${list[0].name || "selected file"}${list.length > 1 ? ` (+${list.length - 1} more)` : ''}`;

    // Render Preview Thumbnail & Checkmark
    const previewContainer = document.getElementById("uploadPreviewContainer");
    const previewImage = document.getElementById("uploadPreviewImage");
    if (previewContainer && previewImage) {
      const firstFile = list.find(f => String(f.type || "").startsWith("image/"));
      if (firstFile) {
        const previewReader = new FileReader();
        previewReader.onload = function (e) {
          previewImage.src = e.target.result;
          previewContainer.style.display = "flex";
          previewContainer.classList.remove("preview-visible");
          requestAnimationFrame(() => previewContainer.classList.add("preview-visible"));
        };
        previewReader.readAsDataURL(firstFile);
      } else {
        // Fallback for non-image files (e.g. ZIP)
        previewImage.src = "/assets/logo.png";
        previewContainer.style.display = "flex";
        previewContainer.classList.remove("preview-visible");
        requestAnimationFrame(() => previewContainer.classList.add("preview-visible"));
      }
    }

    // Compress images asynchronously using canvas to fit localStorage limits
    let loadedCount = 0;
    const compressedList = [];
    const imageFiles = list.filter(f => String(f.type || "").startsWith("image/"));

    if (imageFiles.length === 0) {
      showToast("Direct backend test supports one image file first.", "warning");
      if (scanImageBtn) scanImageBtn.disabled = true;
      return;
    }

    plSelectedUploadFiles = [imageFiles[0]];

    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement("canvas");
          const max_size = 400; // Low resolution resize (approx 15-20KB JPEGs)
          let w = img.width;
          let h = img.height;
          if (w > h) {
            if (w > max_size) {
              h *= max_size / w;
              w = max_size;
            }
          } else {
            if (h > max_size) {
              w *= max_size / h;
              h = max_size;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

          compressedList.push({
            name: file.name || "uploaded-image",
            size: Number(file.size || 0),
            dataUrl: dataUrl,
            resultAssetPath: ""
          });

          loadedCount++;
          if (loadedCount === imageFiles.length) {
            plSetJson(PL_UPLOADS_KEY, compressedList);
            if (scanImageBtn) scanImageBtn.disabled = false;
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

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
  const activeBeltTitle = document.getElementById("liveStreamTitle");

  // Replace buttons
  const activeBeltDetailBtn = document.getElementById("activeBeltDetailBtn");
  const reviewLogsBtn = document.querySelector(".action-panel a");
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
    const storagePreview = hasScanImage ? "" : plStoragePreviewUrl(scan.source_name || scan.drive_file_name);
    const cachedPreview = findCachedUploadPreview(scan.source_name || scan.drive_file_name);
    return {
      name: scan.source_name || scan.id,
      size: scan.source_size || 0,
      thumbnailSrc: previewUrl,
      dataUrl: hasScanImage && previewUrl.startsWith("data:") ? previewUrl : cachedPreview,
      assetPath: hasScanImage && !previewUrl.startsWith("data:") ? previewUrl : storagePreview,
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

  // Change VIEW DETAILED BUTTON action to Approve and Log
  if (activeBeltDetailBtn) {
    activeBeltDetailBtn.textContent = "Verify & Approve Scan Result";
    activeBeltDetailBtn.className = "primary-btn full-btn";
    activeBeltDetailBtn.id = "verifyApproveBtn";
  }

  // Redesign "Review Logs" link button
  if (reviewLogsBtn) {
    reviewLogsBtn.textContent = "Go to Verification Logs";
    reviewLogsBtn.href = "/log";
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

  // Handle Verify & Approve Action
  const approveBtn = document.getElementById("verifyApproveBtn");
  if (approveBtn) {
    approveBtn.addEventListener("click", () => {
      if (!activeScan) return;
      activeScan.overall_status = plNormalizeStatus(activeScan.overall_status) === "quarantined" ? "Quarantined" : "Accepted";
      activeScan.human_review_required = activeScan.overall_status !== "Accepted";
      plSaveScanResult(activeScan);

      // Show toast notification
      showToast("Audit verified. Scan result saved.", "success");
      approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Verified';
      approveBtn.classList.add("is-confirmed");
      renderFinderGrid();
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
    if (activeFile.dataUrl) {
      activeImageObj.src = activeFile.dataUrl;
    } else if (activeFile.assetPath) {
      activeImageObj.src = activeFile.assetPath;
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
    if (marketValueEl) marketValueEl.textContent = "No data";
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

    // Calculate overall purity (percentage of recyclables)
    let recyclableCount = 0;
    boxes.forEach(box => {
      if (box.label.includes("Alert") || box.label.toLowerCase().includes("hazard") || box.label.toLowerCase().includes("contaminant")) {
        return; // Contaminants do not count toward recyclable purity
      }
      const labelLower = box.label.toLowerCase();
      if (labelLower.includes("pet bottle") ||
        labelLower.includes("plastic") ||
        labelLower.includes("metal") ||
        labelLower.includes("can") ||
        labelLower.includes("aluminum") ||
        labelLower.includes("glass") ||
        labelLower.includes("paper") ||
        labelLower.includes("cardboard") ||
        labelLower.includes("bottle") ||
        labelLower.includes("jar") ||
        labelLower.includes("box")) {
        recyclableCount++;
      }
    });

    const purityPct = boxes.length ? Math.round((recyclableCount / boxes.length) * 100) : 0;

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
    if (marketValueEl) marketValueEl.textContent = "No data";
    if (reviewNeededEl) {
      const lowConfidence = boxes.filter(box => plConfidencePercent(box.confidence) < 80).length;
      const pendingStatus = activeScan.human_review_required || plNormalizeStatus(activeScan.overall_status) === "review_required";
      const reviewCount = lowConfidence + (pendingStatus ? 1 : 0);
      reviewNeededEl.textContent = reviewCount ? `${reviewCount} item${reviewCount === 1 ? "" : "s"}` : "Clear";
    }

    // Next Steps Action Guide Generator
    if (actionText) {
      const hasBattery = boxes.some(b => b.label.toLowerCase().includes("battery"));
      const hasContaminant = purityPct < 100;

      let badgeHtml = "";
      if (hasBattery) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card review-required";
        badgeHtml = `
          <strong>Human Review Required</strong>
          <p>
            Lithium battery detected in this upload. Extract the battery and place it in fire-safe quarantine storage. Reject the contaminated record after review.
          </p>
          <ul class="recommendation-list">
            <li><span>Next step</span><strong>Stop recovery routing and isolate the item immediately.</strong></li>
            <li><span>Operator check</span><strong>Confirm battery label, confidence score, and bounding box position.</strong></li>
            <li><span>Risk logic</span><strong>Hazardous material overrides recyclable recovery actions.</strong></li>
            <li><span>Ledger action</span><strong>Send to human review and mark the upload as quarantined.</strong></li>
          </ul>
        `;
      } else if (hasContaminant) {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card review-required";
        const contaminantsList = [];
        boxes.forEach(b => {
          const label = b.label.toLowerCase();
          if (label.includes("alert") || label.includes("trash") || label.includes("textile") || label.includes("contaminant")) {
            contaminantsList.push(b.label.replace(" Alert", "").replace(" Contaminant", ""));
          }
        });
        const uniqContaminants = [...new Set(contaminantsList)];
        badgeHtml = `
          <strong>Human Review Required</strong>
          <p>
            Contamination rate is ${100 - purityPct}%. Remove or verify the highlighted material${uniqContaminants.length > 1 ? "s" : ""}: <em>${uniqContaminants.join(", ") || "mixed contaminants"}</em>.
          </p>
          <ul class="recommendation-list">
            <li><span>Next step</span><strong>Route the upload to manual review before final approval.</strong></li>
            <li><span>Operator check</span><strong>Inspect the highlighted contaminant and confirm material category.</strong></li>
            <li><span>Risk logic</span><strong>Purity is below 100%, so automated acceptance is blocked.</strong></li>
            <li><span>Ledger action</span><strong>Record correction or rejection after human validation.</strong></li>
          </ul>
        `;
      } else {
        if (actionPanel) actionPanel.className = "mini-panel action-panel bbox-card recovery-clear";
        badgeHtml = `
          <strong>Accept Batch</strong>
          <p>
            100% recyclable purity. No contaminants or hazards were detected. Verify this result to add it to the review ledger.
          </p>
          <ul class="recommendation-list">
            <li><span>Next step</span><strong>Approve and route to multi-stream recovery.</strong></li>
            <li><span>Operator check</span><strong>Confirm PET bottle, aluminum can, cardboard box, and glass jar labels.</strong></li>
            <li><span>Risk logic</span><strong>All detected materials are recyclable and above the confidence threshold.</strong></li>
            <li><span>Ledger action</span><strong>Save as a cleared scan after human verification.</strong></li>
          </ul>
        `;
      }
      actionText.innerHTML = badgeHtml;
    }

    if (liveFeed) {
      liveFeed.innerHTML = "";

      const listContainer = document.createElement("div");
      listContainer.style.display = "flex";
      listContainer.style.flexDirection = "column";
      listContainer.style.gap = "6px";
      listContainer.style.marginBottom = "10px";

      boxes.forEach((box, index) => {
        const itemDiv = document.createElement("div");
        const estimatedWeightKg = getEstimatedWeightKg(box.label);
        const estimatedResaleValueRm = getEstimatedResaleValueRm(box.label);
        const isContaminant = box.label.toLowerCase().includes("contaminant") ||
          box.label.toLowerCase().includes("hazard") ||
          box.label.toLowerCase().includes("alert") ||
          box.label.toLowerCase().includes("trash");
        itemDiv.className = `material-row ${isContaminant ? "contaminant" : "recyclable"}`;
        itemDiv.style.setProperty("--row-delay", `${index * 70}ms`);
        itemDiv.style.setProperty("--material-color", isContaminant ? "#ff4d57" : box.color);

        itemDiv.innerHTML = `
          <span>
            <strong>${box.label.replace(" Contaminant", "")}</strong>
            <small>${isContaminant ? "Contaminant" : "Recyclable"} | Qty 1</small>
            <small>Object weight: ${plFormatKg(estimatedWeightKg)}</small>
            <small>Estimated resale value: ${plFormatRm(estimatedResaleValueRm)}</small>
          </span>
          <b>${box.confidence}</b>
        `;
        listContainer.appendChild(itemDiv);
      });
      liveFeed.appendChild(listContainer);

      const infoDiv = document.createElement("div");
      infoDiv.className = "material-meta";
      const totalEstimatedWeightKg = boxes.reduce((sum, box) => sum + getEstimatedWeightKg(box.label), 0);
      const totalEstimatedResaleValueRm = boxes.reduce((sum, box) => sum + getEstimatedResaleValueRm(box.label), 0);
      infoDiv.innerHTML = `
        <div><strong>Disposal Bin:</strong> ${result.bin}</div>
        <div><strong>Object Weight:</strong> ${plFormatKg(totalEstimatedWeightKg)}</div>
        <div><strong>Estimated resale value:</strong> ${plFormatRm(totalEstimatedResaleValueRm)}</div>
      `;
      liveFeed.appendChild(infoDiv);
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
  if (!modal) return; // Not on verification ledger page

  const tableBody = document.querySelector(".ledger-table tbody");
  const reviewTitle = document.getElementById("reviewTitle");
  const reviewDescription = document.getElementById("reviewDescription");
  const closeButton = document.getElementById("closeReviewModal");
  const clearButton = document.getElementById("clearSegment");
  const quarantineButton = document.getElementById("quarantineSegment");

  let activeLogId = null;
  let activeRow = null;

  // Change heading titles to match upload-based audit logs
  const sectionKicker = document.querySelector(".ledger-panel .eyebrow");
  if (sectionKicker) sectionKicker.textContent = "Audit verification";

  const sectionTitle = document.querySelector(".ledger-panel h2");
  if (sectionTitle) sectionTitle.textContent = "Uploaded Image Ledger";

  const mainHeaderTitle = document.querySelector(".main-content h1");
  if (mainHeaderTitle) mainHeaderTitle.textContent = "Human Review Logs";

  const mainHeaderDesc = document.querySelector(".main-content header p");
  if (mainHeaderDesc) mainHeaderDesc.textContent = "Validate uploaded image results before they become final classification records.";

  const ledgerSidebarNote = document.querySelector(".sidebar-note");
  if (ledgerSidebarNote) {
    ledgerSidebarNote.innerHTML = `
      <strong>Human review</strong>
      <p>Open records marked review needed to approve, correct, or reject AI classifications.</p>
    `;
  }

  // Adjust table columns to the upload-only workflow
  const tableHeaders = document.querySelectorAll(".ledger-table th");
  if (tableHeaders[1]) tableHeaders[1].textContent = "Upload Source";
  if (tableHeaders[4]) tableHeaders[4].textContent = "AI Confidence";

  // Pre-load reclassification controls inside the modal
  const snapshotItems = document.querySelector(".review-snapshot .snapshot-items");
  const modalActions = document.querySelector(".modal-actions");

  if (modalActions && !document.getElementById("reclassifySelect")) {
    // Inject custom reclassificaton dropdown
    const reclassifyDiv = document.createElement("div");
    reclassifyDiv.style.gridColumn = "span 2";
    reclassifyDiv.style.marginTop = "10px";
    reclassifyDiv.innerHTML = `
      <label for="reclassifySelect" style="display:block; font-weight:800; margin-bottom:6px; font-size:13px;">Manual reclassification category</label>
      <select id="reclassifySelect" style="width:100%; height:42px; border:1px solid var(--line); border-radius:var(--radius); padding:0 10px; background:#fff; font-weight:700;">
        <option value="Plastic">Plastic</option>
        <option value="Metal">Metal</option>
        <option value="Glass">Glass</option>
        <option value="Paper">Paper</option>
        <option value="Cardboard">Cardboard</option>
        <option value="Food Organics">Food Organics</option>
        <option value="General Trash">General Trash</option>
        <option value="Textile">Textile</option>
        <option value="Battery">Battery</option>
      </select>
    `;
    modalActions.parentNode.insertBefore(reclassifyDiv, modalActions);
  }

  // Adjust button text
  if (clearButton) clearButton.textContent = "Verify result";
  if (quarantineButton) quarantineButton.textContent = "Reject as contaminated";

  // Build Table from LocalStorage state with simulated skeleton loading delay
  setTimeout(() => {
    buildLedgerTable();
  }, 800);

  function buildLedgerTable() {
    if (!tableBody) return;
    const ledger = getAuditLedger();
    tableBody.innerHTML = "";

    const statusCards = document.querySelectorAll(".ops-status-card strong");
    if (statusCards[0]) statusCards[0].textContent = String(ledger.filter(log => log.status === "Cleared").length);
    if (statusCards[1]) statusCards[1].textContent = String(ledger.filter(log => log.status === "Review Needed").length);
    if (statusCards[2]) statusCards[2].textContent = String(ledger.filter(log => log.status === "Quarantined").length);

    const reviewBadge = document.querySelector(".review-badge span");
    if (reviewBadge) reviewBadge.textContent = `${ledger.filter(log => log.status === "Review Needed").length} pending`;

    if (!ledger.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6">
            <div class="feed-empty">No scan history yet. Upload an image to create review logs.</div>
          </td>
        </tr>
      `;
      return;
    }

    ledger.forEach(log => {
      const tr = document.createElement("tr");
      tr.id = `row-${log.id}`;
      const sourceLabel = getLogSourceLabel(log);
      const sourceKey = getLogSourceKey(log);

      let confidenceClass = "positive";
      const numConf = parseFloat(log.confidence);
      if (numConf < 60) confidenceClass = "danger-text";
      else if (numConf < 85) confidenceClass = "warning-text";

      let statusPillClass = "cleared";
      let statusText = log.status;
      if (log.status === "Quarantined" || log.status === "Quarantine Active" || log.status === "Quarantine") {
        statusPillClass = "quarantine";
        statusText = "Quarantined";
      } else if (log.status === "Review Needed") {
        statusPillClass = "review review-action";
      } else if (log.status.includes("Corrected") || log.status.includes("Verified")) {
        statusPillClass = "cleared";
      }

      tr.innerHTML = `
        <td>${log.time}</td>
        <td><button type="button" class="text-drill source-drill" data-station-detail="${sourceKey}">${sourceLabel}</button></td>
        <td><button type="button" class="text-drill" data-material-detail="${log.category}">${log.category}</button></td>
        <td>${log.weight}</td>
        <td class="${confidenceClass}">${log.confidence}</td>
        <td>
          ${log.status === "Review Needed"
          ? `<button type="button" class="status-pill review review-action" data-logid="${log.id}">${log.status}</button>`
          : `<span class="status-pill ${statusPillClass}">${statusText}</span>`
        }
        </td>
      `;

      tr.addEventListener("click", () => {
        if (log.scanId) window.location.href = `/result?scanId=${encodeURIComponent(log.scanId)}`;
      });

      // Set up drill event listeners inside the rows
      const drills = tr.querySelectorAll(".text-drill");
      drills.forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (btn.dataset.materialDetail) {
            renderMaterialDetail(btn.dataset.materialDetail);
          } else if (btn.dataset.stationDetail) {
            renderStationDetail(btn.dataset.stationDetail);
          }
        });
      });

      tableBody.appendChild(tr);
    });

    // Attach click listeners for "Review Needed" buttons
    document.querySelectorAll(".review-action").forEach(button => {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        activeLogId = button.dataset.logid;
        activeRow = button.closest("tr");

        const ledger = plSafeArray(getAuditLedger());
        const activeLog = ledger.find(l => l.id === activeLogId);
        if (!activeLog) {
          showToast("Unable to find this audit record.", "warning");
          return;
        }

        if (reviewTitle) reviewTitle.textContent = "Audit Record: " + activeLog.id;
        if (reviewDescription) {
          reviewDescription.textContent = "Review this uploaded image result. Overrides update the material category and final audit status.";
        }

        // Load matching image asset into snapshot box
        const snapshotFeed = document.querySelector(".review-snapshot .snapshot-feed");
        if (snapshotFeed) {
          snapshotFeed.innerHTML = `
            <span class="snapshot-live"></span>
            <strong>LOW CONFIDENCE - HUMAN AUDIT REQUIRED</strong>
          `;
        }

        // Set matching sample item in review window
        if (snapshotItems) {
          let categoryKey = activeLog.category.toLowerCase().replace(" ", "_");
          if (categoryKey === "food_organics" || categoryKey === "food") categoryKey = "food_organics";
          const itemMeta = detectionResults[categoryKey] || detectionResults.unknown;

          snapshotItems.innerHTML = `
            <img src="${itemMeta.imageSrc}" alt="${activeLog.category}" style="max-height:90px; object-fit:contain;" />
            <div style="display:flex; flex-direction:column; gap:4px; font-size:13px; text-align:left;">
              <div><strong>Initial Prediction:</strong> ${activeLog.category}</div>
              <div><strong>Upload Source:</strong> ${getLogSourceLabel(activeLog)}</div>
              <div><strong>Weight:</strong> ${activeLog.weight}</div>
              <div><strong>Confidence:</strong> ${activeLog.confidence}</div>
            </div>
          `;

          // Select matching item in dropdown
          const reclassifySelect = document.getElementById("reclassifySelect");
          if (reclassifySelect) {
            reclassifySelect.value = activeLog.category;
          }
        }

        modal.classList.add("active");
        modal.setAttribute("aria-hidden", "false");
      });
    });
  }

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    activeLogId = null;
    activeRow = null;
  }

  if (closeButton) closeButton.addEventListener("click", closeModal);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      if (activeLogId) {
        const ledger = plSafeArray(getAuditLedger());
        const activeLog = ledger.find(l => l.id === activeLogId);
        if (!activeLog) {
          showToast("Unable to find this audit record.", "warning");
          closeModal();
          return;
        }

        const reclassifySelect = document.getElementById("reclassifySelect");
        const chosenCategory = reclassifySelect ? reclassifySelect.value : activeLog.category;

        if (chosenCategory !== activeLog.category) {
          showToast("Category changes need a persisted review endpoint before they can be saved.", "warning");
          closeModal();
          return;
        }
        activeLog.status = "Verified (Cleared)";
        saveAuditLedger(ledger);
        buildLedgerTable();
        showToast(`Record ${activeLog.id} verified and cleared.`, "success");
      }
      closeModal();
    });
  }

  if (quarantineButton) {
    quarantineButton.addEventListener("click", function () {
      if (activeLogId) {
        const ledger = plSafeArray(getAuditLedger());
        const activeLog = ledger.find(l => l.id === activeLogId);
        if (!activeLog) {
          showToast("Unable to find this audit record.", "warning");
          closeModal();
          return;
        }
        activeLog.status = "Quarantined";
        saveAuditLedger(ledger);
        buildLedgerTable();
        showToast(`Record ${activeLog.id} flagged as contaminated and rejected.`, "error");
      }
      closeModal();
    });
  }
}

/******************************************
 * 4. OPERATIONS DASHBOARD PAGE           *
 ******************************************/
function initAnalyticsCharts() {
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
