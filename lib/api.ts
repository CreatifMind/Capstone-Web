import { DEMO_MODE, USE_SUPABASE, isSupabaseConfigured } from "./config";
import { mockDetectedMaterials, mockScanLogs, mockScanResult, type DetectedMaterial, type ScanResult } from "./mock-data";
import { supabase } from "./supabase";
import { uploadImageToSupabase } from "./storage";

const latestScanKey = "purityloop_latest_scan";
const logsKey = "purityloop_scan_logs";
const settingsKey = "purityloop_settings";

function canUseSupabase() {
  return USE_SUPABASE && !DEMO_MODE && isSupabaseConfigured && supabase;
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
  const payload: ScanResult = {
    ...mockScanResult,
    ...result,
    id: result.id || crypto.randomUUID(),
    created_at: result.created_at || new Date().toISOString(),
    detected_materials: result.detected_materials || mockDetectedMaterials
  };

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
      return data;
    }
  }

  localStorage.setItem(latestScanKey, JSON.stringify(payload));
  const logs = await getScanLogs();
  localStorage.setItem(logsKey, JSON.stringify([payload, ...logs.filter(item => item.id !== payload.id)]));
  return payload;
}

export async function saveDetectedMaterials(scanResultId: string, materials: DetectedMaterial[]) {
  if (canUseSupabase() && supabase) {
    const { error } = await supabase.from("detected_materials").insert(
      materials.map(material => ({
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
    if (!error && data) return data as ScanResult;
  }

  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(latestScanKey) : null;
  return stored ? (JSON.parse(stored) as ScanResult) : mockScanResult;
}

export async function getScanResultById(id: string): Promise<ScanResult> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
      .select("*, detected_materials(*)")
      .eq("id", id)
      .single();
    if (!error && data) return data as ScanResult;
  }
  const logs = await getScanLogs();
  return logs.find(item => item.id === id) || mockScanResult;
}

export async function getScanLogs(): Promise<ScanResult[]> {
  if (canUseSupabase() && supabase) {
    const { data, error } = await supabase
      .from("scan_results")
      .select("*, detected_materials(*)")
      .order("created_at", { ascending: false });
    if (!error && data) return data as ScanResult[];
  }
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(logsKey) : null;
  return stored ? (JSON.parse(stored) as ScanResult[]) : mockScanLogs;
}

export async function getAnalyticsData() {
  const logs = await getScanLogs();
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
    id: crypto.randomUUID(),
    status: "Open",
    created_at: new Date().toISOString(),
    ...ticket
  };
}

export async function saveSettings(settings: Record<string, unknown>) {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
  return settings;
}
