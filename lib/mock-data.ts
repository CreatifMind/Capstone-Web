export type DetectedMaterial = {
  material_name: string;
  category: string;
  confidence: number;
  recyclable_status: string;
  contaminant_status: string;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
};

export type ScanResult = {
  id: string;
  image_url: string;
  source_name?: string;
  overall_status: string;
  contamination_risk: string;
  recommended_action: string;
  human_review_required: boolean;
  overall_confidence: number;
  created_at: string;
  detected_materials: DetectedMaterial[];
};
