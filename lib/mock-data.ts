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
  overall_status: string;
  contamination_risk: string;
  recommended_action: string;
  human_review_required: boolean;
  overall_confidence: number;
  created_at: string;
  detected_materials: DetectedMaterial[];
};

export const mockDetectedMaterials: DetectedMaterial[] = [
  {
    material_name: "Plastic Bottle",
    category: "Plastic",
    confidence: 97,
    recyclable_status: "Recyclable",
    contaminant_status: "Clean",
    bbox_x: 7,
    bbox_y: 44,
    bbox_width: 19,
    bbox_height: 29
  },
  {
    material_name: "Aluminum Can",
    category: "Metal",
    confidence: 98,
    recyclable_status: "Recyclable",
    contaminant_status: "Clean",
    bbox_x: 25,
    bbox_y: 47,
    bbox_width: 24,
    bbox_height: 24
  },
  {
    material_name: "Cardboard Box",
    category: "Paper",
    confidence: 96,
    recyclable_status: "Recyclable",
    contaminant_status: "Clean",
    bbox_x: 52,
    bbox_y: 31,
    bbox_width: 30,
    bbox_height: 41
  }
];

export const mockScanResult: ScanResult = {
  id: "demo-scan-001",
  image_url: "/assets/items/upload-result-reference.png",
  overall_status: "Accepted",
  contamination_risk: "Low",
  recommended_action: "Accept batch and recover recyclable material.",
  human_review_required: false,
  overall_confidence: 96.8,
  created_at: new Date().toISOString(),
  detected_materials: mockDetectedMaterials
};

export const mockScanLogs: ScanResult[] = [
  mockScanResult,
  {
    ...mockScanResult,
    id: "demo-scan-002",
    overall_status: "Human Review Required",
    contamination_risk: "Medium",
    human_review_required: true,
    overall_confidence: 82,
    created_at: new Date(Date.now() - 1000 * 60 * 48).toISOString()
  }
];
