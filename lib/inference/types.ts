import type { PurityLoopClassName } from "./model-config";

export type LetterboxInfo = {
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  scale: number;
  padX: number;
  padY: number;
};

export type Detection = {
  classId: number;
  className: PurityLoopClassName;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type PreprocessResult = {
  data: Float32Array;
  letterbox: LetterboxInfo;
};

export type PostprocessResult = {
  rawCandidates: number;
  confidenceCandidates: number;
  detections: Detection[];
  reviewDetections: Detection[];
};

export type ModelSessionInfo = {
  loadTimeMs: number;
  executionProvider: string;
};
