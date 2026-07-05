import { DEMO_MODE, USE_SUPABASE, isSupabaseConfigured } from "./config";
import type { DetectedMaterial, ScanResult } from "./mock-data";
import { supabase } from "./supabase";
import { uploadImageToSupabase } from "./storage";
import { safeArray, safeId, safeJsonParse } from "./utils";

const latestScanKey = "purityloop_latest_scan";
const logsKey = "purityloop_scan_logs";
const settingsKey = "purityloop_settings";
const scanResultsTable = "mock_scan_results";
const detectedMaterialsTable = "mock_detected_materials";
const scanResultSelect = "*, detected_materials:mock_detected_materials(*)";

function canUseSupabase() {
  return USE_SUPABASE && !DEMO_MODE && isSupabaseConfigured && supabase;
}

function getStorageItem(key: string) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setStorageItem(key: string, value: unknown) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can fail in private mode, quota errors, or restricted browser contexts.
  }
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDetectedMaterials(value: unknown): DetectedMaterial[] {
  return safeArray<Partial<DetectedMaterial>>(value).map((material, index) => ({
    material_name: material.material_name || material.category || `Detected material ${index + 1}`,
    category: material.category || "Unknown",
    confidence: toFiniteNumber(material.confidence),
    recyclable_status: material.recyclable_status || "Unknown",
    contaminant_status: material.contaminant_status || "Unknown",
    bbox_x: toFiniteNumber(material.bbox_x),
    bbox_y: toFiniteNumber(material.bbox_y),
    bbox_width: toFiniteNumber(material.bbox_width),
    bbox_height: toFiniteNumber(material.bbox_height)
  }));
}

function normalizeScanResult(value: unknown): ScanResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ScanResult>;
  if (!candidate.id) return null;

  return {
    id: candidate.id,
    image_url: candidate.image_url || "",
    source_name: candidate.source_name || "",
    overall_status: candidate.overall_status || "Unknown",
    contamination_risk: candidate.contamination_risk || "Unknown",
    recommended_action: candidate.recommended_action || "No recommendation available.",
    human_review_required: Boolean(candidate.human_review_required),
    overall_confidence: toFiniteNumber(candidate.overall_confidence),
    created_at: candidate.created_at || new Date().toISOString(),
    detected_materials: normalizeDetectedMaterials(candidate.detected_materials)
  };
}

function normalizeScanResults(value: unknown): ScanResult[] {
  return safeArray<unknown>(value).map(normalizeScanResult).filter((item): item is ScanResult => Boolean(item));
}

export async function loginUser(email?: string) {
  return {
    id: "demo-user",
    name: "Admin Operator",
    email: email || "operator@facility.com",
    role: "operator"
  };
}

export { uploadImageToSupabase };

export async function saveScanResult(result: Partial<ScanResult>) {
  const payload = normalizeScanResult({
    ...result,
    id: result.id || safeId("scan"),
    created_at: result.created_at || new Date().toISOString(),
    detected_materials: normalizeDetectedMaterials(result.detected_materials)
  });

  if (!payload) throw new Error("Invalid scan result");

  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from(scanResultsTable)
      .insert({
        image_url: payload.image_url,
        overall_status: payload.overall_status,
        contamination_risk: payload.contamination_risk,
        recommended_action: payload.recommended_action,
        human_review_required: payload.human_review_required,
        overall_confidence: payload.overall_confidence
      })
      .select()
      .single();

    if (!error && data) {
      await saveDetectedMaterials(data.id, payload.detected_materials);
      return normalizeScanResult({ ...data, detected_materials: payload.detected_materials }) || payload;
    }
  }

  setStorageItem(latestScanKey, payload);
  const logs = safeArray<ScanResult>(await getScanLogs());
  setStorageItem(logsKey, [payload, ...logs.filter(item => item.id !== payload.id)]);
  return payload;
}

export async function saveDetectedMaterials(scanResultId: string, materials: DetectedMaterial[]) {
  const safeMaterials = normalizeDetectedMaterials(materials);
  if (!scanResultId || !safeMaterials.length) return false;

  if (canUseSupabase() && supabase) {
    const { error } = await supabase.from(detectedMaterialsTable).insert(
      safeMaterials.map(material => ({
        scan_result_id: scanResultId,
        material_name: material.material_name,
        category: material.category,
        confidence: material.confidence,
        recyclable_status: material.recyclable_status,
        contaminant_status: material.contaminant_status,
        bbox_x: material.bbox_x,
        bbox_y: material.bbox_y,
        bbox_width: material.bbox_width,
        bbox_height: material.bbox_height
      }))
    );
    if (!error) return true;
  }
  return false;
}

export async function getLatestScanResult(): Promise<ScanResult | null> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from(scanResultsTable)
      .select(scanResultSelect)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return normalizeScanResult(data);
  }

  return normalizeScanResult(safeJsonParse<unknown>(getStorageItem(latestScanKey), null));
}

export async function getScanResultById(id: string): Promise<ScanResult | null> {
  if (!id) return null;

  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from(scanResultsTable)
      .select(scanResultSelect)
      .eq("id", id)
      .maybeSingle();
    if (!error && data) return normalizeScanResult(data);
  }
  const logs = safeArray<ScanResult>(await getScanLogs());
  return logs.find(item => item.id === id) || null;
}

export async function getScanLogs(): Promise<ScanResult[]> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from(scanResultsTable)
      .select(scanResultSelect)
      .order("created_at", { ascending: false });
    if (!error && data) return normalizeScanResults(data);
  }
  return normalizeScanResults(safeJsonParse<unknown>(getStorageItem(logsKey), []));
}

export async function getAnalyticsData() {
  const logs = safeArray<ScanResult>(await getScanLogs());
  const materials = logs.flatMap(log => safeArray<DetectedMaterial>(log.detected_materials));
  const recyclable = materials.filter(material => material.recyclable_status === "Recyclable").length;
  const contaminated = materials.filter(material => material.contaminant_status !== "Clean").length;
  const reviewRequired = logs.filter(log => log.human_review_required).length;

  return {
    scanCount: logs.length,
    materialCount: materials.length,
    recyclableCount: recyclable,
    nonRecyclableCount: Math.max(materials.length - recyclable, 0),
    reviewRequired,
    contaminationCount: contaminated,
    recyclableRecoveryRate: materials.length ? (recyclable / materials.length) * 100 : 0,
    contaminationRate: materials.length ? (contaminated / materials.length) * 100 : 0,
    averageConfidence: logs.length
      ? logs.reduce((sum, item) => sum + Number(item.overall_confidence || 0), 0) / logs.length
      : 0
  };
}

export async function submitTicket(ticket: Record<string, unknown>) {
  return {
    id: safeId("ticket"),
    status: "Open",
    created_at: new Date().toISOString(),
    ...ticket
  };
}

export async function saveSettings(settings: Record<string, unknown>) {
  setStorageItem(settingsKey, settings);
  return settings;
}
