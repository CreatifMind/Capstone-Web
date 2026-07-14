export type DetectedMaterial = {
  id?: string;
  material_name: string;
  category: string;
  confidence: number;
  recyclable_status: string;
  contaminant_status: string;
  material_class?: "recyclable" | "contaminant" | "unknown";
  decision_status?: "confirmed" | "review_needed";
  review_required?: boolean;
  display_status?: string;
  disposal_route?: string;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  review_decision?: ReviewDecision | null;
};

export type ReviewDecision = {
  id: string;
  detected_material_id: string;
  chosen_category: string;
  disposition: "recyclable" | "contaminant";
  outcome?: "confirmed" | "rejected";
  reviewer_email?: string | null;
  created_at: string;
};

export type ScanResult = {
  id: string;
  image_url: string;
  preview_image_url?: string;
  drive_file_id?: string;
  drive_web_url?: string;
  source_name?: string;
  overall_status: string;
  contamination_risk: string;
  recommended_action: string;
  human_review_required: boolean;
  overall_confidence: number;
  created_at: string;
  detected_materials: DetectedMaterial[];
};
