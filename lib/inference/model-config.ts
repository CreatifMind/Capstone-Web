export const MODEL_CANDIDATE_THRESHOLD = 0.20;
export const DECISION_CONFIDENCE_THRESHOLD = 0.32;

export const CLASS_CONFIDENCE_THRESHOLDS: Record<string, number> = {
  plastic: 0.25,
  paper: 0.20,
  cardboard: 0.20,
  metal: 0.15,
  glass: 0.20,
  textile: 0.25,
  food_organic: 0.20,
  battery: 0.25,
  general_trash: 0.25,
};

export const MODEL_CONFIG = {
  modelPath: "/models/purityloop/best.onnx",
  inputName: "images",
  outputName: "output0",
  inputShape: [1, 3, 640, 640] as const,
  inputSize: 640,
  paddingValue: 114,
  confidenceThreshold: MODEL_CANDIDATE_THRESHOLD,
  nmsIouThreshold: 0.45,
  executionProvider: "wasm",
  classes: [
    "plastic",
    "paper",
    "cardboard",
    "metal",
    "glass",
    "textile",
    "food_organic",
    "battery",
    "general_trash"
  ] as const
} as const;

export type PurityLoopClassName = (typeof MODEL_CONFIG.classes)[number];
