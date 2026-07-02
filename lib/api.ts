import { DEMO_MODE, USE_SUPABASE, isSupabaseConfigured } from "./config";
import { mockDetectedMaterials, mockScanLogs, mockScanResult, type DetectedMaterial, type ScanResult } from "./mock-data";
import { supabase } from "./supabase";
import { uploadImageToSupabase } from "./storage";
import { safeArray, safeId, safeJsonParse } from "./utils";

const latestScanKey = "purityloop_latest_scan";
const logsKey = "purityloop_scan_logs";
const settingsKey = "purityloop_settings";

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

function normalizeDetectedMaterials(value: unknown, fallback: DetectedMaterial[] = mockDetectedMaterials): DetectedMaterial[] {
  const fallbackMaterials = safeArray<DetectedMaterial>(fallback);
  const mockMaterials = safeArray<DetectedMaterial>(mockDetectedMaterials);
  const source = safeArray<Partial<DetectedMaterial>>(value);
  const normalized = source.map((material, index) => {
    const fallbackMaterial =
      fallbackMaterials[index % Math.max(fallbackMaterials.length, 1)] ||
      mockMaterials[index % Math.max(mockMaterials.length, 1)] || {
        material_name: `Detected material ${index + 1}`,
        category: "Unknown",
        confidence: 0,
        recyclable_status: "Unknown",
        contaminant_status: "Unknown",
        bbox_x: 0,
        bbox_y: 0,
        bbox_width: 0,
        bbox_height: 0
      };
    return {
      ...fallbackMaterial,
      ...material,
      material_name: material.material_name || material.category || fallbackMaterial.material_name || `Detected material ${index + 1}`,
      category: material.category || fallbackMaterial.category || "Unknown",
      confidence: toFiniteNumber(material.confidence, fallbackMaterial.confidence),
      recyclable_status: material.recyclable_status || fallbackMaterial.recyclable_status || "Unknown",
      contaminant_status: material.contaminant_status || fallbackMaterial.contaminant_status || "Unknown",
      bbox_x: toFiniteNumber(material.bbox_x, fallbackMaterial.bbox_x),
      bbox_y: toFiniteNumber(material.bbox_y, fallbackMaterial.bbox_y),
      bbox_width: toFiniteNumber(material.bbox_width, fallbackMaterial.bbox_width),
      bbox_height: toFiniteNumber(material.bbox_height, fallbackMaterial.bbox_height)
    };
  });

  return normalized.length ? normalized : fallbackMaterials;
}

function normalizeScanResult(value: unknown, fallback: ScanResult = mockScanResult): ScanResult {
  const fallbackResult = fallback && typeof fallback === "object" && !Array.isArray(fallback) ? fallback : mockScanResult;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallbackResult;
  const candidate = value as Partial<ScanResult>;
  const detectedMaterials = normalizeDetectedMaterials(candidate.detected_materials, fallbackResult.detected_materials);

  return {
    ...fallbackResult,
    ...candidate,
    id: candidate.id || fallbackResult.id || safeId("scan"),
    image_url: candidate.image_url || fallbackResult.image_url,
    overall_status: candidate.overall_status || fallbackResult.overall_status,
    contamination_risk: candidate.contamination_risk || fallbackResult.contamination_risk,
    recommended_action: candidate.recommended_action || fallbackResult.recommended_action,
    human_review_required: Boolean(candidate.human_review_required),
    overall_confidence: toFiniteNumber(candidate.overall_confidence, fallbackResult.overall_confidence),
    created_at: candidate.created_at || fallbackResult.created_at || new Date().toISOString(),
    detected_materials: detectedMaterials
  };
}

function normalizeScanResults(value: unknown): ScanResult[] {
  const normalized = safeArray<unknown>(value).map((item, index) =>
    normalizeScanResult(item, mockScanLogs[index] || mockScanResult)
  );
  const fallbackLogs = safeArray<ScanResult>(mockScanLogs).map(item => normalizeScanResult(item));
  return normalized.length ? normalized : fallbackLogs;
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
    ...mockScanResult,
    ...result,
    id: result.id || safeId("scan"),
    created_at: result.created_at || new Date().toISOString(),
    detected_materials: normalizeDetectedMaterials(result.detected_materials)
  });

  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
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
      return normalizeScanResult({ ...data, detected_materials: payload.detected_materials }, payload);
    }
  }

  setStorageItem(latestScanKey, payload);
  const logs = safeArray<ScanResult>(await getScanLogs());
  setStorageItem(logsKey, [payload, ...logs.filter(item => item.id !== payload.id)]);
  return payload;
}

export async function saveDetectedMaterials(scanResultId: string, materials: DetectedMaterial[]) {
  const safeMaterials = normalizeDetectedMaterials(materials, []);
  if (!safeMaterials.length) return false;

  if (canUseSupabase() && supabase) {
    const { error } = await supabase.from("detected_materials").insert(
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

export async function getLatestScanResult(): Promise<ScanResult> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
      .select("*, detected_materials(*)")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!error && data) return normalizeScanResult(data);
  }

  return normalizeScanResult(safeJsonParse<unknown>(getStorageItem(latestScanKey), mockScanResult));
}

export async function getScanResultById(id: string): Promise<ScanResult> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
      .select("*, detected_materials(*)")
      .eq("id", id)
      .single();
    if (!error && data) return normalizeScanResult(data);
  }
  const logs = safeArray<ScanResult>(await getScanLogs());
  return logs.find(item => item.id === id) || mockScanResult;
}

export async function getScanLogs(): Promise<ScanResult[]> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
      .select("*, detected_materials(*)")
      .order("created_at", { ascending: false });
    if (!error && data) return normalizeScanResults(data);
  }
  return normalizeScanResults(safeJsonParse<unknown>(getStorageItem(logsKey), mockScanLogs));
}

export async function getAnalyticsData() {
  const logs = safeArray<ScanResult>(await getScanLogs());
  return {
    scanCount: logs.length,
    recyclableRecoveryRate: 96.3,
    contaminationRate: 3.7,
    averageConfidence:
      logs.reduce((sum, item) => sum + Number(item.overall_confidence || 0), 0) / Math.max(logs.length, 1),
    carbonImpactKg: 578
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
