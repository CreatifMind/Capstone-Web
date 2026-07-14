export type DetectedMaterial = {
  id?: string;
  material_name: string;
  category: string;
  confidence: number;
  recyclable_status: string;
  contaminant_status: string;
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
  reviewer_email?: string | null;
  created_at: string;
};

export type ScanResult = {
  id: string;
  image_url: string;
  preview_image_url?: string;
  source_name?: string;
  overall_status: string;
  contamination_risk: string;
  recommended_action: string;
  human_review_required: boolean;
  overall_confidence: number;
  created_at: string;
  detected_materials: DetectedMaterial[];
};
